import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  bootstrapMetrics,
  bootstrapToSummary
} from "../../view-models/bootstrap";
import {
  conversationsToSummaries,
  orbitAiHomeChatWindow,
  proactiveTurnPayloadToChatView,
  type ChatMessageView,
  type ConversationChatView,
  type OrbitAiHomeChatWindow
} from "../../view-models/conversations";

const suggestedPrompts = [
  "今天先跟进谁？",
  "帮我找下一场活动",
  "这周要准备什么？"
] as const;

const capabilityEntries: {
  detail: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}[] = [
  {
    detail: "找活动、看报名和准备事项",
    href: "/events" as Href,
    icon: "calendar-outline",
    title: "活动"
  },
  {
    detail: "联系人、引荐和关系背景",
    href: "/contacts" as Href,
    icon: "people-outline",
    title: "人脉"
  },
  {
    detail: "约见、跟进和活动时间",
    href: "/schedule" as Href,
    icon: "time-outline",
    title: "日程"
  },
  {
    detail: "别人会看到的资料",
    href: "/profile" as Href,
    icon: "person-circle-outline",
    title: "档案"
  },
  {
    detail: "看机会、缺口和优先级",
    href: "/dashboard" as Href,
    icon: "grid-outline",
    title: "关系仪表盘"
  },
  {
    detail: "待回复、提醒和草稿",
    href: "/inbox" as Href,
    icon: "file-tray-full-outline",
    title: "关系收件箱"
  },
  {
    detail: "今天该处理的人",
    href: "/followups" as Href,
    icon: "checkmark-done-outline",
    title: "跟进队列"
  },
  {
    detail: "一对一上下文",
    href: "/chat" as Href,
    icon: "chatbubbles-outline",
    title: "关系对话"
  },
  {
    detail: "签到、匹配和分组",
    href: "/party" as Href,
    icon: "ticket-outline",
    title: "活动现场"
  },
  {
    detail: "确认建议动作",
    href: "/agent" as Href,
    icon: "sparkles-outline",
    title: "动作中心"
  }
];

export function AiScreen() {
  const router = useRouter();
  const client = useOrbitApiClient();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    (data) => conversationsToSummaries(data).length === 0
  );
  const bootstrapState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.bootstrap,
    () => false
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [latestChat, setLatestChat] = useState<ConversationChatView | null>(
    null
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [checkingProactiveTurn, setCheckingProactiveTurn] = useState(false);
  const homeChat = orbitAiHomeChatWindow(
    state.kind === "success" ? state.data : null,
    latestChat
  );

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

  async function requestProactiveBrief() {
    setCheckingProactiveTurn(true);
    setSendError(null);

    try {
      const result = await client.post<unknown>(
        ORBIT_API_ENDPOINTS.proactiveTurns,
        {
          body: {
            signal: {
              body:
                "The user asked Orbit AI to check whether anything needs attention now.",
              evidenceIds: ["evidence:orbit-app:manual-proactive-check"],
              signalId: `orbit-app-manual-check:${Date.now()}`,
              sourceModule: "system",
              title: "Manual Orbit AI check-in",
              type: "system_status"
            }
          }
        }
      );

      if (result.success) {
        setLatestChat(proactiveTurnPayloadToChatView(result.data));
      } else {
        setSendError(result.error.message);
      }
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "现在还不能检查主动提醒。"
      );
    } finally {
      setCheckingProactiveTurn(false);
    }
  }

  return (
    <AppScreen
      eyebrow="关系管家"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Orbit AI"
    >
      <OrbitChatWindow
        chat={homeChat}
        checkingProactiveTurn={checkingProactiveTurn}
        draftMessage={draftMessage}
        onDraftMessageChange={setDraftMessage}
        onRequestProactiveBrief={requestProactiveBrief}
        onSend={sendMessage}
        onUsePrompt={setDraftMessage}
        sendError={sendError}
        sending={false}
        stateKind={state.kind}
      />
      <OrbitContextStrip state={bootstrapState} />
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message="先问一个具体问题，比如今天该先跟进谁。"
          title="还没有对话"
        />
      ) : null}
      <CapabilityGrid onOpen={(href) => router.push(href)} />
      {state.kind === "success"
        ? conversationsToSummaries(state.data).length > 0
          ? (
              <View style={styles.recentPanel}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>最近对话</Text>
                  <Text style={styles.sectionHint}>继续上次的问题</Text>
                </View>
                {conversationsToSummaries(state.data)
                  .slice(0, 3)
                  .map((item) => (
                    <RecentConversationRow
                      item={item}
                      key={item.id}
                      onPress={() =>
                        router.push(`/ai/${encodeURIComponent(item.id)}` as Href)
                      }
                    />
                  ))}
              </View>
            )
          : null
        : null}
    </AppScreen>
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

