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

test("AI conversation uses typed entity cards without keyword-based collection panels", () => {
  assert.match(screenSource, /AiEntityCardList/u);
  assert.doesNotMatch(screenSource, /ConversationInlinePanels|prioritizeConversationContacts|prioritizeConversationEvents/u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.(contacts|events|tasks|profile)\b/u);
  assert.match(screenSource, /ContactMentionPicker/u);
  assert.match(screenSource, /ContactReferenceChip/u);
});
