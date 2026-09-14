import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "followups", "FollowupsScreen.tsx"),
  "utf8",
);

test("followups AI actions use one opaque IORBIT prefill handoff", () => {
  assert.match(screenSource, /registerAiTemplatePrefill/u);
  assert.match(screenSource, /params:\s*\{\s*id:\s*"new",\s*prefillIntent\s*\}/u);
  assert.match(screenSource, /pathname:\s*"\/ai\/\[id\]"/u);
  assert.doesNotMatch(screenSource, /client\.post<unknown>/u);
});

test("task and reminder candidate buttons select their approved templates", () => {
  assert.match(screenSource, /followupCandidateTemplate\("task"\)/u);
  assert.match(screenSource, /followupCandidateTemplate\("reminder"\)/u);
  assert.match(screenSource, />\s*生成候选\s*</u);
  assert.match(screenSource, />\s*生成提醒候选\s*</u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.(taskGeneration|reminderGeneration)/u);
});

test("both contact drafting buttons use stable-id followup templates", () => {
  assert.match(screenSource, /contactFollowupTemplate\(\{\s*channel:\s*"chat",\s*\.\.\.task\s*\}\)/u);
  assert.match(screenSource, /contactFollowupTemplate\(\{\s*channel:\s*"email",\s*\.\.\.task\s*\}\)/u);
  assert.match(screenSource, /if\s*\(!task\.contactId\)/u);
  assert.match(screenSource, />\s*AI 起草\s*</u);
  assert.match(screenSource, />\s*起草联系消息\s*</u);
  assert.doesNotMatch(screenSource, /chatAssistFollowupDraftPath|messageDraftPath/u);
});

test("the only remaining followups write is an explicit saved-task status change", () => {
  assert.match(screenSource, /client\.patch<unknown>\(taskPath\(row\.id\)/u);
  assert.doesNotMatch(screenSource, /messageDraftsToView|GeneratedFollowupsCard|ChatFollowupDraftsCard/u);
});
