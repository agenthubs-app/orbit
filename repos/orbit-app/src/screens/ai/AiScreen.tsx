import { randomUUID } from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  PanResponder,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  useSafeAreaInsets
} from "react-native-safe-area-context";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationSessionPath
} from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { aiConversationListSchema, aiHistoryRows, aiSessionDeleteReceiptSchema, aiSessionGroupListSchema, type AiSession } from "../../api/ai-history-contract";
import { contactCardSummarySchema } from "../../api/schema/contact-card-page";
import { planIntakeListResponseSchema, planV2SummaryResponseSchema } from "../../api/schema/plan-v2";
import { planDoneHref, planFlowHref, planNewGoalHref, planOverviewHref, planReviewHref } from "../../api/compute/plan-href";
import type { AiSessionEntryPointId, AiSessionGroupContract } from "../../api/contract/ai-sessions";
import type { AiSessionSummaryItemContract } from "../../api/contract/ai-session-page";
import type { OrbitLanguage } from "../../api/contract/language";
import { createAiSessionGroup, deleteAiSession, deleteAiSessionGroup, renameAiSessionGroup, restoreAiSession, updateAiSessionOrganization } from "../../api/ai-session-management";
import { aiSessionOriginInputSchema } from "../../api/schema/ai-sessions";
import { aiSessionSummaryPageSchema } from "../../api/schema/ai-session-page";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { registerAiSendIntent } from "../../data/ai-send-intent";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { useLoadingDeadline } from "../../hooks/useLoadingDeadline";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { iorbitR21Copy } from "../../i18n/iorbitR21";
import { todayTaskSummaryModeSchema } from "../../api/schema/today";
import { orbitAiHomeChatWindow } from "../../view-models/conversations";
import type { TodayHomeActionView } from "../../view-models/today-tasks";
import { deviceTodayTaskSummaryView, overlayTodayTaskSummaryView, todaySummaryPath, todaySummaryQuestions, todaySummaryToHomeView } from "../../view-models/today-task-pages";
import type { TaskItemContract } from "../../api/contract/tasks";
import { homeQuestionSnapshot, type HomeQuestionSnapshot } from "../../view-models/home-question-snapshot";
import { useLocalAiSessions } from "../../hooks/useLocalAiSessions";
import { localAiSessionPage } from "../../view-models/ai-sessions-local";
import { buildOfflineAiSessionDelete, buildOfflineAiSessionMutation } from "../../data/sync/ai-session-outbox-mutation";
import { IOrbitStartView } from "./IOrbitStartView";
import { useToast } from "../../components/ui";