function OrbitChatWindow({
  chat,
  checkingProactiveTurn,
  draftMessage,
  onDraftMessageChange,
  onRequestProactiveBrief,
  onSend,
  onUsePrompt,
  sendError,
  sending,
  stateKind
}: {
  chat: OrbitAiHomeChatWindow;
  checkingProactiveTurn: boolean;
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
  onRequestProactiveBrief: () => void;
  onSend: () => void;
  onUsePrompt: (value: string) => void;
  sendError: string | null;
  sending: boolean;
  stateKind: ApiResourceState<unknown>["kind"];
}) {
  const visibleMessages = chat.isEmpty
    ? [
        {
          content:
            stateKind === "loading"
              ? "正在读取你的关系资料。"
              : "把问题发过来。我会按人脉、活动和跟进记录来答。",
          createdAt: "",
          id: "orbit-ai-home-empty",
          role: "assistant"
        }
      ]
    : chat.messages.slice(-4);

  return (
    <View style={styles.chatWindow}>
      <View style={styles.chatHeader}>
        <View>
          <Text style={styles.chatEyebrow}>对话</Text>
          <Text style={styles.chatTitle}>有什么需要处理？</Text>
        </View>
        <View style={styles.chatStatus}>
          <View style={styles.chatStatusDot} />
          <Text style={styles.chatStatusText}>资料已接入</Text>
        </View>
      </View>
      <View style={styles.messagesStack}>
        {visibleMessages.map((message) => {
          const isUser = message.role === "user";

          return (
            <View
              key={message.id}
              style={[
                styles.messageRow,
                isUser ? styles.messageRowUser : null
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  isUser ? styles.messageBubbleUser : null
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isUser ? styles.messageTextUser : null
                  ]}
                >
                  {message.content}
                </Text>
                {messageTimestamp(message) ? (
                  <Text
                    style={[
                      styles.messageTime,
                      isUser ? styles.messageTextUser : null
                    ]}
                  >
                    {messageTimestamp(message)}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.promptChips}>
        {suggestedPrompts.map((prompt) => (
          <Pressable
            accessibilityRole="button"
            key={prompt}
            onPress={() => onUsePrompt(prompt)}
            style={({ pressed }) => [
              styles.promptChip,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.promptChipText}>{prompt}</Text>
          </Pressable>
        ))}
      </View>
      {chat.proposedToolIntents.length > 0 ? (
        <View style={styles.intentList}>
          {chat.proposedToolIntents.slice(0, 2).map((intent) => (
            <View key={intent.id} style={styles.intentPill}>
              <Ionicons
                color={colors.accent}
                name="sparkles-outline"
                size={14}
              />
              <Text numberOfLines={2} style={styles.intentText}>
                {intent.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          multiline
          onChangeText={onDraftMessageChange}
          placeholder="输入问题"
          placeholderTextColor={colors.text4}
          style={styles.input}
          value={draftMessage}
        />
        <View style={styles.composerActions}>
          <Pressable
            accessibilityRole="button"
            disabled={checkingProactiveTurn}
            onPress={onRequestProactiveBrief}
            style={({ pressed }) => [
              styles.iconTextButton,
              checkingProactiveTurn ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={colors.text2}
              name="notifications-outline"
              size={17}
            />
            <Text style={styles.secondaryButtonText}>
              {checkingProactiveTurn ? "检查中" : "主动提醒"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={onSend}
            style={({ pressed }) => [
              styles.sendIconButton,
              sending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.onAccent} name="send" size={18} />
          </Pressable>
        </View>
        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
      </View>
    </View>
  );
}

function OrbitContextStrip({ state }: { state: ApiResourceState<unknown> }) {
  if (state.kind === "loading" || state.kind === "empty") {
    return null;
  }

  if (state.kind === "offline") {
    return (
      <ErrorState message={state.error.message} title="启动摘要不可用" />
    );
  }

  if (state.kind === "failure") {
    return <ErrorState message={state.error.message} title="启动摘要不可用" />;
  }

  const summary = bootstrapToSummary(state.data);
  const metrics = bootstrapMetrics(summary);

  return (
    <View style={styles.contextStrip}>
      <View style={styles.contextHeader}>
        <Text style={styles.contextTitle}>{summary.workspaceName}</Text>
        <Text style={styles.contextName}>{summary.profileName}</Text>
      </View>
      <Text style={styles.summaryText}>{summary.summary}</Text>
      <View style={styles.contextMetrics}>
        {metrics.map((metric) => (
          <View key={metric.label} style={styles.contextMetric}>
            <Text style={styles.contextMetricValue}>{metric.value}</Text>
            <Text style={styles.contextMetricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.contextNextAction}>{summary.nextAction}</Text>
    </View>
  );
}

function CapabilityGrid({ onOpen }: { onOpen: (href: Href) => void }) {
  return (
      <View style={styles.capabilitySection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>常用入口</Text>
        <Text style={styles.sectionHint}>提问或直接打开</Text>
      </View>
      <View style={styles.capabilityGrid}>
        {capabilityEntries.map((entry) => (
          <Pressable
            accessibilityRole="button"
            key={String(entry.href)}
            onPress={() => onOpen(entry.href)}
            style={({ pressed }) => [
              styles.capabilityTile,
              pressed ? styles.pressed : null
            ]}
          >
            <View style={styles.capabilityIcon}>
              <Ionicons color={colors.accent} name={entry.icon} size={19} />
            </View>
            <Text numberOfLines={1} style={styles.capabilityTitle}>
              {entry.title}
            </Text>
            <Text numberOfLines={2} style={styles.capabilityDetail}>
              {entry.detail}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RecentConversationRow({
  item,
  onPress
}: {
  item: ReturnType<typeof conversationsToSummaries>[number];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.recentRow,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.recentIcon}>
        <Ionicons color={colors.accent} name="chatbubble-outline" size={17} />
      </View>
      <View style={styles.recentText}>
        <Text numberOfLines={1} style={styles.recentTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={styles.recentPreview}>
          {item.preview || "继续问一个具体问题。"}
        </Text>
      </View>
      <Ionicons color={colors.text3} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  capabilityDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  capabilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  capabilityIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  capabilitySection: {
    gap: spacing.md
  },
  capabilityTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 130,
    padding: spacing.md
  },
  capabilityTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  chatEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  chatHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  chatStatus: {
    alignItems: "center",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chatStatusDot: {
    backgroundColor: colors.live,
    borderRadius: radius.pill,
    height: 7,
    width: 7
  },
  chatStatusText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  chatTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 28,
    marginTop: 2
  },
  chatWindow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg
  },
  composer: {
    gap: spacing.md
  },
  composerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: 17,
    lineHeight: 23,
    maxHeight: 124,
    minHeight: 108,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    textAlignVertical: "top"
  },
  iconTextButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  intentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  intentPill: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
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
  messageBubble: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: "88%",
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  messageBubbleUser: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  messageRow: {
    alignItems: "flex-start"
  },
  messageRowUser: {
    alignItems: "flex-end"
  },
  messagesStack: {
    gap: spacing.sm
  },
  messageText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  messageTextUser: {
    color: colors.onAccent
  },
  messageTime: {
    color: colors.text3,
    fontSize: 11,
    marginTop: 5
  },
  contextHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  contextMetric: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  contextMetricLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  contextMetricValue: {
    color: colors.accent,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  contextMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  contextName: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  contextNextAction: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  contextStrip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  contextTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  pressed: {
    opacity: 0.72
  },
  promptChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  promptChipText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  recentIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  recentPanel: {
    gap: spacing.md
  },
  recentPreview: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  recentRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  recentText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  recentTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  sectionHint: {
    color: colors.text3,
    fontSize: typography.caption
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "700"
  },
  sendIconButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 44,
    width: 52
  },
  secondaryButtonText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "600"
  },
  summaryText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  }
});
