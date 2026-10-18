import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/agent page renders the real Orbit AI chat experience", async () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  const agentSource = source("app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx");
  const agentModelSource = source(
    "app/(app)/app/orbit-agent-route-view-model.ts",
  );

  assert.match(pageSource, /<IOrbit2026\b/);
  assert.ok(pageSource.indexOf("if (guide)") < pageSource.indexOf("<IOrbit2026"), "the demo boundary stays before the live screen");
  // Sprint 0104: the legacy chat route model is retired; the page no longer reads chat data.
  assert.match(pageSource, /createOrbitAgentStarterViewModel\(\)/);
  assert.doesNotMatch(pageSource, /loadAppChatRouteViewModel|composeOrbitAgentEntryViewModel|compose-app-chat/);
  assert.match(pageSource, /getOrbitServerLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.match(pageSource, /await auth\(\)/);
  assert.match(
    pageSource,
    /redirect\("\/app\/account\/login\?next=%2Fapp%2Fagent"\)/,
  );
  assert.doesNotMatch(pageSource, /firstSearchParam\(resolvedSearchParams, "action"\)/);
  assert.doesNotMatch(pageSource, /firstSearchParam\(resolvedSearchParams, "scenario"\)/);
  assert.doesNotMatch(pageSource, /firstSearchParam\(resolvedSearchParams, "mode"\)/);
  assert.doesNotMatch(pageSource, /AppAgentCommandCenter/);
  assert.doesNotMatch(pageSource, /getOrbitAgentViewModel/);
  assert.doesNotMatch(
    agentModelSource,
    /getOrbitAgentViewModel|getOrbitHybridRouteData/,
  );
  assert.match(agentSource, /data-orbit-agent-chat-composer/);
  assert.match(agentSource, /data-orbit-iorbit-thread/);
});

test("/app/agent demo starter stays free of real names and the live ask target remains registered", async () => {
  const { createOrbitAgentStarterViewModel } = await import(
    "../../app/(app)/app/orbit-agent-route-view-model"
  );
  const entryModel = { viewModel: createOrbitAgentStarterViewModel() };

  assert.deepEqual(entryModel.viewModel.history, []);
  assert.deepEqual(entryModel.viewModel.scenarios.people.items, []);
  assert.deepEqual(entryModel.viewModel.scenarios.events.items, []);
  assert.deepEqual(entryModel.viewModel.scenarios.peopleToEvents.items, []);
  assert.equal(entryModel.viewModel.suggests.length, 3);

  // The ask target still handles in-page prompts. Browser captures cover the
  // rendered composer and explicit send; importing CSS modules in Node does not.
  const chatHookSource = source("app/(app)/app/agent/iorbit-0918/use-agent-chat.ts");

  assert.match(chatHookSource, /useOrbitAskTarget\(askTarget\)/);
  assert.match(chatHookSource, /onAsk: ask/);
});

