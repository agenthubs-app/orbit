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
  assert.match(screenSource, /rawSessionThread/u);
  assert.match(screenSource, /isStoredAgentSession/u);
});

test("AI conversation screen persists iOS continuations back to web history sessions", () => {
  assert.match(screenSource, /messages: \[\.\.\.previousSession\.messages, \.\.\.messages\]/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.aiConversationSessions/u);
  assert.match(screenSource, /previousSession/u);
});

test("AI conversation persists a consumed initial message before canonical navigation", () => {
  assert.match(screenSource, /function persistAndCanonicalizeDraftConversation/u);
  assert.match(screenSource, /pendingSaveRef/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.aiConversationSessions/u);
  assert.match(screenSource, /aiSessionReceiptMatches\(result\.data, pending\.session\)/u);
  assert.match(
    screenSource,
    /params: \{ id: saved\.id, source: "session" \}/u
  );
  assert.match(
    screenSource,
    /await persistAndCanonicalizeDraftConversation\(pending\)/u
  );
});

test("AI conversation keeps a pending task suggestion visible before canonical navigation", () => {
  assert.match(
    screenSource,
    /waitForTask: \["suggested", "needs_date_confirmation"\]\.includes\(nextThread\.taskInteraction\?\.state \?\? ""\)/u
  );
  assert.match(
    screenSource,
    /if \(savedSessionId && !saveNotice && !draftValue\.current\.trim\(\)\) router\.replace/u
  );
});

test("AI conversation screen renders markdown markers and quotes distinctly", () => {
  assert.match(screenSource, /block\.marker \?\? "•"/u);
  assert.match(screenSource, /styles\.markdownQuoteBlock/u);
  assert.match(screenSource, /styles\.markdownQuoteText/u);
});

// Sprint 0085: the "AI 运行依据" panel is gone. It sat under every reply, took
// half a screen, and said the same thing each time. What replaces it is the
// entity card, which shows the record itself rather than a note about the run.
test("AI conversation screen no longer renders a run-evidence panel under every reply", () => {
  assert.doesNotMatch(screenSource, /locale\.t\("aiConversation\.runBasis"\)/u);
  assert.doesNotMatch(screenSource, /AiRunAuditPanel/u);
  assert.doesNotMatch(screenSource, /runReferences\.map/u);
  // The run id is still captured for the session record; only the panel is gone.
  assert.match(screenSource, /conversationAiRunReferencesFor/u);
});

test("AI conversation screen renders the entity draft card and confirms it explicitly", () => {
  assert.match(screenSource, /AiEntityDraftCard/u);
  assert.match(screenSource, /aiEntityDraftCardView/u);
  assert.match(screenSource, /resolveEntityDraft/u);
  assert.match(screenSource, /aiEntityDraftActionPath/u);
  // Confirming is a POST the screen makes, never something a reply body triggers.
  assert.match(screenSource, /body: \{ action \}/u);
});

test("AI conversation event panel renders related events as compact content modules", () => {
  assert.match(screenSource, /function EventInlinePanel/u);
  assert.match(screenSource, /prioritizeConversationEvents/u);
  assert.match(screenSource, /prioritizedEvents/u);
  assert.match(screenSource, /styles\.eventSuggestionThumbFrame/u);
  assert.match(screenSource, /styles\.eventSuggestionDetail/u);
  assert.match(screenSource, /event\.participantCountLabel/u);
  assert.match(screenSource, /event\.actionLabel/u);
  assert.match(
    screenSource,
    /eventSuggestionThumbFrame:\s*\{[^}]*height:\s*52[^}]*width:\s*64/su
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
