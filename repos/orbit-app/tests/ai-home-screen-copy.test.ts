import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AiScreen.tsx"),
  "utf8"
);

test("Orbit AI home uses a compact localized chat entry", () => {
  assert.doesNotMatch(
    screenSource,
    /Ask first|直接问今天|让 AI 带你过去|已准备好|有什么需要处理|把问题发过来/u
  );
  assert.match(screenSource, /placeholder=\{locale\.t\("ai\.askPlaceholder"\)\}/u);
  assert.match(screenSource, />IORBIT</u);
  assert.doesNotMatch(screenSource, />我是您的人脉管家</u);
  assert.doesNotMatch(screenSource, /eyebrow=/u);
});

test("Orbit AI home pins the composer to the bottom of the chat", () => {
  assert.doesNotMatch(screenSource, /KeyboardAvoidingView/u);
  assert.match(screenSource, /Keyboard\.isVisible\(\)/u);
  assert.match(screenSource, /keyboardWillChangeFrame/u);
  assert.match(screenSource, /keyboardBottomInset > 0/u);
  assert.match(screenSource, /paddingBottom: keyboardBottomInset/u);
  assert.match(screenSource, /<ChatTranscript/u);
  assert.match(screenSource, /<ChatComposer/u);
  assert.doesNotMatch(screenSource, /<AppScreen/u);

  const transcriptIndex = screenSource.indexOf("<ChatTranscript");
  const composerIndex = screenSource.indexOf("<ChatComposer");

  assert.notEqual(transcriptIndex, -1);
  assert.notEqual(composerIndex, -1);
  assert.ok(transcriptIndex < composerIndex);
});

test("Orbit AI composer controls keep the 44 point touch baseline", () => {
  for (const styleName of ["composerPlusButton", "composerSendButton"]) {
    assert.match(
      screenSource,
      new RegExp(`${styleName}:[\\s\\S]*?height: 44[\\s\\S]*?width: 44`, "u")
    );
  }
});

test("Orbit AI home opens conversation history from the top right", () => {
  assert.match(screenSource, /accessibilityLabel=\{locale\.t\("ai\.history"\)\}/u);
  assert.match(screenSource, /OrbitAiHistoryPanel/u);
  assert.match(screenSource, /historyOpen/u);
  assert.match(screenSource, /onOpenHistory=\{\(\) => setHistoryOpen\(true\)\}/u);

  const menuIndex = screenSource.indexOf('accessibilityLabel={locale.t("ai.home")}');
  const historyIndex = screenSource.indexOf('accessibilityLabel={locale.t("ai.history")}');

  assert.notEqual(menuIndex, -1);
  assert.notEqual(historyIndex, -1);
  assert.ok(menuIndex < historyIndex);
});

test("Orbit AI composer menu carries card scanning and a new chat", () => {
  assert.match(screenSource, /ComposerMenuSheet/u);
  assert.match(screenSource, /locale\.t\("ai\.scanCard"\)/u);
  assert.match(screenSource, /locale\.t\("ai\.newChat"\)/u);
  assert.match(screenSource, /onScanCard=\{\(\) => openCapability\("\/contacts\/new" as Href\)\}/u);
});

test("Orbit AI home uses a ChatGPT-style drawer for shortcuts and history", () => {
  assert.match(screenSource, /OrbitAiDrawer/u);
  assert.match(screenSource, /drawerOpen/u);
  assert.match(screenSource, /Modal/u);
  assert.match(screenSource, /PanResponder/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.aiConversationSessions/u);
  // Actual source-specific rows and menu navigation are covered by the
  // private-route/HTTP tests in ink-signal-ai-home.test.ts.
  assert.match(screenSource, /aiHistoryRows/u);
  assert.match(screenSource, /locale\.t\("ai\.commonEntries"\)/u);
  assert.match(screenSource, /locale\.t\("ai\.historyTitle"\)/u);
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
  // Deletion receipt and source-only refresh are exercised through real HTTP.
  assert.match(screenSource, /setHistoryAttempt/u);
  assert.match(screenSource, /locale\.t\("ai\.deleteHistory"\)/u);
  assert.match(screenSource, /locale\.t\("ai\.deleting"\)/u);
  assert.match(screenSource, /item\.source !== "session"/u);
});

