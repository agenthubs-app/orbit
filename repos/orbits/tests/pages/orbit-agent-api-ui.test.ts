/**
 * Orbit Agent API/UI 边界测试。
 *
 * 锁住前端提交路径必须调用 Chat Agent API，mock/live 由环境配置决定。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("Orbit agent UI sends prompts through the Chat Agent API boundary", () => {
  const source = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );
  const serviceFactory = readProjectFile("features/orbit-ai/service-factory.ts");

  assert.match(source, /fetch\(["']\/api\/ai\/conversations["']/);
  assert.match(source, /method:\s*["']POST["']/);
  assert.match(source, /assistantMessage/);
  assert.match(serviceFactory, /process\.env\.ORBIT_AGENT_CONVERSATION_MODE/);
  assert.doesNotMatch(source, /function routeScenario/);
  assert.match(source, /fetchAgentConversation/);
});

test("Orbit agent submit controls expose a 44px target and guard blank or concurrent requests", () => {
  // 输入框已提取成 layout 级的全局组件，发送守卫也跟着搬了过去。
  const agentSource = readProjectFile("app/(app)/app/orbit-global-ask/orbit-global-ask.tsx");

  assert.match(agentSource, /type="button"/);
  assert.match(agentSource, /data-orbit-agent-submit="true"/);
  // 发送守卫：请求进行中或空输入（无提示语兜底）时不提交
  assert.match(agentSource, /if \(busy\) return/);
  assert.match(agentSource, /const text = query\.trim\(\) \|\| hint/);
  assert.match(agentSource, /if \(!text\) return/);
  // 视觉尺寸按设计定稿（36px 圆钮），可点击热区仍为 44px（.hit-44 ::after）
  assert.match(agentSource, /className="oga-send hit-44"/);
});

test("Orbit agent uses CSS-gated responsive trees and exposes one shared request state", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /className="orbit-desktop-only"/);
  assert.match(agentSource, /className="orbit-mobile-only"/);
  assert.equal(
    (agentSource.match(/\{workspaceContent\}/g) ?? []).length,
    2,
  );
  assert.match(agentSource, /data-orbit-agent-request-state/);
  assert.match(agentSource, /aria-busy=\{thinking\}/);
  assert.match(agentSource, /histOpen \?/);
  assert.doesNotMatch(agentSource, /matchMedia\(/);
});


test("the actual Agent request helper aborts stalled requests and always clears its timer", async () => {
  const source = readProjectFile("app/(app)/app/agent/orbit-real-agent.tsx");
  const parsed = ts.createSourceFile("orbit-real-agent.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["AGENT_REQUEST_TIMEOUT_MS", "AgentRequestTimeoutError", "fetchAgentConversation"]);
  const declarations = parsed.statements.filter((statement) => {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return names.has(statement.name?.text ?? "");
    return ts.isVariableStatement(statement) && statement.declarationList.declarations.some((item) => ts.isIdentifier(item.name) && names.has(item.name.text));
  });
  assert.equal(declarations.length, 3, "request helper declarations must remain discoverable");
  const compiled = ts.transpileModule(declarations.map((node) => node.getText(parsed)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const outcome of ["success", "failure", "timeout"] as const) {
    let expire!: () => void;
    let resolveFetch!: (response: Response) => void;
    let rejectFetch!: (error: Error) => void;
    let requestSignal!: AbortSignal;
    const cleared: number[] = [];
    const helper = runInNewContext(`${compiled}; fetchAgentConversation`, {
      AbortController,
      window: {
        setTimeout(callback: () => void, delay: number) { assert.equal(delay, 30_000); expire = callback; return 7; },
        clearTimeout(id: number) { cleared.push(id); },
      },
      fetch(url: string, init: RequestInit) {
        assert.equal(url, "/api/ai/conversations");
        assert.equal(init.method, "POST");
        assert.equal(init.body, '{"message":"test request"}');
        requestSignal = init.signal!;
        return new Promise<Response>((resolve, reject) => {
          resolveFetch = resolve; rejectFetch = reject;
          requestSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      },
    }) as (body: string) => Promise<Response>;
    const pending = helper('{"message":"test request"}');
    assert.equal(requestSignal.aborted, false);
    assert.deepEqual(cleared, []);
    if (outcome === "success") {
      const response = new Response('{"success":true}'); resolveFetch(response);
      assert.equal(await pending, response);
    } else if (outcome === "failure") {
      const failure = new Error("Controlled network failure"); rejectFetch(failure);
      await assert.rejects(pending, (error) => error === failure);
    } else {
      expire();
      await assert.rejects(pending, (error) => (error as Error).name === "AgentRequestTimeoutError");
      assert.equal(requestSignal.aborted, true);
    }
    assert.deepEqual(cleared, [7], `${outcome} must release its deadline timer`);
  }
});
