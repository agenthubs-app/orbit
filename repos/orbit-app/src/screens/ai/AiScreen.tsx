import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
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
import { aiConversationListSchema, aiHistoryRows, aiSessionDeleteReceiptSchema, aiSessionGroupListSchema, aiSessionListSchema, type AiSession } from "../../api/ai-history-contract";
import type { AiSessionEntryPointId, AiSessionGroupContract } from "../../api/contract/ai-sessions";
import type { OrbitLanguage } from "../../api/contract/language";
import { createAiSessionGroup, deleteAiSessionGroup, renameAiSessionGroup, updateAiSessionOrganization } from "../../api/ai-session-management";
import { aiSessionOriginInputSchema } from "../../api/schema/ai-sessions";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { iorbitBrandMark } from "../../design/iorbit-brand";
import { registerAiSendIntent } from "../../data/ai-send-intent";
import { layout, textStyles, radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
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
import { AiSessionOrganizationPanel } from "./AiSessionOrganization";

type CapabilityTone = "accent" | "amber" | "live" | "sky";

const capabilityEntries: {
  detailKey: MessageKey;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: MessageKey;
  tone: CapabilityTone;
}[] = [
  {
    detailKey: "ai.capabilityTodayDetail",
    href: "/today" as Href,
    icon: "calendar-outline",
    titleKey: "ai.capabilityToday",
    tone: "accent"
  },
  {
    detailKey: "ai.capabilityContactsDetail",
    href: "/contacts" as Href,
    icon: "people-outline",
    titleKey: "ai.capabilityContacts",
    tone: "sky"
  },
  {
    detailKey: "ai.capabilityEventsDetail",
    href: "/events" as Href,
    icon: "ticket-outline",
    titleKey: "ai.capabilityEvents",
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
  groupId: string | null;
  id: string;
  organizationRevision: number;
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
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const params = useLocalSearchParams<{ drawer?: string | string[]; entryPointId?: string | string[] }>();
  const keyboardBottomInset = useStableKeyboardBottomInset();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [groupsAttempt, setGroupsAttempt] = useState(0);
  const [conversationAttempt, setConversationAttempt] = useState(0);
  const [additionalHistorySessions, setAdditionalHistorySessions] = useState<AiSession[]>([]);
  const [historyPaginationBusy, setHistoryPaginationBusy] = useState(false);
  const [historyPaginationError, setHistoryPaginationError] = useState<string | null>(null);
  const readScope = JSON.stringify([scopeKey, refreshIndex]);
  const ownership = useMemo(() => ({}), [readScope]);
  const latest = useRef(ownership);
  latest.current = ownership;
  const mounted = useRef(true);
  const deleteOperation = useRef<AbortController | null>(null);
  const organizationOperation = useRef<AbortController | null>(null);
  const navigationLock = useRef(false);
  const owns = () => mounted.current && latest.current === ownership && isScopeCurrent();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; deleteOperation.current?.abort(); deleteOperation.current = null; organizationOperation.current?.abort(); organizationOperation.current = null; };
  }, [ownership]);
  const client = useOrbitApiClient({ scopeKey: readScope });
  const inboxBadge = useRelationshipInboxBadgeCount(readScope);
  const state = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    () => false,
    { scopeKey: JSON.stringify([readScope, conversationAttempt]) }
  ), aiConversationListSchema);
  const historyState = validateApiResourceState(useApiResource<unknown>(
    `${ORBIT_API_ENDPOINTS.aiConversationSessions}?v=2&limit=50`,
    () => false,
    { scopeKey: JSON.stringify([readScope, historyAttempt]) }
  ), aiSessionListSchema);
  const groupsState = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.aiConversationGroups,
    () => false,
    { scopeKey: JSON.stringify([readScope, groupsAttempt]) }
  ), aiSessionGroupListSchema);
  const todayState = useApiResource<unknown>(
    todayPath("Asia/Tokyo"),
    (data) => todayHomeSummary(data, new Date(), "Asia/Tokyo", locale.language).items.length === 0,
    { scopeKey: readScope }
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPendingOpen, setHistoryPendingOpen] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationPendingOpen, setOrganizationPendingOpen] = useState(false);
  const [organizationItem, setOrganizationItem] = useState<AiDrawerHistoryItem | null>(null);
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [initialGroupId, setInitialGroupId] = useState<string | null>(null);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [startedNewChat, setStartedNewChat] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const requestedOrigin = aiSessionOriginInputSchema.safeParse({
    entryClient: "app",
    entryPointId: optionalParam(params.entryPointId) || "ai.home",
    initialGroupId: null,
    kind: "manual",
    template: null,
  });
  const [entryPointId, setEntryPointId] = useState<AiSessionEntryPointId>(
    requestedOrigin.success ? requestedOrigin.data.entryPointId : "ai.home",
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyDeleteError, setHistoryDeleteError] = useState<string | null>(
    null
  );
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiDrawerHistoryItem | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const firstHistoryPage = historyState.kind === "success" || historyState.kind === "empty"
    ? historyState.data
    : null;
  const firstHistoryPageIdentity = firstHistoryPage
    ? JSON.stringify([readScope, historyAttempt, firstHistoryPage.nextCursor, firstHistoryPage.sessions.map(session => session.id)])
    : JSON.stringify([readScope, historyAttempt, historyState.kind]);
  useEffect(() => {
    setAdditionalHistorySessions([]);
    setHistoryPaginationError(null);
    if (!firstHistoryPage?.nextCursor) {
      setHistoryPaginationBusy(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const loadRemainingHistory = async () => {
      setHistoryPaginationBusy(true);
      const sessions: AiSession[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = firstHistoryPage.nextCursor ?? null;
      for (let page = 0; active && cursor && page < 199; page += 1) {
        if (seenCursors.has(cursor)) {
          setHistoryPaginationError(locale.t("ai.historyUnreadable"));
          break;
        }
        seenCursors.add(cursor);
        const result = await client.get<unknown>(
          `${ORBIT_API_ENDPOINTS.aiConversationSessions}?v=2&limit=50&cursor=${encodeURIComponent(cursor)}`,
          { signal: controller.signal },
        );
        if (!active || controller.signal.aborted) return;
        const parsed = result.success ? aiSessionListSchema.safeParse(result.data) : null;
        if (!result.success || !parsed?.success) {
          setHistoryPaginationError(locale.t("ai.historyUnreadable"));
          break;
        }
        sessions.push(...parsed.data.sessions);
        cursor = parsed.data.nextCursor ?? null;
      }
      if (active) {
        setAdditionalHistorySessions(sessions);
        setHistoryPaginationBusy(false);
      }
    };
    void loadRemainingHistory();
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, firstHistoryPageIdentity]);
  const completeHistoryData = firstHistoryPage ? {
    ...firstHistoryPage,
    sessions: [...new Map(
      [...firstHistoryPage.sessions, ...additionalHistorySessions].map(session => [session.id, session]),
    ).values()],
  } : null;
  const projectedHomeChat = orbitAiHomeChatWindow(
    startedNewChat || state.kind !== "success" ? null : state.data,
    null,
    locale.language
  );
  // Preserve the existing bootstrap/window selection, but render the validated
  // business text verbatim rather than the shared legacy keyword replacement.
  const homeChat = { ...projectedHomeChat, messages: projectedHomeChat.messages.map(message => ({ ...message,
    content: state.kind === "success" ? state.data.messages.find(item => item.messageId === message.id)?.content ?? state.data.assistantMessage : message.content
  })) };
  const historyItems = aiHistoryRows(state.kind === "success" || state.kind === "empty" ? state.data : null,
    completeHistoryData)
    .filter(item => item.source !== "session" || !deletedIds.includes(item.id));
  const groups = groupsState.kind === "success" || groupsState.kind === "empty"
    ? groupsState.data.groups
    : [];
  const historyNotices: { message: string; retryLabel?: string; onRetry?: () => void }[] = [];
  if (state.kind === "loading" || historyState.kind === "loading") historyNotices.push({ message: locale.t("ai.loadingRecent") });
  if (historyPaginationBusy) historyNotices.push({ message: locale.t("ai.loadingAllHistory") });
  if (historyPaginationError) historyNotices.push({ message: historyPaginationError, retryLabel: locale.t("ai.retryRead"), onRetry: () => { if (owns()) setHistoryAttempt(value => value + 1); } });
  if (state.kind === "failure" || state.kind === "offline") historyNotices.push({ message: locale.t("ai.conversationsUnreadable"), retryLabel: locale.t("ai.retryConversations"), onRetry: () => { if (owns()) setConversationAttempt(value => value + 1); } });
  if (historyState.kind === "failure" || historyState.kind === "offline") historyNotices.push({ message: locale.t("ai.historyUnreadable"), retryLabel: locale.t("ai.retryHistory"), onRetry: () => { if (owns()) setHistoryAttempt(value => value + 1); } });
  if ((state.kind === "success" || state.kind === "empty") && state.data.state === "pending") historyNotices.push({ message: locale.t("ai.conversationPreparing") });
  if ((historyState.kind === "success" || historyState.kind === "empty") && !historyState.data.storage.configured) historyNotices.push({ message: locale.t("ai.historyUnavailable") });
  const todayPayload =
    todayState.kind === "success" || todayState.kind === "empty"
      ? todayState.data
      : null;
  const todaySummary = todayHomeSummary(todayPayload, new Date(), "Asia/Tokyo", locale.language);
  const [questionSnapshot, setQuestionSnapshot] = useState<HomeQuestionSnapshot | null>(null);
  const nextQuestionSnapshot = homeQuestionSnapshot(questionSnapshot, {
    scope: JSON.stringify([baseUrl, auth.user?.id ?? null]),
    payload: todayPayload,
    ready: auth.ready && todayState.kind !== "loading",
    refreshing: todayState.refreshing
  });
  if (nextQuestionSnapshot !== questionSnapshot) setQuestionSnapshot(nextQuestionSnapshot);
  const suggestedPrompts = [...(nextQuestionSnapshot.questions ?? todayHomeQuestions(null, new Date(), locale.language)), { kind: "discussion", label: locale.t("ai.discussionPrompt") }];
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
    if (!owns() || navigationLock.current || !auth.user?.id) return;
    const message = draftMessage.trim();

    if (!message) {
      setSendError(locale.t("ai.enterQuestion"));
      return;
    }

    let sendIntent: string;
    try {
      sendIntent = randomUUID();
    } catch {
      setSendError(locale.t("ai.sendFailed"));
      return;
    }
    registerAiSendIntent({
      id: sendIntent,
      actorId: auth.user.id,
      baseUrl,
      message,
      origin: {
        entryClient: "app",
        entryPointId,
        initialGroupId,
        kind: "manual",
        template: null,
      },
    });
    setSendError(null);
    navigationLock.current = true;
    router.push({
      params: { id: "new", initialMessage: message, sendIntent },
      pathname: "/ai/[id]"
    });
  }

  function startNewChat(groupId: string | null = null) {
    if (!owns()) return;
    navigationLock.current = false;
    setComposerMenuOpen(false);
    setHistoryOpen(false);
    setDrawerOpen(false);
    setStartedNewChat(true);
    setInitialGroupId(groupId);
    setEntryPointId("ai.new_chat");
    setDraftMessage("");
    setSendError(null);
  }

  function openOrganization(item: AiDrawerHistoryItem | null) {
    if (!owns()) return;
    setOrganizationItem(item);
    setOrganizationError(null);
    setOrganizationPendingOpen(true);
    setHistoryOpen(false);
    if (Platform.OS === "web") {
      setOrganizationPendingOpen(false);
      setOrganizationOpen(true);
    }
  }

  function closeOrganizationAndOpenHistory() {
    setHistoryPendingOpen(true);
    setOrganizationOpen(false);
    if (Platform.OS === "web") {
      setHistoryPendingOpen(false);
      setHistoryOpen(true);
    }
  }

  async function mutateOrganization(
    item: AiDrawerHistoryItem,
    patch: { customTitle?: string | null; groupId?: string | null; pinned?: boolean },
  ) {
    if (!owns() || organizationOperation.current || item.source !== "session") return;
    const operation = new AbortController();
    organizationOperation.current = operation;
    setOrganizationBusy(true);
    setOrganizationError(null);
    const result = await updateAiSessionOrganization(client, item.id, {
      expectedRevision: item.organizationRevision,
      mutationId: randomUUID(),
      patch,
    }, operation.signal);
    if (!owns() || operation.signal.aborted || organizationOperation.current !== operation) return;
    if (result.ok) {
      const organization = result.value.organization;
      if (organization) {
        setOrganizationItem(current => current?.id === item.id ? {
          ...current,
          groupId: organization.groupId,
          organizationRevision: organization.revision,
          pinned: organization.pinned,
          title: organization.customTitle ?? current.title,
        } : current);
      }
      setHistoryAttempt(value => value + 1);
    } else {
      setOrganizationError(result.error);
    }
    organizationOperation.current = null;
    setOrganizationBusy(false);
  }

  async function createGroup(name: string) {
    if (!owns() || organizationOperation.current) return;
    const operation = new AbortController(); organizationOperation.current = operation; setOrganizationBusy(true); setOrganizationError(null);
    const id = `group:${randomUUID()}`;
    const result = await createAiSessionGroup(client, { id, mutationId: randomUUID(), name }, operation.signal);
    if (!owns() || operation.signal.aborted || organizationOperation.current !== operation) return;
    if (result.ok) setGroupsAttempt(value => value + 1); else setOrganizationError(result.error);
    organizationOperation.current = null; setOrganizationBusy(false);
  }

  async function renameGroup(group: AiSessionGroupContract, name: string) {
    if (!owns() || organizationOperation.current) return;
    const operation = new AbortController(); organizationOperation.current = operation; setOrganizationBusy(true); setOrganizationError(null);
    const result = await renameAiSessionGroup(client, group.id, { expectedRevision: group.revision, mutationId: randomUUID(), name }, operation.signal);
    if (!owns() || operation.signal.aborted || organizationOperation.current !== operation) return;
    if (result.ok) setGroupsAttempt(value => value + 1); else setOrganizationError(result.error);
    organizationOperation.current = null; setOrganizationBusy(false);
  }

  async function deleteGroup(group: AiSessionGroupContract) {
    if (!owns() || organizationOperation.current) return;
    const operation = new AbortController(); organizationOperation.current = operation; setOrganizationBusy(true); setOrganizationError(null);
    const result = await deleteAiSessionGroup(client, group.id, { expectedRevision: group.revision, mutationId: randomUUID() }, operation.signal);
    if (!owns() || operation.signal.aborted || organizationOperation.current !== operation) return;
    if (result.ok) {
      if (selectedGroupId === group.id) setSelectedGroupId(null);
      setGroupsAttempt(value => value + 1); setHistoryAttempt(value => value + 1);
    } else setOrganizationError(result.error);
    organizationOperation.current = null; setOrganizationBusy(false);
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
      setHistoryDeleteError(locale.t("ai.deleteUnconfirmed"));
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
            <Text accessibilityRole="header" style={styles.heroTitle}>{locale.t("ai.promptTitle")}</Text>
            <Text style={styles.heroSubtitle}>{locale.t("ai.promptSubtitle")}</Text>
            <View style={styles.suggestionList}>
              <Text style={styles.suggestionHeading}>{locale.t("ai.suggestionHeading")}</Text>
              {suggestedPrompts.map(prompt => (
                <Pressable accessibilityLabel={locale.t("ai.fillQuestion", { question: prompt.label })} accessibilityHint={locale.t("ai.fillQuestionHint")} accessibilityRole="button" key={prompt.kind}
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
                <Text style={styles.sectionLabel}>{locale.t("ai.recentChats")}</Text>
                <Pressable accessibilityLabel={locale.t("ai.allChats")} accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.allHistoryButton}>
                  <Text style={styles.allHistoryText}>{locale.t("ai.all")}</Text><Ionicons name="chevron-forward" color={colors.accent} size={14} />
                </Pressable>
              </View>
              {historyItems.slice(0, 3).map(item => (
                <Pressable accessibilityLabel={locale.t("ai.continueChat", { title: item.title })} accessibilityRole="button" key={`${item.source}:${item.id}`} onPress={() => openHistoryItem(item)} style={({ pressed }) => [styles.recentRow, pressed ? styles.pressed : null]}>
                  <View style={styles.recentCopy}><Text numberOfLines={2} style={styles.recentTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.recentPreview}>{item.preview}</Text></View>
                  <Text style={styles.recentWhen}>{item.when}</Text><Ionicons name="chevron-forward" color={colors.text4} size={14} />
                </Pressable>
              ))}
              {state.kind === "loading" || historyState.kind === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>{locale.t("ai.loadingRecent")}</Text> : null}
              {(state.kind === "success" || state.kind === "empty") && state.data.state === "pending" ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>{locale.t("ai.conversationPreparing")}</Text> : null}
              {state.kind === "failure" || state.kind === "offline" ? <View style={styles.recentFailure}><Text style={styles.errorText}>{locale.t("ai.conversationsUnreadable")}</Text><Pressable accessibilityLabel={locale.t("ai.retryConversations")} accessibilityRole="button" onPress={() => { if (owns()) setConversationAttempt(value => value + 1); }} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("common.retry")}</Text></Pressable></View> : null}
              {historyState.kind === "failure" || historyState.kind === "offline" ? <View style={styles.recentFailure}><Text style={styles.errorText}>{locale.t("ai.historyUnreadable")}</Text><Pressable accessibilityLabel={locale.t("ai.retryHistory")} accessibilityRole="button" onPress={() => { if (owns()) setHistoryAttempt(value => value + 1); }} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("common.retry")}</Text></Pressable></View> : null}
              {(historyState.kind === "success" || historyState.kind === "empty") && !historyState.data.storage.configured ? <Text style={styles.recentState}>{locale.t("ai.historyUnavailable")}</Text> : null}
              {historyItems.length === 0 && (state.kind === "success" || state.kind === "empty") && state.data.state !== "pending" && (historyState.kind === "success" || historyState.kind === "empty") && historyState.data.storage.configured ? <Text style={styles.recentState}>{locale.t("ai.noConversations")}</Text> : null}
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
        accountName={mobileUserDisplayName(auth.user, locale.t("ai.account"))}
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
        historyPaginationError={historyPaginationError}
        historyPaging={historyPaginationBusy}
        historyItems={selectedGroupId ? historyItems.filter(item => item.groupId === selectedGroupId) : historyItems}
        groupFilterName={groups.find(group => group.id === selectedGroupId)?.name ?? null}
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
        onDismiss={() => {
          if (!organizationPendingOpen) return;
          setOrganizationPendingOpen(false);
          if (owns()) setOrganizationOpen(true);
        }}
        onDeleteHistoryItem={item => { if (owns() && !deleteOperation.current) { setHistoryDeleteError(null); setConfirmDelete(item); } }}
        onManageGroups={() => openOrganization(null)}
        onManageHistoryItem={item => openOrganization(item)}
        onOpenHistoryItem={openHistoryItem}
        onClearGroupFilter={() => setSelectedGroupId(null)}
        visible={historyOpen}
      />
      <AiSessionOrganizationPanel
        busy={organizationBusy}
        error={organizationError}
        groups={groups}
        item={organizationItem}
        onClose={() => { if (!organizationBusy) setOrganizationOpen(false); }}
        onDismiss={() => {
          if (!historyPendingOpen) return;
          setHistoryPendingOpen(false);
          if (owns()) setHistoryOpen(true);
        }}
        onCreateGroup={name => { void createGroup(name); }}
        onDeleteGroup={group => { void deleteGroup(group); }}
        onDeleteSession={item => { const historyItem = historyItems.find(row => row.id === item.id); if (historyItem) { setConfirmDelete(historyItem); closeOrganizationAndOpenHistory(); } }}
        onMoveSession={(item, groupId) => { void mutateOrganization(item as AiDrawerHistoryItem, { groupId }); }}
        onOpenGroup={group => { setSelectedGroupId(group.id); closeOrganizationAndOpenHistory(); }}
        onRenameGroup={(group, name) => { void renameGroup(group, name); }}
        onRenameSession={(item, title) => { void mutateOrganization(item as AiDrawerHistoryItem, { customTitle: title.trim() }); }}
        onStartGroupChat={group => { setOrganizationOpen(false); startNewChat(group.id); }}
        onTogglePin={item => { void mutateOrganization(item as AiDrawerHistoryItem, { pinned: !item.pinned }); }}
        visible={organizationOpen}
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
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel={locale.t("ai.home")}
        accessibilityRole="button"
        onPress={onHome}
        style={({ pressed }) => [
          styles.homeButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="chevron-back" size={19} /><Text style={styles.homeButtonText}>{locale.t("ai.home")}</Text>
      </Pressable>
      <View style={styles.brand}><Image accessible={false} testID="iorbit-brand-mark" source={iorbitBrandMark} style={{ width: 18, height: 18 }} /><Text style={styles.topBarTitle}>IORBIT</Text></View>
      <Pressable
        accessibilityLabel={locale.t("ai.history")}
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

function messageTimestamp(message: ChatMessageView, language: OrbitLanguage): string {
  if (!message.createdAt) {
    return "";
  }

  const timestamp = Date.parse(message.createdAt);

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", {
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
  const locale = useOrbitLocale();
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
        const when = messageTimestamp(message, locale.language);

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
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const minimumInputHeight = Math.max(44, Math.ceil(22 * fontScale + 12));
  const [inputHeight, setInputHeight] = useState(minimumInputHeight);
  const canSend = draftMessage.trim().length > 0;

  return (
    <View style={styles.composerBar}>
      <TextInput
        accessibilityLabel={locale.t("ai.message")}
        multiline
        numberOfLines={1}
        onChangeText={value => { if (!value) setInputHeight(minimumInputHeight); onDraftMessageChange(value); }}
        onContentSizeChange={event => setInputHeight(Math.min(120, Math.max(minimumInputHeight, event.nativeEvent.contentSize.height)))}
        placeholder={locale.t("ai.askPlaceholder")}
        placeholderTextColor={colors.text4}
        style={[styles.composerInput, { height: Math.max(minimumInputHeight, inputHeight) }]}
        value={draftMessage}
      />
      <View style={styles.composerActions}>
      <Pressable
        accessibilityLabel={locale.t("ai.moreActions")}
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
        accessibilityLabel={locale.t("ai.send")}
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
  const locale = useOrbitLocale();
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
          accessibilityLabel={locale.t("ai.closeMenu")}
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
            <Text style={styles.sheetRowText}>{locale.t("ai.scanCard")}</Text>
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
            <Text style={styles.sheetRowText}>{locale.t("ai.newChat")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenDrawer} style={({ pressed }) => [styles.sheetRow, pressed ? styles.pressed : null]}>
            <View style={styles.sheetRowIcon}><Ionicons color={colors.ink} name="menu-outline" size={19} /></View>
            <Text style={styles.sheetRowText}>{locale.t("ai.commonEntries")}</Text>
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
  const locale = useOrbitLocale();
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
          accessibilityLabel={locale.t("ai.closeSidebar")}
          onPress={onClose}
          style={styles.drawerScrim}
        />
        <View style={styles.drawerPanel}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Orbit AI</Text>
            <View style={styles.drawerHeaderActions}>
              <Pressable
                accessibilityLabel={locale.t("ai.openInbox")}
                accessibilityRole="button"
                onPress={() => onOpenCapability("/inbox" as Href)}
                style={({ pressed }) => [styles.drawerIconButton, pressed ? styles.pressed : null]}
              >
                <Ionicons color={colors.text2} name="file-tray-full-outline" size={19} />
                {inboxBadge ? <View style={styles.drawerInboxDot} /> : null}
              </Pressable>
              <Pressable
                accessibilityLabel={locale.t("ai.closeSidebar")}
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
              accessibilityLabel={locale.t("ai.newChat")}
              accessibilityRole="button"
              onPress={onNewChat}
              style={({ pressed }) => [styles.drawerNewChat, pressed ? styles.pressed : null]}
            >
              <Ionicons color={colors.onAccent} name="create-outline" size={19} />
              <Text style={styles.drawerNewChatText}>{locale.t("ai.newChat")}</Text>
            </Pressable>
            <View style={styles.drawerSearchBox}>
              <Ionicons color={colors.text3} name="search-outline" size={17} />
              <TextInput
                onChangeText={setHistoryQuery}
                placeholder={locale.t("ai.searchConversations")}
                placeholderTextColor={colors.text4}
                style={styles.drawerSearchInput}
                value={historyQuery}
              />
            </View>
            <Text style={styles.drawerSectionTitle}>{locale.t("ai.commonEntries")}</Text>
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
            <Text style={styles.drawerSectionTitle}>{locale.t("ai.recentChats")}</Text>
            {historyNotices.map(notice => <View key={notice.message} style={styles.recentFailure}>
              <Text accessibilityLiveRegion="polite" style={notice.onRetry ? styles.errorText : styles.drawerEmptyText}>{notice.message}</Text>
              {notice.onRetry ? <Pressable accessibilityLabel={notice.retryLabel} accessibilityRole="button" onPress={notice.onRetry} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("common.retry")}</Text></Pressable> : null}
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
                <Text style={styles.drawerEmptyText}>{locale.t("ai.noMatchingChats")}</Text>
              ) : null}
            </View>
          </ScrollView>
          <View style={styles.drawerFooter}>
            <Pressable
              accessibilityLabel={locale.t("ai.openProfile")}
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
              accessibilityLabel={locale.t("ai.openSettings")}
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
  const locale = useOrbitLocale();
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
          {locale.t(entry.titleKey)}
        </Text>
        {entry.detailKey ? (
          <Text numberOfLines={1} style={styles.capabilityDetail}>
            {locale.t(entry.detailKey)}
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
  historyPaginationError,
  historyPaging,
  historyItems,
  groupFilterName,
  historyStateKind,
  onClose,
  onDismiss,
  onCancelDelete,
  onConfirmDelete,
  onDeleteHistoryItem,
  onManageGroups,
  onManageHistoryItem,
  onOpenHistoryItem,
  onClearGroupFilter,
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
  historyPaginationError: string | null;
  historyPaging: boolean;
  historyItems: AiDrawerHistoryItem[];
  groupFilterName: string | null;
  historyStateKind: ApiResourceState<unknown>["kind"];
  onClose: () => void;
  onDismiss: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDeleteHistoryItem: (item: AiDrawerHistoryItem) => void;
  onManageGroups: () => void;
  onManageHistoryItem: (item: AiDrawerHistoryItem) => void;
  onOpenHistoryItem: (item: AiDrawerHistoryItem) => void;
  onClearGroupFilter: () => void;
  visible: boolean;
}) {
  const locale = useOrbitLocale();
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
  const loading = conversationStateKind === "loading" || historyStateKind === "loading" || historyPaging;

  useEffect(() => {
    if (!visible) {
      setHistoryQuery("");
    }
  }, [visible]);

  return (
    <Modal
      animationType="fade"
      onDismiss={onDismiss}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.historyModalRoot}>
        <Pressable
          accessibilityLabel={locale.t("ai.closeHistory")}
          onPress={onClose}
          style={styles.drawerScrim}
        />
        <View style={styles.historyPanel}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>{groupFilterName ? locale.t("ai.historyNamed", { name: groupFilterName }) : locale.t("ai.historyTitle")}</Text>
            <View style={styles.drawerHeaderActions}>
            <Pressable accessibilityLabel={locale.t("ai.manageGroups")} accessibilityRole="button" onPress={onManageGroups} style={styles.drawerIconButton}><Ionicons color={colors.text2} name="folder-open-outline" size={19} /></Pressable>
            <Pressable
              accessibilityLabel={locale.t("ai.closeHistory")}
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
          </View>
          {groupFilterName ? <Pressable accessibilityLabel={locale.t("ai.showAllHistory")} accessibilityRole="button" onPress={onClearGroupFilter} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("ai.all")}</Text></Pressable> : null}
          {loading ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>{locale.t("ai.loadingHistory")}</Text> : null}
          {conversationPending ? <Text accessibilityLiveRegion="polite" style={styles.recentState}>{locale.t("ai.conversationPreparing")}</Text> : null}
          {historyUnavailable ? <Text style={styles.recentState}>{locale.t("ai.historyUnavailable")}</Text> : null}
          {conversationFailed ? <View style={styles.recentFailure}><Text style={styles.errorText}>{locale.t("ai.conversationsUnreadable")}</Text><Pressable accessibilityLabel={locale.t("ai.retryConversations")} accessibilityRole="button" onPress={onRetryConversation} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("common.retry")}</Text></Pressable></View> : null}
          {historyFailed ? <View style={styles.recentFailure}><Text style={styles.errorText}>{locale.t("ai.historyUnreadable")}</Text><Pressable accessibilityLabel={locale.t("ai.retryHistory")} accessibilityRole="button" onPress={onRetryHistory} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("common.retry")}</Text></Pressable></View> : null}
          {historyDeleteError ? (
            <Text style={styles.errorText}>{historyDeleteError}</Text>
          ) : null}
          {historyPaginationError ? <Text style={styles.errorText}>{historyPaginationError}</Text> : null}
          {confirmDelete ? <View style={styles.deleteConfirmation}>
            <Text style={styles.recentTitle}>{locale.t("ai.deleteNamed", { title: confirmDelete.title })}</Text>
            <Text style={styles.recentPreview}>{locale.t("ai.deleteIrreversible")}</Text>
            <View style={styles.deleteActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={locale.t("ai.cancelDelete")} disabled={Boolean(deletingHistoryId)} onPress={onCancelDelete} style={styles.retryButton}><Text style={styles.allHistoryText}>{locale.t("ai.cancelDelete")}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={locale.t("ai.confirmDelete")} disabled={Boolean(deletingHistoryId)} onPress={onConfirmDelete} style={[styles.confirmButton, deletingHistoryId ? styles.disabled : null]}><Text style={styles.confirmButtonText}>{locale.t(deletingHistoryId ? "ai.deleting" : "ai.confirmDelete")}</Text></Pressable>
            </View>
          </View> : null}
          <View style={styles.drawerSearchBox}>
            <Ionicons color={colors.text3} name="search-outline" size={15} />
            <TextInput
              onChangeText={setHistoryQuery}
              placeholder={locale.t("ai.searchHistory")}
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
            onManageHistoryItem={onManageHistoryItem}
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
  onManageHistoryItem,
  onOpenHistoryItem
}: {
  deletingHistoryId: string | null;
  historyItems: AiDrawerHistoryItem[];
  canShowEmpty: boolean;
  hasQuery: boolean;
  onDeleteHistoryItem: (item: AiDrawerHistoryItem) => void;
  onManageHistoryItem: (item: AiDrawerHistoryItem) => void;
  onOpenHistoryItem: (item: AiDrawerHistoryItem) => void;
}) {
  const locale = useOrbitLocale();
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
            onManage={() => onManageHistoryItem(item)}
            onPress={() => onOpenHistoryItem(item)}
          />
        ))}
      </ScrollView>
    );
  }

  if (!canShowEmpty) return null;

  return (
    <View style={styles.drawerEmptyBox}>
      <Text style={styles.drawerEmptyTitle}>{locale.t(hasQuery ? "ai.emptyMatched" : "ai.emptyHistory")}</Text>
      <Text style={styles.drawerEmptyText}>{locale.t(hasQuery ? "ai.changeKeyword" : "ai.startQuestion")}</Text>
    </View>
  );
}

