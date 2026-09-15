import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { type Href, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { NotificationDeliveryContract } from "../../api/contract/notifications";
import type { ApiResult } from "../../api/types";
import {
  ORBIT_API_ENDPOINTS,
  agentSignalPath,
  chatPrivacyControlsPath,
  notificationDeliveryPath,
  relationshipCommunicationConversationPath,
  relationshipCommunicationConversationsPath,
  relationshipCommunicationReadPath
} from "../../api/endpoints";
import {
  MESSAGE_STATE_FOREGROUND_REFRESH_MS,
  emitMessageStateInvalidation,
  relationshipConversationContactId,
  relationshipConversationListToInbox,
  relationshipConversationToThread,
  relationshipReadReceiptMatches,
  relationshipReadTarget,
  subscribeMessageStateInvalidation,
} from "../../api/message-state";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import type { ApiResourceState } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { resultToRouteState, type RouteState } from "../../view-models/route-state";
import { inboxNotificationActions, inboxNotificationReceiptMatches, inboxNotificationsReadable } from "../../view-models/inbox-notification-actions";
import {
  filterInboxFeed,
  inboxFeedFromSources,
  type InboxFeedFilter,
  type InboxFeedItem,
  type InboxFeedView,
} from "../../view-models/inbox-feed";
import { runInboxReadBatch } from "../../view-models/inbox-read-batch";
import {
  buildRelationshipSignalConfirmRequest,
  buildRelationshipPrivacyToggleRequest,
  buildRelationshipThreadDraftRequest,
  createdRelationshipThreadToView,
  relationshipConversationIdForContact,
  relationshipAlertsToView,
  relationshipInboxErrorText,
  relationshipPrivacyControlsToView,
  relationshipSignalConfirmToView,
  relationshipSignalsToView,
  type RelationshipAlertsView,
  type RelationshipCreatedThreadView,
  type RelationshipConversationView,
  type RelationshipPrivacyControlsView,
  type RelationshipSignalConfirmView,
  type RelationshipSignalsView,
  type RelationshipThreadDetailView
} from "../../view-models/relationship-inbox";
import { inboxPolishTemplate, registerAiTemplatePrefill } from "../../data/ai-template-prefill";
import {
  appPerformanceInput,
  appPerformanceScenarioForPath,
  isAppPerformanceEnabled,
  markAppPerformance,
  measureAppPerformance,
} from "../../performance/app-performance";

type InboxSection = "alerts" | "threads";
type ClientGet = (endpoint: string, options?: { signal?: AbortSignal }) => Promise<ApiResult<unknown>>;
type ClientPost = (endpoint: string, body: unknown) => Promise<ApiResult<unknown>>;
type ClientPatch = (endpoint: string, body: unknown, options?: { signal?: AbortSignal }) => Promise<{
  data?: unknown;
  error?: { message: string };
  success: boolean;
  status?: number;
}>;

function useInboxIdentity(routeKey: string) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  // Opaque keys isolate reads and local drafts without storing credentials.
  const scopeKey = useMemo(() => randomUUID(), [actorId, auth.cookieHeader, server.baseUrl, ready, routeKey]);
  return { actorId, ready, scopeKey };
}

function useInboxRequests(scopeKey: string) {
  const locale = useOrbitLocale();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [resumeIndex, setResumeIndex] = useState(0);
  const nativeActive = useRef(foreground);
  const scope = useMemo(() => ({ key: randomUUID(), ready: focused && foreground, controller: new AbortController() }),
    [scopeKey, focused, foreground, resumeIndex]);
  const latest = useRef(scope);
  latest.current = scope;
  const client = useOrbitApiClient({ scopeKey: scope.key });
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      const active = state === "active";
      // Revoke before React commits so a late 401 cannot expire this session.
      if (!active) latest.current.controller.abort();
      if (active && !nativeActive.current) setResumeIndex(value => value + 1);
      nativeActive.current = active;
      setForeground(active);
    });
    return () => {
      listener.remove();
      latest.current.controller.abort();
    };
  }, []);
  useEffect(() => {
    // React may replay mount effects; that setup needs a new live controller.
    if (scope.controller.signal.aborted) scope.controller = new AbortController();
    return () => scope.controller.abort();
  }, [scope]);
  const isCurrent = useCallback(() => latest.current === scope && scope.ready && !scope.controller.signal.aborted, [scope]);
  const request = useCallback(async (method: "get" | "post" | "patch", endpoint: string, body?: unknown, signal?: AbortSignal): ReturnType<ClientGet> => {
    const inactive: ApiResult<unknown> = { success: false, status: 0, meta: { featureMode: null, privacy: null, runtimeBoundary: null }, error: { code: "ORBIT_APP_INACTIVE_REQUEST", message: locale.t("inbox.requestInactive") } };
    if (!isCurrent() || signal?.aborted) return inactive;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    scope.controller.signal.addEventListener("abort", abort, { once: true });
    try {
      const performanceScenario = method === "get" && isAppPerformanceEnabled()
        ? appPerformanceScenarioForPath(endpoint)
        : null;
      const execute = () => client[method]<unknown>(endpoint, { body, signal: controller.signal });
      const result = performanceScenario
        ? await measureAppPerformance(
            appPerformanceInput("app.resource", performanceScenario),
            execute,
          )
        : await execute();
      return isCurrent() && !controller.signal.aborted ? result : inactive;
    } finally {
      signal?.removeEventListener("abort", abort);
      scope.controller.signal.removeEventListener("abort", abort);
    }
  }, [client, isCurrent, scope]);
  const clientGet = useCallback((endpoint: string, options?: { signal?: AbortSignal }) => request("get", endpoint, undefined, options?.signal), [request]);
  const clientPost = useCallback((endpoint: string, body: unknown) => request("post", endpoint, body), [request]);
  const clientPatch = useCallback((endpoint: string, body: unknown, options?: { signal?: AbortSignal }) => request("patch", endpoint, body, options?.signal), [request]);
  return { clientGet, clientPost, clientPatch, isCurrent };
}

// Inbox permissions/content must be confirmed by this foreground lifetime.
// Keep ordinary refresh behavior without changing other screens' cache policy.
interface InboxResourceOptions {
  clearOnRefresh?: boolean;
  isValid?: (data: unknown) => boolean;
  refreshIntervalMs?: number;
}

function useInboxResource(path: string, isEmpty: (data: unknown) => boolean,
  clientGet: ClientGet, isCurrent: () => boolean, options: InboxResourceOptions = {}): ApiResourceState<unknown> {
  const locale = useOrbitLocale();
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const emptyRef = useRef(isEmpty);
  emptyRef.current = isEmpty;
  const validRef = useRef(options.isValid);
  validRef.current = options.isValid;
  const [snapshot, setSnapshot] = useState<{ clientGet: ClientGet; state: RouteState<unknown>; refreshing: boolean } | null>(null);
  const refresh = useCallback(() => {
    if (!isCurrent()) return;
    pending.current?.abort();
    setSnapshot(previous => ({ clientGet, state: !options.clearOnRefresh && previous?.clientGet === clientGet ? previous.state : { kind: "loading" }, refreshing: true }));
    setAttempt(value => value + 1);
  }, [clientGet, isCurrent, options.clearOnRefresh]);
  useEffect(() => {
    if (!isCurrent()) return;
    const controller = new AbortController();
    pending.current = controller;
    void clientGet(path, { signal: controller.signal }).then(received => {
      if (!isCurrent() || controller.signal.aborted) return;
      const result = received.success && (received.status < 200 || received.status >= 300)
        ? { ...received, success: false as const, error: { code: "ORBIT_APP_UNEXPECTED_STATUS", message: locale.t("inbox.requestFailed") } }
        : received.success && validRef.current && !validRef.current(received.data)
          ? { ...received, success: false as const, error: { code: "ORBIT_APP_INVALID_MESSAGE_STATE", message: locale.t("inbox.invalidMessageState") } }
          : received;
      setSnapshot({ clientGet, state: resultToRouteState(result, emptyRef.current), refreshing: false });
    }).catch(() => {
      if (!isCurrent() || controller.signal.aborted) return;
      setSnapshot({ clientGet, state: { kind: "failure", status: 0, meta: { featureMode: null, privacy: null, runtimeBoundary: null }, error: { code: "ORBIT_APP_UNEXPECTED_ERROR", message: locale.t("inbox.requestFailed") } }, refreshing: false });
    });
    return () => controller.abort();
  }, [attempt, clientGet, isCurrent, path]);
  useEffect(() => {
    if (!options.refreshIntervalMs || !isCurrent()) return;
    const timer = setInterval(refresh, options.refreshIntervalMs);
    return () => clearInterval(timer);
  }, [isCurrent, options.refreshIntervalMs, refresh]);
  return { ...(isCurrent() && snapshot?.clientGet === clientGet ? snapshot.state : { kind: "loading" as const }), refresh,
    refreshing: isCurrent() && snapshot?.clientGet === clientGet ? snapshot.refreshing : false };
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

interface DeliveryView {
  body: string;
  signalId: string;
  status: string;
  targetKind: string;
  title: string;
}

function notificationDeliveryToView(value: unknown, deliveryId: string, fallbackTitle: string, fallbackBody: string): DeliveryView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<NotificationDeliveryContract>;
  if (record.deliveryId !== deliveryId || record.data?.deliveryId !== deliveryId
    || record.target?.deliveryId !== deliveryId || record.target?.kind !== "inbox") return null;
  const title = typeof record.title === "string" ? record.title : fallbackTitle;
  const body = typeof record.body === "string" ? record.body : fallbackBody;
  const rawSignalId = typeof record.signalId === "string" ? record.signalId : "";
  // Only AgentSignal ids support the PATCH lifecycle. Event-derived delivery
  // ids are intentionally inbox-only until a real task/action target exists.
  const signalId = rawSignalId.startsWith("signal:") ? rawSignalId : "";
  const status = typeof record.status === "string" ? record.status : "scheduled";
  const target =
    record.target && typeof record.target === "object" && !Array.isArray(record.target)
      ? (record.target as Record<string, unknown>)
      : null;
  return {
    body,
    signalId,
    status,
    targetKind: typeof target?.kind === "string" ? target.kind : "inbox",
    title
  };
}

