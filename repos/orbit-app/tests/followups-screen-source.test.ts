import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const read = (file: string) => readFileSync(join(repoRoot, file), "utf8");
const screen = read("src/screens/followups/FollowupsScreen.tsx");
const tools = read("src/screens/tasks/RelationshipTaskTools.tsx");

test("legacy route keeps its private wrapper and delegates to a normalized relationship list", () => {
  assert.match(read("app/followups.tsx"), /withOrbitPrivateRoute\(FollowupsScreen\)/);
  assert.match(screen, /<Redirect href=\{taskListHref\(\{ scope: "relationship", view: params.view \}\)/);
  assert.doesNotMatch(screen, /useApiResource|useOrbitApiClient|client\.(post|patch)/);
});

test("unified tools consume the published opaque templates and canonical history entry", () => {
  assert.match(tools, /registerAiTemplatePrefill/);
  assert.match(tools, /params: \{ id: "new", prefillIntent \}/);
  assert.match(tools, /followupCandidateTemplate\("task"\)/);
  assert.match(tools, /followupCandidateTemplate\("reminder"\)/);
  assert.match(tools, /contactFollowupTemplate\(\{ channel, contactId: selected.contact.id/);
  assert.match(tools, /"\/ai\?drawer=1"/);
  assert.doesNotMatch(tools, /client\.(post|patch)|taskGeneration|reminderGeneration|messageDraftPath/);
});

test("suggestions use their own source and cannot auto-select a person", () => {
  // Only component wiring here; real count separation, failure and paging are
  // exercised through the mounted route in tasks-unification-interactions.
  assert.match(tools, /<PendingTaskSuggestions\s*\/>/);
  assert.doesNotMatch(tools, /tasksPath\(\)|candidatesPayload/);
  assert.match(tools, /INBOX_NOTIFICATIONS_PATH/);
  assert.match(tools, /if \(!selected\)/);
  assert.doesNotMatch(tools, /priorityTask|savedDraftTask|\.open\.find/);
});