function DrawerHistoryRow({
  deleting,
  item,
  onDelete,
  onManage,
  onPress
}: {
  deleting: boolean;
  item: AiDrawerHistoryItem;
  onDelete: () => void;
  onManage: () => void;
  onPress: () => void;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const canDelete = item.source === "session";

  return (
    <View style={styles.drawerHistoryRow}>
      <Pressable
        accessibilityLabel={locale.t("ai.openHistoryNamed", { title: item.title })}
        accessibilityRole="button"
        onLongPress={canDelete ? onManage : undefined}
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
            {item.preview || locale.t("ai.continueQuestion")}
          </Text>
        </View>
      </Pressable>
      {canDelete ? (
        <Pressable accessibilityLabel={locale.t("ai.manageConversation")} accessibilityRole="button" disabled={deleting} onPress={onManage} style={({ pressed }) => [styles.historyDeleteButton, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.text3} name="ellipsis-horizontal" size={15} />
        </Pressable>
      ) : null}
      {canDelete ? (
        <Pressable
          accessibilityLabel={locale.t("ai.deleteHistory")}
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
            <Text style={styles.historyDeleteText}>{locale.t("ai.deleting")}</Text>
          ) : (
            <Text style={styles.historyDeleteText}>{locale.t("ai.deleteHistory")}</Text>
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