function uniqueConversations(
  conversations: RelationshipConversationView[]
): RelationshipConversationView[] {
  const seen = new Set<string>();
  return conversations.filter((conversation) => {
    if (seen.has(conversation.id)) {
      return false;
    }
    seen.add(conversation.id);
    return true;
  });
}

export function RelationshipInboxScreen() {
  const locale = useOrbitLocale();
  const params = useLocalSearchParams<{
    contactId?: string | string[];
    deliveryId?: string | string[];
    organization?: string | string[];
    participantName?: string | string[];
  }>();
  const seedContactId = firstParam(params.contactId);
  const deliveryId = firstParam(params.deliveryId);
  const seedName = firstParam(params.participantName);
  const seedOrganization = firstParam(params.organization);
  const { actorId, ready, scopeKey } = useInboxIdentity(JSON.stringify([seedContactId, deliveryId, seedName, seedOrganization]));
  if (!ready) return <InboxLayout title={locale.t("inbox.title")}><LoadingState /></InboxLayout>;
  return <ScopedRelationshipInboxScreen key={scopeKey} actorId={actorId} scopeKey={scopeKey} seedContactId={seedContactId} deliveryId={deliveryId} seedName={seedName} seedOrganization={seedOrganization} />;
}

function ScopedRelationshipInboxScreen({ actorId, scopeKey, seedContactId, deliveryId, seedName, seedOrganization }: {
  actorId: string; scopeKey: string; seedContactId: string; deliveryId: string; seedName: string; seedOrganization: string;
}) {
  const renderStartedAt = isAppPerformanceEnabled()
    ? globalThis.performance.now()
    : 0;
  useEffect(() => {
    if (!isAppPerformanceEnabled()) return;
    markAppPerformance({
      ...appPerformanceInput("app.react_commit", "app.inbox"),
      durationMs: globalThis.performance.now() - renderStartedAt,
      failed: false,
    });
  });
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const router = useRouter();
  const { clientGet, clientPost, clientPatch, isCurrent } = useInboxRequests(scopeKey);
  const [deliveryAttempt, setDeliveryAttempt] = useState(0);
  const currentDelivery = useRef<DeliveryView | null>(null);
  const deliveryController = useRef<AbortController | null>(null);
  const getCurrentDelivery = useCallback(() => isCurrent() ? currentDelivery.current : null, [isCurrent]);
  const [deliveryState, setDeliveryState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "failure"; message: string }
    | { data: DeliveryView; kind: "success"; signal: AbortSignal }
  >({ kind: "idle" });
  const state = useInboxResource(
    relationshipCommunicationConversationsPath(),
    (data) => relationshipConversationListToInbox(data, actorId)?.conversations.length === 0,
    clientGet, isCurrent, {
      isValid: (data) => relationshipConversationListToInbox(data, actorId) !== null,
      refreshIntervalMs: MESSAGE_STATE_FOREGROUND_REFRESH_MS,
    }
  );
  const notificationsState = useInboxResource(
    ORBIT_API_ENDPOINTS.notifications,
    (data) => relationshipAlertsToView(data, undefined, locale.language).alerts.length === 0,
    clientGet, isCurrent, { clearOnRefresh: true }
  );
  const notificationsData = notificationsState.kind === "success" || notificationsState.kind === "empty"
    ? notificationsState.data : null;
  const notificationsReadable = inboxNotificationsReadable(notificationsData);
  const currentNotifications = useRef<unknown>(null);
  currentNotifications.current = notificationsReadable ? notificationsData : null;
  const getCurrentNotifications = useCallback(() => isCurrent() ? currentNotifications.current : null, [isCurrent]);
  function refreshNotifications() {
    if (!isCurrent()) return;
    currentNotifications.current = null;
    notificationsState.refresh();
  }
  const signalsState = useInboxResource(
    ORBIT_API_ENDPOINTS.relationshipSignalsEmailCalendar,
    (data) => relationshipSignalsToView(data, locale.language).signals.length === 0,
    clientGet, isCurrent
  );
  const conversationsData = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const signalsData = signalsState.kind === "success" || signalsState.kind === "empty" ? signalsState.data : null;
  const feed = useMemo(() => inboxFeedFromSources({
    actorId,
    conversationsData,
    language: locale.language,
    notificationsData,
    now: new Date().toISOString(),
    signalsData,
  }), [actorId, conversationsData, locale.language, notificationsData, signalsData]);
  const batchScope = useMemo(
    () => ({ actorId, conversationsData, notificationsData, signalsData }),
    [actorId, conversationsData, notificationsData, signalsData]
  );
  const currentBatchScope = useRef(batchScope);
  currentBatchScope.current = batchScope;
  const [batchPending, setBatchPending] = useState(false);
  const [batchError, setBatchError] = useState("");
  const confirmableUnread = feed.items.filter(item => !item.read && item.readAction).length;
  const [composing, setComposing] = useState(
    Boolean(!seedContactId && (seedName || seedOrganization))
  );
  const [createdThread, setCreatedThread] =
    useState<RelationshipCreatedThreadView | null>(null);
  const contentReady = state.kind === "success" || state.kind === "empty";
  const retainedContent = useRef<{ data: unknown } | null>(null);
  if (contentReady) retainedContent.current = { data: state.data };
  const currentContent = useRef(contentReady);
  currentContent.current = contentReady;
  const isContentCurrent = useCallback(() => isCurrent() && currentContent.current, [isCurrent, contentReady]);

  useEffect(() => subscribeMessageStateInvalidation(state.refresh), [state.refresh]);

  useEffect(() => {
    currentDelivery.current = null;
    if (!isCurrent()) {
      setDeliveryState({ kind: "idle" });
      return;
    }
    if (!deliveryId) {
      setDeliveryState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    deliveryController.current = controller;
    setDeliveryState({ kind: "loading" });
    void clientGet(notificationDeliveryPath(deliveryId), { signal: controller.signal }).then((result) => {
      if (!isCurrent() || controller.signal.aborted) return;
      if (!result.success || result.status === undefined || result.status < 200 || result.status >= 300) {
        setDeliveryState({
          kind: "failure",
          message: locale.t("inbox.alertUnreadable")
        });
        return;
      }
      const view = notificationDeliveryToView(result.data, deliveryId, locale.t("inbox.fallbackAlertTitle"), locale.t("inbox.fallbackAlertBody"));
      currentDelivery.current = view;
      setDeliveryState(
        view ? { data: view, kind: "success", signal: controller.signal } : {
          kind: "failure",
          message: locale.t("inbox.alertInvalid")
        }
      );
    }).catch(() => {
      if (isCurrent() && !controller.signal.aborted) {
        setDeliveryState({ kind: "failure", message: locale.t("inbox.alertUnreadable") });
      }
    });
    return () => {
      currentDelivery.current = null;
      controller.abort();
    };
  }, [clientGet, deliveryId, deliveryAttempt, isCurrent]);

  function refreshDelivery() {
    if (!isCurrent() || !deliveryId) return;
    currentDelivery.current = null;
    deliveryController.current?.abort();
    setDeliveryState({ kind: "loading" });
    setDeliveryAttempt(value => value + 1);
  }

  useEffect(() => {
    if (seedContactId) {
      setComposing(false);
      return;
    }

    if (seedName || seedOrganization) {
      setComposing(true);
    }
  }, [seedContactId, seedName, seedOrganization]);

  function refreshAll() {
    if (!isCurrent()) return;
    refreshDelivery();
    state.refresh();
    refreshNotifications();
    signalsState.refresh();
  }

  async function markAllRead() {
    if (!isCurrent() || batchPending || confirmableUnread === 0) return;
    const scope = batchScope;
    setBatchPending(true);
    setBatchError("");
    try {
      const result = await runInboxReadBatch({
        execute: action => clientPost(action.endpoint, action.body),
        isCurrent: () => isCurrent() && currentBatchScope.current === scope,
        items: feed.items,
      });
      if (result.stale || !isCurrent() || currentBatchScope.current !== scope) return;
      if (result.failedIds.length > 0) {
        setBatchError(locale.t("inbox.markAllReadFailed", { count: result.failedIds.length }));
      }
      emitMessageStateInvalidation();
      refreshNotifications();
      signalsState.refresh();
    } finally {
      if (isCurrent() && currentBatchScope.current === scope) setBatchPending(false);
    }
  }

  function openConversation(conversationId: string) {
    if (!isCurrent()) return;
    router.push(`/inbox/${encodeURIComponent(conversationId)}` as Href);
  }

  return (
    <InboxLayout
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            state.refreshing || deliveryState.kind === "loading" ||
            notificationsState.refreshing ||
            signalsState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title={locale.t(contentReady && composing ? "inbox.compose" : contentReady && createdThread ? "inbox.draftPreview" : "inbox.title")}
      onMarkAllRead={contentReady && !composing && !createdThread ? () => void markAllRead() : undefined}
      markAllReadDisabled={batchPending || confirmableUnread === 0}
      hideBack={contentReady && composing}
      onBack={createdThread ? () => setCreatedThread(null) : undefined}
    >
      {deliveryState.kind === "loading" ? (
        <LoadingState />
      ) : null}
      {deliveryState.kind === "failure" ? (
        <ErrorState message={deliveryState.message} title={locale.t("inbox.alertUnavailable")} />
      ) : null}
      {isCurrent() && deliveryState.kind === "success" ? (
        <NotificationDeliveryCard clientPatch={clientPatch} getCurrentDelivery={getCurrentDelivery} signal={deliveryState.signal} view={deliveryState.data} />
      ) : null}
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title={locale.t("inbox.serverUnavailable")} />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {retainedContent.current ? (
        <View style={!contentReady ? { display: "none" } : undefined}>
        <InboxContent
          clientGet={clientGet}
          clientPost={clientPost}
          isCurrent={isContentCurrent}
          contentReady={contentReady}
          actorId={actorId}
          getCurrentNotifications={getCurrentNotifications}
          createdThread={createdThread}
          data={retainedContent.current.data}
          feed={feed}
          batchError={batchError}
          notificationsData={notificationsData}
          notificationsError={
            notificationsState.kind === "failure" || notificationsState.kind === "offline"
              ? relationshipInboxErrorText(notificationsState.error.message, locale.t("inbox.alertsUnavailable"), locale.language)
              : (notificationsState.kind === "success" || notificationsState.kind === "empty") && !notificationsReadable
                ? locale.t("inbox.alertsInvalid") : ""
          }
          notificationsLoading={notificationsState.kind === "loading"}
          onRefreshNotifications={refreshNotifications}
          onOpenNotificationTarget={(href) => { if (isCurrent()) router.push(href as Href); }}
          onOpenConversation={openConversation}
          onSetCreatedThread={setCreatedThread}
          onRefreshSignals={signalsState.refresh}
          seed={{
            contactId: seedContactId,
            organization: seedOrganization,
            participantName: seedName
          }}
          signalsData={signalsData}
          signalsError={
            signalsState.kind === "failure" || signalsState.kind === "offline"
              ? relationshipInboxErrorText(
                  signalsState.error.message,
                  locale.t("inbox.signalsUnavailable"),
                  locale.language
                )
              : ""
          }
          signalsLoading={signalsState.kind === "loading"}
          setComposing={setComposing}
          composing={composing}
        />
        </View>
      ) : null}
    </InboxLayout>
  );
}

export function RelationshipInboxThreadScreen() {
  const locale = useOrbitLocale();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = firstParam(params.id);
  const { actorId, ready, scopeKey } = useInboxIdentity(conversationId);
  if (!ready) return <InboxLayout title={locale.t("inbox.messageTitle")}><LoadingState /></InboxLayout>;
  if (!conversationId) return <InboxLayout title={locale.t("inbox.messageTitle")}><ErrorState message={locale.t("inbox.missingConversation")} title={locale.t("inbox.conversationUnavailable")} /></InboxLayout>;
  return <ScopedRelationshipInboxThreadScreen key={scopeKey} actorId={actorId} conversationId={conversationId} scopeKey={scopeKey} />;
}

function ScopedRelationshipInboxThreadScreen({ actorId, conversationId, scopeKey }: { actorId: string; conversationId: string; scopeKey: string }) {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const { clientGet, clientPost, isCurrent } = useInboxRequests(scopeKey);
  const state = useInboxResource(
    relationshipCommunicationConversationPath(conversationId),
    (data) => relationshipConversationToThread(data, actorId)?.messages.length === 0,
    clientGet, isCurrent, {
      isValid: (data) => relationshipConversationToThread(data, actorId) !== null,
      refreshIntervalMs: MESSAGE_STATE_FOREGROUND_REFRESH_MS,
    }
  );
  const stateData = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const detail = stateData ? relationshipConversationToThread(stateData, actorId) : null;
  const retainedDetail = useRef<RelationshipThreadDetailView | null>(null);
  const retainedContactId = useRef("");
  if (detail) {
    retainedDetail.current = detail;
    retainedContactId.current = relationshipConversationContactId(stateData, actorId);
  }
  const contentReady = Boolean(detail);
  const currentContent = useRef(contentReady);
  currentContent.current = contentReady;
  const isContentCurrent = useCallback(() => isCurrent() && currentContent.current, [isCurrent, contentReady]);
  const readAttempt = useRef<{ data: unknown; key: string } | null>(null);
  const [readError, setReadError] = useState("");

  useEffect(() => subscribeMessageStateInvalidation(state.refresh), [state.refresh]);
  useEffect(() => {
    if (!stateData || !isContentCurrent()) return;
    const target = relationshipReadTarget(stateData, actorId);
    if (!target) {
      setReadError("");
      return;
    }
    const key = `${target.conversationId}\u001f${target.lastReadMessageId}`;
    const previousAttempt = readAttempt.current;
    if (previousAttempt?.data === stateData && previousAttempt.key === key) return;
    readAttempt.current = { data: stateData, key };
    setReadError("");
    void clientPost(relationshipCommunicationReadPath(target.conversationId), {
      lastReadMessageId: target.lastReadMessageId,
    }).then(result => {
      if (!isContentCurrent() || readAttempt.current?.data !== stateData) return;
      if (!result.success || result.status === undefined || result.status < 200 || result.status >= 300
        || !relationshipReadReceiptMatches(result.data, target)) {
        setReadError(locale.t("inbox.readUnconfirmed"));
        return;
      }
      setReadError("");
      emitMessageStateInvalidation();
    }).catch(() => {
      if (isContentCurrent() && readAttempt.current?.data === stateData) {
        setReadError(locale.t("inbox.readUnconfirmed"));
      }
    });
  }, [actorId, clientPost, isContentCurrent, stateData]);

  return (
    <InboxLayout
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title={locale.t("inbox.messageTitle")}
    >
      {!conversationId ? (
        <ErrorState message={locale.t("inbox.missingConversation")} title={locale.t("inbox.conversationUnavailable")} />
      ) : null}
      {conversationId && state.kind === "loading" ? <LoadingState /> : null}
      {conversationId && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title={locale.t("inbox.serverUnavailable")} />
      ) : null}
      {conversationId && state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {conversationId && readError ? <Text accessibilityRole="alert">{readError}</Text> : null}
      {conversationId && retainedDetail.current ? (
        <View style={!detail ? { display: "none" } : undefined}>
        <ThreadDetail
          clientGet={clientGet}
          clientPost={clientPost}
          contactId={retainedContactId.current}
          isCurrent={isContentCurrent}
          detail={retainedDetail.current}
        />
        </View>
      ) : null}
      {conversationId && state.kind === "empty" ? (
        <EmptyState
          message={locale.t("inbox.emptyMessagesBody")}
          title={locale.t("inbox.emptyMessagesTitle")}
        />
      ) : null}
    </InboxLayout>
  );
}

function InboxLayout({ children, title, refreshControl, onCompose, onMarkAllRead, markAllReadDisabled = false, onBack, hideBack = false }: PropsWithChildren<{
  title: string;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  onCompose?: (() => void) | undefined;
  onMarkAllRead?: (() => void) | undefined;
  markAllReadDisabled?: boolean;
  onBack?: (() => void) | undefined;
  hideBack?: boolean;
}>) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const canGoBack = router.canGoBack();
  return (
    <SafeAreaView edges={["top"]} style={styles.inboxSafeArea}>
      <View style={styles.mailToolbar}>
        <View style={styles.toolbarSide}>
          {!hideBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={locale.t(onMarkAllRead ? "inbox.home" : onBack || canGoBack ? "inbox.back" : "inbox.home")}
              onPress={onBack ?? (() => canGoBack
                ? router.back()
                : router.replace("/home" as Href))}
              style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.accent} name="chevron-back" size={18} />
              <Text style={styles.toolbarText}>{locale.t(onMarkAllRead ? "inbox.home" : onBack || canGoBack ? "inbox.back" : "inbox.home")}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityRole="header" style={styles.mailTitle}>
          {title}
        </Text>
        <View style={[styles.toolbarSide, styles.toolbarEnd]}>
          {onMarkAllRead ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={locale.t("inbox.markAllRead")}
              accessibilityState={{ disabled: markAllReadDisabled }}
              disabled={markAllReadDisabled}
              onPress={onMarkAllRead}
              style={({ pressed }) => [styles.toolbarButton, markAllReadDisabled && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.toolbarComposeText}>{locale.t("inbox.markAllRead")}</Text>
            </Pressable>
          ) : onCompose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={locale.t("inbox.compose")}
              onPress={onCompose}
              style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
            >
              <Text style={styles.toolbarComposeText}>{locale.t("inbox.compose")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.inboxCanvas}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        style={styles.inboxScroll}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function NotificationDeliveryCard({
  clientPatch,
  getCurrentDelivery,
  signal,
  view
}: {
  clientPatch: ClientPatch;
  getCurrentDelivery: () => DeliveryView | null;
  signal: AbortSignal;
  view: DeliveryView;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const actionLock = useRef(false);

  async function updateSignal(status: "acknowledged" | "dismissed" | "snoozed") {
    if (!view.signalId || actionLock.current || signal.aborted || getCurrentDelivery() !== view) return;
    actionLock.current = true;
    setPendingAction(status);
    setActionError("");
    setActionStatus("");
    const snoozedUntil = status === "snoozed" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined;
    try {
      const result = await clientPatch(agentSignalPath(view.signalId), {
        status, ...(snoozedUntil ? { snoozedUntil } : {})
      }, { signal });
      if (signal.aborted || getCurrentDelivery() !== view) return;
      const data = result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? result.data as Record<string, unknown> : null;
      const receipt = data?.signal && typeof data.signal === "object" && !Array.isArray(data.signal)
        ? data.signal as Record<string, unknown> : null;
      if (!result.success || result.status === undefined || result.status < 200 || result.status >= 300
        || receipt?.signalId !== view.signalId || receipt.status !== status
        || typeof receipt.lastObservedAt !== "string" || !Number.isFinite(Date.parse(receipt.lastObservedAt))
        || (snoozedUntil !== undefined && receipt.snoozedUntil !== snoozedUntil)) {
        setActionError(locale.t("inbox.signalUnconfirmed"));
        return;
      }
      setActionStatus(
        status === "acknowledged"
          ? locale.t("inbox.acknowledged")
          : status === "snoozed"
            ? locale.t("inbox.snoozed")
            : locale.t("inbox.ignored")
      );
    } catch {
      if (!signal.aborted && getCurrentDelivery() === view) setActionError(locale.t("inbox.signalUnconfirmed"));
    } finally {
      actionLock.current = false;
      if (!signal.aborted && getCurrentDelivery() === view) setPendingAction(null);
    }
  }

  return (
    <DataCard
      detail={locale.t("inbox.deliveryDetail")}
      title={view.title}
    >
      <Text style={styles.bodyText}>{view.body}</Text>
      <Text style={styles.safetyText}>
        {view.targetKind === "inbox"
          ? locale.t("inbox.proactiveSafety")
          : locale.t("inbox.targetedSafety")}
      </Text>
      {view.signalId ? (
        <View style={styles.buttonRow}>
          <ActionButton
            disabled={pendingAction !== null}
            icon="eye-outline"
            label={locale.t(pendingAction === "acknowledged" ? "aiConversation.processing" : "inbox.viewSuggestion")}
            onPress={() => void updateSignal("acknowledged")}
            variant="secondary"
          />
          <ActionButton
            disabled={pendingAction !== null}
            icon="time-outline"
            label={locale.t(pendingAction === "snoozed" ? "aiConversation.processing" : "inbox.later")}
            onPress={() => void updateSignal("snoozed")}
            variant="secondary"
          />
          <ActionButton
            disabled={pendingAction !== null}
            icon="close-outline"
            label={locale.t(pendingAction === "dismissed" ? "aiConversation.processing" : "inbox.ignore")}
            onPress={() => void updateSignal("dismissed")}
            variant="secondary"
          />
        </View>
      ) : null}
      {actionStatus ? <Text style={styles.safetyText}>{actionStatus}</Text> : null}
      {actionError ? <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text> : null}
    </DataCard>
  );
}

function InboxContent({
  actorId,
  batchError,
  clientGet,
  clientPost,
  isCurrent,
  contentReady,
  getCurrentNotifications,
  composing,
  createdThread,
  data,
  feed,
  notificationsData,
  notificationsError,
  notificationsLoading,
  onOpenConversation,
  onOpenNotificationTarget,
  onSetCreatedThread,
  onRefreshNotifications,
  onRefreshSignals,
  seed,
  signalsData,
  signalsError,
  signalsLoading,
  setComposing
}: {
  actorId: string;
  batchError: string;
  clientGet: ClientGet;
  clientPost: ClientPost;
  isCurrent: () => boolean;
  contentReady: boolean;
  getCurrentNotifications: () => unknown;
  composing: boolean;
  createdThread: RelationshipCreatedThreadView | null;
  data: unknown;
  feed: InboxFeedView;
  notificationsData: unknown;
  notificationsError: string;
  notificationsLoading: boolean;
  onOpenConversation: (conversationId: string) => void;
  onOpenNotificationTarget: (href: string) => void;
  onSetCreatedThread: (thread: RelationshipCreatedThreadView | null) => void;
  onRefreshNotifications: () => void;
  onRefreshSignals: () => void;
  seed: { contactId: string; organization: string; participantName: string };
  signalsData: unknown;
  signalsError: string;
  signalsLoading: boolean;
  setComposing: (value: boolean) => void;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const view = relationshipConversationListToInbox(data, actorId) ?? {
    conversations: [], selected: null, summary: locale.t("inbox.noMessages"), title: locale.t("inbox.title")
  };
  const signalsView = relationshipSignalsToView(signalsData, locale.language);
  const [activeFilter, setActiveFilter] = useState<InboxFeedFilter>("all");
  const [reviewSignals, setReviewSignals] = useState(false);
  const [seedHandled, setSeedHandled] = useState(false);
  const [notificationPending, setNotificationPending] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState("");
  const notificationLock = useRef(false);
  const alertsActive = useRef(false);
  alertsActive.current = !composing && !createdThread;
  useEffect(() => () => { alertsActive.current = false; }, []);
  useEffect(() => { notificationLock.current = false; setNotificationPending(null); setNotificationError(""); }, [isCurrent]);


  async function actOnAlert(id: string, state: "read" | "ignored") {
    if (!isCurrent() || notificationLock.current || !alertsActive.current) return;
    const source = getCurrentNotifications();
    if (!source) return;
    const action = inboxNotificationActions(source).get(id);
    setNotificationError("");
    if (!action || action.ignored) {
      setNotificationError(locale.t("inbox.notificationChanged"));
      return;
    }
    if (state === "read" && !action.href) {
      setNotificationError(locale.t("inbox.targetUnsupported"));
      return;
    }
    if (!action.canPersist && state === "ignored") return;
    if (state === "read" && (!action.canPersist || action.read)) {
      onOpenNotificationTarget(action.href!);
      return;
    }
    notificationLock.current = true;
    setNotificationPending(id);
    try {
      const result = await clientPost(`/api/notifications/${encodeURIComponent(id)}/state`, { state });
      if (!isCurrent() || !alertsActive.current || getCurrentNotifications() !== source) return;
      if (!result.success || result.status === undefined || result.status < 200 || result.status >= 300
        || !inboxNotificationReceiptMatches(result.data, id, state)) {
        setNotificationError(locale.t("inbox.stateUnconfirmed"));
        return;
      }
      emitMessageStateInvalidation();
      onRefreshNotifications();
      if (state === "read") onOpenNotificationTarget(action.href!);
    } catch {
      if (isCurrent() && alertsActive.current && getCurrentNotifications() === source) setNotificationError(locale.t("inbox.stateUnconfirmed"));
    } finally {
      if (isCurrent()) { notificationLock.current = false; setNotificationPending(null); }
    }
  }
  const seededConversationId = relationshipConversationIdForContact(
    view,
    seed.contactId
  );

  useEffect(() => {
    if (!seed.contactId || seedHandled) {
      return;
    }

    setSeedHandled(true);

    if (seededConversationId) {
      onOpenConversation(seededConversationId);
      setComposing(false);
      return;
    }

    setComposing(true);
  }, [
    onOpenConversation,
    seed.contactId,
    seedHandled,
    seededConversationId,
    setComposing
  ]);

  useEffect(() => {
    if (composing) {
      setActiveFilter("all");
      setReviewSignals(false);
    }
  }, [composing]);

  if (composing || createdThread) {
    return (
      <NewThreadComposer
        clientPost={clientPost}
        clientGet={clientGet}
        isCurrent={isCurrent}
        preview={createdThread}
        onEdit={() => {
          onSetCreatedThread(null);
          setComposing(true);
        }}
        onCancel={() => setComposing(false)}
        onCreated={(thread) => {
          onSetCreatedThread(thread);
          setComposing(false);
        }}
        seed={seed}
      />
    );
  }

  if (!contentReady) return null;

  const visibleFeed = filterInboxFeed(feed, activeFilter);

  function openFeedItem(item: InboxFeedItem) {
    if (item.id.startsWith("conversation:")) {
      onOpenConversation(item.id.slice("conversation:".length));
      return;
    }
    if (item.id.startsWith("notification:") && item.targetHref) {
      void actOnAlert(item.id.slice("notification:".length), "read");
      return;
    }
    if (item.targetHref) {
      onOpenNotificationTarget(item.targetHref);
      return;
    }
    if (item.id.startsWith("signal:")) setReviewSignals(true);
  }

  return (
    <View style={styles.mailContent}>
      <UnifiedInboxTabs
        activeFilter={activeFilter}
        onChange={filter => {
          setActiveFilter(filter);
          setReviewSignals(false);
        }}
        unreadCount={feed.unreadCount}
      />
      {batchError ? <Text accessibilityRole="alert" style={styles.unifiedError}>{batchError}</Text> : null}
      {notificationError ? <Text accessibilityRole="alert" style={styles.unifiedError}>{notificationError}</Text> : null}
      {notificationsLoading ? <Text style={styles.resourceStatus}>{locale.t("inbox.reminderLoading")}</Text> : null}
      {notificationsError ? (
        <View style={styles.unifiedSourceError}>
          <Text accessibilityRole="alert" style={styles.errorText}>{notificationsError}</Text>
          <ActionButton icon="refresh-outline" label={locale.t("inbox.retryAlerts")} onPress={onRefreshNotifications} variant="secondary" />
        </View>
      ) : null}
      {signalsLoading ? <Text style={styles.resourceStatus}>{locale.t("inbox.signalsLoading")}</Text> : null}
      {signalsError ? <Text accessibilityRole="alert" style={styles.unifiedError}>{signalsError}</Text> : null}
      <UnifiedFeedList
        disabled={notificationPending !== null}
        items={visibleFeed.items}
        onOpen={openFeedItem}
      />
      {reviewSignals && activeFilter === "contact" ? (
        <RelationshipSignalsCard
          clientPost={clientPost}
          isCurrent={isCurrent}
          error={signalsError}
          loading={signalsLoading}
          onConfirmed={onRefreshSignals}
          view={signalsView}
        />
      ) : null}
      {visibleFeed.items.length === 0 && !notificationsLoading && !signalsLoading ? (
        <EmptyState message={locale.t("inbox.messagesHint")} title={locale.t("inbox.noMessages")} />
      ) : null}
      {feed.coverageConfirmed && visibleFeed.items.length > 0 ? (
        <Text style={styles.feedCoverage}>{locale.t("inbox.recentThirtyDays")}</Text>
      ) : null}
    </View>
  );
}

function RelationshipSignalsCard({
  clientPost,
  isCurrent,
  error,
  loading,
  onConfirmed,
  view
}: {
  clientPost: ClientPost;
  isCurrent: () => boolean;
  error: string;
  loading: boolean;
  onConfirmed: () => void;
  view: RelationshipSignalsView;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const [pendingSignalId, setPendingSignalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<RelationshipSignalConfirmView | null>(null);
  useEffect(() => { setPendingSignalId(null); setActionError(null); setConfirmation(null); }, [isCurrent]);

  async function onConfirmSignal(id: string) {
    if (!isCurrent()) return;
    const request = buildRelationshipSignalConfirmRequest(id, locale.language);

    if (!request.success) {
      setActionError(request.error);
      return;
    }

    setPendingSignalId(id);
    setActionError(null);

    try {
      const result = await clientPost(request.request.endpoint, request.request.body);
      if (!isCurrent()) return;

      if (!result.success) {
        setActionError(
          relationshipInboxErrorText(
            result.error?.message,
            locale.t("inbox.signalConfirmFailed"),
            locale.language
          )
        );
        return;
      }

      setConfirmation(relationshipSignalConfirmToView(result.data, locale.language));
      onConfirmed();
    } catch (requestError) {
      if (!isCurrent()) return;
      setActionError(
        relationshipInboxErrorText(requestError, locale.t("inbox.signalConfirmFailed"), locale.language)
      );
    } finally {
      if (isCurrent()) setPendingSignalId(null);
    }
  }

  return (
    <DataCard detail={loading || error ? "" : view.summary} title={locale.t("inbox.signalsTitle")}>
      {loading ? <Text style={styles.threadPreview}>{locale.t("inbox.signalsLoading")}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      {confirmation ? (
        <View style={styles.stagedBox}>
          <Text style={styles.stagedTitle}>{confirmation.title}</Text>
          <Text style={styles.bodyText}>{confirmation.contactLine}</Text>
          <Text style={styles.threadPreview}>
            {confirmation.detail} · {confirmation.confirmedAt}
          </Text>
          <Text style={styles.safetyText}>{confirmation.safetyText}</Text>
        </View>
      ) : null}
      {view.signals.length > 0 ? (
        <View style={styles.listStack}>
          {view.signals.map((signal) => (
            <View key={signal.id} style={styles.alertRow}>
              <View style={[styles.alertRowTop, fontScale > 1.3 && styles.alertRowTopLarge]}>
                <Text style={styles.alertTitle}>
                  {signal.title}
                </Text>
                <Text style={[styles.alertTime, fontScale > 1.3 && styles.alertTimeLarge]}>{signal.occurredAt}</Text>
              </View>
              <Text style={styles.alertDetail}>
                {signal.metaLine}
              </Text>
              <Text style={styles.threadPreview}>
                {signal.context}
              </Text>
              <Text style={styles.threadPreview}>
                {signal.evidenceExcerpt}
              </Text>
              <View style={styles.tagsRow}>
                <Text style={styles.sourceTag}>{signal.sourceLabel}</Text>
                <Text style={styles.unreadTag}>{signal.confidenceLabel}</Text>
                <Text style={styles.proactiveTag}>{signal.statusLabel}</Text>
                <Text style={styles.sourceTag}>{signal.permissionLabel}</Text>
              </View>
              <Text style={styles.safetyText}>{signal.nextAction}</Text>
              {signal.canConfirm ? (
                <ActionButton
                  disabled={pendingSignalId !== null}
                  icon="checkmark-outline"
                  label={locale.t("inbox.confirmSignal")}
                  onPress={() => onConfirmSignal(signal.id)}
                  variant="secondary"
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : !loading && !error ? (
        <View style={styles.emptyInboxSection}>
          <Ionicons color={colors.text3} name="trail-sign-outline" size={22} />
          <Text style={styles.emptyInboxTitle}>{locale.t("inbox.noSignals")}</Text>
          <Text style={styles.threadPreview}>{view.emptyText}</Text>
        </View>
      ) : null}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function UnifiedInboxTabs({
  activeFilter,
  onChange,
  unreadCount,
}: {
  activeFilter: InboxFeedFilter;
  onChange: (filter: InboxFeedFilter) => void;
  unreadCount: number;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const tabs: ReadonlyArray<{ filter: InboxFeedFilter; label: string }> = [
    { filter: "all", label: locale.t("inbox.all") },
    { filter: "activity", label: locale.t("inbox.activity") },
    { filter: "task", label: locale.t("inbox.tasks") },
    { filter: "contact", label: locale.t("inbox.contacts") },
  ];
  return (
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.feedTabsContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.feedTabs}
    >
      {tabs.map(tab => {
        const active = activeFilter === tab.filter;
        const count = tab.filter === "all" ? unreadCount : 0;
        const accessibleLabel = count ? `${tab.label} ${count}` : tab.label;
        return (
          <Pressable
            accessibilityLabel={accessibleLabel}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.filter}
            onPress={() => onChange(tab.filter)}
            style={({ pressed }) => [
              styles.feedTab,
              active && styles.feedTabActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.feedTabText, active && styles.feedTabTextActive]}>{tab.label}{count > 0 ? " " : ""}</Text>
            {count > 0 ? <Text style={styles.feedTabCount}>{count}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function feedCategoryLabel(category: InboxFeedItem["category"], t: ReturnType<typeof useOrbitLocale>["t"]): string {
  const keys = {
    activity: "inbox.sourceActivity",
    assistant: "inbox.sourceAssistant",
    contact: "inbox.sourceContact",
    task: "inbox.sourceTask",
  } as const;
  return t(keys[category]);
}

function feedTimeLabel(value: string, language: ReturnType<typeof useOrbitLocale>["language"], yesterday: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const current = new Date();
  const sameDay = date.getFullYear() === current.getFullYear()
    && date.getMonth() === current.getMonth() && date.getDate() === current.getDate();
  if (sameDay) return date.toLocaleTimeString(language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const previous = new Date(current);
  previous.setDate(current.getDate() - 1);
  if (date.getFullYear() === previous.getFullYear()
    && date.getMonth() === previous.getMonth() && date.getDate() === previous.getDate()) return yesterday;
  return date.toLocaleDateString(language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN", {
    day: "numeric",
    month: "short",
  });
}

function UnifiedFeedList({
  disabled,
  items,
  onOpen,
}: {
  disabled: boolean;
  items: readonly InboxFeedItem[];
  onOpen: (item: InboxFeedItem) => void;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const [visibleCount, setVisibleCount] = useState(12);
  const visibleItems = items.slice(0, visibleCount);
  const showMoreLabel = locale.language === "zh"
    ? "显示更多"
    : locale.language === "ja"
      ? "さらに表示"
      : "Show more";
  return (
    <View style={styles.feedList}>
      {visibleItems.map(item => {
        const category = feedCategoryLabel(item.category, locale.t);
        const subtitle = item.subtitle && item.subtitle !== category ? `${category} · ${item.subtitle}` : category;
        const time = feedTimeLabel(item.occurredAt, locale.language, locale.t("inbox.yesterday"));
        const state = locale.t(item.read ? "inbox.readState" : "inbox.unreadState");
        const interactive = Boolean(item.targetHref || item.id.startsWith("conversation:") || item.id.startsWith("signal:"));
        const content = (
          <>
            <View style={styles.feedUnreadGutter}>
              {!item.read ? <View style={styles.feedUnreadDot} /> : null}
            </View>
            <View style={[styles.feedRowBody, fontScale > 1.3 && styles.feedRowBodyLarge]}>
              <View style={styles.feedCopy}>
                <Text style={[styles.feedTitle, !item.read && styles.feedTitleUnread]}>{item.title}</Text>
                <Text style={styles.feedSubtitle}>{subtitle}</Text>
              </View>
              {time ? <Text style={[styles.feedTime, fontScale > 1.3 && styles.feedTimeLarge]}>{time}</Text> : null}
            </View>
          </>
        );
        const accessibilityLabel = [item.title, subtitle, time, state].filter(Boolean).join("，");
        return interactive ? (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            key={item.id}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.feedRow, pressed && styles.pressed]}
          >
            {content}
          </Pressable>
        ) : (
          <View accessibilityLabel={accessibilityLabel} accessible key={item.id} style={styles.feedRow}>
            {content}
          </View>
        );
      })}
      {visibleItems.length < items.length ? (
        <Pressable
          accessibilityLabel={showMoreLabel}
          accessibilityRole="button"
          onPress={() => setVisibleCount(items.length)}
          style={({ pressed }) => [styles.feedMore, pressed && styles.pressed]}
        >
          <Text style={styles.feedMoreText}>{showMoreLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InboxSegmentedControl({
  activeSection,
  alertCount,
  onChange
}: {
  activeSection: InboxSection;
  alertCount: number;
  onChange: (section: InboxSection) => void;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  return (
    <View accessibilityRole="tablist" style={styles.segmentedControl}>
      <SegmentButton
        active={activeSection === "threads"}
        label={locale.t("inbox.messagesTab")}
        onPress={() => onChange("threads")}
      />
      <SegmentButton
        active={activeSection === "alerts"}
        count={alertCount}
        label={locale.t("inbox.alertsTab")}
        onPress={() => onChange("alerts")}
      />
    </View>
  );
}

function SegmentButton({
  active,
  count = 0,
  label,
  onPress
}: {
  active: boolean;
  count?: number;
  label: string;
  onPress: () => void;
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={count ? `${label} ${count}` : label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active ? styles.segmentButtonActive : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text
        style={[
          styles.segmentButtonText,
          active ? styles.segmentButtonTextActive : null
        ]}
      >
        {label}
      </Text>
      {count > 0 ? <Text style={styles.segmentCount}>{count}</Text> : null}
    </Pressable>
  );
}

function AlertDismissButton({
  disabled = false,
  label,
  onPress
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.alertDismissButton,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.text3} name="close-outline" size={15} />
      <Text style={styles.alertDismissText}>{label}</Text>
    </Pressable>
  );
}

function AlertsCard({
  error,
  pendingId,
  onDismissAlert,
  onOpenAlert,
  view
}: {
  error: string;
  pendingId: string | null;
  onDismissAlert: (id: string) => void;
  onOpenAlert: (id: string) => void;
  view: RelationshipAlertsView;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.remindersPane}>
      <Text style={styles.threadPreview}>{locale.t(view.alerts.some(alert => alert.canPersistState)
        ? "inbox.stateAccount" : "inbox.stateSession")}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      {pendingId ? <Text accessibilityLiveRegion="polite" style={styles.resourceStatus}>{locale.t("inbox.updating")}</Text> : null}
      {view.alerts.length > 0 ? (
        <View style={styles.listStack}>
          {view.alerts.map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={[styles.alertRowTop, fontScale > 1.3 && styles.alertRowTopLarge]}>
                <Text style={styles.alertTitle}>
                  {alert.title}
                </Text>
                <Text style={[styles.alertTime, fontScale > 1.3 && styles.alertTimeLarge]}>{alert.dueLabel}</Text>
              </View>
              {alert.detail ? (
                <Text style={styles.alertDetail}>
                  {alert.detail}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text
                  style={
                    alert.kind === "proactive"
                      ? styles.proactiveTag
                      : styles.unreadTag
                  }
                >
                  {alert.priorityLabel}
                </Text>
                {alert.read ? <Text style={styles.alertDetail}>{locale.t("inbox.read")}</Text> : null}
                {alert.href ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={locale.t("inbox.openAlert", { title: alert.title })}
                    accessibilityState={{ disabled: pendingId !== null }} disabled={pendingId !== null}
                    onPress={() => onOpenAlert(alert.id)}
                    style={({ pressed }) => [styles.alertDismissButton, pendingId ? styles.disabled : null, pressed ? styles.pressed : null]}>
                    <Ionicons color={colors.accent} name="arrow-forward-outline" size={15} />
                    <Text style={styles.alertDismissText}>{locale.t("inbox.view")}</Text>
                  </Pressable>
                ) : null}
                <AlertDismissButton
                  disabled={pendingId !== null}
                  label={locale.t("inbox.ignore")}
                  onPress={() => onDismissAlert(alert.id)}
                />
              </View>
              {alert.canPersistState && !alert.href ? <Text style={styles.alertDetail}>{locale.t("inbox.targetUnsupported")}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyInboxSection}>
          <Ionicons color={colors.text3} name="notifications-outline" size={22} />
          <Text style={styles.emptyInboxTitle}>{locale.t("inbox.noAlerts")}</Text>
          <Text style={styles.threadPreview}>
            {locale.t("inbox.noAlertsBody")}
          </Text>
        </View>
      )}
      <Text style={styles.safetyText}>{view.safetyText}</Text>
    </View>
  );
}

function ConversationList({
  conversations,
  onSelect,
  query
}: {
  conversations: RelationshipConversationView[];
  onSelect: (conversationId: string) => void;
  query: string;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConversations = normalizedQuery
    ? conversations.filter((conversation) =>
        [
          conversation.name,
          conversation.organization,
          conversation.subject,
          conversation.preview
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : conversations;

  return (
      <View style={styles.mailList}>
        {visibleConversations.length > 0 ? (
          visibleConversations.map((conversation) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${conversation.name}，${conversation.subject}，${conversation.lastAt}，${conversation.preview}${conversation.unreadCount > 0 ? `，${locale.t("inbox.unreadCount", { count: conversation.unreadCount })}` : ""}`}
              key={conversation.id}
              onPress={() => onSelect(conversation.id)}
              style={({ pressed }) => [
                styles.threadRow,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.unreadGutter}>
                {conversation.unreadCount > 0 ? (
                  <Ionicons color={colors.accent} name="ellipse" size={8} />
                ) : null}
              </View>
              <View style={[styles.listRowBody, fontScale > 1.3 && styles.listRowBodyLarge]}>
                <View style={[styles.listCopy, fontScale > 1.3 && styles.listCopyLarge]}>
                  <Text style={[styles.listHeadline, conversation.unreadCount > 0 && styles.listHeadlineUnread]}>
                    <Text>{conversation.name}</Text>{" · "}<Text>{conversation.subject}</Text>
                  </Text>
                  <Text style={styles.listPreview}>{conversation.preview}</Text>
                </View>
                <Text style={[styles.listDate, fontScale > 1.3 && styles.listDateLarge]}>{conversation.lastAt}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyInboxSection}>
            <Ionicons color={colors.text3} name="search-outline" size={22} />
            <Text style={styles.emptyInboxTitle}>{locale.t(query.trim() ? "inbox.noSearchResults" : "inbox.noMessages")}</Text>
            <Text style={styles.threadPreview}>{locale.t(query.trim() ? "inbox.searchHint" : "inbox.messagesHint")}</Text>
          </View>
        )}
      </View>
  );
}

function ThreadDetail({
  clientGet,
  clientPost,
  contactId,
  isCurrent,
  detail,
  previewOnly = false
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  contactId?: string;
  isCurrent: () => boolean;
  detail: RelationshipThreadDetailView;
  previewOnly?: boolean;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showEmptyRecords, setShowEmptyRecords] = useState(false);
  const emptyCount = detail.messages.filter(message => message.body === "暂无消息正文").length;
  const visibleMessages = showEmptyRecords
    ? detail.messages
    : detail.messages.filter(message => message.body !== "暂无消息正文");
  return (
    <View style={styles.readingPane}>
      <Text accessibilityRole="header" style={styles.readingSubject}>{detail.subject}</Text>
      {!previewOnly ? <Text style={styles.bodyText}>{locale.t("inbox.contactNamed", { name: detail.participantName })}</Text> : null}
      {emptyCount > 0 ? (
        <View>
          <Text style={styles.threadPreview}>{locale.t("inbox.emptyRecordCount", { count: emptyCount })}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showEmptyRecords }}
            onPress={() => setShowEmptyRecords(value => !value)}
            style={styles.privacyDisclosure}
          >
            <Text style={styles.threadPreview}>{locale.t(showEmptyRecords ? "inbox.collapseEmpty" : "inbox.expandEmpty")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.messageStack}>
        {visibleMessages.map((message) => (
          <View
            key={message.id}
            style={styles.mailMessage}
          >
            <View style={styles.messageMeta}>
              <Text style={styles.messageSender}>{message.sender}</Text>
              <Text style={styles.messageTime}>{message.time}</Text>
            </View>
            <Text style={styles.messageBody}>{message.body}</Text>
          </View>
        ))}
      </View>
      {previewOnly ? (
        <Text style={styles.safetyText}>{locale.t("inbox.previewOnly")}</Text>
      ) : (
        <>
          <ReplyComposer contactId={contactId ?? ""} isCurrent={isCurrent} detail={detail} />
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("inbox.privacy")} accessibilityState={{ expanded: showPrivacy }} onPress={() => setShowPrivacy(value => !value)} style={styles.privacyDisclosure}>
            <Text style={styles.threadPreview}>{locale.t(showPrivacy ? "inbox.collapsePrivacy" : "inbox.privacy")}</Text>
          </Pressable>
          {showPrivacy ? <PrivacyControlsPanel clientGet={clientGet} clientPost={clientPost} isCurrent={isCurrent} detail={detail} /> : null}
        </>
      )}
    </View>
  );
}

function PrivacyControlsPanel({
  clientGet,
  clientPost,
  isCurrent,
  detail
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  isCurrent: () => boolean;
  detail: RelationshipThreadDetailView;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const [privacy, setPrivacy] = useState<RelationshipPrivacyControlsView | null>(
    null
  );
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyToggling, setPrivacyToggling] = useState(false);

  async function loadPrivacyControls() {
    if (!isCurrent()) return;
    setPrivacyLoading(true);
    setPrivacyError(null);

    try {
      const result = await clientGet(chatPrivacyControlsPath(detail.conversationId));
      if (!isCurrent()) return;

      if (result.success) {
        setPrivacy(relationshipPrivacyControlsToView(result.data, locale.language));
      } else {
        setPrivacyError(
          relationshipInboxErrorText(
            result.error?.message,
            locale.t("inbox.privacyUnavailable"),
            locale.language
          )
        );
      }
    } catch (requestError) {
      if (!isCurrent()) return;
      setPrivacyError(
        relationshipInboxErrorText(requestError, locale.t("inbox.privacyUnavailable"), locale.language)
      );
    } finally {
      if (isCurrent()) setPrivacyLoading(false);
    }
  }

  useEffect(() => {
    setPrivacy(null);
    setPrivacyToggling(false);
    setPrivacyLoading(false);
    void loadPrivacyControls();
  }, [detail.conversationId, isCurrent]);

  async function toggleAnalysis() {
    if (!privacy || !isCurrent()) {
      return;
    }

    const request = buildRelationshipPrivacyToggleRequest({
      conversationId: detail.conversationId,
      enabled: privacy.nextEnabled
    }, locale.language);

    if (!request.success) {
      setPrivacyError(request.error);
      return;
    }

    setPrivacyToggling(true);
    setPrivacyError(null);

    try {
      const result = await clientPost(request.request.endpoint, request.request.body);
      if (!isCurrent()) return;

      if (result.success) {
        setPrivacy(relationshipPrivacyControlsToView(result.data, locale.language));
      } else {
        setPrivacyError(
          relationshipInboxErrorText(
            result.error?.message,
            locale.t("inbox.privacyUpdateFailed"),
            locale.language
          )
        );
      }
    } catch (requestError) {
      if (!isCurrent()) return;
      setPrivacyError(
        relationshipInboxErrorText(requestError, locale.t("inbox.privacyUpdateFailed"), locale.language)
      );
    } finally {
      if (isCurrent()) setPrivacyToggling(false);
    }
  }

  if (!privacy) {
    return (
      <View style={styles.stagedBox}>
        <Text style={styles.stagedTitle}>{locale.t("inbox.privacy")}</Text>
        <Text style={styles.threadPreview}>
          {locale.t(privacyLoading ? "inbox.privacyLoading" : "inbox.privacyUnavailable")}
        </Text>
        {privacyError ? <Text style={styles.errorText}>{privacyError}</Text> : null}
        {!privacyLoading ? (
          <ActionButton
            icon="refresh-outline"
            label={locale.t("common.retry")}
            onPress={loadPrivacyControls}
            variant="secondary"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.privacyBox}>
      <View style={styles.threadRowTop}>
        <View>
          <Text style={styles.stagedTitle}>{privacy.title}</Text>
          <Text style={styles.threadPreview}>{privacy.summary}</Text>
        </View>
        <Text style={styles.sourceTag}>{privacy.sourceLabel}</Text>
      </View>
      <View style={styles.tagsRow}>
        <Text style={styles.unreadTag}>{privacy.analysisLabel}</Text>
        <Text style={styles.sourceTag}>{privacy.privateNotesLabel}</Text>
        <Text style={styles.proactiveTag}>{privacy.shareLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{privacy.analysisDetail}</Text>
      <Text style={styles.threadPreview}>{privacy.deletionLabel}</Text>
      <Text style={styles.safetyText}>{privacy.safetyText}</Text>
      {privacyError ? <Text style={styles.errorText}>{privacyError}</Text> : null}
      <ActionButton
        disabled={privacyToggling}
        icon="lock-closed-outline"
        label={privacy.toggleLabel}
        onPress={toggleAnalysis}
        variant="secondary"
      />
    </View>
  );
}

function ReplyComposer({
  contactId,
  isCurrent,
  detail
}: {
  contactId: string;
  isCurrent: () => boolean;
  detail: RelationshipThreadDetailView;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const router = useRouter();
  const [body, setBody] = useState(detail.draftReply);
  const draftEdited = useRef(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [staged, setStaged] = useState("");
  useEffect(() => { setRewriteError(null); }, [isCurrent]);

  useEffect(() => {
    if (draftEdited.current) return;
    setBody(detail.draftReply);
    setRewriteError(null);
    setStaged("");
  }, [detail.conversationId, detail.draftReply]);

  function rewriteDraft() {
    if (!isCurrent()) return;
    const actorId = auth.actorId;
    if (!body.trim()) { setRewriteError(locale.t("inbox.writeDraftFirst")); return; }
    if (!contactId) { setRewriteError(locale.t("inbox.missingContact")); return; }
    if (!actorId || !server.baseUrl) { setRewriteError(locale.t("inbox.signInForAi")); return; }
    try {
      const prefillIntent = registerAiTemplatePrefill({ actorId, baseUrl: server.baseUrl, ...inboxPolishTemplate({ contactId, contactName: detail.participantName, draft: body.trim() }) });
      setRewriteError(null);
      router.push({ pathname: "/ai/[id]", params: { id: "new", prefillIntent } } as Href);
    } catch {
      setRewriteError(locale.t("inbox.transferFailed"));
    }
  }

  if (staged) {
    return (
      <View style={styles.stagedBox}>
        <Text style={styles.stagedTitle}>{locale.t("inbox.replyPreview")}</Text>
        <Text style={styles.threadPreview}>{locale.t("inbox.previewOnly")}</Text>
        <Text style={styles.bodyText}>{staged}</Text>
        <ActionButton
          icon="pencil-outline"
          label={locale.t("inbox.continueEditing")}
          onPress={() => setStaged("")}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <View style={styles.composer}>
      <Text style={styles.fieldLabel}>{locale.t("inbox.replyDraft")}</Text>
      <TextInput
        accessibilityLabel={locale.t("inbox.replyBody")}
        multiline
        onChangeText={(value) => {
          draftEdited.current = true;
          setBody(value);
        }}
        placeholder={locale.t("inbox.replyPlaceholder")}
        placeholderTextColor={colors.text4}
        style={styles.input}
        value={body}
      />
      {rewriteError ? <Text style={styles.errorText}>{rewriteError}</Text> : null}
      <Text style={styles.safetyText}>{detail.safetyText}</Text>
      <View style={styles.buttonRow}>
        <ActionButton
          disabled={!body.trim()}
          icon="sparkles-outline"
          label={locale.t("inbox.polishDraft")}
          onPress={rewriteDraft}
          variant="secondary"
        />
        <ActionButton
          disabled={!body.trim()}
          icon="mail-unread-outline"
          label={locale.t("inbox.previewReply")}
          onPress={() => { draftEdited.current = true; setStaged(body.trim()); }}
        />
      </View>
    </View>
  );
}

function NewThreadComposer({
  clientGet,
  clientPost,
  isCurrent,
  preview,
  onEdit,
  onCancel,
  onCreated,
  seed
}: {
  clientGet: ClientGet;
  clientPost: ClientPost;
  isCurrent: () => boolean;
  preview: RelationshipCreatedThreadView | null;
  onEdit: () => void;
  onCancel: () => void;
  onCreated: (thread: RelationshipCreatedThreadView) => void;
  seed: { contactId: string; organization: string; participantName: string };
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const [participantName, setParticipantName] = useState(seed.participantName);
  const [organization, setOrganization] = useState(seed.organization);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBusy(false); setError(null); }, [isCurrent]);

  useEffect(() => {
    setParticipantName(seed.participantName);
    setOrganization(seed.organization);
    setSubject("");
    setBody("");
  }, [seed.contactId, seed.organization, seed.participantName]);

  async function createThread() {
    if (!isCurrent()) return;
    const draft = buildRelationshipThreadDraftRequest({
      body,
      contactId: seed.contactId,
      organization,
      participantName,
      subject
    }, locale.language);

    if (!draft.success) {
      setError(draft.error);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await clientPost(draft.request.endpoint, draft.request.body);
      if (!isCurrent()) return;
      if (result.success) {
        onCreated(createdRelationshipThreadToView(result.data, locale.language));
      } else {
        setError(
          relationshipInboxErrorText(
            result.error?.message,
            locale.t("inbox.createDraftFailed"),
            locale.language
          )
        );
      }
    } catch (requestError) {
      if (!isCurrent()) return;
      setError(
        relationshipInboxErrorText(requestError, locale.t("inbox.createDraftFailed"), locale.language)
      );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  if (preview) {
    return (
      <View style={styles.readingPane}>
        <Text style={styles.bodyText}>{locale.t("inbox.contactNamed", { name: preview.conversation.name })}</Text>
        <ThreadDetail clientGet={clientGet} clientPost={clientPost} isCurrent={isCurrent} detail={preview.detail} previewOnly />
        <ActionButton icon="pencil-outline" label={locale.t("inbox.continueEditing")} onPress={onEdit} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.readingPane}>
      <View style={styles.composer}>
        <LabeledInput
          editable={!busy}
          label={locale.t("inbox.recipient")}
          onChangeText={setParticipantName}
          placeholder={locale.t("inbox.recipientPlaceholder")}
          value={participantName}
        />
        <LabeledInput
          editable={!busy}
          label={locale.t("inbox.organization")}
          onChangeText={setOrganization}
          placeholder={locale.t("inbox.optional")}
          value={organization}
        />
        <LabeledInput
          editable={!busy}
          label={locale.t("inbox.subject")}
          onChangeText={setSubject}
          placeholder={locale.t("inbox.subjectPlaceholder")}
          value={subject}
        />
        <Text style={styles.fieldLabel}>{locale.t("inbox.body")}</Text>
        <TextInput
          accessibilityLabel={locale.t("inbox.body")}
          editable={!busy}
          multiline
          onChangeText={setBody}
          placeholder={locale.t("inbox.firstMessagePlaceholder")}
          placeholderTextColor={colors.text4}
          style={styles.input}
          value={body}
        />
        <Text style={styles.safetyText}>
          {locale.t("inbox.previewSafety")}
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.buttonRow}>
          <ActionButton
            disabled={busy}
            icon="close-outline"
            label={locale.t("common.cancel")}
            onPress={onCancel}
            variant="secondary"
          />
          <ActionButton
            disabled={busy}
            icon="checkmark-outline"
            label={locale.t(busy ? "inbox.preparing" : "inbox.previewDraft")}
            onPress={createThread}
          />
        </View>
      </View>
    </View>
  );
}

function LabeledInput({
  editable = true,
  label,
  onChangeText,
  placeholder,
  value
}: {
  editable?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={editable}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text4}
        style={styles.singleInput}
        value={value}
      />
    </View>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  variant = "primary"
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  const { colors, styles } = useStyles();
  const secondary = variant === "secondary";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary ? styles.actionButtonSecondary : null,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons
        color={secondary ? colors.text2 : colors.onAccent}
        name={icon}
        size={16}
      />
      <Text
        style={[
          styles.actionButtonText,
          secondary ? styles.actionButtonTextSecondary : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  inboxSafeArea: {
    backgroundColor: colors.surface,
    flex: 1
  },
  inboxCanvas: {
    alignSelf: "center",
    width: "100%",
    maxWidth: layout.contentMax,
    paddingBottom: layout.contentBottom,
    paddingHorizontal: layout.pageInset
  },
  inboxScroll: { flex: 1 },
  mailToolbar: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    minHeight: 48,
    maxWidth: layout.contentMax,
    paddingHorizontal: 16,
    paddingVertical: 2,
    width: "100%"
  },
  toolbarSide: { width: "28%", alignItems: "flex-start" },
  toolbarEnd: { alignItems: "flex-end" },
  toolbarButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    minWidth: 44,
    maxWidth: "100%",
    justifyContent: "center"
  },
  toolbarText: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1
  },
  toolbarComposeText: { color: colors.accent, fontSize: 16, fontWeight: "600", lineHeight: 22, flexShrink: 1 },
  mailTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
    textAlign: "center"
  },
  mailContent: { gap: 0 },
  mailList: { gap: 0 },
  readingPane: { gap: 20 },
  remindersPane: { gap: 12, paddingTop: 16 },
  resourceStatus: { color: colors.text3, fontSize: 14, lineHeight: 21, paddingTop: 16 },
  readingSubject: { ...textStyles.title, color: colors.ink },
  mailMessage: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingBottom: 24
  },
  privacyDisclosure: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  actionButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderWidth: 1,
    minHeight: layout.control
  },
  actionButtonText: {
    ...createControlStyles(colors).primaryButtonText,
    color: colors.onAccent,
    flexShrink: 1
  },
  actionButtonTextSecondary: {
    color: colors.text2
  },
  alertRow: {
    borderBottomColor: colors.border2,
    borderBottomWidth: 1,
    gap: 3,
    paddingVertical: 14
  },
  alertRowTop: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  alertRowTopLarge: { flexDirection: "column", gap: 3 },
  alertTitle: { color: colors.ink, flex: 1, minWidth: 0, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  alertDetail: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  alertTime: { color: colors.text3, fontSize: 12, lineHeight: 18, maxWidth: 116 },
  alertTimeLarge: { maxWidth: "100%" },
  alertDismissButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 9
  },
  alertDismissText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  composer: {
    gap: spacing.md
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  emptyInboxSection: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg
  },
  emptyInboxTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700"
  },
  fieldGroup: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md
  },
  fieldLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 128,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    textAlignVertical: "top",
    lineHeight: 23
  },
  listStack: {
    gap: spacing.sm
  },
  messageBody: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 26
  },
  messageMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  messageSender: {
    color: colors.text2,
    fontSize: 16,
    fontWeight: "600"
  },
  messageStack: {
    gap: spacing.md
  },
  messageTime: {
    color: colors.text3,
    fontSize: typography.caption
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  pressed: {
    opacity: 0.78
  },
  proactiveTag: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  privacyBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  rewriteBox: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  safetyText: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18,
    padding: spacing.md
  },
  feedCoverage: {
    color: colors.text4,
    fontSize: 12,
    lineHeight: 18,
    paddingTop: 28,
    textAlign: "center"
  },
  feedCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  feedList: {
    borderTopColor: colors.border,
    borderTopWidth: 1
  },
  feedMore: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48
  },
  feedMoreText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  feedRow: {
    alignItems: "stretch",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 68,
    paddingVertical: 12
  },
  feedRowBody: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0
  },
  feedRowBodyLarge: {
    flexDirection: "column",
    gap: 4
  },
  feedSubtitle: {
    color: colors.text3,
    fontSize: 12,
    lineHeight: 18
  },
  feedTab: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 1
  },
  feedTabActive: {
    borderBottomColor: colors.ink
  },
  feedTabCount: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21
  },
  feedTabText: {
    color: colors.text3,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 21
  },
  feedTabTextActive: {
    color: colors.ink,
    fontWeight: "800"
  },
  feedTabs: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    marginTop: 12
  },
  feedTabsContent: {
    gap: 22
  },
  feedTime: {
    color: colors.text4,
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "right"
  },
  feedTimeLarge: {
    alignSelf: "flex-end",
    textAlign: "left"
  },
  feedTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22
  },
  feedTitleUnread: {
    fontWeight: "700"
  },
  feedUnreadDot: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: 8,
    width: 8
  },
  feedUnreadGutter: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingTop: 6,
    width: 20
  },
  unifiedError: {
    color: colors.rose,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8
  },
  unifiedSourceError: {
    gap: 8,
    paddingVertical: 8
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.input,
    marginTop: 12
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 0
  },
  segmentButton: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44
  },
  segmentButtonActive: {
    borderBottomColor: colors.ink
  },
  segmentButtonText: {
    color: colors.text3,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400"
  },
  segmentButtonTextActive: {
    color: colors.ink,
    fontWeight: "800"
  },
  segmentCount: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800"
  },
  segmentedControl: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    gap: 22
  },
  singleInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: spacing.sm
  },
  sourceTag: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  stagedBox: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  stagedTitle: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  threadName: {
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  threadPreview: {
    color: colors.text3,
    fontSize: 14,
    lineHeight: 21
  },
  threadRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border2,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 44,
    paddingVertical: 14
  },
  unreadGutter: { width: 8, paddingTop: 7 },
  listRowBody: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  listRowBodyLarge: { flexDirection: "column", gap: 3 },
  listCopy: { flex: 1, minWidth: 0, gap: 3 },
  listCopyLarge: { flex: 0, width: "100%" },
  listHeadline: { color: colors.ink, fontSize: 15, fontWeight: "400", lineHeight: 21 },
  listHeadlineUnread: { fontWeight: "700" },
  listPreview: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  listDate: { color: colors.text3, fontSize: 12, lineHeight: 18, maxWidth: 90 },
  listDateLarge: { maxWidth: "100%" },
  threadRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  threadSubject: {
    ...textStyles.body,
    color: colors.text
  },
  threadTime: {
    color: colors.text3,
    fontSize: typography.caption
  },
  unreadTag: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  }
}));