test("Orbit AI history keeps open and delete actions as sibling buttons", () => {
  const rowStart = screenSource.indexOf("function DrawerHistoryRow");
  const stylesStart = screenSource.indexOf("const styles", rowStart);
  const rowSource = screenSource.slice(rowStart, stylesStart);

  assert.match(rowSource, /<View style=\{styles\.drawerHistoryRow\}>/u);
  assert.match(
    rowSource,
    /accessibilityLabel=\{locale\.t\("ai\.openHistoryNamed", \{ title: item\.title \}\)\}/u
  );
  assert.match(rowSource, /accessibilityLabel=\{locale\.t\("ai\.deleteHistory"\)\}/u);
  assert.doesNotMatch(
    rowSource,
    /<Pressable[\s\S]*styles\.drawerHistoryRow[\s\S]*<Pressable/u
  );
  assert.match(screenSource, /historyDeleteButton:[\s\S]*minHeight: 44/u);
});

test("Orbit AI drawer keeps web sessions and normal AI conversations in history", () => {
  assert.doesNotMatch(
    screenSource,
    /sessionHistoryItems\.length > 0\s*\?\s*sessionHistoryItems\s*:\s*conversationHistoryItems/u
  );
  // Real mixed-source ordering and continuation routes are covered by
  // ink-signal-ai-home.test.ts rather than the old private array syntax.
  assert.match(screenSource, /const historyItems = aiHistoryRows/u);
});

test("Orbit AI session search and group filters are part of the server page scope", () => {
  assert.match(screenSource, /historyQuery/u);
  assert.match(screenSource, /historyParams.set\("q", historyQueryParam\)/u);
  assert.match(screenSource, /historyParams.set\("groupId", selectedGroupId\)/u);
  assert.match(screenSource, /params.set\("q", historyQueryParam\)/u);
  assert.match(screenSource, /latestHistoryFilterIdentity.current !== identity/u);
  assert.match(screenSource, /placeholder=\{locale\.t\("ai\.searchHistory"\)\}/u);
  assert.match(screenSource, /historyItems=\{historyItems\}/u);
  assert.match(screenSource, /"ai\.loadMoreHistory"/u);
  assert.match(screenSource, /"ai\.loadingMoreHistory"/u);
  assert.match(screenSource, /"ai\.retryMoreHistory"/u);
  assert.match(screenSource, /aiSessionSummaryPageSchema/u);
  assert.doesNotMatch(screenSource, /v=2|loadRemainingHistory|page < 199/u);

  const panelStart = screenSource.indexOf("function OrbitAiHistoryPanel");
  const searchIndex = screenSource.indexOf('placeholder={locale.t("ai.searchHistory")}', panelStart);
  const listIndex = screenSource.indexOf("<DrawerHistoryList", panelStart);

  assert.notEqual(searchIndex, -1);
  assert.notEqual(listIndex, -1);
  assert.ok(searchIndex < listIndex);
});

