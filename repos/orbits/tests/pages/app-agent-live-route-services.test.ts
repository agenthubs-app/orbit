import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

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
