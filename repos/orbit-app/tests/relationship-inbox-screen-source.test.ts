import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "inbox", "RelationshipInboxScreen.tsx"),
  "utf8"
);

test("relationship inbox screen presents mobile inbox sections for alerts and threads", () => {
  assert.match(screenSource, /type InboxSection = "alerts" \| "threads"/u);
  assert.match(screenSource, /SegmentButton/u);
  assert.match(screenSource, /activeSection/u);
  assert.match(screenSource, /提醒/u);
  assert.match(screenSource, /对话/u);
});

test("relationship inbox alerts can be dismissed locally like the web inbox panel", () => {
  assert.match(screenSource, /dismissedAlertIds/u);
  assert.match(screenSource, /onDismissAlert/u);
  assert.match(screenSource, /label="忽略"/u);
});

test("relationship inbox does not GET the POST-only proactive signal endpoint", () => {
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.proactiveTurns/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.notifications/u);
});

test("notification deep links fetch an authenticated delivery and expose signal actions", () => {
  assert.match(screenSource, /notificationDeliveryPath\(deliveryId\)/u);
  assert.match(screenSource, /agentSignalPath\(view\.signalId\)/u);
  assert.match(screenSource, /updateSignal\("acknowledged"\)/u);
  assert.match(screenSource, /updateSignal\("snoozed"\)/u);
  assert.match(screenSource, /updateSignal\("dismissed"\)/u);
  assert.match(screenSource, /label=\{pendingAction === "snoozed"/u);
  assert.doesNotMatch(screenSource, /mark.*delivery.*complete/u);
});

test("relationship inbox can rewrite reply drafts through the web assist boundary", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.chatAssistRewrite/u);
  assert.match(screenSource, /buildRelationshipRewriteRequest/u);
  assert.match(screenSource, /relationshipRewriteToDraft/u);
  assert.match(screenSource, /label="润色草稿"/u);
  assert.match(screenSource, /setBody\(rewrite\.body\)/u);
  assert.doesNotMatch(screenSource, /send-message/u);
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
  assert.match(screenSource, /"隐私控制"/u);
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
    /relationshipInboxErrorText\(\s*result\.error\?\.message,\s*"隐私控制暂时不可用。"\s*\)/u
  );
  assert.match(
    panelSource,
    /relationshipInboxErrorText\(\s*requestError,\s*"隐私控制暂时更新不了。"\s*\)/u
  );
});

test("relationship inbox actions sanitize user-facing error text", () => {
  const screenActions = [
    {
      end: "function MetricPill",
      fallback: "这条线索暂时确认不了。",
      name: "RelationshipSignalsCard",
      setter: "setActionError"
    },
    {
      end: "function NewThreadComposer",
      fallback: "这段草稿暂时润色不了。",
      name: "ReplyComposer",
      setter: "setRewriteError"
    },
    {
      end: "function LabeledInput",
      fallback: "这段草稿暂时创建不了。",
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

test("relationship inbox shows and confirms email or calendar relationship signals", () => {
  assert.match(screenSource, /relationshipSignalsEmailCalendar/u);
  assert.match(screenSource, /relationshipSignalsToView/u);
  assert.match(screenSource, /buildRelationshipSignalConfirmRequest/u);
  assert.match(screenSource, /relationshipSignalConfirmToView/u);
  assert.match(screenSource, /RelationshipSignalsCard/u);
  assert.match(screenSource, /onConfirmSignal/u);
  assert.match(screenSource, /label="确认线索"/u);
  assert.match(screenSource, /title="关系线索"/u);
});

test("relationship inbox opens an existing thread before composing from a contact seed", () => {
  assert.match(screenSource, /relationshipConversationIdForContact/u);
  assert.match(screenSource, /seededConversationId/u);
  assert.match(screenSource, /onSelectConversation\(seededConversationId\)/u);
  assert.match(screenSource, /setComposing\(false\)/u);
});

test("relationship inbox opens to searchable conversation history like the web inbox panel", () => {
  assert.match(screenSource, /useState<InboxSection>\("threads"\)/u);
  assert.match(screenSource, /visibleConversations/u);
  assert.match(screenSource, /placeholder="搜索对话"/u);

  const searchIndex = screenSource.indexOf('placeholder="搜索对话"');
  const listIndex = screenSource.indexOf("visibleConversations.map");

  assert.notEqual(searchIndex, -1);
  assert.notEqual(listIndex, -1);
  assert.ok(searchIndex < listIndex);
});

test("relationship inbox labels the combined signal and reminder segment as pending work", () => {
  assert.match(screenSource, /alertCount=\{visibleAlerts\.length \+ signalCount\}/u);
  assert.match(screenSource, /label="待处理"/u);
  assert.doesNotMatch(
    screenSource,
    /alertCount=\{visibleAlerts\.length \+ signalCount\}[\s\S]*label="提醒"/u
  );
});
