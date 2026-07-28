import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationSessionPath
} from "../../api/endpoints";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { agentHistorySessionsToSummaries } from "../../view-models/agent-history";
import {
  conversationsToSummaries,
  orbitAiHomeChatWindow,
  type ChatMessageView,
  type OrbitAiHomeChatWindow
} from "../../view-models/conversations";

const suggestedPrompts: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { icon: "people-outline", label: "今天该先跟进谁" },
  { icon: "calendar-outline", label: "帮我挑下一场活动" },
  { icon: "checkmark-done-outline", label: "这周的准备清单" }
];

type CapabilityTone = "accent" | "amber" | "live" | "rose" | "sky";

const capabilityEntries: {
  detail?: string;
  featured: boolean;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tone: CapabilityTone;
}[] = [
  {
    detail: "找活动、看报名和准备事项",
    featured: true,
    href: "/events" as Href,
    icon: "calendar-outline",
    title: "活动",
    tone: "accent"
  },
  {
    detail: "联系人、引荐和关系背景",
    featured: true,
    href: "/contacts" as Href,
    icon: "people-outline",
    title: "人脉",
    tone: "sky"
  },
  {
    detail: "约见、跟进和活动时间",
    featured: true,
    href: "/schedule" as Href,
    icon: "time-outline",
    title: "日程",
    tone: "live"
  },
  {
    detail: "待回复、提醒和草稿",
    featured: true,
    href: "/inbox" as Href,
    icon: "file-tray-full-outline",
    title: "关系收件箱",
    tone: "amber"
  },
  {
    detail: "看机会、缺口和优先级",
    featured: false,
    href: "/dashboard" as Href,
    icon: "grid-outline",
    title: "关系仪表盘",
    tone: "accent"
  },
  {
    detail: "今天该处理的人",
    featured: false,
    href: "/followups" as Href,
    icon: "checkmark-done-outline",
    title: "跟进队列",
    tone: "live"
  },
  {
    detail: "一对一上下文",
    featured: false,
    href: "/chat" as Href,
    icon: "chatbubbles-outline",
    title: "关系对话",
    tone: "sky"
  },
  {
    detail: "签到、匹配和分组",
    featured: false,
    href: "/party" as Href,
    icon: "ticket-outline",
    title: "活动现场",
    tone: "rose"
  },
  {
    detail: "确认建议动作",
    featured: false,
    href: "/agent" as Href,
    icon: "sparkles-outline",
    title: "动作中心",
    tone: "accent"
  },
  {
    detail: "别人看到的你",
    featured: false,
    href: "/profile" as Href,
    icon: "person-circle-outline",
    title: "档案",
    tone: "amber"
  }
];

const settingsEntry: (typeof capabilityEntries)[number] = {
  detail: "账号、权限和服务器",
  featured: false,
  href: "/settings" as Href,
  icon: "settings-outline",
  title: "设置",
  tone: "sky"
};

const featuredCapabilities = capabilityEntries.filter((entry) => entry.featured);
const secondaryCapabilities = capabilityEntries.filter(
  (entry) => !entry.featured
);

const toneStyles: Record<CapabilityTone, { icon: string; surface: string }> = {
  accent: { icon: colors.accent, surface: colors.accentSofter },
  amber: { icon: colors.amber, surface: colors.amberSoft },
  live: { icon: colors.live, surface: colors.liveSoft },
  rose: { icon: colors.rose, surface: colors.roseSoft },
  sky: { icon: colors.sky, surface: colors.skySoft }
};

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

