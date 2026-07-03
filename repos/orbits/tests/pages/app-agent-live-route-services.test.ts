import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getOrbitAgentViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/agent page renders the real Orbit AI chat experience", async () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  const agentSource = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(pageSource, /OrbitRealAgent/);
  assert.match(pageSource, /getOrbitAgentViewModel/);
  assert.match(pageSource, /getOrbitServerLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.doesNotMatch(pageSource, /AppAgentCommandCenter/);
  assert.match(agentSource, /data-orbit-real-page="agent"/);
});

test("Orbit AI entry copy does not expose hybrid implementation labels", () => {
  const viewModel = getOrbitAgentViewModel();

  assert.doesNotMatch(JSON.stringify(viewModel), /\bHybrid\b|\bhybrid\b/);
});