test("Orbit AI drawer exposes three workspace goals and keeps inbox in the header", () => {
  for (const href of [
    'href: "/today" as Href',
    'href: "/contacts" as Href',
    'href: "/events" as Href'
  ]) {
    assert.match(
      screenSource,
      new RegExp(href.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
    );
  }

  for (const href of [
    'href: "/dashboard" as Href',
    'href: "/followups" as Href',
    'href: "/chat" as Href',
    'href: "/party" as Href',
    'href: "/agent" as Href',
    'href: "/profile" as Href'
  ]) {
    assert.doesNotMatch(
      screenSource,
      new RegExp(href.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
    );
  }

  for (const titleKey of ["ai.capabilityToday", "ai.capabilityContacts", "ai.capabilityEvents"]) {
    assert.match(screenSource, new RegExp(`titleKey: "${titleKey.replace(".", "\\.")}"`, "u"));
  }
  assert.doesNotMatch(screenSource, /titleKey: "ai\.openInbox"/u);
  assert.doesNotMatch(
    screenSource,
    /关系仪表盘|关系对话|活动现场|动作中心|更多入口/u
  );
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
  // The approved home keeps its guidance visible alongside recent history.
  assert.match(screenSource, /suggestedPrompts\.map/u);
  assert.match(screenSource, /styles\.suggestionRow/u);
  // Filling/editing remains non-writing in ink-signal-ai-home.test.ts.
});

test("Orbit AI home renders Today tasks and schedule before chat messages", () => {
  assert.match(screenSource, /OrbitNextActions/u);
  assert.match(screenSource, /todaySummaryPath\("Asia\/Tokyo"\)/u);
  assert.match(screenSource, /todaySummaryToHomeView/u);
  assert.match(screenSource, /todaySummaryQuestions/u);
  assert.doesNotMatch(screenSource, /todayPath\(|todayHomeSummary|todayHomeQuestions/u);
  assert.match(screenSource, /openTaskCount/u);
  assert.doesNotMatch(screenSource, /agentSignalsHomePath|agentSignalPath|agentSignalsToNextActions/u);

  const actionsIndex = screenSource.indexOf("<OrbitNextActions");
  const messagesIndex = screenSource.indexOf("chat.messages.map");

  assert.notEqual(actionsIndex, -1);
  assert.notEqual(messagesIndex, -1);
  assert.ok(actionsIndex < messagesIndex);
});

test("Orbit AI keeps suggestions separate from tasks and uses the Today count in the drawer", () => {
  assert.match(screenSource, /onOpenSuggestions=\{\(\) => openCapability\("\/today" as Href\)\}/u);
  assert.match(screenSource, /todayBadge=\{todaySummaryView\.openTaskCount\}/u);
  assert.doesNotMatch(screenSource, /nextActionsBadge/u);
});

test("Orbit AI home does not auto-scroll past next actions", () => {
  const transcriptStart = screenSource.indexOf("function ChatTranscript");
  const composerStart = screenSource.indexOf("function ChatComposer");
  const transcriptSource = screenSource.slice(transcriptStart, composerStart);

  assert.doesNotMatch(transcriptSource, /onContentSizeChange/u);
  assert.doesNotMatch(transcriptSource, /scrollToEnd/u);
});

test("Orbit AI drawer integrates workspace shortcuts, inbox, search, and recent history", () => {
  assert.match(screenSource, /const toneStyles = \(colors: OrbitColors\): Record<CapabilityTone/u);
  assert.match(screenSource, /CapabilityRow/u);
  assert.match(screenSource, /styles\.capabilityIcon, \{ backgroundColor: tone\.surface \}/u);
  assert.match(screenSource, /styles\.drawerRowGroup/u);
  assert.doesNotMatch(screenSource, /FeaturedCapabilityTile/u);
  assert.doesNotMatch(screenSource, /drawerFeaturedGrid/u);
  assert.match(screenSource, />Orbit AI</u);
  assert.match(screenSource, /accessibilityLabel=\{locale\.t\("ai\.openInbox"\)\}/u);
  assert.match(screenSource, /placeholder=\{locale\.t\("ai\.searchConversations"\)\}/u);
  assert.match(screenSource, /locale\.t\("ai\.recentChats"\)/u);
  assert.match(screenSource, /historyItems\.slice\(0, 8\)/u);
  assert.match(screenSource, /accessibilityLabel=\{locale\.t\("ai\.newChat"\)\}/u);

  for (const icon of [
    "calendar-outline",
    "people-outline",
    "ticket-outline"
  ]) {
    assert.match(screenSource, new RegExp(`icon: "${icon}"`, "u"));
  }
  assert.doesNotMatch(screenSource, /titleKey: "ai\.openInbox"/u);
});

test("Orbit AI drawer combines the signed-in account and settings in its footer", () => {
  assert.match(screenSource, /useOrbitAuthSession/u);
  assert.match(screenSource, /mobileUserDisplayName/u);
  // Real login names and the missing-name fallback are rendered and exercised
  // through the real drawer in ink-signal-ai-home.test.ts.
  assert.match(screenSource, /styles\.drawerFooter/u);
  assert.match(screenSource, /styles\.drawerAccount/u);
  assert.match(screenSource, /onOpenCapability\("\/profile" as Href\)/u);
  assert.match(screenSource, /onOpenCapability\("\/settings" as Href\)/u);
  assert.match(screenSource, /accessibilityLabel=\{locale\.t\("ai\.openProfile"\)\}/u);
  assert.match(screenSource, /accessibilityLabel=\{locale\.t\("ai\.openSettings"\)\}/u);
  assert.doesNotMatch(screenSource, /const settingsEntry/u);
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
