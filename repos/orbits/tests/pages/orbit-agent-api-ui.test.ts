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

test("Orbit agent submit controls remain hittable while blank prompts are guarded in handlers", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );
  const landingSource = readProjectFile(
    "app/(app)/app/orbit-agent-hero.tsx",
  );

  assert.match(agentSource, /type="submit"/);
  assert.match(agentSource, /aria-disabled=\{isBlank\}/);
  assert.match(agentSource, /data-orbit-agent-submit="true"/);
  assert.doesNotMatch(agentSource, /disabled=\{!value\.trim\(\)\}/);

  assert.match(landingSource, /aria-disabled=\{isBlank\}/);
  assert.match(landingSource, /data-orbit-agent-hero-submit="true"/);
  assert.doesNotMatch(landingSource, /disabled=\{!text\.trim\(\)\}/);
});

test("Orbit agent gates responsive chat layout and exposes request state", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(agentSource, /const chatBox = \(/);
  assert.equal((agentSource.match(/<ChatBox\b/g) ?? []).length, 1);
  assert.match(agentSource, /busy=\{thinking\}/);
  assert.match(agentSource, /data-orbit-agent-request-state/);
  assert.match(agentSource, /isMobileLayout && histOpen/);
});
