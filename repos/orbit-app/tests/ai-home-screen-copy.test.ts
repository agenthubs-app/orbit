import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AiScreen.tsx"),
  "utf8"
);

test("Orbit AI home uses a compact Chinese chat entry", () => {
  assert.doesNotMatch(
    screenSource,
    /Ask first|直接问今天|让 AI 带你过去|已准备好|有什么需要处理|把问题发过来/u
  );
  assert.match(screenSource, /placeholder="询问 Orbit AI"/u);
  assert.match(screenSource, />Orbit AI</u);
  assert.doesNotMatch(screenSource, />我是您的人脉管家</u);
  assert.doesNotMatch(screenSource, /eyebrow=/u);
});

test("Orbit AI home pins the composer to the bottom of the chat", () => {
  assert.match(screenSource, /KeyboardAvoidingView/u);
  assert.match(screenSource, /<ChatTranscript/u);
  assert.match(screenSource, /<ChatComposer/u);
  assert.doesNotMatch(screenSource, /<AppScreen/u);

  const transcriptIndex = screenSource.indexOf("<ChatTranscript");
  const composerIndex = screenSource.indexOf("<ChatComposer");

  assert.notEqual(transcriptIndex, -1);
  assert.notEqual(composerIndex, -1);
  assert.ok(transcriptIndex < composerIndex);
});

test("Orbit AI home opens conversation history from the top right", () => {
  assert.match(screenSource, /accessibilityLabel="对话历史"/u);
  assert.match(screenSource, /OrbitAiHistoryPanel/u);
  assert.match(screenSource, /historyOpen/u);
  assert.match(screenSource, /onOpenHistory=\{\(\) => setHistoryOpen\(true\)\}/u);

  const menuIndex = screenSource.indexOf('accessibilityLabel="打开侧栏"');
  const historyIndex = screenSource.indexOf('accessibilityLabel="对话历史"');

  assert.notEqual(menuIndex, -1);
  assert.notEqual(historyIndex, -1);
  assert.ok(menuIndex < historyIndex);
});

test("Orbit AI composer menu carries card scanning and a new chat", () => {
  assert.match(screenSource, /ComposerMenuSheet/u);
  assert.match(screenSource, />扫名片</u);
  assert.match(screenSource, />新对话</u);
  assert.match(screenSource, /onScanCard=\{\(\) => openCapability\("\/contacts\/new" as Href\)\}/u);
});

test("Orbit AI home uses a ChatGPT-style drawer for shortcuts and history", () => {
  assert.match(screenSource, /OrbitAiDrawer/u);
  assert.match(screenSource, /drawerOpen/u);
  assert.match(screenSource, /Modal/u);
  assert.match(screenSource, /PanResponder/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.aiConversationSessions/u);
  assert.match(screenSource, /agentHistorySessionsToSummaries/u);
  assert.match(screenSource, /accessibilityLabel="打开侧栏"/u);
  assert.match(screenSource, />历史记录</u);
  assert.doesNotMatch(
    screenSource,
    /<CapabilityGrid onOpen=\{\(href\) => router\.push\(href\)\} \/>/u
  );
});