export function AiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ drawer?: string | string[] }>();
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.chatBody}
        >
          <ChatTranscript
            chat={homeChat}
            onRefresh={refresh}
            refreshing={state.refreshing || historyState.refreshing}
          >
            {state.kind === "loading" ? <LoadingState /> : null}
            {state.kind === "offline" ? (
              <ErrorState message={state.error.message} title="服务器连不上" />
            ) : null}
            {state.kind === "failure" ? (
              <ErrorState message={state.error.message} />
            ) : null}
          </ChatTranscript>
          {homeChat.isEmpty ? (
            <View style={styles.suggestionList}>
              {suggestedPrompts.map((prompt) => (
                <Pressable
                  accessibilityRole="button"
                  key={prompt.label}
                  onPress={() => setDraftMessage(prompt.label)}
                  style={({ pressed }) => [
                    styles.suggestionRow,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons
                    color={colors.text2}
                    name={prompt.icon}
                    size={21}
                  />
                  <Text style={styles.suggestionText}>{prompt.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {sendError ? (
            <Text style={styles.composerError}>{sendError}</Text>
          ) : null}
          <ChatComposer
            draftMessage={draftMessage}
            onDraftMessageChange={setDraftMessage}
            onOpenMenu={() => setComposerMenuOpen(true)}
            onSend={sendMessage}
          />
        </KeyboardAvoidingView>
      </View>
      <OrbitAiDrawer
        inboxBadge={inboxBadge}
        onClose={() => setDrawerOpen(false)}
        onOpenCapability={openCapability}
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
  const scrollRef = useRef<ScrollView | null>(null);

  return (
    <ScrollView
      contentContainerStyle={styles.transcriptContent}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      ref={scrollRef}
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
  inboxBadge,
  onClose,
  onOpenCapability,
  visible
}: {
  inboxBadge: number | undefined;
  onClose: () => void;
  onOpenCapability: (href: Href) => void;
  visible: boolean;
}) {
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
            <Text style={styles.drawerTitle}>人脉入口</Text>
            <Pressable
              accessibilityLabel="关闭侧栏"
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
          <ScrollView
            contentContainerStyle={styles.drawerBody}
            showsVerticalScrollIndicator={false}
            style={styles.drawerScroll}
          >
            <View style={styles.drawerFeaturedGrid}>
              {featuredCapabilities.map((entry) => (
                <FeaturedCapabilityTile
                  badge={entry.href === "/inbox" ? inboxBadge : undefined}
                  entry={entry}
                  key={String(entry.href)}
                  onPress={() => onOpenCapability(entry.href)}
                />
              ))}
            </View>
            <Text style={styles.drawerSectionTitle}>更多入口</Text>
            <View style={styles.drawerRowGroup}>
              {secondaryCapabilities.map((entry) => (
                <CapabilityRow
                  entry={entry}
                  key={String(entry.href)}
                  onPress={() => onOpenCapability(entry.href)}
                />
              ))}
            </View>
          </ScrollView>
          <View style={styles.drawerFooter}>
            <CapabilityRow
              entry={settingsEntry}
              onPress={() => onOpenCapability(settingsEntry.href)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FeaturedCapabilityTile({
  badge,
  entry,
  onPress
}: {
  badge: number | undefined;
  entry: (typeof capabilityEntries)[number];
  onPress: () => void;
}) {
  const tone = toneStyles[entry.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.featuredTile,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.featuredTileTop}>
        <View style={[styles.capabilityIcon, { backgroundColor: tone.surface }]}>
          <Ionicons color={tone.icon} name={entry.icon} size={22} />
        </View>
        {badge ? (
          <View style={styles.capabilityBadge}>
            <Text style={styles.capabilityBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.capabilityTitle}>
        {entry.title}
      </Text>
      {entry.detail ? (
        <Text numberOfLines={2} style={styles.capabilityDetail}>
          {entry.detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

function CapabilityRow({
  entry,
  onPress
}: {
  entry: (typeof capabilityEntries)[number];
  onPress: () => void;
}) {
  const tone = toneStyles[entry.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.capabilityRow,
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
  const canDelete = item.source === "session";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerHistoryRow,
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capabilityBadge: {
    alignItems: "center",
    backgroundColor: colors.rose,
    borderRadius: radius.pill,
    justifyContent: "center",
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  capabilityBadgeText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  capabilityDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  capabilityIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  capabilityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.xs
  },
  capabilityRowText: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  capabilityTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  chatBody: {
    flex: 1
  },
  chatRoot: {
    backgroundColor: colors.bg,
    flex: 1
  },
  composerBar: {
    alignItems: "flex-end",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
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
    minHeight: 34,
    paddingTop: 6,
    paddingVertical: 6
  },
  composerPlusButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34
  },
  composerSendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  composerSendButtonIdle: {
    backgroundColor: colors.surface3
  },
  disabled: {
    opacity: 0.54
  },
  drawerBody: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl
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
  drawerFeaturedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  drawerFooter: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.sm
  },
  drawerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
  drawerHistoryPreview: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
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
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
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
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  drawerModalRoot: {
    flex: 1,
    justifyContent: "flex-start"
  },
  drawerPanel: {
    backgroundColor: colors.surface,
    borderBottomRightRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    boxShadow: "8px 0 22px rgba(18,18,28,0.16)",
    elevation: 10,
    gap: spacing.lg,
    height: "100%",
    maxWidth: 360,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 76,
    width: "86%"
  },
  drawerRowGroup: {
    gap: spacing.xxs
  },
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
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md
  },
  drawerSearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.caption,
    minWidth: 0,
    paddingVertical: 0
  },
  drawerSectionTitle: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.4,
    paddingHorizontal: spacing.xs
  },
  drawerTitle: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  featuredTile: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    flexBasis: "47%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 0,
    padding: spacing.md
  },
  featuredTileTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  historyDeleteButton: {
    alignItems: "center",
    backgroundColor: colors.roseSoft,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
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
    borderBottomLeftRadius: radius.sheet,
    borderTopLeftRadius: radius.sheet,
    boxShadow: "-8px 0 22px rgba(18,18,28,0.16)",
    elevation: 10,
    gap: spacing.md,
    height: "100%",
    maxWidth: 320,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 76,
    width: "75%"
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
    backgroundColor: colors.bg,
    flex: 1
  },
  sheetPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    boxShadow: "0 8px 26px rgba(18,18,28,0.18)",
    elevation: 10,
    gap: spacing.xxs,
    marginBottom: 72,
    marginLeft: spacing.lg,
    padding: spacing.sm,
    width: 216
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
    paddingHorizontal: spacing.sm
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
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600"
  },
  sheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,22,26,0.12)"
  },
  suggestionList: {
    gap: spacing.xxs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl
  },
  suggestionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 46
  },
  suggestionText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  topBarButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  topBarTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "700"
  },
  transcript: {
    flex: 1
  },
  transcriptContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg
  }
});
