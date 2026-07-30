import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AiConversationScreen.tsx"),
  "utf8"
);

test("AI conversation screen can open web Orbit AI history sessions", () => {
  assert.match(screenSource, /source/u);
  assert.match(screenSource, /aiConversationSessionPath/u);
  assert.match(screenSource, /agentChatSessionPayloadToThreadView/u);
  assert.match(screenSource, /isStoredAgentSession/u);
});

test("AI conversation screen persists iOS continuations back to web history sessions", () => {
  assert.match(screenSource, /agentSessionUpdateRequestFromThread/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.aiConversationSessions/u);
  assert.match(screenSource, /previousSessionData/u);
});

test("AI conversation persists a consumed initial message before canonical navigation", () => {
  assert.match(screenSource, /function persistAndCanonicalizeDraftConversation/u);
  assert.match(screenSource, /agentSessionCreateRequestFromThread/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.aiConversationSessions/u);
  assert.match(screenSource, /if \(!saved\.success\)/u);
  assert.match(
    screenSource,
    /params: \{ id: sessionId, source: "session" \}/u
  );
  assert.match(
    screenSource,
    /await persistAndCanonicalizeDraftConversation\(result\.data, nextThread\)/u
  );
});

test("AI conversation screen renders markdown markers and quotes distinctly", () => {
  assert.match(screenSource, /block\.marker \?\? "•"/u);
  assert.match(screenSource, /styles\.markdownQuoteBlock/u);
  assert.match(screenSource, /styles\.markdownQuoteText/u);
});

test("AI conversation screen can inspect web AI run details", () => {
  assert.match(screenSource, /buildAiRunDetailRequest/u);
  assert.match(screenSource, /conversationAiRunReferencesFor/u);
  assert.match(screenSource, /aiRunDetailToView/u);
  assert.match(screenSource, /inspectAiRun/u);
  assert.match(screenSource, /client\.get<unknown>\(\s*request\.request\.path/u);
  assert.match(screenSource, />AI 运行依据</u);
  assert.match(screenSource, /runReferences\.map/u);
});

test("AI conversation event panel renders related events as compact content modules", () => {
  assert.match(screenSource, /function EventInlinePanel/u);
  assert.match(screenSource, /prioritizeConversationEvents/u);
  assert.match(screenSource, /prioritizedEvents/u);
  assert.match(screenSource, /styles\.eventSuggestionMediaColumn/u);
  assert.match(screenSource, /styles\.eventSuggestionThumbFrame/u);
  assert.match(screenSource, /styles\.eventSuggestionMeta/u);
  assert.match(screenSource, /event\.participantCountLabel/u);
  assert.match(screenSource, /event\.actionLabel/u);
  assert.match(
    screenSource,
    /eventSuggestionThumbFrame:\s*\{[^}]*height:\s*64[^}]*width:\s*64/su
  );
  assert.doesNotMatch(screenSource, /styles\.eventImageFrame/u);
  assert.doesNotMatch(screenSource, /eventImageFrame:\s*\{/u);
  assert.doesNotMatch(screenSource, /eventCards\.slice\(0,\s*3\)\.map/u);
});

test("AI conversation people panel reuses contact avatar images", () => {
  assert.match(screenSource, /Image,/u);
  assert.match(screenSource, /function PeopleInlinePanel/u);
  assert.match(screenSource, /baseUrl: string/u);
  assert.match(screenSource, /contact\.imageUrl/u);
  assert.match(
    screenSource,
    /source=\{\{ uri: assetUrl\(baseUrl, contact\.imageUrl\) \}\}/u
  );
  assert.match(screenSource, /styles\.contactAvatarImage/u);
});

test("AI conversation people panel prioritizes contacts mentioned in the thread", () => {
  assert.match(screenSource, /prioritizeConversationContacts/u);
  assert.match(screenSource, /thread: ConversationThreadView/u);
  assert.match(screenSource, /prioritizedContacts/u);
  assert.match(
    screenSource,
    /prioritizeConversationContacts\(thread,\s*contactCards\)/u
  );
  assert.match(screenSource, /prioritizedContacts\.slice\(0,\s*3\)/u);
  assert.doesNotMatch(screenSource, /contactCards\.slice\(0,\s*3\)\.map/u);
});