function localDateKey(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(item => [item.type, item.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

type AiDrawerHistoryItem = {
  groupId: string | null;
  id: string;
  organizationRevision: number;
  pinned: boolean;
  preview: string;
  source: "conversation" | "session";
  title: string;
  updatedAt: string;
  when: string;
};

type AiHistoryContinuation = {
  identity: string;
  items: AiSessionSummaryItemContract[];
  nextCursor: string | null;
  hasMore: boolean;
  usedCursors: string[];
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
  const toast = useToast();
  const locale = useOrbitLocale();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const params = useLocalSearchParams<{ drawer?: string | string[]; entryPointId?: string | string[] }>();
  const keyboardBottomInset = useStableKeyboardBottomInset();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [historyQuery, setHistoryQuery] = useState("");
  const [debouncedHistoryQuery, setDebouncedHistoryQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsAttempt, setGroupsAttempt] = useState(0);
  const [conversationAttempt, setConversationAttempt] = useState(0);
  const [todayAttempt, setTodayAttempt] = useState(0);
  const readScope = JSON.stringify([scopeKey, refreshIndex]);
  const historyQueryParam = debouncedHistoryQuery;
  const historyQuerySettled = historyQuery.trim() === historyQueryParam;
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedHistoryQuery(historyQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [historyQuery]);
  const historyFilterIdentity = JSON.stringify([readScope, historyAttempt, historyQueryParam, selectedGroupId]);
  const latestHistoryFilterIdentity = useRef(historyFilterIdentity);
  latestHistoryFilterIdentity.current = historyFilterIdentity;
  const historyParams = new URLSearchParams({ limit: "20" });
  if (historyQueryParam) historyParams.set("q", historyQueryParam);
  if (selectedGroupId) historyParams.set("groupId", selectedGroupId);
  const historyPath = `${ORBIT_API_ENDPOINTS.aiConversationSessions}?${historyParams.toString()}`;
  const ownership = useMemo(() => ({}), [readScope]);
  const latest = useRef(ownership);
  latest.current = ownership;
  const mounted = useRef(true);
  const deleteOperation = useRef<AbortController | null>(null);
  const organizationOperation = useRef<AbortController | null>(null);
  const historyPageOperation = useRef<AbortController | null>(null);
  const [historyContinuation, setHistoryContinuation] = useState<AiHistoryContinuation | null>(null);
  const [historyPagingIdentity, setHistoryPagingIdentity] = useState<string | null>(null);
  const [historyPageError, setHistoryPageError] = useState<{ identity: string; message: string } | null>(null);
  useEffect(() => {
    if (!historyQuerySettled) historyPageOperation.current?.abort();
  }, [historyQuerySettled]);
  const navigationLock = useRef(false);
  const owns = () => mounted.current && latest.current === ownership && isScopeCurrent();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; deleteOperation.current?.abort(); deleteOperation.current = null; organizationOperation.current?.abort(); organizationOperation.current = null; historyPageOperation.current?.abort(); historyPageOperation.current = null; };
  }, [ownership]);
  const client = useOrbitApiClient({ scopeKey: readScope });
  const inboxBadge = useRelationshipInboxBadgeCount(readScope);
  const state = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    () => false,
    { scopeKey: JSON.stringify([readScope, conversationAttempt]) }
  ), aiConversationListSchema);
  // Sprint 0118 (AI B3): where the device mirror holds the AI sessions (native always, the browser with
  // its mirror) the list, search and group filter read it; the network list stays inert.
  const localSessions = useLocalAiSessions();
  const historyFromDevice = localSessions.available && localSessions.freshness.readable;
  const aiOffline = historyFromDevice && localSessions.freshness.offline;
  const pendingAiWrites = localSessions.queuedMutations.some(item => item.state === "queued" || item.state === "sending");
  const failedAiWrite = localSessions.queuedMutations.find(item => item.state === "conflict" || item.state === "failed");
  const historyState = validateApiResourceState(useApiResource<unknown>(
    historyPath,
    data => { const parsed = aiSessionSummaryPageSchema.safeParse(data); return parsed.success && parsed.data.items.length === 0; },
    { scopeKey: historyFilterIdentity, cachePolicy: "network-only", enabled: !localSessions.available }
  ), aiSessionSummaryPageSchema);
  const historyKind: typeof historyState.kind = localSessions.available
    ? (historyFromDevice ? "success" : localSessions.freshness.failure ? "failure" : "loading")
    : historyState.kind;
  const groupsState = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.aiConversationGroups,
    () => false,
    { scopeKey: JSON.stringify([readScope, groupsAttempt]) }
  ), aiSessionGroupListSchema);
  const contactSummary = validateApiResourceState(useApiResource<unknown>(
    "/api/contacts/summary", () => false, { scopeKey: readScope, cachePolicy: "network-only" }
  ), contactCardSummarySchema);
  const planIntakes = validateApiResourceState(useApiResource<unknown>(
    "/api/agent/plans/intakes?platform=app", () => false, { scopeKey: readScope, cachePolicy: "network-only" }
  ), planIntakeListResponseSchema);
  const planSummary = validateApiResourceState(useApiResource<unknown>(
    "/api/agent/plans/v2/summary", () => false, { scopeKey: readScope, cachePolicy: "network-only" }
  ), planV2SummaryResponseSchema);
  const todayNow = new Date();
  const todayDate = localDateKey("Asia/Tokyo", todayNow);
  // Sprint 0131 (coordinator item from 0118): the Today block is the page copy "today-summary" (today's only),
  // so offline it keeps the last summary with the tab's 截至 notice instead of 「暂时无法连接」.
  const todaySchema = todayTaskSummaryModeSchema.refine(value => value.date === todayDate && value.timeZone === "Asia/Tokyo", { message: "Stale Today summary scope" });
  const todayCopied = usePageCopyResource<unknown>(
    todaySummaryPath("Asia/Tokyo"),
    () => false,
    { scopeKey: JSON.stringify([readScope, todayAttempt, todayDate]), copy: { id: "today-summary" }, accept: (data) => todaySchema.safeParse(data).success }
  );
  const taskMirror = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const taskOutbox = useOfflineTaskOutbox(taskMirror, Platform.OS !== "web");
  const todayState = validateApiResourceState(todayCopied, todaySchema);
  // Sprint 0092: neither region may say "still reading" without end. A retry
  // bumps the attempt counter, which restarts the clock for that region.
  const recentLoading = state.kind === "loading" || historyKind === "loading";
  const recentOverdue = useLoadingDeadline(recentLoading, JSON.stringify([readScope, conversationAttempt, historyAttempt]));
  const todayOverdue = useLoadingDeadline(todayState.kind === "loading", JSON.stringify([readScope, todayAttempt]));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPendingOpen, setHistoryPendingOpen] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationPendingOpen, setOrganizationPendingOpen] = useState(false);
  const [organizationItem, setOrganizationItem] = useState<AiDrawerHistoryItem | null>(null);
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
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
  const [pendingUndo, setPendingUndo] = useState<({ id: string; token: string; until: string } | { id: string; mutationId: string; until: string }) | null>(null);
  useEffect(() => {
    if (!pendingUndo) return;
    const timer = setTimeout(() => setPendingUndo(current => current?.until === pendingUndo.until && current.id === pendingUndo.id ? null : current), Math.max(0, Date.parse(pendingUndo.until) - Date.now()));
    return () => clearTimeout(timer);
  }, [pendingUndo]);
  // The device mirror is partial. A nonempty online query must use the actor-scoped
  // server search so older message bodies and pages are included automatically.
  const serverSearchActive = historyFromDevice && historyQueryParam.length > 0 && !aiOffline;
  const serverSearchState = validateApiResourceState(useApiResource<unknown>(
    historyPath,
    () => false,
    { scopeKey: historyFilterIdentity + ":server-search", cachePolicy: "network-only", enabled: serverSearchActive && !aiOffline }
  ), aiSessionSummaryPageSchema);
  const serverSearchPage = serverSearchActive && (serverSearchState.kind === "success" || serverSearchState.kind === "empty") ? serverSearchState.data : null;
  const firstHistoryPage = historyFromDevice
    ? serverSearchActive ? serverSearchPage : localAiSessionPage(localSessions.rows, { q: historyQueryParam, groupId: selectedGroupId })
    : !localSessions.available && (historyState.kind === "success" || historyState.kind === "empty")
      ? historyState.data
      : null;
  const activeHistoryContinuation = historyContinuation?.identity === historyFilterIdentity ? historyContinuation : null;
  const displaySessionPage = firstHistoryPage ? {
    ...firstHistoryPage,
    items: [...firstHistoryPage.items, ...(activeHistoryContinuation?.items ?? [])],
  } : null;
  const historyNextCursor = activeHistoryContinuation ? activeHistoryContinuation.nextCursor : firstHistoryPage?.nextCursor ?? null;
  const historyHasMore = activeHistoryContinuation ? activeHistoryContinuation.hasMore : firstHistoryPage?.hasMore ?? false;
  const historyPaging = historyPagingIdentity === historyFilterIdentity;
  const activeHistoryPageError = historyPageError?.identity === historyFilterIdentity ? historyPageError.message : null;
  useEffect(() => {
    historyPageOperation.current?.abort();
    historyPageOperation.current = null;
    setHistoryContinuation(current => current?.identity === historyFilterIdentity ? current : null);
    setHistoryPagingIdentity(null);
    setHistoryPageError(current => current?.identity === historyFilterIdentity ? current : null);
  }, [historyFilterIdentity]);
  async function loadMoreHistory() {
    if (!owns() || !historyQuerySettled || !firstHistoryPage || !historyHasMore || !historyNextCursor || historyPageOperation.current) return;
    const identity = historyFilterIdentity;
    const cursor = historyNextCursor;
    const continuation = historyContinuation?.identity === identity ? historyContinuation : null;
    const seenCursors = new Set(continuation?.usedCursors ?? []);
    if (seenCursors.has(cursor)) {
      setHistoryPageError({ identity, message: locale.t("ai.historyUnreadable") });
      return;
    }
    const operation = new AbortController();
    historyPageOperation.current = operation;
    setHistoryPagingIdentity(identity);
    setHistoryPageError(null);
    const params = new URLSearchParams({ limit: "20", cursor });
    if (historyQueryParam) params.set("q", historyQueryParam);
    if (selectedGroupId) params.set("groupId", selectedGroupId);
    try {
      const result = await client.get<unknown>(`${ORBIT_API_ENDPOINTS.aiConversationSessions}?${params.toString()}`, { signal: operation.signal });
      if (!owns() || operation.signal.aborted || latestHistoryFilterIdentity.current !== identity || historyPageOperation.current !== operation) return;
      const parsed = result.success ? aiSessionSummaryPageSchema.safeParse(result.data) : null;
      if (!result.success || !parsed?.success || (parsed.data.nextCursor !== null && (parsed.data.nextCursor === cursor || seenCursors.has(parsed.data.nextCursor)))) {
        setHistoryPageError({ identity, message: locale.t("ai.historyUnreadable") });
        return;
      }
      const previousItems = continuation?.items ?? [];
      const existingIds = new Set([...firstHistoryPage.items, ...previousItems].map(item => item.id));
      const newItems = parsed.data.items.filter(item => !existingIds.has(item.id));
      setHistoryContinuation({
        identity,
        items: [...previousItems, ...newItems],
        nextCursor: parsed.data.nextCursor,
        hasMore: parsed.data.hasMore,
        usedCursors: [...seenCursors, cursor],
      });
      setHistoryPageError(null);
    } catch {
      if (owns() && !operation.signal.aborted && latestHistoryFilterIdentity.current === identity) {
        setHistoryPageError({ identity, message: locale.t("ai.historyUnreadable") });
      }
    } finally {
      if (historyPageOperation.current === operation) {
        historyPageOperation.current = null;
        setHistoryPagingIdentity(current => current === identity ? null : current);
      }
    }
  }
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
  const historyItems = aiHistoryRows(!serverSearchActive && (state.kind === "success" || state.kind === "empty") ? state.data : null,
    displaySessionPage)
    .filter(item => {
      if (item.source === "session") return !deletedIds.includes(item.id);
      if (selectedGroupId && item.groupId !== selectedGroupId) return false;
      return !historyQueryParam || `${item.title} ${item.preview}`.toLocaleLowerCase().includes(historyQueryParam.toLocaleLowerCase());
    });
  const groups = groupsState.kind === "success" || groupsState.kind === "empty"
    ? groupsState.data.groups
    : [];
  const historyNotices: { message: string; retryLabel?: string; onRetry?: () => void }[] = [];
  if (serverSearchActive && (serverSearchState.kind === "failure" || serverSearchState.kind === "offline")) historyNotices.push({
    message: locale.t("ai.historyUnreadable"), retryLabel: locale.t("ai.retryHistory"),
    onRetry: () => { if (owns()) setHistoryAttempt(value => value + 1); },
  });
  if (recentLoading && !recentOverdue) historyNotices.push({ message: locale.t("ai.loadingRecent") });
  if (recentOverdue) historyNotices.push({ message: locale.t("ai.recentTimedOut"), retryLabel: locale.t("common.retry"), onRetry: () => { if (owns()) { setConversationAttempt(value => value + 1); setHistoryAttempt(value => value + 1); } } });
  if (!aiOffline && (state.kind === "failure" || state.kind === "offline")) historyNotices.push({ message: locale.t("ai.conversationsUnreadable"), retryLabel: locale.t("ai.retryConversations"), onRetry: () => { if (owns()) setConversationAttempt(value => value + 1); } });
  if (historyKind === "failure" || historyKind === "offline") historyNotices.push({ message: locale.t("ai.historyUnreadable"), retryLabel: locale.t("ai.retryHistory"), onRetry: () => { if (owns()) { setHistoryAttempt(value => value + 1); if (localSessions.available) void localSessions.refresh(); } } });
  if ((state.kind === "success" || state.kind === "empty") && state.data.state === "pending") historyNotices.push({ message: locale.t("ai.conversationPreparing") });
  if (!localSessions.available && (historyState.kind === "success" || historyState.kind === "empty") && !historyState.data.storage.configured) historyNotices.push({ message: locale.t("ai.historyUnavailable") });
  const todayPayload =
    todayState.kind === "success" || todayState.kind === "empty"
      ? todayState.data
      : null;
  const serverTodaySummary = todayPayload
    ? todaySummaryToHomeView(todayPayload, todayDate, "Asia/Tokyo", todayNow, locale.language)
    : null;
  const todaySummary = overlayTodayTaskSummaryView(serverTodaySummary,
    taskMirror.records.flatMap(record => record.deletedAt === null && record.payload && typeof record.payload === "object"
      ? [record.payload as unknown as TaskItemContract] : []),
    taskOutbox.queuedMutations, auth.actorId ?? "", todayDate, todayNow, "Asia/Tokyo", locale.language);
  // Sprint 0136: offline with no copy of today's summary, count from the device task mirror instead of showing 0.
  const todayUnreachable = todayState.kind === "offline" || todayState.kind === "failure";
  const deviceTodaySummary = !todaySummary && todayUnreachable && Platform.OS !== "web" && taskMirror.status !== "unsynced"
    ? deviceTodayTaskSummaryView(taskMirror.records.flatMap(record => record.deletedAt === null && record.payload && typeof record.payload === "object"
      ? [record.payload as unknown as TaskItemContract] : []), taskOutbox.queuedMutations, auth.actorId ?? "", todayDate, todayNow, "Asia/Tokyo", locale.language)
    : null;
  const todaySummaryView = todaySummary ?? deviceTodaySummary ?? { items: [], openTaskCount: 0, suggestionCount: 0 };
  const summaryQuestions = todayPayload ? todaySummaryQuestions(todayPayload, locale.language) : null;
  const [questionSnapshot, setQuestionSnapshot] = useState<HomeQuestionSnapshot | null>(null);
  const nextQuestionSnapshot = homeQuestionSnapshot(questionSnapshot, {
    scope: JSON.stringify([baseUrl, auth.actorId, todayDate]),
    questions: summaryQuestions,
    ready: auth.ready && summaryQuestions !== null,
    refreshing: todayState.refreshing
  });
  if (nextQuestionSnapshot !== questionSnapshot) setQuestionSnapshot(nextQuestionSnapshot);
  const suggestedPrompts = [
    ...(nextQuestionSnapshot.questions ?? todaySummaryQuestions(null, locale.language)),
    { kind: "discussion", label: locale.t("ai.discussionPrompt") },
    { kind: "plan", label: locale.t("ai.planPrompt") },
  ];
  const todayError =
    todayState.kind === "offline"
      ? locale.t("sync.notOnDevice")
      : todayState.kind === "failure"
      ? todayState.error.message
      : todayOverdue
        ? locale.t("todayActions.timedOut")
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
      setHistoryOpen(true);
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

  function sendMessage(messageOverride?: string) {
    if (!owns() || navigationLock.current || !auth.actorId) return;
    const message = (messageOverride ?? draftMessage).trim();

    if (!message) {
      setSendError(locale.t("ai.enterQuestion"));
      return;
    }
    if (aiOffline) {
      setSendError(locale.t("sync.needsNetwork"));
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
      actorId: auth.actorId,
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
    if (aiOffline) {
      setOrganizationBusy(true);
      setOrganizationError(null);
      try {
        await localSessions.enqueueOfflineMutation(buildOfflineAiSessionMutation({
          mutationId: randomUUID(), sessionId: item.id, expectedRevision: item.organizationRevision,
          patch, createdAt: new Date().toISOString(),
        }));
      } catch {
        if (owns()) setOrganizationError(iorbitR21Copy[locale.language].syncConflict);
      } finally {
        if (owns()) setOrganizationBusy(false);
      }
      return;
    }
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
      if (localSessions.available) void localSessions.refresh();
    } else {
      setOrganizationError(result.code === "PIN_LIMIT" ? iorbitR21Copy[locale.language].pinLimit : result.error);
      if (result.code === "PIN_LIMIT" || result.code === "CONFLICT") {
        setHistoryAttempt(value => value + 1);
        if (localSessions.available) void localSessions.refresh();
      }
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
    if (aiOffline) {
      setDeletingHistoryId(item.id);
      setHistoryDeleteError(null);
      try {
        const mutation = buildOfflineAiSessionDelete({ mutationId: randomUUID(), sessionId: item.id,
          expectedRevision: item.organizationRevision, createdAt: new Date().toISOString() });
        await localSessions.enqueueOfflineMutation(mutation);
        if (!owns()) return;
        setPendingUndo({ id: item.id, mutationId: mutation.mutationId, until: mutation.nextRetryAt! });
        setConfirmDelete(null);
        toast.success(iorbitR21Copy[locale.language].deleted, { undo: () => { void cancelOfflineDeletion(item.id, mutation.mutationId); } });
      } catch {
        if (owns()) setHistoryDeleteError(iorbitR21Copy[locale.language].syncConflict);
      } finally {
        if (owns()) setDeletingHistoryId(null);
      }
      return;
    }
    const operation = new AbortController();
    deleteOperation.current = operation;

    setDeletingHistoryId(item.id);
    setHistoryDeleteError(null);

    const result = await deleteAiSession(client, item.id, operation.signal);
    if (!owns() || operation.signal.aborted || deleteOperation.current !== operation) return;
    if (result.ok) {
      setDeletedIds(ids => [...ids, item.id]);
      if (result.value.undoToken && result.value.undoUntil && Date.parse(result.value.undoUntil) > Date.now()) {
        const token = result.value.undoToken;
        setPendingUndo({ id: item.id, token, until: result.value.undoUntil });
        toast.success(iorbitR21Copy[locale.language].deleted, { undo: () => { void restoreDeletion(item.id, token); } });
      } else {
        setPendingUndo(null);
        toast.success(iorbitR21Copy[locale.language].deleted);
      }
      setConfirmDelete(null);
      setHistoryAttempt(value => value + 1);
      if (localSessions.available) void localSessions.refresh();
    } else {
      setHistoryDeleteError(locale.t("ai.deleteUnconfirmed"));
    }
    deleteOperation.current = null;
    setDeletingHistoryId(null);
  }

  async function restoreDeletion(id: string, token: string) {
    if (!owns()) return;
    setPendingUndo(null);
    const restored = await restoreAiSession(client, id, token);
    if (restored.ok) {
      setDeletedIds(ids => ids.filter(deletedId => deletedId !== id));
      setHistoryAttempt(value => value + 1);
      if (localSessions.available) void localSessions.refresh();
    } else {
      setHistoryDeleteError(iorbitR21Copy[locale.language].undoFailed);
    }
  }

  async function cancelOfflineDeletion(id: string, mutationId: string) {
    if (!owns()) return;
    try {
      const cancelled = await localSessions.cancelOfflineDelete(mutationId);
      if (!owns()) return;
      setPendingUndo(null);
      if (!cancelled) setHistoryDeleteError(iorbitR21Copy[locale.language].undoFailed);
    } catch {
      if (owns()) setHistoryDeleteError(iorbitR21Copy[locale.language].undoFailed);
    }
  }

  async function undoDelete() {
    if (!pendingUndo) return;
    if ("mutationId" in pendingUndo) await cancelOfflineDeletion(pendingUndo.id, pendingUndo.mutationId);
    else await restoreDeletion(pendingUndo.id, pendingUndo.token);
  }

  return (
    <IOrbitStartView
      contactCount={contactSummary.kind === "success" || contactSummary.kind === "empty" ? contactSummary.data.total : -1}
      confirmDelete={confirmDelete}
      deleting={deletingHistoryId !== null}
      draft={draftMessage}
      error={sendError ?? historyDeleteError ?? organizationError ?? (failedAiWrite ? failedAiWrite.lastErrorCode === "PIN_LIMIT" ? iorbitR21Copy[locale.language].pinLimit : iorbitR21Copy[locale.language].syncConflict : null) ?? activeHistoryPageError ?? (serverSearchActive && serverSearchState.kind === "failure" ? serverSearchState.error.message : null)}
      history={historyItems}
      hasPendingWrites={pendingAiWrites}
      historyHasMore={historyHasMore && historyQuerySettled}
      historyLoading={historyKind === "loading" || historyPaging || (serverSearchActive && serverSearchState.kind === "loading")}
      historyNotice={historyNotices.find((notice) => notice.onRetry) ?? null}
      historyOpen={historyOpen}
      historyQuery={historyQuery}
      offline={aiOffline}
      offlineAt={localSessions.freshness.lastSyncedAt}
      onCancelDelete={() => { if (!deleteOperation.current) setConfirmDelete(null); }}
      onClose={() => { if (router.canGoBack()) router.back(); else router.replace("/home" as Href); }}
      onConfirmDelete={() => { if (confirmDelete) void deleteHistoryItem(confirmDelete); }}
      onDelete={item => { if (owns()) { setHistoryDeleteError(null); setConfirmDelete(item); } }}
      onDiscardFailedWrite={failedAiWrite ? () => { void localSessions.discardFailedMutation(failedAiWrite.mutationId).then(discarded => {
        if (owns() && discarded) { setOrganizationError(null); setHistoryDeleteError(null); void localSessions.refresh(); }
      }).catch(() => { if (owns()) setOrganizationError(iorbitR21Copy[locale.language].syncConflict); }); } : undefined}
      onDraftChange={value => { if (owns()) { navigationLock.current = false; setDraftMessage(value); } }}
      onHistoryClose={() => setHistoryOpen(false)}
      onHistoryOpen={() => setHistoryOpen(true)}
      onHistoryQueryChange={setHistoryQuery}
      onLoadMore={() => { void loadMoreHistory(); }}
      onNew={() => startNewChat()}
      onNewGoal={() => router.push(planNewGoalHref("app") as Href)}
      onOpen={openHistoryItem}
      onOpenIntake={intake => router.push(planFlowHref("app", intake.intakeId) as Href)}
      onOpenGoal={(goal, destination) => router.push((destination === "done" ? planDoneHref("app", goal.planId) : destination === "review" ? planReviewHref("app", goal.planId) : planOverviewHref("app", goal.planId)) as Href)}
      onPin={item => { void mutateOrganization(item, { pinned: !item.pinned }); }}
      onRename={(item, title) => { void mutateOrganization(item, { customTitle: title }); }}
      onScan={() => openCapability("/contacts/new/scan" as Href)}
      onSend={sendMessage}
      onUndo={() => { void undoDelete(); }}
      planIntakes={planIntakes.kind === "success" || planIntakes.kind === "empty" ? planIntakes.data.intakes : []}
      planGoals={planSummary.kind === "success" || planSummary.kind === "empty" ? planSummary.data.goals.filter(goal => !goal.sample) : []}
      suggestions={suggestedPrompts.slice(0, 4).map((item, index) => ({ key: String(item.kind), label: item.label, emoji: ["👥", "🎟️", "🎯", "✦"][index] ?? "✦" }))}
      undoAvailable={pendingUndo !== null}
    />
  );
}
