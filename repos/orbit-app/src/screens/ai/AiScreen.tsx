import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
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
import { aiConversationListSchema, aiHistoryRows, aiSessionDeleteReceiptSchema, aiSessionListSchema } from "../../api/ai-history-contract";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { iorbitBrandMark } from "../../design/iorbit-brand";
import { layout, textStyles, radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { mobileUserDisplayName } from "../../view-models/mobile-profile";
import {
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

export function AiScreen({ scopeKey, isScopeCurrent = () => true }: { scopeKey?: string; isScopeCurrent?: () => boolean } = {}) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const params = useLocalSearchParams<{ drawer?: string | string[] }>();
  const keyboardBottomInset = useStableKeyboardBottomInset();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [conversationAttempt, setConversationAttempt] = useState(0);
  const readScope = JSON.stringify([scopeKey, refreshIndex]);
  const ownership = useMemo(() => ({}), [readScope]);
  const latest = useRef(ownership);
  latest.current = ownership;
  const mounted = useRef(true);
  const deleteOperation = useRef<AbortController | null>(null);
  const navigationLock = useRef(false);
  const owns = () => mounted.current && latest.current === ownership && isScopeCurrent();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; deleteOperation.current?.abort(); deleteOperation.current = null; };
  }, [ownership]);
  const client = useOrbitApiClient({ scopeKey: readScope });
  const inboxBadge = useRelationshipInboxBadgeCount(readScope);
  const state = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    () => false,
    { scopeKey: JSON.stringify([readScope, conversationAttempt]) }
  ), aiConversationListSchema);
  const historyState = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.aiConversationSessions,
    () => false,
    { scopeKey: JSON.stringify([readScope, historyAttempt]) }
  ), aiSessionListSchema);
  const todayState = useApiResource<unknown>(
    todayPath("Asia/Tokyo"),
    (data) => todayHomeSummary(data).items.length === 0,
    { scopeKey: readScope }
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
  const [confirmDelete, setConfirmDelete] = useState<AiDrawerHistoryItem | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const projectedHomeChat = orbitAiHomeChatWindow(
    startedNewChat || state.kind !== "success" ? null : state.data
  );
  // Preserve the existing bootstrap/window selection, but render the validated
  // business text verbatim rather than the shared legacy keyword replacement.
  const homeChat = { ...projectedHomeChat, messages: projectedHomeChat.messages.map(message => ({ ...message,
    content: state.kind === "success" ? state.data.messages.find(item => item.messageId === message.id)?.content ?? state.data.assistantMessage : message.content
  })) };
  const historyItems = aiHistoryRows(state.kind === "success" || state.kind === "empty" ? state.data : null,
    historyState.kind === "success" || historyState.kind === "empty" ? historyState.data : null)
    .filter(item => item.source !== "session" || !deletedIds.includes(item.id));
  const historyNotices: { message: string; retryLabel?: string; onRetry?: () => void }[] = [];
  if (state.kind === "loading" || historyState.kind === "loading") historyNotices.push({ message: "正在读取最近会话" });
  if (state.kind === "failure" || state.kind === "offline") historyNotices.push({ message: "会话记录未能读取", retryLabel: "重试会话记录", onRetry: () => { if (owns()) setConversationAttempt(value => value + 1); } });
  if (historyState.kind === "failure" || historyState.kind === "offline") historyNotices.push({ message: "历史记录未能读取", retryLabel: "重试历史记录", onRetry: () => { if (owns()) setHistoryAttempt(value => value + 1); } });
  if ((state.kind === "success" || state.kind === "empty") && state.data.state === "pending") historyNotices.push({ message: "会话记录正在准备" });
  if ((historyState.kind === "success" || historyState.kind === "empty") && !historyState.data.storage.configured) historyNotices.push({ message: "历史记录暂不可用，仍可开始新会话。" });
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
  const suggestedPrompts = [...(nextQuestionSnapshot.questions ?? todayHomeQuestions(null)), { kind: "discussion", label: "回看与某位人脉的讨论" }];
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
    if (!owns()) return;
    deleteOperation.current?.abort();
    deleteOperation.current = null;
    setConfirmDelete(null);
    setDeletingHistoryId(null);
    setHistoryDeleteError(null);
    setRefreshIndex(value => value + 1);
  }

  function openTodayAction(item: TodayHomeActionView) {
    if (!owns()) return;
    router.push(item.href as Href);
  }

  function sendMessage() {
    if (!owns() || navigationLock.current) return;
    const message = draftMessage.trim();

    if (!message) {
      setSendError("先输入问题。");
      return;
    }

    setSendError(null);
    navigationLock.current = true;
    setDraftMessage("");
    router.push({
      params: { id: "new", initialMessage: message },
      pathname: "/ai/[id]"
    });
  }

  function startNewChat() {
    if (!owns()) return;
    navigationLock.current = false;
    setComposerMenuOpen(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
    setStartedNewChat(true);
    setDraftMessage("");
    setSendError(null);
  }

  function openCapability(href: Href) {
    if (!owns()) return;
    setDrawerOpen(false);
    setComposerMenuOpen(false);
    router.push(href);
  }

  function openHistoryItem(item: AiDrawerHistoryItem) {
    if (!owns()) return;
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
    if (!owns() || deleteOperation.current || item.source !== "session" || confirmDelete?.id !== item.id
      || !historyItems.some(row => row.source === "session" && row.id === item.id)) return;
    const operation = new AbortController();
    deleteOperation.current = operation;

    setDeletingHistoryId(item.id);
    setHistoryDeleteError(null);

    const result = await client.delete<unknown>(
      aiConversationSessionPath(item.id), { signal: operation.signal }
    );
    if (!owns() || operation.signal.aborted || deleteOperation.current !== operation) return;
    if (result.success && result.status >= 200 && result.status < 300 && aiSessionDeleteReceiptSchema.safeParse(result.data).success) {
      setDeletedIds(ids => [...ids, item.id]);
      setConfirmDelete(null);
      setHistoryAttempt(value => value + 1);
    } else {
      setHistoryDeleteError("尚未确认删除，请重试。");
    }
    deleteOperation.current = null;
    setDeletingHistoryId(null);
  }

  return (
    <SafeAreaView edges={["bottom", "top"]} style={styles.safeArea}>
      <View {...drawerPanResponder.panHandlers} style={styles.chatRoot}>
        <ChatTopBar
          onHome={() => openCapability("/home" as Href)}
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
            <Text accessibilityRole="header" style={styles.heroTitle}>{"今天想\n整理什么？"}</Text>
            <Text style={styles.heroSubtitle}>从人脉、日程或待办开始，整理接下来要做的事。</Text>
            <View style={styles.suggestionList}>
              <Text style={styles.suggestionHeading}>可以从这里开始</Text>
              {suggestedPrompts.map(prompt => (
                <Pressable accessibilityLabel={`填入问题：${prompt.label}`} accessibilityHint="填入输入框后，你仍可修改或确认发送" accessibilityRole="button" key={prompt.kind}
                  onPress={() => { if (owns()) { navigationLock.current = false; setDraftMessage(prompt.label); } }}
                  style={({ pressed }) => [styles.suggestionRow, pressed ? styles.pressed : null]}>
                  <Ionicons color={colors.ink} name={prompt.kind === "discovery" || prompt.kind === "preparation" ? "calendar-outline" : prompt.kind === "discussion" || prompt.kind === "followup" ? "people-outline" : "checkbox-outline"} size={20} />
                  <Text style={styles.suggestionText}>{prompt.label}</Text>
                  <Ionicons color={colors.accent} name="arrow-forward" size={20} />
                </Pressable>
              ))}
            </View>
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={styles.sectionLabel}>最近会话</Text>
                <Pressable accessibilityLabel="全部会话" accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.allHistoryButton}>
                  <Text style={styles.allHistoryText}>全部</Text><Ionicons name="chevron-forward" color={colors.accent} size={14} />
                </Pressable>
              </View>
              {historyItems.slice(0, 3).map(item => (
                <Pressable accessibilityLabel={`继续会话：${item.title}`} accessibilityRole="button" key={`${item.source}:${item.id}`} onPress={() => openHistoryItem(item)} style={({ pressed }) => [styles.recentRow, pressed ? styles.pressed : null]}>
                  <View style={styles.recentCopy}><Text numberOfLines={2} style={styles.recentTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.recentPreview}>{item.preview}</Text></View>
                  <Text style={styles.recentWhen}>{item.when}</Text><Ionicons name="chevron-forward" color={colors.text4} size={14} />
                </Pressable>
              ))}
              {state.kind === "loading" || historyState.kind === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>正在读取最近会话</Text> : null}
              {(state.kind === "success" || state.kind === "empty") && state.data.state === "pending" ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>会话记录正在准备</Text> : null}
              {state.kind === "failure" || state.kind === "offline" ? <View style={styles.recentFailure}><Text style={styles.errorText}>会话记录未能读取</Text><Pressable accessibilityLabel="重试会话记录" accessibilityRole="button" onPress={() => { if (owns()) setConversationAttempt(value => value + 1); }} style={styles.retryButton}><Text style={styles.allHistoryText}>重试</Text></Pressable></View> : null}
              {historyState.kind === "failure" || historyState.kind === "offline" ? <View style={styles.recentFailure}><Text style={styles.errorText}>历史记录未能读取</Text><Pressable accessibilityLabel="重试历史记录" accessibilityRole="button" onPress={() => { if (owns()) setHistoryAttempt(value => value + 1); }} style={styles.retryButton}><Text style={styles.allHistoryText}>重试</Text></Pressable></View> : null}
              {(historyState.kind === "success" || historyState.kind === "empty") && !historyState.data.storage.configured ? <Text style={styles.recentState}>历史记录暂不可用，仍可开始新会话。</Text> : null}
              {historyItems.length === 0 && (state.kind === "success" || state.kind === "empty") && state.data.state !== "pending" && (historyState.kind === "success" || historyState.kind === "empty") && historyState.data.storage.configured ? <Text style={styles.recentState}>还没有会话</Text> : null}
            </View>
            <OrbitNextActions
              error={todayError}
              loading={todayState.kind === "loading"}
              onOpen={openTodayAction}
              onOpenSuggestions={() => openCapability("/today" as Href)}
              onRefresh={todayState.refresh}
              summary={todaySummary}
            />
          </ChatTranscript>
          {sendError ? (
            <Text style={styles.composerError}>{sendError}</Text>
          ) : null}
          <ChatComposer
            draftMessage={draftMessage}
            onDraftMessageChange={value => { if (owns()) { navigationLock.current = false; setDraftMessage(value); } }}
            onOpenMenu={() => setComposerMenuOpen(true)}
            onSend={sendMessage}
          />
        </View>
      </View>
      <OrbitAiDrawer
        accountName={mobileUserDisplayName(auth.user, "账号")}
        inboxBadge={inboxBadge}
        historyItems={historyItems}
        historyNotices={historyNotices}
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
        conversationStateKind={state.kind}
        conversationPending={(state.kind === "success" || state.kind === "empty") && state.data.state === "pending"}
        historyUnavailable={(historyState.kind === "success" || historyState.kind === "empty") && !historyState.data.storage.configured}
        onRetryConversation={() => { if (owns()) setConversationAttempt(value => value + 1); }}
        onRetryHistory={() => { if (owns()) setHistoryAttempt(value => value + 1); }}
        confirmDelete={confirmDelete}
        onCancelDelete={() => { if (!deleteOperation.current) setConfirmDelete(null); }}
        onConfirmDelete={() => { if (confirmDelete) void deleteHistoryItem(confirmDelete); }}
        onClose={() => setHistoryOpen(false)}
        onDeleteHistoryItem={item => { if (owns() && !deleteOperation.current) { setHistoryDeleteError(null); setConfirmDelete(item); } }}
        onOpenHistoryItem={openHistoryItem}
        visible={historyOpen}
      />
      <ComposerMenuSheet
        onClose={() => setComposerMenuOpen(false)}
        onNewChat={startNewChat}
        onOpenDrawer={() => { setComposerMenuOpen(false); setDrawerOpen(true); }}
        onScanCard={() => openCapability("/contacts/new" as Href)}
        visible={composerMenuOpen}
      />
    </SafeAreaView>
  );
}

