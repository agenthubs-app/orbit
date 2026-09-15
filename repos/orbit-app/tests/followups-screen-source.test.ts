import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const read = (file: string) => readFileSync(join(repoRoot, file), "utf8");
const screen = read("src/screens/followups/FollowupsScreen.tsx");
const tools = read("src/screens/tasks/RelationshipTaskTools.tsx");

test("legacy route keeps its private wrapper and delegates to a normalized relationship list", () => {
  assert.match(read("app/followups.tsx"), /withOrbitPrivateRoute\(FollowupsRoute\)/);
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

test("legacy candidates remain separate from canonical task counts and automatic person selection", () => {
  assert.match(tools, /candidatesPayload/);
  assert.match(tools, /ORBIT_API_ENDPOINTS.notifications/);
  assert.match(tools, /if \(!selected\)/);
  assert.doesNotMatch(tools, /priorityTask|savedDraftTask|\.open\.find/);
});
