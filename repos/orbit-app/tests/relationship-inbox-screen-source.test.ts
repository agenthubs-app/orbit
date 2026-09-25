import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "inbox", "RelationshipInboxScreen.tsx"),
  "utf8"
);
const detailRoutePath = join(repoRoot, "app", "inbox", "[id].tsx");

// Native route / HTTP boundary checks remain here. Feed filters, reading and
// seeded compose behavior are exercised in relationship-inbox-interactions.test.ts.

test("relationship inbox uses the typed notification list and does not expose the legacy reminder feed", () => {
  assert.match(screenSource, /useNotificationInbox/u);
  assert.match(screenSource, /NotificationInboxList/u);
  assert.match(screenSource, /runInboxReadBatch/u);
  assert.doesNotMatch(screenSource, /inboxFeedFromSources|UnifiedInboxTabs|UnifiedFeedList|RelationshipSignalsCard/u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.notifications/u);
});

test("relationship inbox does not GET the POST-only proactive signal endpoint", () => {
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.proactiveTurns/u);
  assert.match(screenSource, /useNotificationInbox/u);
});

test("notification deep links fetch an authenticated delivery and expose signal actions", () => {
  assert.match(screenSource, /notificationDeliveryPath\(deliveryId\)/u);
  assert.match(screenSource, /agentSignalPath\(view\.signalId\)/u);
  assert.match(screenSource, /updateSignal\("acknowledged"\)/u);
  assert.match(screenSource, /updateSignal\("snoozed"\)/u);
  assert.match(screenSource, /updateSignal\("dismissed"\)/u);
  assert.match(screenSource, /locale\.t\(pendingAction === "snoozed"/u);
  assert.doesNotMatch(screenSource, /mark.*delivery.*complete/u);
});

test("notification delivery card binds themed styles locally", () => {
  const start = screenSource.indexOf("function NotificationDeliveryCard(");
  const end = screenSource.indexOf("function InboxContent(", start);

  assert.ok(start >= 0 && end > start);
  assert.match(screenSource.slice(start, end), /const \{ styles \} = useStyles\(\)/u);
});

test("relationship inbox hands reply drafts to an opaque stable-contact IORBIT prefill", () => {
  assert.match(screenSource, /retainedContactId\.current = page!\.conversation\.contactId/u);
  assert.match(screenSource, /registerAiTemplatePrefill/u);
  assert.match(screenSource, /inboxPolishTemplate\(\{ contactId, contactName: detail\.participantName, draft: body\.trim\(\) \}\)/u);
  assert.match(screenSource, /pathname: "\/ai\/\[id\]", params: \{ id: "new", prefillIntent \}/u);
  assert.match(screenSource, /label=\{locale\.t\("inbox\.polishDraft"\)\}/u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.chatAssistRewrite|buildRelationshipRewriteRequest|relationshipRewriteToDraft/u);
});

test("relationship inbox shows chat privacy controls from the web boundary", () => {
  assert.match(screenSource, /chatPrivacyControlsPath/u);
  assert.match(screenSource, /relationshipInboxErrorText/u);
  assert.match(screenSource, /relationshipPrivacyControlsToView/u);
  assert.match(screenSource, /buildRelationshipPrivacyToggleRequest/u);
  assert.match(
    screenSource,
    /clientGet\(chatPrivacyControlsPath\(detail\.conversationId\)\)/u
  );
  assert.match(
    screenSource,
    /clientPost\(request\.request\.endpoint,\s*request\.request\.body\)/u
  );
  assert.match(screenSource, /label=\{privacy\.toggleLabel\}/u);
  assert.match(screenSource, /locale\.t\("inbox\.privacy"\)/u);
});

test("relationship inbox privacy controls never render raw implementation errors", () => {
  const panelStart = screenSource.indexOf("function PrivacyControlsPanel");
  const composerStart = screenSource.indexOf("function ReplyComposer");
  const panelSource = screenSource.slice(panelStart, composerStart);

  assert.ok(panelStart >= 0);
  assert.ok(composerStart > panelStart);
  assert.doesNotMatch(
    panelSource,
    /setPrivacyError\(result\.error\?\.message/u
  );
  assert.doesNotMatch(panelSource, /setPrivacyError\([\s\S]*requestError\.message/u);
  assert.match(
    panelSource,
    /relationshipInboxErrorText\(\s*result\.error\?\.message,\s*locale\.t\("inbox\.privacyUnavailable"\),\s*locale\.language\s*\)/u
  );
  assert.match(
    panelSource,
    /relationshipInboxErrorText\(\s*requestError,\s*locale\.t\("inbox\.privacyUpdateFailed"\),\s*locale\.language\s*\)/u
  );
});

test("relationship inbox actions sanitize user-facing error text", () => {
  const screenActions = [
    {
      end: "function LabeledInput",
      fallback: "inbox\\.createDraftFailed",
      name: "NewThreadComposer",
      setter: "setError"
    }
  ];

  for (const action of screenActions) {
    const actionStart = screenSource.indexOf(`function ${action.name}`);
    const actionEnd = screenSource.indexOf(action.end);
    const actionSource = screenSource.slice(actionStart, actionEnd);

    assert.ok(actionStart >= 0);
    assert.ok(actionEnd > actionStart);
    assert.doesNotMatch(
      actionSource,
      new RegExp(`${action.setter}\\(result\\.error\\?\\.message`, "u")
    );
    assert.doesNotMatch(
      actionSource,
      new RegExp(`${action.setter}\\([\\s\\S]*requestError\\.message`, "u")
    );
    assert.match(
      actionSource,
      new RegExp(
        `${action.setter}\\([\\s\\S]*relationshipInboxErrorText\\([\\s\\S]*${action.fallback}`,
        "u"
      )
    );
  }
});

test("relationship inbox opens an existing thread before composing from a contact seed", () => {
  assert.match(screenSource, /relationshipConversationIdForContact/u);
  assert.match(screenSource, /seededConversationId/u);
  assert.match(screenSource, /onOpenConversation\(seededConversationId\)/u);
  assert.match(screenSource, /setComposing\(false\)/u);
});

test("relationship inbox opens threads on a dedicated detail route", () => {
  assert.ok(existsSync(detailRoutePath), "inbox detail route should exist");
  assert.match(screenSource, /useRouter/u);
  assert.match(
    screenSource,
    /router\.push\(`\/inbox\/\$\{encodeURIComponent\(conversationId\)\}` as Href\)/u
  );
  assert.match(screenSource, /export function RelationshipInboxThreadScreen/u);
  assert.match(screenSource, /relationshipCommunicationConversationPath\(conversationId\)/u);

  const listStart = screenSource.indexOf("function InboxContent");
  const listEnd = screenSource.indexOf("function InboxSegmentedControl");
  const listSource = screenSource.slice(listStart, listEnd);

  assert.doesNotMatch(listSource, /detail=\{view\.selected\}/u);
  assert.match(listSource, /onOpenConversation/u);
});

test("relationship inbox keeps non-persisted created threads as local previews", () => {
  assert.match(screenSource, /createdThread/u);
  assert.match(screenSource, /onSetCreatedThread\(thread\)/u);
  assert.match(screenSource, /previewOnly/u);

  const onCreatedStart = screenSource.indexOf("onCreated={(thread) => {");
  const onCreatedEnd = screenSource.indexOf("seed={seed}", onCreatedStart);
  const onCreatedSource = screenSource.slice(onCreatedStart, onCreatedEnd);

  assert.doesNotMatch(onCreatedSource, /onOpenConversation/u);
});