function ChatTopBar({
  onHome,
  onOpenHistory
}: {
  onHome: () => void;
  onOpenHistory: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel="首页"
        accessibilityRole="button"
        onPress={onHome}
        style={({ pressed }) => [
          styles.homeButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="chevron-back" size={19} /><Text style={styles.homeButtonText}>首页</Text>
      </Pressable>
      <View style={styles.brand}><Image accessible={false} testID="iorbit-brand-mark" source={iorbitBrandMark} style={{ width: 18, height: 18 }} /><Text style={styles.topBarTitle}>IORBIT</Text></View>
      <Pressable
        accessibilityLabel="对话历史"
        accessibilityRole="button"
        onPress={onOpenHistory}
        style={({ pressed }) => [
          styles.topBarButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.ink} name="time-outline" size={22} />
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
  const { fontScale } = useWindowDimensions();
  const minimumInputHeight = Math.max(44, Math.ceil(22 * fontScale + 12));
  const [inputHeight, setInputHeight] = useState(minimumInputHeight);
  const canSend = draftMessage.trim().length > 0;

  return (
    <View style={styles.composerBar}>
      <TextInput
        accessibilityLabel="消息"
        multiline
        numberOfLines={1}
        onChangeText={value => { if (!value) setInputHeight(minimumInputHeight); onDraftMessageChange(value); }}
        onContentSizeChange={event => setInputHeight(Math.min(120, Math.max(minimumInputHeight, event.nativeEvent.contentSize.height)))}
        placeholder="询问 IORBIT"
        placeholderTextColor={colors.text4}
        style={[styles.composerInput, { height: Math.max(minimumInputHeight, inputHeight) }]}
        value={draftMessage}
      />
      <View style={styles.composerActions}>
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
          name="paper-plane-outline"
          size={19}
        />
      </Pressable>
      </View>
    </View>
  );
}

function ComposerMenuSheet({
  onClose,
  onNewChat,
  onOpenDrawer,
  onScanCard,
  visible
}: {
  onClose: () => void;
  onNewChat: () => void;
  onOpenDrawer: () => void;
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
          <Pressable accessibilityRole="button" onPress={onOpenDrawer} style={({ pressed }) => [styles.sheetRow, pressed ? styles.pressed : null]}>
            <View style={styles.sheetRowIcon}><Ionicons color={colors.ink} name="menu-outline" size={19} /></View>
            <Text style={styles.sheetRowText}>常用入口</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OrbitAiDrawer({
  accountName,
  historyItems,
  historyNotices,
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
  historyNotices: { message: string; retryLabel?: string; onRetry?: () => void }[];
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
            {historyNotices.map(notice => <View key={notice.message} style={styles.recentFailure}>
              <Text accessibilityLiveRegion="polite" style={notice.onRetry ? styles.errorText : styles.drawerEmptyText}>{notice.message}</Text>
              {notice.onRetry ? <Pressable accessibilityLabel={notice.retryLabel} accessibilityRole="button" onPress={notice.onRetry} style={styles.retryButton}><Text style={styles.allHistoryText}>重试</Text></Pressable> : null}
            </View>)}
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
              {filteredHistoryItems.length === 0 && historyNotices.length === 0 ? (
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
  conversationStateKind,
  conversationPending,
  historyUnavailable,
  onRetryConversation,
  onRetryHistory,
  confirmDelete,
  deletingHistoryId,
  historyDeleteError,
  historyItems,
  historyStateKind,
  onClose,
  onCancelDelete,
  onConfirmDelete,
  onDeleteHistoryItem,
  onOpenHistoryItem,
  visible
}: {
  conversationStateKind: ApiResourceState<unknown>["kind"];
  conversationPending: boolean;
  historyUnavailable: boolean;
  onRetryConversation: () => void;
  onRetryHistory: () => void;
  confirmDelete: AiDrawerHistoryItem | null;
  deletingHistoryId: string | null;
  historyDeleteError: string | null;
  historyItems: AiDrawerHistoryItem[];
  historyStateKind: ApiResourceState<unknown>["kind"];
  onClose: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
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
  const conversationFailed = conversationStateKind === "failure" || conversationStateKind === "offline";
  const historyFailed = historyStateKind === "failure" || historyStateKind === "offline";
  const loading = conversationStateKind === "loading" || historyStateKind === "loading";

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
          {loading ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>正在读取历史记录。</Text> : null}
          {conversationPending ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>会话记录正在准备</Text> : null}
          {historyUnavailable ? <Text style={styles.recentState}>历史记录暂不可用，仍可开始新会话。</Text> : null}
          {conversationFailed ? <View style={styles.recentFailure}><Text style={styles.errorText}>会话记录未能读取</Text><Pressable accessibilityLabel="重试会话记录" accessibilityRole="button" onPress={onRetryConversation} style={styles.retryButton}><Text style={styles.allHistoryText}>重试</Text></Pressable></View> : null}
          {historyFailed ? <View style={styles.recentFailure}><Text style={styles.errorText}>历史记录未能读取</Text><Pressable accessibilityLabel="重试历史记录" accessibilityRole="button" onPress={onRetryHistory} style={styles.retryButton}><Text style={styles.allHistoryText}>重试</Text></Pressable></View> : null}
          {historyDeleteError ? (
            <Text style={styles.errorText}>{historyDeleteError}</Text>
          ) : null}
          {confirmDelete ? <View style={styles.deleteConfirmation}>
            <Text style={styles.recentTitle}>删除「{confirmDelete.title}」？</Text>
            <Text style={styles.recentPreview}>这条历史记录删除后无法恢复。</Text>
            <View style={styles.deleteActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="取消删除" disabled={Boolean(deletingHistoryId)} onPress={onCancelDelete} style={styles.retryButton}><Text style={styles.allHistoryText}>取消删除</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="确认删除" disabled={Boolean(deletingHistoryId)} onPress={onConfirmDelete} style={[styles.confirmButton, deletingHistoryId ? styles.disabled : null]}><Text style={styles.confirmButtonText}>{deletingHistoryId ? "删除中" : "确认删除"}</Text></Pressable>
            </View>
          </View> : null}
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
            hasQuery={normalizedHistoryQuery.length > 0}
            canShowEmpty={!conversationFailed && !historyFailed && !loading && !conversationPending && !historyUnavailable}
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
  canShowEmpty,
  hasQuery,
  onDeleteHistoryItem,
  onOpenHistoryItem
}: {
  deletingHistoryId: string | null;
  historyItems: AiDrawerHistoryItem[];
  canShowEmpty: boolean;
  hasQuery: boolean;
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

  if (!canShowEmpty) return null;

  return (
    <View style={styles.drawerEmptyBox}>
      <Text style={styles.drawerEmptyTitle}>{hasQuery ? "还没有匹配的对话。" : "还没有历史记录"}</Text>
      <Text style={styles.drawerEmptyText}>{hasQuery ? "换个关键词试试。" : "从一个问题开始，后续会出现在这里。"}</Text>
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
  heroTitle: { color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36, letterSpacing: -0.6 },
  heroSubtitle: { color: colors.text3, fontSize: 13, lineHeight: 20, marginTop: 6 },
  sectionLabel: { color: colors.text3, fontSize: 12, fontWeight: "700", lineHeight: 18, letterSpacing: 0.48 },
  recentSection: { marginTop: 0, marginBottom: 10 },
  recentHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", borderBottomColor: colors.border, borderBottomWidth: 1, minHeight: 44 },
  allHistoryButton: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minWidth: 44, minHeight: 44, gap: 2 },
  allHistoryText: { color: colors.accent, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 64, borderBottomColor: colors.hairline, borderBottomWidth: 1 },
  recentCopy: { flex: 1, minWidth: 0, gap: 2 },
  recentTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  recentPreview: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  recentWhen: { color: colors.text3, fontSize: 12, lineHeight: 18, maxWidth: "25%" },
  recentState: { color: colors.text3, fontSize: 13, lineHeight: 20, paddingVertical: 16 },
  recentFailure: { gap: 8, alignItems: "flex-start", paddingVertical: 12 },
  retryButton: { justifyContent: "center", alignItems: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  deleteConfirmation: { gap: 8, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  deleteActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  confirmButton: { justifyContent: "center", alignItems: "center", minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.ink },
  confirmButtonText: { color: colors.surface, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  brand: { flexDirection: "row", gap: 6, alignItems: "center", flexShrink: 1 },
  homeButton: { minWidth: 58, minHeight: 44, flexDirection: "row", alignItems: "center", marginLeft: -5 },
  homeButtonText: { color: colors.accent, fontWeight: "600", fontSize: 15, lineHeight: 22 },
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
    backgroundColor: colors.surface,
    borderColor: colors.ink,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
    marginBottom: 0,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    marginHorizontal: layout.pageInset
  },
  composerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  composerError: {
    color: colors.rose,
    fontSize: typography.caption,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.xl
  },
  composerInput: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: layout.control
  },
  composerPlusButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
    borderRadius: 8,
    backgroundColor: colors.surface2
  },
  composerSendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
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
    marginTop: 22
  },
  suggestionHeading: {
    color: colors.text3,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.48,
    lineHeight: 18,
    paddingBottom: 6,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  suggestionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 50,
    paddingVertical: 14,
    borderBottomColor: colors.hairline,
    borderBottomWidth: 1
  },
  suggestionText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    gap: 8,
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
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.6,
    lineHeight: 22,
    color: colors.ink
  },
  transcript: {
    flex: 1
  },
  transcriptContent: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: layout.pageInset
  }
}));
