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