test("Orbit AI drawer can delete imported web session history", () => {
  assert.match(screenSource, /aiConversationSessionPath/u);
  assert.match(screenSource, /deletingHistoryId/u);
  assert.match(screenSource, /onDeleteHistoryItem/u);
  assert.match(
    screenSource,
    /client\.delete<unknown>\(\s*aiConversationSessionPath\(item\.id\)/u
  );
  assert.match(screenSource, /historyState\.refresh\(\)/u);
  assert.match(screenSource, />删除</u);
  assert.match(screenSource, />删除中</u);
  assert.match(screenSource, /item\.source !== "session"/u);
});

test("Orbit AI drawer keeps web sessions and normal AI conversations in history", () => {
  assert.doesNotMatch(
    screenSource,
    /sessionHistoryItems\.length > 0\s*\?\s*sessionHistoryItems\s*:\s*conversationHistoryItems/u
  );
  assert.match(
    screenSource,
    /const historyItems = \[\s*\.{3}sessionHistoryItems,\s*\.{3}conversationHistoryItems\s*\]/u
  );
});

test("Orbit AI drawer can search long history lists", () => {
  assert.match(screenSource, /historyQuery/u);
  assert.match(screenSource, /filteredHistoryItems/u);
  assert.match(screenSource, /placeholder="搜索历史"/u);
  assert.match(screenSource, /historyItems=\{filteredHistoryItems\}/u);

  const searchIndex = screenSource.indexOf('placeholder="搜索历史"');
  const listIndex = screenSource.indexOf("historyItems={filteredHistoryItems}");

  assert.notEqual(searchIndex, -1);
  assert.notEqual(listIndex, -1);
  assert.ok(searchIndex < listIndex);
});

test("Orbit AI home exposes the primary app destinations", () => {
  for (const href of [
    'href: "/events" as Href',
    'href: "/contacts" as Href',
    'href: "/schedule" as Href',
    'href: "/profile" as Href',
    'href: "/dashboard" as Href',
    'href: "/agent" as Href'
  ]) {
    assert.match(
      screenSource,
      new RegExp(href.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
    );
  }
});

test("Orbit AI drawer exposes every defined app destination", () => {
  assert.doesNotMatch(screenSource, /capabilityEntries\.slice\(/u);

  for (const href of [
    'href: "/events" as Href',
    'href: "/contacts" as Href',
    'href: "/schedule" as Href',
    'href: "/profile" as Href',
    'href: "/dashboard" as Href',
    'href: "/inbox" as Href',
    'href: "/followups" as Href',
    'href: "/chat" as Href',
    'href: "/party" as Href',
    'href: "/agent" as Href'
  ]) {
    assert.match(
      screenSource,
      new RegExp(href.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
    );
  }
});

test("Orbit AI home does not describe the personal profile inline", () => {
  assert.doesNotMatch(
    screenSource,
    /别人会看到的资料|资料已接入|正在读取你的关系资料|summary\.profileName|自我画像|个人画像/u
  );
});

test("Orbit AI home does not render the relationship workbench strip", () => {
  assert.doesNotMatch(
    screenSource,
    /OrbitContextStrip|bootstrapToSummary|bootstrapMetrics|ORBIT_API_ENDPOINTS\.bootstrap|Orbit 人脉工作台/u
  );
});

test("Orbit AI home keeps empty conversation guidance above the composer", () => {
  assert.doesNotMatch(screenSource, /EmptyState/u);
  assert.match(screenSource, /homeChat\.isEmpty \? \(/u);
  assert.match(screenSource, /suggestedPrompts\.map/u);
  assert.match(screenSource, /styles\.suggestionRow/u);
  assert.match(screenSource, /onPress=\{\(\) => setDraftMessage\(prompt\.label\)\}/u);
});

test("Orbit AI drawer gives every destination its own icon and tone", () => {
  assert.match(screenSource, /const toneStyles: Record<CapabilityTone/u);
  assert.match(screenSource, /FeaturedCapabilityTile/u);
  assert.match(screenSource, /CapabilityRow/u);
  assert.match(screenSource, /styles\.capabilityIcon, \{ backgroundColor: tone\.surface \}/u);

  for (const icon of [
    "calendar-outline",
    "people-outline",
    "time-outline",
    "file-tray-full-outline",
    "grid-outline",
    "checkmark-done-outline",
    "chatbubbles-outline",
    "ticket-outline",
    "sparkles-outline",
    "person-circle-outline"
  ]) {
    assert.match(screenSource, new RegExp(`icon: "${icon}"`, "u"));
  }
});

test("Orbit AI drawer keeps a settings entry pinned at the bottom", () => {
  assert.match(screenSource, /const settingsEntry/u);
  assert.match(screenSource, /title: "设置"/u);
  assert.match(screenSource, /href: "\/account" as Href/u);
  assert.match(screenSource, /styles\.drawerFooter/u);
  assert.match(screenSource, /entry=\{settingsEntry\}/u);
});

test("Orbit AI home leaves proactive check-ins to the relationship inbox", () => {
  assert.doesNotMatch(screenSource, /主动提醒/u);
  assert.doesNotMatch(screenSource, /requestProactiveBrief|proactiveTurnPayloadToChatView/u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.proactiveTurns/u);
});

test("Orbit AI drawer avoids deprecated React Native shadow props", () => {
  const drawerPanelStart = screenSource.indexOf("drawerPanel:");
  const drawerScrimStart = screenSource.indexOf("drawerScrim:");
  const drawerPanelSource = screenSource.slice(drawerPanelStart, drawerScrimStart);

  assert.notEqual(drawerPanelStart, -1);
  assert.notEqual(drawerScrimStart, -1);
  assert.match(drawerPanelSource, /boxShadow:/u);
  assert.doesNotMatch(
    drawerPanelSource,
    /shadowColor|shadowOffset|shadowOpacity|shadowRadius/u
  );
});
