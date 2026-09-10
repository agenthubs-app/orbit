import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets
} from "react-native-safe-area-context";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationSessionPath,
  todayPath
} from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { agentHistorySessionsToSummaries } from "../../view-models/agent-history";
import { mobileUserDisplayName } from "../../view-models/mobile-profile";
import {
  conversationsToSummaries,
  orbitAiHomeChatWindow,
  type ChatMessageView,
  type OrbitAiHomeChatWindow
} from "../../view-models/conversations";
import {
  todayHomeSummary,
  todayHomeQuestions,
  type TodayHomeActionView
} from "../../view-models/today-tasks";
import { OrbitNextActions } from "./OrbitNextActions";
import { homeQuestionSnapshot, type HomeQuestionSnapshot } from "../../view-models/home-question-snapshot";

type CapabilityTone = "accent" | "amber" | "live" | "sky";

const capabilityEntries: {
  detail: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tone: CapabilityTone;
}[] = [
  {
    detail: "待办与日程",
    href: "/today" as Href,
    icon: "calendar-outline",
    title: "今天",
    tone: "accent"
  },
  {
    detail: "联系人、关系进展与分析",
    href: "/contacts" as Href,
    icon: "people-outline",
    title: "人脉",
    tone: "sky"
  },
  {
    detail: "发现、报名与现场",
    href: "/events" as Href,
    icon: "ticket-outline",
    title: "活动",
    tone: "live"
  }
];

const toneStyles = (colors: OrbitColors): Record<CapabilityTone, { icon: string; surface: string }> => ({
  accent: { icon: colors.accent, surface: colors.accentSofter },
  amber: { icon: colors.amber, surface: colors.amberSoft },
  live: { icon: colors.live, surface: colors.liveSoft },
  sky: { icon: colors.sky, surface: colors.skySoft }
});

type AiDrawerHistoryItem = {
  id: string;
  pinned: boolean;
  preview: string;
  source: "conversation" | "session";
  title: string;
  when: string;
};

function optionalParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

type KeyboardFrame = {
  height: number;
  screenY: number;
};

function useStableKeyboardBottomInset(): number {
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrame | null>(
    () => {
      const metrics =
        Platform.OS === "ios" && Keyboard.isVisible()
          ? Keyboard.metrics()
          : undefined;

      return metrics
        ? { height: metrics.height, screenY: metrics.screenY }
        : null;
    }
  );

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    const frameSubscription = Keyboard.addListener(
      "keyboardWillChangeFrame",
      (event) => {
        const nextFrame = {
          height: event.endCoordinates.height,
          screenY: event.endCoordinates.screenY
        };

        setKeyboardFrame((currentFrame) =>
          currentFrame?.height === nextFrame.height &&
          currentFrame.screenY === nextFrame.screenY
            ? currentFrame
            : nextFrame
        );
      }
    );
    const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardFrame(null);
    });

    return () => {
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (!keyboardFrame) {
    return 0;
  }

  const viewportBottom = viewportHeight - safeAreaBottom;
  const keyboardBottom = keyboardFrame.screenY + keyboardFrame.height;
  const keyboardIsDocked = keyboardBottom >= viewportBottom - 1;

  return keyboardIsDocked
    ? Math.max(0, viewportBottom - keyboardFrame.screenY)
    : 0;
}

