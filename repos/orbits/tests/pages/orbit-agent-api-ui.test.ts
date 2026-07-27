/**
 * Orbit Agent API/UI 边界测试。
 *
 * 锁住前端提交路径必须调用 Chat Agent API，mock/live 由环境配置决定。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
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
  assert.doesNotMatch(source, /setTimeout\(/);
});

test("Orbit agent submit controls expose a 44px target and guard blank or concurrent requests", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /type="button"/);
  assert.match(agentSource, /aria-disabled=\{busy \|\| isBlank\}/);
  assert.match(agentSource, /data-orbit-agent-submit="true"/);
  assert.match(agentSource, /disabled=\{busy \|\| isBlank\}/);
  assert.match(agentSource, /if \(thinking \|\| !value\) return/);
  assert.match(agentSource, /height: 44/);
  assert.match(agentSource, /width: 44/);
});

test("Orbit agent uses CSS-gated responsive trees and exposes one shared request state", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /className="orbit-desktop-only"/);
  assert.match(agentSource, /className="orbit-mobile-only"/);
  assert.equal((agentSource.match(/<ChatBox\b/g) ?? []).length, 2);
  assert.equal(
    (agentSource.match(/<ChatBox busy=\{thinking\}/g) ?? []).length,
    2,
  );
  assert.match(agentSource, /surface="desktop"/);
  assert.match(agentSource, /surface="mobile"/);
  assert.match(agentSource, /data-orbit-agent-request-state/);
  assert.match(agentSource, /aria-busy=\{thinking\}/);
  assert.match(agentSource, /histOpen \?/);
  assert.doesNotMatch(agentSource, /matchMedia\(/);
});
