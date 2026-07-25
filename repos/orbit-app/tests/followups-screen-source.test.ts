import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "followups", "FollowupsScreen.tsx"),
  "utf8"
);

test("followups screen can generate review-only task candidates through the web API", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.taskGeneration/u);
  assert.match(screenSource, /generatedFollowupTasksToView/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*ORBIT_API_ENDPOINTS\.taskGeneration/u
  );
  assert.match(screenSource, /"生成跟进建议"/u);
  assert.match(screenSource, /GeneratedFollowupsCard/u);
  assert.match(screenSource, /title=\{view\.title\}/u);
});

test("followups screen can generate review-only reminder candidates through the web API", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.reminderGeneration/u);
  assert.match(screenSource, /generatedFollowupRemindersToView/u);
  assert.match(screenSource, /buildReminderGenerationRequest/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*ORBIT_API_ENDPOINTS\.reminderGeneration/u
  );
  assert.match(screenSource, /"生成提醒候选"/u);
  assert.match(screenSource, /GeneratedRemindersCard/u);
  assert.doesNotMatch(screenSource, /deliver-notification|push-notification/u);
});

test("followups screen can create review-only message drafts through the web API", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.messageDrafts/u);
  assert.match(screenSource, /messageDraftsToView/u);
  assert.match(screenSource, /buildMessageDraftRequestFromTask/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*ORBIT_API_ENDPOINTS\.messageDrafts/u
  );
  assert.match(screenSource, /"起草跟进消息"/u);
  assert.match(screenSource, /MessageDraftsCard/u);
});

test("followups screen can draft lightweight follow-up copy through chat writing assist", () => {
  assert.match(screenSource, /chatAssistFollowupDraftPath/u);
  assert.match(screenSource, /buildChatFollowupDraftRequestFromTask/u);
  assert.match(screenSource, /chatFollowupDraftsToView/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*chatAssistFollowupDraftPath\(\)/u
  );
  assert.match(screenSource, /"AI 起草"/u);
  assert.match(screenSource, /ChatFollowupDraftsCard/u);
  assert.doesNotMatch(screenSource, /aiProviderRequested|externalSendRequested/u);
});

test("followups screen can mark message drafts ready without sending", () => {
  assert.match(screenSource, /messageDraftPath/u);
  assert.match(screenSource, /buildMessageDraftReviewRequest/u);
  assert.match(
    screenSource,
    /client\.patch<unknown>\(\s*messageDraftPath\(draft\.id\)/u
  );
  assert.match(screenSource, /"标记可确认"/u);
  assert.doesNotMatch(screenSource, /send-message/u);
});