export function AiScreen() {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const params = useLocalSearchParams<{ drawer?: string | string[] }>();
  const keyboardBottomInset = useStableKeyboardBottomInset();
  const client = useOrbitApiClient();
  const inboxBadge = useRelationshipInboxBadgeCount();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    (data) => conversationsToSummaries(data).length === 0
  );
  const historyState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.aiConversationSessions,
    (data) => agentHistorySessionsToSummaries(data).length === 0
  );
  const todayState = useApiResource<unknown>(
    todayPath("Asia/Tokyo"),
    (data) => todayHomeSummary(data).items.length === 0
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [startedNewChat, setStartedNewChat] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyDeleteError, setHistoryDeleteError] = useState<string | null>(
    null
  );
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const homeChat = orbitAiHomeChatWindow(
    startedNewChat || state.kind !== "success" ? null : state.data
  );
  const sessionHistoryItems: AiDrawerHistoryItem[] =
    historyState.kind === "success"
      ? agentHistorySessionsToSummaries(historyState.data).map((item) => ({
          id: item.id,
          pinned: item.pinned,
          preview: item.preview,
          source: "session",
          title: item.title,
          when: item.when
        }))
      : [];
  const conversationHistoryItems: AiDrawerHistoryItem[] =
    state.kind === "success"
      ? conversationsToSummaries(state.data)
          .slice(0, 12)
          .map((item) => ({
            id: item.id,
            pinned: false,
            preview: item.preview,
            source: "conversation",
            title: item.title,
            when: "最近"
          }))
      : [];
  const historyItems = [
    ...sessionHistoryItems,
    ...conversationHistoryItems
  ];
  const todayPayload =
    todayState.kind === "success" || todayState.kind === "empty"
      ? todayState.data
      : null;
  const todaySummary = todayHomeSummary(todayPayload);
  const [questionSnapshot, setQuestionSnapshot] = useState<HomeQuestionSnapshot | null>(null);
  const nextQuestionSnapshot = homeQuestionSnapshot(questionSnapshot, {
    scope: JSON.stringify([baseUrl, auth.user?.id ?? null]),
    payload: todayPayload,
    ready: auth.ready && todayState.kind !== "loading",
    refreshing: todayState.refreshing
  });
  if (nextQuestionSnapshot !== questionSnapshot) setQuestionSnapshot(nextQuestionSnapshot);
  const suggestedPrompts = nextQuestionSnapshot.questions ?? todayHomeQuestions(null);
  const todayError =
    todayState.kind === "offline" || todayState.kind === "failure"
      ? todayState.error.message
      : null;
  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 24 && Math.abs(gesture.dy) < 28,
        onPanResponderRelease: (_event, gesture) => {
          if (!drawerOpen && gesture.moveX < 54 && gesture.dx > 64) {
            setDrawerOpen(true);
          }

          if (drawerOpen && gesture.dx < -64) {
            setDrawerOpen(false);
          }
        }
      }),
    [drawerOpen]
  );

  useEffect(() => {
    if (optionalParam(params.drawer) === "1") {
      setDrawerOpen(true);
    }
  }, [params.drawer]);

  function refresh() {
    state.refresh();
    historyState.refresh();
    todayState.refresh();
  }

  function openTodayAction(item: TodayHomeActionView) {
    router.push(item.href as Href);
  }

  function sendMessage() {
    const message = draftMessage.trim();

    if (!message) {
      setSendError("先输入问题。");
      return;
    }

    setSendError(null);
    setDraftMessage("");
    router.push({
      params: { id: "new", initialMessage: message },
      pathname: "/ai/[id]"
    });
  }

  function startNewChat() {
    setComposerMenuOpen(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
    setStartedNewChat(true);
    setDraftMessage("");
    setSendError(null);
  }

  function openCapability(href: Href) {
    setDrawerOpen(false);
    setComposerMenuOpen(false);
    router.push(href);
  }

  function openHistoryItem(item: AiDrawerHistoryItem) {
    setHistoryOpen(false);
    setDrawerOpen(false);

    if (item.source === "session") {
      router.push({
        params: { id: item.id, source: "session" },
        pathname: "/ai/[id]"
      });
      return;
    }

    router.push(`/ai/${encodeURIComponent(item.id)}` as Href);
  }

  async function deleteHistoryItem(item: AiDrawerHistoryItem) {
    if (item.source !== "session") {
      return;
    }

    setDeletingHistoryId(item.id);
    setHistoryDeleteError(null);

    const result = await client.delete<unknown>(
      aiConversationSessionPath(item.id)
    );

    if (result.success) {
      historyState.refresh();
    } else {
      setHistoryDeleteError(result.error.message);
    }

    setDeletingHistoryId(null);
  }

  return (
    <SafeAreaView edges={["bottom", "top"]} style={styles.safeArea}>
      <View {...drawerPanResponder.panHandlers} style={styles.chatRoot}>
        <ChatTopBar
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <View
          style={[
            styles.chatBody,
            keyboardBottomInset > 0
              ? { paddingBottom: keyboardBottomInset }
              : null
          ]}
        >
          <ChatTranscript
            chat={homeChat}
            onRefresh={refresh}
            refreshing={
              state.refreshing ||
              historyState.refreshing ||
              todayState.refreshing
            }
          >
            <OrbitNextActions
              error={todayError}
              loading={todayState.kind === "loading"}
              onOpen={openTodayAction}
              onOpenSuggestions={() => router.push("/today" as Href)}
              onRefresh={todayState.refresh}
              summary={todaySummary}
            />
            {homeChat.isEmpty ? (
              <View style={styles.suggestionList}>
                <Text style={styles.suggestionHeading}>试着问我</Text>
                {suggestedPrompts.map((prompt) => (
                  <Pressable
                    accessibilityLabel={`填入问题：${prompt.label}`}
                    accessibilityHint="填入输入框后，你仍可修改或确认发送"
                    accessibilityRole="button"
                    key={prompt.kind}
                    onPress={() => setDraftMessage(prompt.label)}
                    style={({ pressed }) => [
                      styles.suggestionRow,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Text style={styles.suggestionText}>{prompt.label}</Text>
                    <Ionicons color={colors.text3} name="arrow-up" size={20} style={{ transform: [{ rotate: "-45deg" }] }} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {state.kind === "loading" ? <LoadingState /> : null}
            {state.kind === "offline" ? (
              <ErrorState message={state.error.message} title="服务器连不上" />
            ) : null}
            {state.kind === "failure" ? (
              <ErrorState message={state.error.message} />
            ) : null}
          </ChatTranscript>
          {sendError ? (
            <Text style={styles.composerError}>{sendError}</Text>
          ) : null}
          <ChatComposer
            draftMessage={draftMessage}
            onDraftMessageChange={setDraftMessage}
            onOpenMenu={() => setComposerMenuOpen(true)}
            onSend={sendMessage}
          />
        </View>
      </View>
      <OrbitAiDrawer
        accountName={mobileUserDisplayName(auth.user, "小雨")}
        inboxBadge={inboxBadge}
        historyItems={historyItems}
        todayBadge={todaySummary.openTaskCount}
        onClose={() => setDrawerOpen(false)}
        onNewChat={startNewChat}
        onOpenCapability={openCapability}
        onOpenHistoryItem={openHistoryItem}
        visible={drawerOpen}
      />
      <OrbitAiHistoryPanel
        deletingHistoryId={deletingHistoryId}
        historyDeleteError={historyDeleteError}
        historyItems={historyItems}
        historyStateKind={historyState.kind}
        onClose={() => setHistoryOpen(false)}
        onDeleteHistoryItem={deleteHistoryItem}
        onOpenHistoryItem={openHistoryItem}
        visible={historyOpen}
      />
      <ComposerMenuSheet
        onClose={() => setComposerMenuOpen(false)}
        onNewChat={startNewChat}
        onScanCard={() => openCapability("/contacts/new" as Href)}
        visible={composerMenuOpen}
      />
    </SafeAreaView>
  );
}

function ChatTopBar({
  onOpenDrawer,
  onOpenHistory
}: {
  onOpenDrawer: () => void;
  onOpenHistory: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel="打开侧栏"
        accessibilityRole="button"
        onPress={onOpenDrawer}
        style={({ pressed }) => [
          styles.topBarButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.ink} name="menu-outline" size={21} />
      </Pressable>
      <Text style={styles.topBarTitle}>Orbit AI</Text>
      <Pressable
        accessibilityLabel="对话历史"
        accessibilityRole="button"
        onPress={onOpenHistory}
        style={({ pressed }) => [
          styles.topBarButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.ink} name="chatbubble-outline" size={19} />
      </Pressable>
    </View>
  );
}

function messageTimestamp(message: ChatMessageView): string {
  if (!message.createdAt) {
    return "";
  }

  const timestamp = Date.parse(message.createdAt);

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).format(new Date(timestamp));
}

function ChatTranscript({
  chat,
  children,
  onRefresh,
  refreshing
}: {
  chat: OrbitAiHomeChatWindow;
  children?: React.ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { colors, styles } = useStyles();
  return (
    <ScrollView
      contentContainerStyle={styles.transcriptContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          onRefresh={onRefresh}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      style={styles.transcript}
    >
      {children}
      {chat.messages.map((message) => {
        const isUser = message.role === "user";
        const when = messageTimestamp(message);

        return (
          <View
            key={message.id}
            style={[styles.messageRow, isUser ? styles.messageRowUser : null]}
          >
            <View style={isUser ? styles.messageBubbleUser : styles.messagePlain}>
              <Text
                style={[
                  styles.messageText,
                  isUser ? styles.messageTextUser : null
                ]}
              >
                {message.content}
              </Text>
            </View>
            {when && !isUser ? (
              <Text style={styles.messageTime}>{when}</Text>
            ) : null}
          </View>
        );
      })}
      {chat.proposedToolIntents.length > 0 ? (
        <View style={styles.intentList}>
          {chat.proposedToolIntents.slice(0, 2).map((intent) => (
            <View key={intent.id} style={styles.intentPill}>
              <Ionicons color={colors.accent} name="sparkles-outline" size={14} />
              <Text numberOfLines={2} style={styles.intentText}>
                {intent.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ChatComposer({
  draftMessage,
  onDraftMessageChange,
  onOpenMenu,
  onSend
}: {
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
  onOpenMenu: () => void;
  onSend: () => void;
}) {
  const { colors, styles } = useStyles();
  const canSend = draftMessage.trim().length > 0;

  return (
    <View style={styles.composerBar}>
      <Pressable
        accessibilityLabel="更多操作"
        accessibilityRole="button"
        onPress={onOpenMenu}
        style={({ pressed }) => [
          styles.composerPlusButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.ink} name="add" size={22} />
      </Pressable>
      <TextInput
        multiline
        onChangeText={onDraftMessageChange}
        placeholder="询问 Orbit AI"
        placeholderTextColor={colors.text4}
        style={styles.composerInput}
        value={draftMessage}
      />
      <Pressable
        accessibilityLabel="发送"
        accessibilityRole="button"
        disabled={!canSend}
        onPress={onSend}
        style={({ pressed }) => [
          styles.composerSendButton,
          canSend ? null : styles.composerSendButtonIdle,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons
          color={canSend ? colors.onAccent : colors.text4}
          name="arrow-up"
          size={19}
        />
      </Pressable>
    </View>
  );
}

function ComposerMenuSheet({
  onClose,
  onNewChat,
  onScanCard,
  visible
}: {
  onClose: () => void;
  onNewChat: () => void;
  onScanCard: () => void;
  visible: boolean;
}) {
  const { colors, styles } = useStyles();
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityLabel="关闭菜单"
          onPress={onClose}
          style={styles.sheetScrim}
        />
        <View style={styles.sheetPanel}>
          <Pressable
            accessibilityRole="button"
            onPress={onScanCard}
            style={({ pressed }) => [
              styles.sheetRow,
              pressed ? styles.pressed : null
            ]}
          >
            <View style={styles.sheetRowIcon}>
              <Ionicons color={colors.ink} name="scan-outline" size={19} />
            </View>
            <Text style={styles.sheetRowText}>扫名片</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onNewChat}
            style={({ pressed }) => [
              styles.sheetRow,
              pressed ? styles.pressed : null
            ]}
          >
            <View style={styles.sheetRowIcon}>
              <Ionicons color={colors.ink} name="create-outline" size={19} />
            </View>
            <Text style={styles.sheetRowText}>新对话</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OrbitAiDrawer({
  accountName,
  historyItems,
  inboxBadge,
  todayBadge,
  onClose,
  onNewChat,
  onOpenCapability,
  onOpenHistoryItem,
  visible
}: {
  accountName: string;
  historyItems: AiDrawerHistoryItem[];
  inboxBadge: number | undefined;
  todayBadge: number;
  onClose: () => void;
  onNewChat: () => void;
  onOpenCapability: (href: Href) => void;
  onOpenHistoryItem: (item: AiDrawerHistoryItem) => void;
  visible: boolean;
}) {
  const { colors, styles } = useStyles();
  const [historyQuery, setHistoryQuery] = useState("");
  const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
  const filteredHistoryItems = normalizedQuery
    ? historyItems.filter((item) =>
        `${item.title} ${item.preview}`.toLocaleLowerCase().includes(normalizedQuery)
      )
    : historyItems;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.drawerModalRoot}>
        <Pressable
          accessibilityLabel="关闭侧栏"
          onPress={onClose}
          style={styles.drawerScrim}
        />
        <View style={styles.drawerPanel}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Orbit AI</Text>
            <View style={styles.drawerHeaderActions}>
              <Pressable
                accessibilityLabel="打开收件箱"
                accessibilityRole="button"
                onPress={() => onOpenCapability("/inbox" as Href)}
                style={({ pressed }) => [styles.drawerIconButton, pressed ? styles.pressed : null]}
              >
                <Ionicons color={colors.text2} name="file-tray-full-outline" size={19} />
                {inboxBadge ? <View style={styles.drawerInboxDot} /> : null}
              </Pressable>
              <Pressable
                accessibilityLabel="关闭侧栏"
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.drawerIconButton, pressed ? styles.pressed : null]}
              >
                <Ionicons color={colors.text2} name="close" size={20} />
              </Pressable>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.drawerBody}
            showsVerticalScrollIndicator={false}
            style={styles.drawerScroll}
          >
            <Pressable
              accessibilityLabel="新对话"
              accessibilityRole="button"
              onPress={onNewChat}
              style={({ pressed }) => [styles.drawerNewChat, pressed ? styles.pressed : null]}
            >
              <Ionicons color={colors.onAccent} name="create-outline" size={19} />
              <Text style={styles.drawerNewChatText}>新对话</Text>
            </Pressable>
            <View style={styles.drawerSearchBox}>
              <Ionicons color={colors.text3} name="search-outline" size={17} />
              <TextInput
                onChangeText={setHistoryQuery}
                placeholder="搜索对话"
                placeholderTextColor={colors.text4}
                style={styles.drawerSearchInput}
                value={historyQuery}
              />
            </View>
            <Text style={styles.drawerSectionTitle}>常用入口</Text>
            <View style={styles.drawerRowGroup}>
              {capabilityEntries.map((entry, index) => (
                <CapabilityRow
                  badge={entry.href === "/today" ? todayBadge : undefined}
                  badgeTone="accent"
                  entry={entry}
                  key={String(entry.href)}
                  last={index === capabilityEntries.length - 1}
                  onPress={() => onOpenCapability(entry.href)}
                />
              ))}
            </View>
            <Text style={styles.drawerSectionTitle}>最近对话</Text>
            <View style={styles.drawerRecentList}>
              {filteredHistoryItems.slice(0, 8).map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${item.source}:${item.id}`}
                  onPress={() => onOpenHistoryItem(item)}
                  style={({ pressed }) => [styles.drawerRecentRow, pressed ? styles.pressed : null]}
                >
                  <Ionicons color={colors.text3} name="chatbubble-outline" size={17} />
                  <View style={styles.drawerRecentCopy}>
                    <Text numberOfLines={1} style={styles.drawerRecentTitle}>{item.title}</Text>
                    <Text numberOfLines={1} style={styles.drawerRecentPreview}>{item.preview}</Text>
                  </View>
                </Pressable>
              ))}
              {filteredHistoryItems.length === 0 ? (
                <Text style={styles.drawerEmptyText}>还没有匹配的对话。</Text>
              ) : null}
            </View>
          </ScrollView>
          <View style={styles.drawerFooter}>
            <Pressable
              accessibilityLabel="打开个人档案"
              accessibilityRole="button"
              onPress={() => onOpenCapability("/profile" as Href)}
              style={({ pressed }) => [
                styles.drawerAccount,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.drawerAvatar}>
                <Ionicons color={colors.amber} name="person-outline" size={21} />
              </View>
              <Text numberOfLines={1} style={styles.drawerAccountName}>
                {accountName}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="打开设置"
              accessibilityRole="button"
              onPress={() => onOpenCapability("/settings" as Href)}
              style={({ pressed }) => [
                styles.drawerSettingsButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons color={colors.text3} name="settings-outline" size={22} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CapabilityRow({
  badge,
  badgeTone,
  entry,
  last,
  onPress
}: {
  badge: number | undefined;
  badgeTone: "accent" | "rose";
  entry: (typeof capabilityEntries)[number];
  last: boolean;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  const tone = toneStyles(colors)[entry.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.capabilityRow,
        last ? styles.capabilityRowLast : null,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={[styles.capabilityIcon, { backgroundColor: tone.surface }]}>
        <Ionicons color={tone.icon} name={entry.icon} size={19} />
      </View>
      <View style={styles.capabilityRowText}>
        <Text numberOfLines={1} style={styles.capabilityTitle}>
          {entry.title}
        </Text>
        {entry.detail ? (
          <Text numberOfLines={1} style={styles.capabilityDetail}>
            {entry.detail}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View
          style={[
            styles.capabilityBadge,
            badgeTone === "accent" ? styles.capabilityBadgeAccent : null
          ]}
        >
          <Text style={styles.capabilityBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons color={colors.text4} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function OrbitAiHistoryPanel({
  deletingHistoryId,
  historyDeleteError,
  historyItems,
  historyStateKind,
  onClose,
  onDeleteHistoryItem,
  onOpenHistoryItem,
  visible
}: {
  deletingHistoryId: string | null;
  historyDeleteError: string | null;
  historyItems: AiDrawerHistoryItem[];
  historyStateKind: ApiResourceState<unknown>["kind"];
  onClose: () => void;
  onDeleteHistoryItem: (item: AiDrawerHistoryItem) => void;
  onOpenHistoryItem: (item: AiDrawerHistoryItem) => void;
  visible: boolean;
}) {
  const { colors, styles } = useStyles();
  const [historyQuery, setHistoryQuery] = useState("");
  const normalizedHistoryQuery = historyQuery.trim().toLocaleLowerCase();
  const filteredHistoryItems = normalizedHistoryQuery
    ? historyItems.filter((item) =>
        [item.title, item.preview, item.when]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedHistoryQuery)
      )
    : historyItems;

  useEffect(() => {
    if (!visible) {
      setHistoryQuery("");
    }
  }, [visible]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.historyModalRoot}>
        <Pressable
          accessibilityLabel="关闭历史"
          onPress={onClose}
          style={styles.drawerScrim}
        />
        <View style={styles.historyPanel}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>历史记录</Text>
            <Pressable
              accessibilityLabel="关闭历史"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.drawerIconButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons color={colors.text2} name="close" size={20} />
            </Pressable>
          </View>
          {historyDeleteError ? (
            <Text style={styles.errorText}>{historyDeleteError}</Text>
          ) : null}
          <View style={styles.drawerSearchBox}>
            <Ionicons color={colors.text3} name="search-outline" size={15} />
            <TextInput
              onChangeText={setHistoryQuery}
              placeholder="搜索历史"
              placeholderTextColor={colors.text4}
              style={styles.drawerSearchInput}
              value={historyQuery}
            />
          </View>
          <DrawerHistoryList
            deletingHistoryId={deletingHistoryId}
            historyItems={filteredHistoryItems}
            historyStateKind={historyStateKind}
            onDeleteHistoryItem={onDeleteHistoryItem}
            onOpenHistoryItem={onOpenHistoryItem}
          />
        </View>
      </View>
    </Modal>
  );
}

function DrawerHistoryList({
  deletingHistoryId,
  historyItems,
  historyStateKind,
  onDeleteHistoryItem,
  onOpenHistoryItem
}: {
  deletingHistoryId: string | null;
  historyItems: AiDrawerHistoryItem[];
  historyStateKind: ApiResourceState<unknown>["kind"];
  onDeleteHistoryItem: (item: AiDrawerHistoryItem) => void;
  onOpenHistoryItem: (item: AiDrawerHistoryItem) => void;
}) {
  const { styles } = useStyles();
  if (historyItems.length > 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.drawerHistoryList}
        showsVerticalScrollIndicator={false}
        style={styles.drawerHistoryScroll}
      >
        {historyItems.map((item) => (
          <DrawerHistoryRow
            item={item}
            key={`${item.source}:${item.id}`}
            deleting={deletingHistoryId === item.id}
            onDelete={() => onDeleteHistoryItem(item)}
            onPress={() => onOpenHistoryItem(item)}
          />
        ))}
      </ScrollView>
    );
  }

  if (historyStateKind === "loading") {
    return <Text style={styles.drawerEmptyText}>正在读取历史记录。</Text>;
  }

  if (historyStateKind === "offline" || historyStateKind === "failure") {
    return <Text style={styles.errorText}>历史记录暂时不可用。</Text>;
  }

  return (
    <View style={styles.drawerEmptyBox}>
      <Text style={styles.drawerEmptyTitle}>还没有历史记录</Text>
      <Text style={styles.drawerEmptyText}>从一个问题开始，后续会出现在这里。</Text>
    </View>
  );
}

function DrawerHistoryRow({
  deleting,
  item,
  onDelete,
  onPress
}: {
  deleting: boolean;
  item: AiDrawerHistoryItem;
  onDelete: () => void;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  const canDelete = item.source === "session";

  return (
    <View style={styles.drawerHistoryRow}>
      <Pressable
        accessibilityLabel={`打开历史记录：${item.title}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.drawerHistoryOpenButton,
          pressed ? styles.pressed : null
        ]}
      >
        <View style={styles.drawerHistoryText}>
          <View style={styles.drawerHistoryMeta}>
            <Text numberOfLines={1} style={styles.drawerHistoryWhen}>
              {item.when}
            </Text>
            {item.pinned ? (
              <Ionicons color={colors.amber} name="pin-outline" size={12} />
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.drawerHistoryTitle}>
            {item.title}
          </Text>
          <Text numberOfLines={2} style={styles.drawerHistoryPreview}>
            {item.preview || "继续问一个具体问题。"}
          </Text>
        </View>
      </Pressable>
      {canDelete ? (
        <Pressable
          accessibilityLabel="删除历史记录"
          accessibilityRole="button"
          disabled={deleting}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.historyDeleteButton,
            deleting ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.rose} name="trash-outline" size={14} />
          {deleting ? (
            <Text style={styles.historyDeleteText}>删除中</Text>
          ) : (
            <Text style={styles.historyDeleteText}>删除</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  capabilityBadge: {
    alignItems: "center",
    backgroundColor: colors.rose,
    borderRadius: radius.pill,
    justifyContent: "center",
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  capabilityBadgeAccent: {
    backgroundColor: colors.accent
  },
  capabilityBadgeText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  capabilityDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 18
  },
  capabilityIcon: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  capabilityRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 82,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md
  },
  capabilityRowLast: {
    borderBottomWidth: 0
  },
  capabilityRowText: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  capabilityTitle: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  chatBody: {
    flex: 1
  },
  chatRoot: {
    flex: 1,
    backgroundColor: colors.surface,
    maxWidth: layout.contentMax,
    width: "100%",
    alignSelf: "center"
  },
  composerBar: {
    alignItems: "flex-end",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginHorizontal: layout.pageInset
  },
  composerError: {
    color: colors.rose,
    fontSize: typography.caption,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.xl
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    maxHeight: 120,
    paddingTop: 6,
    paddingVertical: 6,
    minHeight: layout.control
  },
  composerPlusButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  composerSendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  composerSendButtonIdle: {
    backgroundColor: colors.surface3
  },
  disabled: {
    opacity: 0.54
  },
  drawerBody: {
    paddingBottom: spacing.xxl
  },
  drawerAccount: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 52,
    minWidth: 0
  },
  drawerAccountName: {
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  drawerAvatar: {
    alignItems: "center",
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  drawerEmptyBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  drawerEmptyText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  drawerEmptyTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  drawerFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  drawerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  drawerHeaderActions: { flexDirection: "row", gap: spacing.xs },
  drawerInboxDot: {
    backgroundColor: colors.rose,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 9,
    position: "absolute",
    right: 5,
    top: 5,
    width: 9
  },
  drawerHistoryList: {
    gap: spacing.xs,
    paddingBottom: spacing.xl
  },
  drawerHistoryMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  drawerHistoryOpenButton: {
    borderRadius: radius.control,
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  drawerHistoryPreview: {
    ...textStyles.caption,
    color: colors.text3
  },
  drawerHistoryRow: {
    alignItems: "center",
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  drawerHistoryScroll: {
    flex: 1,
    minHeight: 0
  },
  drawerHistoryText: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0
  },
  drawerHistoryTitle: {
    ...textStyles.body,
    color: colors.ink
  },
  drawerHistoryWhen: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14
  },
  drawerIconButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  drawerNewChat: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  drawerNewChatText: { ...createControlStyles(colors).primaryButtonText, color: colors.onAccent },
  drawerModalRoot: {
    flex: 1,
    justifyContent: "flex-start"
  },
  drawerPanel: {
    backgroundColor: colors.surface,
    borderBottomRightRadius: radius.card,
    borderTopRightRadius: radius.card,
    boxShadow: "4px 0 16px rgba(18,18,28,0.10)",
    elevation: 4,
    gap: spacing.lg,
    height: "100%",
    maxWidth: 360,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 76,
    width: "86%"
  },
  drawerRowGroup: {
    gap: 0
  },
  drawerRecentCopy: { flex: 1, gap: 2, minWidth: 0 },
  drawerRecentList: { gap: spacing.xs },
  drawerRecentPreview: { color: colors.text3, fontSize: typography.caption },
  drawerRecentRow: { alignItems: "center", borderRadius: radius.control, flexDirection: "row", gap: spacing.sm, minHeight: 50, paddingHorizontal: spacing.sm },
  drawerRecentTitle: { ...textStyles.body, color: colors.text },
  drawerScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,22,26,0.34)"
  },
  drawerScroll: {
    flex: 1,
    minHeight: 0
  },
  drawerSearchBox: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  drawerSearchInput: {
    color: colors.text,
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    minHeight: layout.control,
    fontSize: typography.body,
    lineHeight: 23
  },
  drawerSectionTitle: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs
  },
  drawerTitle: {
    ...textStyles.title,
    color: colors.ink
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  drawerSettingsButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  historyDeleteButton: {
    alignItems: "center",
    backgroundColor: colors.roseSoft,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  historyDeleteText: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  historyModalRoot: {
    alignItems: "flex-end",
    flex: 1
  },
  historyPanel: {
    backgroundColor: colors.surface,
    boxShadow: "-8px 0 22px rgba(18,18,28,0.16)",
    elevation: 10,
    gap: spacing.md,
    height: "100%",
    maxWidth: 320,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 76,
    borderBottomLeftRadius: radius.card,
    borderTopLeftRadius: radius.card,
    width: "90%"
  },
  intentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  intentPill: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  intentText: {
    color: colors.accent,
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  messageBubbleUser: {
    backgroundColor: colors.surface3,
    borderRadius: 20,
    maxWidth: "86%",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10
  },
  messagePlain: {
    width: "100%"
  },
  messageRow: {
    alignItems: "flex-start",
    marginBottom: spacing.lg
  },
  messageRowUser: {
    alignItems: "flex-end"
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24
  },
  messageTextUser: {
    color: colors.ink
  },
  messageTime: {
    color: colors.text4,
    fontSize: 11,
    marginTop: spacing.xs
  },
  pressed: {
    opacity: 0.72
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface
  },
  sheetPanel: {
    backgroundColor: colors.surface,
    boxShadow: "0 8px 26px rgba(18,18,28,0.18)",
    elevation: 10,
    gap: spacing.xxs,
    marginBottom: 72,
    padding: spacing.sm,
    width: 216,
    borderRadius: radius.card,
    marginLeft: layout.pageInset
  },
  sheetRoot: {
    alignItems: "flex-start",
    flex: 1,
    justifyContent: "flex-end"
  },
  sheetRow: {
    alignItems: "center",
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  sheetRowIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  sheetRowText: {
    ...textStyles.body,
    color: colors.ink,
    flexShrink: 1
  },
  sheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,22,26,0.12)"
  },
  suggestionList: {
    marginTop: 28,
    paddingBottom: spacing.md,
  },
  suggestionHeading: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20,
    paddingBottom: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  suggestionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  suggestionText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 24
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: layout.pageInset
  },
  topBarButton: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
    backgroundColor: "transparent"
  },
  topBarTitle: {
    ...textStyles.section,
    color: colors.ink
  },
  transcript: {
    flex: 1
  },
  transcriptContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: layout.pageInset
  }
}));
