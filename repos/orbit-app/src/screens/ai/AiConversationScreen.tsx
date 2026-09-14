import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationPath,
  aiConversationSessionPath,
  taskSuggestionAcceptPath,
  taskSuggestionDismissPath
} from "../../api/endpoints";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { iorbitBrandMark } from "../../design/iorbit-brand";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { aiConversationListSchema, aiSessionReadSchema, aiSessionReceiptMatches, aiReplyPayload, aiReliableSendReceipt, aiReliableSendRecovery, aiTaskReceipt, type AiConversationPayload, type AiSession } from "../../api/ai-history-contract";
import type { AiSessionOriginInputContract } from "../../api/contract/ai-sessions";
import {
  aiRunDetailToView,
  buildAiRunDetailRequest,
  conversationAiRunReferencesFor,
  conversationInlinePanelsForThread,
  conversationPayloadToThreadView,
  conversationQuickRoutes,
  conversationRecordLinks,
  conversationTaskDetailHref,
  markdownBlocksFor,
  pendingConversationThreadView,
  prioritizeConversationContacts,
  prioritizeConversationEvents,
  type ChatMessageView,
  type AiRunDetailView,
  type ConversationAiRunReferenceView,
  type ConversationInlinePanelView,
  type ConversationQuickRouteView,
  type ConversationThreadView,
  type MarkdownBlockView,
  type MarkdownInlineView,
  type TaskInteractionView
} from "../../view-models/conversations";
import {
  contactAvatarFor,
  contactsToSummaries,
  type ContactSummary
} from "../../view-models/contacts";
import { eventsToSummaries, type EventSummary } from "../../view-models/events";
import {
  followupInlineContextLabel,
  followupsToView,
  type FollowupTaskView
} from "../../view-models/followups";
import { profileToSummary, type ProfileSummary } from "../../view-models/profile";
import {
  tasksToScheduleItems,
  type ScheduleItem
} from "../../view-models/schedule";

type ResourceKind = "empty" | "failure" | "loading" | "offline" | "success";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "conversation";
  }

  return value ?? "conversation";
}

function optionalParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

type ReliableSendAttempt = {
  clientMessageId: string;
  expectedMessageRevision: number;
  origin?: AiSessionOriginInputContract;
  requestId: string;
  sessionId: string;
};
type SendRequest = { path: string; message: string; history?: { content: string; role: "user" | "assistant" }[] | undefined; reliable?: ReliableSendAttempt; revision: number };
type PendingSessionSave = { session: AiSession; revision: number; canonicalize: boolean; waitForTask: boolean };
type ConversationJournalState = {
  draftMessage: string; latestData: AiConversationPayload | null; resolvedConversationId: string | null;
  savedSessionId: string | null; sessionSnapshot: AiSession | null; pendingSave: PendingSessionSave | null;
  saveError: string | null; saveNotice: string | null; sendError: string | null; sendCode: string | null; failedRequest: SendRequest | null;
  actionError: string | null; acceptedTaskId: string | null; taskInteractionResolution: "accepted" | "dismissed" | null;
};
export type AiConversationJournal = Partial<ConversationJournalState> & { draftRevision?: number; interruptedRequest?: SendRequest };

function useJournalState<K extends keyof ConversationJournalState>(journal: AiConversationJournal, key: K, initial: ConversationJournalState[K]) {
  const [value, setValue] = useState<ConversationJournalState[K]>(() => key in journal ? journal[key] as ConversationJournalState[K] : initial);
  function update(next: ConversationJournalState[K]) {
    Object.assign(journal, { [key]: next });
    setValue(next);
  }
  return [value, update] as const;
}

function rawConversationThread(payload: AiConversationPayload): ConversationThreadView {
  return {
    ...conversationPayloadToThreadView(payload),
    title: payload.conversations.find(item => item.conversationId === payload.activeConversationId)?.title || "IORBIT 会话",
    assistantMessage: payload.assistantMessage,
    messages: payload.messages.map(item => ({ id: item.messageId, role: item.role, content: item.content, createdAt: item.createdAt }))
  };
}

function rawSessionThread(session: AiSession): ConversationThreadView {
  return {
    activeConversationId: session.id, title: session.customTitle?.trim() || session.title,
    assistantMessage: session.messages.findLast(item => item.role === "assistant")?.text ?? "",
    messages: session.messages.map((item, index) => ({ id: item.id ?? `${session.id}:message:${index}`, role: item.role, content: item.text, createdAt: typeof item.createdAt === "string" ? item.createdAt : session.updatedAt })),
    nextAction: "", proposedToolIntents: []
  };
}

export function AiConversationScreen({ scopeKey, isScopeCurrent = () => true, claimInitialPrompt, allowInitialPrompt = true, journal: providedJournal, sessionOrigin }: {
  scopeKey?: string; isScopeCurrent?: () => boolean; claimInitialPrompt?: () => boolean; allowInitialPrompt?: boolean; journal?: AiConversationJournal; sessionOrigin?: AiSessionOriginInputContract;
} = {}) {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const { id, initialMessage, initialMessageConsumed, source } = useLocalSearchParams<{
    id?: string | string[]; initialMessage?: string | string[]; initialMessageConsumed?: string | string[]; source?: string | string[];
  }>();
  const conversationId = firstParam(id);
  const initialPrompt = allowInitialPrompt ? optionalParam(initialMessage).trim() : "";
  const isStoredAgentSession = optionalParam(source) === "session";
  const isDraftConversation = conversationId === "new";
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient(scopeKey === undefined ? {} : { scopeKey });
  const localJournal = useRef<AiConversationJournal>({});
  const journal = providedJournal ?? localJournal.current;
  const readOptions = scopeKey === undefined ? {} : { scopeKey };
  const path = isDraftConversation ? ORBIT_API_ENDPOINTS.conversations
    : isStoredAgentSession ? aiConversationSessionPath(conversationId) : aiConversationPath(conversationId);
  const state = useApiResource<unknown>(path, () => false, readOptions);
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, data => eventsToSummaries(data).length === 0, readOptions);
  const contactsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.contacts, data => contactsToSummaries(data).length === 0, readOptions);
  const tasksState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.tasks, data => followupsToView({ notificationsPayload: {}, tasksPayload: data }).tasks.length === 0, readOptions);
  const profileState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false, readOptions);
  const [draftMessage, setDraftMessage] = useJournalState(journal, "draftMessage", isDraftConversation && optionalParam(initialMessageConsumed) !== "1" ? initialPrompt : "");
  const draftValue = useRef(draftMessage);
  const draftRevision = useRef(journal.draftRevision ?? 0);
  const [latestData, setLatestData] = useJournalState(journal, "latestData", null);
  const [resolvedConversationId, setResolvedConversationId] = useJournalState(journal, "resolvedConversationId", null);
  const [savedSessionId, setSavedSessionId] = useJournalState(journal, "savedSessionId", null);
  const [sessionSnapshot, setSessionSnapshot] = useJournalState(journal, "sessionSnapshot", null);
  const [pendingSave, setPendingSave] = useJournalState(journal, "pendingSave", null);
  const pendingSaveRef = useRef(pendingSave);
  const [saveError, setSaveError] = useJournalState(journal, "saveError", null);
  const [saveNotice, setSaveNotice] = useJournalState(journal, "saveNotice", null);
  const [sendError, setSendError] = useJournalState(journal, "sendError", null);
  const [sendCode, setSendCode] = useJournalState(journal, "sendCode", null);
  const [failedRequest, setFailedRequest] = useJournalState(journal, "failedRequest", null);
  const [actionError, setActionError] = useJournalState(journal, "actionError", null);
  const [aiRunError, setAiRunError] = useState<string | null>(null);
  const [aiRunDetailView, setAiRunDetailView] = useState<AiRunDetailView | null>(null);
  const [pendingAiRunId, setPendingAiRunId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskInteractionBusy, setTaskInteractionBusy] = useState(false);
  const [acceptedTaskId, setAcceptedTaskId] = useJournalState(journal, "acceptedTaskId", null);
  const [taskInteractionResolution, setTaskInteractionResolution] = useJournalState(journal, "taskInteractionResolution", null);
  const submittedInitialPrompt = useRef<string | null>(null);
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const sendOperation = useRef<AbortController | null>(null);
  const saveOperation = useRef<AbortController | null>(null);
  const taskOperation = useRef<AbortController | null>(null);
  const runOperation = useRef<AbortController | null>(null);
  const refreshOverlay = useRef<unknown>(undefined);
  const owns = () => mounted.current && isScopeCurrent();
  const ownsRequest = (controller: AbortController) => owns() && !controller.signal.aborted;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (journal.interruptedRequest) {
        journal.failedRequest = journal.interruptedRequest;
        journal.sendError = "上次请求已中断，结果尚未确认。你可以重试或编辑问题。";
      }
      if (journal.pendingSave) journal.saveError = "回复尚未确认保存，请重试保存。";
      requests.current.forEach(controller => controller.abort()); requests.current.clear();
    };
  }, [client, scopeKey]);
  useEffect(() => {
    if (refreshOverlay.current !== undefined && (state.kind === "success" || state.kind === "empty")
      && state.data !== refreshOverlay.current && !state.refreshing) {
      refreshOverlay.current = undefined;
      setLatestData(null); setSessionSnapshot(null);
    }
  }, [state]);

  const loadedData = !isDraftConversation && (state.kind === "success" || state.kind === "empty") ? state.data : null;
  const sessionRead = loadedData && isStoredAgentSession ? aiSessionReadSchema.safeParse(loadedData) : null;
  const loadedSession = sessionRead?.success && sessionRead.data.storage.configured && sessionRead.data.session?.id === conversationId ? sessionRead.data.session : null;
  const conversationRead = loadedData && !isStoredAgentSession ? aiConversationListSchema.safeParse(loadedData) : null;
  const readInvalid = loadedData !== null && (isStoredAgentSession ? !loadedSession : !conversationRead?.success);
  const previousSession = sessionSnapshot ?? loadedSession;
  const generatedThread = latestData ? rawConversationThread(latestData) : null;
  const submittedMessage = journal.interruptedRequest?.message ?? failedRequest?.message;
  const initialThread: ConversationThreadView | null = !isDraftConversation ? null : submittedMessage ? pendingConversationThreadView(submittedMessage)
    : { activeConversationId: null, assistantMessage: "", messages: [], nextAction: "", proposedToolIntents: [], title: "新会话" };
  const thread = generatedThread
    ? previousSession ? { ...generatedThread, title: rawSessionThread(previousSession).title, messages: rawSessionThread(previousSession).messages } : generatedThread
    : loadedSession ? rawSessionThread(loadedSession)
    : conversationRead?.success ? rawConversationThread(conversationRead.data)
    : initialThread && failedRequest ? { ...initialThread, title: "未生成回答", messages: initialThread.messages.filter(item => item.role === "user") } : initialThread;
  const runReferences = thread ? conversationAiRunReferencesFor(latestData ?? loadedData ?? thread) : [];
  const inlinePanels = thread && (!isDraftConversation || latestData) ? conversationInlinePanelsForThread(thread) : [];

  function changeDraft(value: string) {
    if (!owns()) return;
    draftValue.current = value;
    draftRevision.current++;
    journal.draftRevision = draftRevision.current;
    setDraftMessage(value);
  }

  function refresh() {
    if (!owns()) return;
    // Refresh reads only. It never consumes a draft or replays an initial write.
    if (!isDraftConversation && !sendOperation.current && !saveOperation.current && !taskOperation.current && !pendingSaveRef.current
      && (state.kind === "success" || state.kind === "empty")) refreshOverlay.current = state.data;
    state.refresh(); eventsState.refresh(); contactsState.refresh(); tasksState.refresh(); profileState.refresh();
  }

  function conversationHistoryForRequest() {
    return thread?.messages.filter((item): item is ChatMessageView & { role: "user" | "assistant" } =>
      (item.role === "user" || item.role === "assistant") && Boolean(item.content.trim()))
      .map(item => ({ content: item.content, role: item.role })).slice(-8);
  }

  function requestForSend(input: Omit<SendRequest, "reliable">): SendRequest {
    if (!(isDraftConversation || isStoredAgentSession || previousSession)) return input;
    const sessionId = previousSession?.id ?? `agent-session-mobile-${randomUUID()}`;
    return {
      ...input,
      reliable: {
        clientMessageId: randomUUID(),
        expectedMessageRevision: previousSession?.messageRevision ?? previousSession?.messages.length ?? 0,
        ...(!previousSession ? {
          origin: sessionOrigin ?? {
            entryClient: "app",
            entryPointId: "ai.new_chat",
            initialGroupId: null,
            kind: "manual",
            template: null,
          }
        } : {}),
        requestId: randomUUID(),
        sessionId,
      },
    };
  }

  async function persistAndCanonicalizeDraftConversation(pending: PendingSessionSave) {
    if (!owns() || saveOperation.current) return;
    const controller = new AbortController();
    saveOperation.current = controller; requests.current.add(controller);
    setSaving(true); setSaveError(null);
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.aiConversationSessions, { body: { session: pending.session }, signal: controller.signal });
    if (!ownsRequest(controller)) return;
    if (result.success && result.status >= 200 && result.status < 300 && aiSessionReceiptMatches(result.data, pending.session)) {
      const saved = aiSessionReadSchema.parse(result.data).session!;
      const limited = pending.session.messages.length > saved.messages.length
        || pending.session.messages.some(message => message.text.trim().length > 12000)
        || pending.session.title.trim().length > 120 || (pending.session.customTitle?.trim().length ?? 0) > 120;
      setSavedSessionId(saved.id);
      setSessionSnapshot(saved);
      if (limited) setSaveNotice("会话已保存，但超出上限的内容已截断。服务最多保留最近 100 条消息，每条 12,000 字、标题 120 字。");
      pendingSaveRef.current = null; setPendingSave(null);
      if (pending.canonicalize && !pending.waitForTask && !limited && !saveNotice && draftRevision.current === pending.revision && !draftValue.current.trim()) {
        router.replace({ params: { id: saved.id, source: "session" }, pathname: "/ai/[id]" });
      }
    } else {
      setSaveError(result.success ? "回复已生成，但尚未确认保存。请重试保存。" : `回复已生成，但保存失败：${result.error.message}`);
    }
    requests.current.delete(controller); saveOperation.current = null; setSaving(false);
  }

  async function submitRequest(request: SendRequest) {
    if (!owns() || sendOperation.current || saveOperation.current || taskOperation.current || pendingSaveRef.current) return;
    const controller = new AbortController();
    sendOperation.current = controller; requests.current.add(controller);
    refreshOverlay.current = undefined;
    journal.interruptedRequest = request;
    setSending(true); setSendError(null); setSendCode(null); setFailedRequest(null);
    setAiRunError(null); setAiRunDetailView(null); setActionError(null);
    const result = await client.post<unknown>(request.path, {
      body: {
        locale: "zh",
        message: request.message,
        ...(request.history ? { history: request.history } : {}),
        ...(request.reliable ? {
          ...request.reliable,
          protocolVersion: 2,
          references: []
        } : {})
      }, signal: controller.signal
    });
    if (!ownsRequest(controller)) return;
    delete journal.interruptedRequest;
    const receipt = result.success && result.status >= 200 && result.status < 300 ? aiReliableSendReceipt(result.data) : null;
    const payload = result.success && result.status >= 200 && result.status < 300 ? aiReplyPayload(result.data, request.message) : null;
    if (payload) {
      setTaskInteractionResolution(null); setAcceptedTaskId(null);
      setLatestData(payload); setResolvedConversationId(payload.activeConversationId);
      if (draftRevision.current === request.revision) { draftValue.current = ""; setDraftMessage(""); }
      const nextThread = rawConversationThread(payload);
      if (request.reliable && receipt?.state === "completed") {
        const turnStart = payload.messages.findLastIndex(item => item.role === "user");
        const messages = payload.messages.slice(turnStart).filter((item): item is typeof item & { role: "user" | "assistant" } => item.role === "user" || item.role === "assistant")
          .map((item, index) => ({
            createdAt: item.createdAt,
            id: index === 0 ? request.reliable!.clientMessageId : item.messageId,
            role: item.role,
            text: item.content
          }));
        const now = new Date().toISOString();
        const session: AiSession = previousSession
          ? { ...previousSession, messageRevision: receipt?.messageRevision, messages: [...previousSession.messages, ...messages], updatedAt: now }
          : { id: request.reliable.sessionId, title: request.message.slice(0, 120), createdAt: messages[0]?.createdAt ?? now, updatedAt: now, pinned: false, messageRevision: receipt?.messageRevision, messages };
        setSavedSessionId(session.id);
        setSessionSnapshot(session);
        pendingSaveRef.current = null; setPendingSave(null);
        if (isDraftConversation && !nextThread.taskInteraction?.state && draftRevision.current === request.revision && !draftValue.current.trim()) {
          router.replace({ params: { id: session.id, source: "session" }, pathname: "/ai/[id]" });
        }
      } else if (isDraftConversation || isStoredAgentSession || previousSession) {
        const turnStart = payload.messages.findLastIndex(item => item.role === "user");
        const messages = payload.messages.slice(turnStart).filter((item): item is typeof item & { role: "user" | "assistant" } => item.role === "user" || item.role === "assistant")
          .map(item => ({ role: item.role, text: item.content }));
        const runId = conversationAiRunReferencesFor(payload)[0]?.id;
        const identity = (runId || `${payload.activeConversationId}-${Date.now()}`).replace(/[^A-Za-z0-9_-]/gu, "-");
        const now = new Date().toISOString();
        const session: AiSession = previousSession
          ? { ...previousSession, messages: [...previousSession.messages, ...messages], updatedAt: now }
          : { id: `agent-session-mobile-${identity}`, title: request.message.slice(0, 120), createdAt: now, updatedAt: now, pinned: false, messages };
        const pending = { session, revision: request.revision, canonicalize: isDraftConversation, waitForTask: nextThread.taskInteraction?.state === "suggested" };
        setSessionSnapshot(session); pendingSaveRef.current = pending; setPendingSave(pending);
        await persistAndCanonicalizeDraftConversation(pending);
      }
    } else {
      setFailedRequest(request);
      const unknown = Boolean(request.reliable) && (!result.success || receipt?.state === "pending" || receipt?.state === "outcome_unknown");
      setSendError(unknown ? "请求结果尚未确认。请先检查结果，系统不会重复生成。" : result.success ? "服务返回的回答不完整，请重试或编辑问题。" : result.error.message);
      setSendCode(unknown ? receipt?.state ?? "OUTCOME_UNKNOWN" : result.success ? null : result.error.code);
    }
    if (!ownsRequest(controller)) return;
    requests.current.delete(controller); sendOperation.current = null; setSending(false);
  }

  async function sendMessage() {
    if (!owns()) return;
    const message = draftValue.current.trim();
    if (!message) return;
    const usesSessionHistory = isDraftConversation || isStoredAgentSession || Boolean(previousSession);
    const history = previousSession ? conversationHistoryForRequest() : undefined;
    const sendPath = usesSessionHistory ? ORBIT_API_ENDPOINTS.conversations
      : resolvedConversationId ? aiConversationPath(resolvedConversationId) : path;
    await submitRequest(requestForSend({ path: sendPath, message, revision: draftRevision.current, history: history?.length ? history : undefined }));
  }

  useEffect(() => {
    if (!owns() || !isDraftConversation || !initialPrompt || submittedInitialPrompt.current === initialPrompt) return;
    submittedInitialPrompt.current = initialPrompt;
    if (!claimInitialPrompt?.()) {
      if (optionalParam(initialMessageConsumed) === "1" && !latestData && !failedRequest) {
        setFailedRequest({ path: ORBIT_API_ENDPOINTS.conversations, message: initialPrompt, revision: draftRevision.current });
        setSendError("这条问题已提交过，结果尚未确认。你可以重试或编辑问题。");
      }
      return;
    }
    void submitRequest(requestForSend({ path: ORBIT_API_ENDPOINTS.conversations, message: initialPrompt, revision: draftRevision.current }));
  }, [client, initialPrompt, isDraftConversation]);

  async function recoverRequest(request: SendRequest) {
    if (!request.reliable || !owns() || sendOperation.current) {
      if (!request.reliable) await submitRequest(request);
      return;
    }
    const controller = new AbortController(); sendOperation.current = controller; requests.current.add(controller);
    setSending(true); setSendError(null); setSendCode(null);
    const recoveryPath = `${aiConversationSessionPath(request.reliable.sessionId)}?${new URLSearchParams({ requestId: request.reliable.requestId }).toString()}`;
    const result = await client.get<unknown>(recoveryPath, { signal: controller.signal });
    if (!ownsRequest(controller)) return;
    const recovery = result.success && result.status >= 200 && result.status < 300 ? aiReliableSendRecovery(result.data) : null;
    requests.current.delete(controller); sendOperation.current = null; setSending(false);
    if (recovery?.receipt.state === "completed" || recovery?.receipt.state === "failed_before_execution") {
      await submitRequest(request);
      return;
    }
    setFailedRequest(request);
    setSendError(recovery ? "请求仍在处理中或结果未知。稍后再次检查；系统不会重复生成。" : result.success ? "暂时无法确认请求结果，请稍后再检查。" : result.error.message);
    setSendCode(recovery?.receipt.state ?? (result.success ? "OUTCOME_UNKNOWN" : result.error.code));
  }

  async function inspectAiRun(reference: ConversationAiRunReferenceView) {
    if (!owns()) return;
    const request = buildAiRunDetailRequest(reference.id);
    if (!request.success) { setAiRunError(request.error); return; }
    runOperation.current?.abort();
    const controller = new AbortController(); runOperation.current = controller; requests.current.add(controller);
    setPendingAiRunId(reference.id); setAiRunError(null);
    const result = await client.get<unknown>(request.request.path, { signal: controller.signal });
    if (!ownsRequest(controller)) return;
    if (result.success && result.status >= 200 && result.status < 300) setAiRunDetailView(aiRunDetailToView(result.data));
    else setAiRunError(result.success ? "执行记录未能读取，请重试。" : result.error.message);
    requests.current.delete(controller); runOperation.current = null; setPendingAiRunId(null);
  }

  async function resolveTaskSuggestion(action: "accept" | "dismiss") {
    const suggestionId = thread?.taskInteraction?.suggestionId;
    if (!owns() || !suggestionId || taskOperation.current || sendOperation.current || saveOperation.current || pendingSaveRef.current) return;
    const controller = new AbortController(); taskOperation.current = controller; requests.current.add(controller);
    setTaskInteractionBusy(true); setActionError(null);
    const endpoint = action === "accept" ? taskSuggestionAcceptPath(suggestionId) : taskSuggestionDismissPath(suggestionId);
    const result = await client.post<unknown>(endpoint, {
      body: { idempotencyKey: `ios:agent-task-${action}:${suggestionId}` }, signal: controller.signal
    });
    if (!ownsRequest(controller)) return;
    const receipt = result.success && result.status >= 200 && result.status < 300 ? aiTaskReceipt(result.data, suggestionId, action) : null;
    if (receipt) {
      setAcceptedTaskId(receipt.taskId);
      setTaskInteractionResolution(action === "accept" ? "accepted" : "dismissed");
      if (action === "accept") tasksState.refresh();
      if (savedSessionId && !saveNotice && !draftValue.current.trim()) router.replace({ params: { id: savedSessionId, source: "session" }, pathname: "/ai/[id]" });
    } else setActionError(result.success ? "尚未确认操作结果，请重试。" : result.error.message);
    requests.current.delete(controller); taskOperation.current = null; setTaskInteractionBusy(false);
  }

  function openHref(href: string) {
    if (owns()) router.push(href as Href);
  }
  const eventCards =
    eventsState.kind === "success" ? eventsToSummaries(eventsState.data) : [];
  const contactCards = contactsState.kind === "success"
    ? contactsToSummaries(contactsState.data)
    : [];
  const followupTasks = tasksState.kind === "success"
    ? followupsToView({ notificationsPayload: {}, tasksPayload: tasksState.data })
        .tasks
    : [];
  const scheduleItems = tasksState.kind === "success"
    ? tasksToScheduleItems(tasksState.data)
    : [];
  const profile = profileState.kind === "success" || profileState.kind === "empty"
    ? profileToSummary(profileState.data)
    : null;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.readingSafeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top} style={[styles.readingRoot, !thread ? styles.readingFallback : null]}>
      {!thread ? <Pressable accessibilityLabel="返回 Orbit AI" accessibilityRole="button" onPress={() => { if (owns()) router.back(); }} style={styles.backButton}>
        <Ionicons color={colors.ink} name="arrow-back-outline" size={24} />
      </Pressable> : null}
      {!isDraftConversation && state.kind === "loading" ? <LoadingState /> : null}
      {!isDraftConversation && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {!isDraftConversation && state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {readInvalid ? <ErrorState title="会话未能读取" message="服务返回的会话不完整或与当前记录不符，请重试。" /> : null}
      {!thread && state.kind !== "loading" ? <Pressable accessibilityRole="button" onPress={refresh} style={styles.failureSecondary}><Text style={styles.failureSecondaryText}>重试读取</Text></Pressable> : null}
      {state.kind === "empty" && !thread ? (
        <EmptyState message="这条对话还没有消息。" title="没有消息" />
      ) : null}
      {thread ? (
        <ConversationThread
          baseUrl={baseUrl}
          contactCards={contactCards}
          contactsStateKind={contactsState.kind}
          draftMessage={draftMessage}
          eventCards={eventCards}
          eventsStateKind={eventsState.kind}
          followupTasks={followupTasks}
          followupsStateKind={tasksState.kind}
          inlinePanels={inlinePanels}
          aiRunDetailView={aiRunDetailView}
          aiRunError={aiRunError}
          onBack={() => openHref("/ai")}
          onChangeDraft={changeDraft}
          onInspectAiRun={inspectAiRun}
          onOpenContact={(contactId) =>
            openHref(`/contacts/${encodeURIComponent(contactId)}`)
          }
          onOpenEvent={(eventId) =>
            openHref(`/events/${encodeURIComponent(eventId)}`)
          }
          onOpenHref={openHref}
          onResolveTaskSuggestion={resolveTaskSuggestion}
          profile={profile}
          profileStateKind={profileState.kind}
          pendingAiRunId={pendingAiRunId}
          onRefresh={refresh}
          refreshing={state.refreshing}
          runReferences={runReferences}
          scheduleItems={scheduleItems}
          scheduleStateKind={tasksState.kind}
          onSend={sendMessage}
          sendError={sendError}
          sendCode={sendCode}
          actionError={actionError}
          saveError={saveError}
          saveNotice={saveNotice}
          saving={saving}
          writingBlocked={!!pendingSave || saving || taskInteractionBusy}
          retrySendLabel={failedRequest?.reliable && ["OUTCOME_UNKNOWN", "pending", "outcome_unknown"].includes(sendCode ?? "") ? "检查结果" : "重新生成"}
          onRetrySend={() => { if (failedRequest) void recoverRequest(failedRequest); }}
          onEditQuestion={() => { if (failedRequest && owns()) { changeDraft(failedRequest.message); setSendError(null); setSendCode(null); } }}
          onRetrySave={() => { if (pendingSave) void persistAndCanonicalizeDraftConversation(pendingSave); }}
          sending={sending}
          taskInteractionBusy={taskInteractionBusy}
          taskInteractionResolution={taskInteractionResolution}
          thread={acceptedTaskId && thread.taskInteraction ? { ...thread, taskInteraction: { ...thread.taskInteraction, taskId: acceptedTaskId } } : thread}
        />
      ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConversationThread({
  aiRunDetailView,
  aiRunError,
  baseUrl,
  contactCards,
  contactsStateKind,
  draftMessage,
  eventCards,
  eventsStateKind,
  followupTasks,
  followupsStateKind,
  inlinePanels,
  onBack,
  onChangeDraft,
  onInspectAiRun,
  onOpenContact,
  onOpenEvent,
  onOpenHref,
  onResolveTaskSuggestion,
  profile,
  profileStateKind,
  pendingAiRunId,
  onRefresh,
  refreshing,
  runReferences,
  scheduleItems,
  scheduleStateKind,
  onSend,
  sendError,
  sendCode,
  actionError,
  saveError,
  saveNotice,
  saving,
  writingBlocked,
  onRetrySend,
  retrySendLabel,
  onEditQuestion,
  onRetrySave,
  sending,
  taskInteractionBusy,
  taskInteractionResolution,
  thread
}: {
  aiRunDetailView: AiRunDetailView | null;
  aiRunError: string | null;
  baseUrl: string;
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  draftMessage: string;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  followupTasks: FollowupTaskView[];
  followupsStateKind: ResourceKind;
  inlinePanels: ConversationInlinePanelView[];
  onBack: () => void;
  onChangeDraft: (value: string) => void;
  onInspectAiRun: (reference: ConversationAiRunReferenceView) => void;
  onOpenContact: (contactId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: string) => void;
  onResolveTaskSuggestion: (action: "accept" | "dismiss") => void;
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
  pendingAiRunId: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  runReferences: ConversationAiRunReferenceView[];
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
  onSend: () => void;
  sendError: string | null;
  sendCode: string | null;
  actionError: string | null;
  saveError: string | null;
  saveNotice: string | null;
  saving: boolean;
  writingBlocked: boolean;
  onRetrySend: () => void;
  retrySendLabel: string;
  onEditQuestion: () => void;
  onRetrySave: () => void;
  sending: boolean;
  taskInteractionBusy: boolean;
  taskInteractionResolution: "accepted" | "dismissed" | null;
  thread: ConversationThreadView;
}) {
  const { colors, styles } = useStyles();
  const [routesOpen, setRoutesOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const minimumInputHeight = Math.max(44, Math.ceil(22 * fontScale + 12));
  const [inputHeight, setInputHeight] = useState(44);
  const historyScroll = useRef<ScrollView>(null);
  const followNewMessages = useRef(false);
  const inlinePanelAnchorIndex = thread.messages.reduce(
    (lastIndex, message, index) => (message.role === "assistant" ? index : lastIndex),
    -1
  );

  return (
    <View style={styles.threadSurface}>
      <View accessibilityLabel="对话导航" style={styles.threadHeader}>
        <Pressable accessibilityLabel="返回 Orbit AI" accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onBack(); }} style={styles.backButton}>
          <Ionicons color={colors.ink} name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.threadTitleBlock}>
          <View style={styles.threadBrand}><Image accessible={false} source={iorbitBrandMark} testID="iorbit-brand-mark" style={styles.brandMark} /><Text style={styles.threadEyebrow}>IORBIT</Text></View>
          <Text numberOfLines={1} style={styles.threadTitle}>
            {thread.title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="更多对话选项"
          accessibilityRole="button"
          accessibilityState={{ expanded: routesOpen }}
          onPress={() => { Keyboard.dismiss(); setRoutesOpen(!routesOpen); }}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.ink} name="ellipsis-horizontal" size={24} />
        </Pressable>
      </View>
      {routesOpen ? <View style={styles.routesPanel}><QuickRouteDock onOpenHref={(href) => { setRoutesOpen(false); onOpenHref(href); }} /></View> : null}
      <ScrollView
        ref={historyScroll}
        testID="conversation-history"
        contentContainerStyle={styles.readingContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          followNewMessages.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => { if (followNewMessages.current) historyScroll.current?.scrollToEnd({ animated: true }); }}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={colors.accent} />}
        style={styles.readingHistory}
      >
      <View style={styles.messagePanel}>
        {thread.messages.length === 0 ? (
          <EmptyState message="这条对话还没有消息。" title="没有消息" />
        ) : (
          <View style={styles.messageStack}>
            {thread.messages.map((message, index) => (
              <Fragment key={message.id}>
                <MessageBubble baseUrl={baseUrl} message={message} onOpenHref={onOpenHref} />
                {index === inlinePanelAnchorIndex && inlinePanels.length > 0 ? (
                  <ConversationInlinePanels
                    baseUrl={baseUrl}
                    contactCards={contactCards}
                    contactsStateKind={contactsStateKind}
                    eventCards={eventCards}
                    eventsStateKind={eventsStateKind}
                    followupTasks={followupTasks}
                    followupsStateKind={followupsStateKind}
                    onOpenContact={onOpenContact}
                    onOpenEvent={onOpenEvent}
                    onOpenHref={onOpenHref}
                    panels={inlinePanels}
                    profile={profile}
                    profileStateKind={profileStateKind}
                    scheduleItems={scheduleItems}
                    scheduleStateKind={scheduleStateKind}
                    thread={thread}
                  />
                ) : null}
              </Fragment>
            ))}
          </View>
        )}
      </View>
      {thread.taskInteraction ? (
        <TaskInteractionCard
          busy={taskInteractionBusy}
          interaction={thread.taskInteraction}
          onResolve={onResolveTaskSuggestion}
          onOpenHref={onOpenHref}
          resolution={taskInteractionResolution}
        />
      ) : null}
      {thread.proposedToolIntents.length > 0 ? (
        <View style={styles.intentPanel}>
          <Text style={styles.panelTitle}>建议动作</Text>
          {thread.proposedToolIntents.map((intent) => (
            <View key={intent.id} style={styles.intentBlock}>
              <Text style={styles.intentTitle}>{intent.label}</Text>
              <Text style={styles.bodyText}>{intent.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {runReferences.length > 0 || aiRunDetailView || aiRunError ? (
        <AiRunAuditPanel
          detailView={aiRunDetailView}
          error={aiRunError}
          onInspectAiRun={onInspectAiRun}
          pendingAiRunId={pendingAiRunId}
          runReferences={runReferences}
        />
      ) : null}
      {sendError ? <View accessibilityLiveRegion="polite" style={styles.failureStack}>
        <Text style={[styles.messageLabel, styles.assistantLabel]}>IORBIT</Text>
        <View style={styles.failureCard}>
        <View style={styles.failureHeading}><Ionicons color={colors.rose} name="alert-circle-outline" size={28} /><Text style={styles.failureTitle}>这次回答没有生成</Text></View>
        <Text style={styles.failureBody}>{sendError}</Text>
        <View style={styles.failureActions}>
          <Pressable accessibilityRole="button" onPress={onRetrySend} disabled={sending || writingBlocked} style={styles.failurePrimary}><Text style={styles.failurePrimaryText}>{retrySendLabel}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onEditQuestion} disabled={sending} style={styles.failureSecondary}><Text style={styles.failureSecondaryText}>编辑问题</Text></Pressable>
        </View>
        </View>
        {sendCode ? <Text selectable style={styles.failureCode}>{sendCode}</Text> : null}
      </View> : null}
      {actionError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{actionError}</Text> : null}
      {saveError ? <View accessibilityLiveRegion="polite" style={styles.failureCard}>
        <Text style={styles.failureTitle}>回复尚未保存</Text><Text style={styles.failureBody}>{saveError}</Text>
        <Pressable accessibilityRole="button" onPress={onRetrySave} disabled={saving} style={styles.failurePrimary}><Text style={styles.failurePrimaryText}>重试保存</Text></Pressable>
      </View> : null}
      {sending || saving ? <Text accessibilityLiveRegion="polite" style={styles.threadNextAction}>{saving ? "正在保存会话…" : "正在回复…"}</Text> : null}
      </ScrollView>
      {saveNotice ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { marginHorizontal: layout.pageInset }]}>{saveNotice}</Text> : null}
      <View testID="conversation-composer" style={styles.composerPanel}>
        <TextInput
          accessibilityLabel="消息"
          multiline
          numberOfLines={1}
          onChangeText={(value) => { if (!value) setInputHeight(minimumInputHeight); onChangeDraft(value); }}
          onContentSizeChange={(event) => setInputHeight(Math.min(120, Math.max(minimumInputHeight, event.nativeEvent.contentSize.height)))}
          placeholder="继续追问，或换个角度问…"
          placeholderTextColor={colors.text4}
          style={[styles.input, { height: Math.max(minimumInputHeight, inputHeight) }]}
          textAlignVertical="top"
          value={draftMessage}
        />
        <View style={styles.composerActions}>
        <Pressable accessibilityLabel="打开快捷入口" accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRoutesOpen(!routesOpen); }} style={styles.composerPlusButton}>
          <Ionicons color={colors.ink} name="add" size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel="发送消息"
          accessibilityRole="button"
          accessibilityState={{ disabled: sending || writingBlocked || !draftMessage.trim(), busy: sending || saving }}
          disabled={sending || writingBlocked || !draftMessage.trim()}
          onPress={() => { followNewMessages.current = true; onSend(); }}
          style={({ pressed }) => [
            styles.sendButton,
            sending || writingBlocked || !draftMessage.trim() ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name={sending ? "ellipsis-horizontal" : "paper-plane-outline"} size={20} />
        </Pressable>
        </View>
      </View>
    </View>
  );
}

function TaskInteractionCard({
  busy,
  interaction,
  onResolve,
  onOpenHref,
  resolution
}: {
  busy: boolean;
  interaction: TaskInteractionView;
  onResolve: (action: "accept" | "dismiss") => void;
  onOpenHref: (href: string) => void;
  resolution: "accepted" | "dismissed" | null;
}) {
  const { colors, styles } = useStyles();
  const completed = interaction.state === "created" || resolution === "accepted";
  const dismissed = resolution === "dismissed";
  const failed = interaction.state === "failed";

  return (
    <View style={[styles.taskInteractionCard, failed ? styles.taskInteractionFailed : null]}>
      <View style={styles.taskInteractionHeader}>
        <View style={styles.taskInteractionIcon}>
          <Ionicons
            color={failed ? colors.rose : completed ? colors.live : colors.accent}
            name={failed ? "alert-circle-outline" : completed ? "checkmark" : "sparkles-outline"}
            size={18}
          />
        </View>
        <View style={styles.taskInteractionCopy}>
          <Text style={styles.taskInteractionEyebrow}>
            {failed
              ? "待办未创建"
              : completed
                ? "已加入待办"
                : dismissed
                  ? "已暂不处理"
                  : "待办建议"}
          </Text>
          <Text style={styles.taskInteractionTitle}>{interaction.title}</Text>
          {!completed && !dismissed && interaction.reason ? (
            <Text style={styles.taskInteractionReason}>{interaction.reason}</Text>
          ) : null}
        </View>
      </View>
      {interaction.state === "suggested" && !resolution ? (
        <View style={styles.taskInteractionActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onResolve("dismiss")}
            style={({ pressed }) => [
              styles.taskInteractionSecondary,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.taskInteractionSecondaryText}>暂不需要</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onResolve("accept")}
            style={({ pressed }) => [
              styles.taskInteractionPrimary,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.taskInteractionPrimaryText}>
              {busy ? "处理中" : "加入待办"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {completed && conversationTaskDetailHref(interaction.taskId) ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`打开待办详情：${interaction.title}`} onPress={() => onOpenHref(conversationTaskDetailHref(interaction.taskId)!)} style={styles.recordLink}>
          <Text style={styles.recordLinkText}>查看待办</Text><Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

function AiRunAuditPanel({
  detailView,
  error,
  onInspectAiRun,
  pendingAiRunId,
  runReferences
}: {
  detailView: AiRunDetailView | null;
  error: string | null;
  onInspectAiRun: (reference: ConversationAiRunReferenceView) => void;
  pendingAiRunId: string | null;
  runReferences: ConversationAiRunReferenceView[];
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.aiRunPanel}>
      <View style={styles.aiRunHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>AI 运行依据</Text>
          <Text style={styles.inlinePanelDetail}>
            查看这次回复的来源、证据和安全边界。
          </Text>
        </View>
        <Ionicons color={colors.accent} name="shield-checkmark-outline" size={18} />
      </View>
      {runReferences.length > 0 ? (
        <View style={styles.aiRunReferenceStack}>
          {runReferences.map((reference) => {
            const pending = pendingAiRunId === reference.id;

            return (
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(pendingAiRunId)}
                key={reference.id}
                onPress={() => onInspectAiRun(reference)}
                style={({ pressed }) => [
                  styles.aiRunReference,
                  pending ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <View style={styles.aiRunReferenceText}>
                  <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                    {reference.id}
                  </Text>
                  <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                    {reference.detail}
                  </Text>
                </View>
                <Text style={styles.aiRunActionText}>
                  {pending ? "读取中" : reference.actionLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {detailView ? (
        <View style={styles.aiRunResult}>
          <View style={styles.aiRunMetricRow}>
            {detailView.metrics.map((metric) => (
              <Text key={metric} numberOfLines={1} style={styles.aiRunMetric}>
                {metric}
              </Text>
            ))}
          </View>
          <Text style={styles.bodyText}>{detailView.summary}</Text>
          <Text style={styles.aiRunOutput}>{detailView.outputPreview}</Text>
          <Text style={styles.inlinePanelDetail}>{detailView.nextAction}</Text>
          <Text style={styles.aiRunSafetyText}>{detailView.safetyText}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function ConversationInlinePanels({
  baseUrl,
  contactCards,
  contactsStateKind,
  eventCards,
  eventsStateKind,
  followupTasks,
  followupsStateKind,
  onOpenContact,
  onOpenEvent,
  onOpenHref,
  panels,
  profile,
  profileStateKind,
  scheduleItems,
  scheduleStateKind,
  thread
}: {
  baseUrl: string;
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  followupTasks: FollowupTaskView[];
  followupsStateKind: ResourceKind;
  onOpenContact: (contactId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: string) => void;
  panels: ConversationInlinePanelView[];
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
  thread: ConversationThreadView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.inlinePanelStack}>
      {panels.map((panel) => {
        if (panel.kind === "people") {
          return (
            <PeopleInlinePanel
              baseUrl={baseUrl}
              contactCards={contactCards}
              contactsStateKind={contactsStateKind}
              key={panel.kind}
              onOpenContact={onOpenContact}
              onOpenHref={onOpenHref}
              panel={panel}
              thread={thread}
            />
          );
        }

        if (panel.kind === "followups") {
          return (
            <FollowupsInlinePanel
              followupTasks={followupTasks}
              followupsStateKind={followupsStateKind}
              key={panel.kind}
              onOpenHref={onOpenHref}
              panel={panel}
            />
          );
        }

        if (panel.kind === "schedule") {
          return (
            <ScheduleInlinePanel
              key={panel.kind}
              onOpenHref={onOpenHref}
              panel={panel}
              scheduleItems={scheduleItems}
              scheduleStateKind={scheduleStateKind}
            />
          );
        }

        if (panel.kind === "profile") {
          return (
            <ProfileInlinePanel
              key={panel.kind}
              onOpenHref={onOpenHref}
              panel={panel}
              profile={profile}
              profileStateKind={profileStateKind}
            />
          );
        }

        return (
            <EventInlinePanel
              baseUrl={baseUrl}
              eventCards={eventCards}
              eventsStateKind={eventsStateKind}
              key={panel.kind}
              onOpenEvent={onOpenEvent}
              onOpenHref={onOpenHref}
              panel={panel}
              thread={thread}
            />
        );
      })}
    </View>
  );
}

function EventInlinePanel({
  baseUrl,
  eventCards,
  eventsStateKind,
  onOpenEvent,
  onOpenHref,
  panel,
  thread
}: {
  baseUrl: string;
  eventCards: EventSummary[];
  eventsStateKind: ResourceKind;
  onOpenEvent: (eventId: string) => void;
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  thread: ConversationThreadView;
}) {
  const { colors, styles } = useStyles();
  const prioritizedEvents = prioritizeConversationEvents(thread, eventCards);
  const header = (
      <View style={[styles.inlinePanelHeader, eventCards.length ? styles.eventPanelHeader : null]}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          {!eventCards.length ? <Text style={styles.inlinePanelDetail}>{panel.detail}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
  );

  return (
    <View style={styles.inlinePanel}>
      {!eventCards.length ? header : null}
      {eventsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取活动。</Text>
      ) : null}
      {eventsStateKind === "offline" || eventsStateKind === "failure" ? (
        <Text style={styles.errorText}>活动暂时不可用。</Text>
      ) : null}
      {eventsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的活动。</Text>
      ) : null}
      {eventCards.length > 0 ? (
        <View style={styles.eventCardStack}>
          {prioritizedEvents.slice(0, 3).map((event) => (
            <Pressable
              accessibilityRole="button"
              key={event.id}
              onPress={() => onOpenEvent(event.id)}
              style={({ pressed }) => [
                styles.eventSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
                <Image
                  testID={`ai-event-image-${event.id}`}
                  source={{ uri: assetUrl(baseUrl, event.coverPath) }}
                  style={styles.eventSuggestionThumbFrame}
                />
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={2} style={styles.eventSuggestionTitle}>
                  {event.title}
                </Text>
                <Text style={styles.eventSuggestionDetail}>{event.startsAt}{event.location ? ` · ${event.location}` : ""}</Text>
                <Text style={styles.eventSuggestionDetail}>{event.status} · {event.participantCountLabel}</Text>
              </View>
              <Text style={styles.eventSuggestionAction}>{event.actionLabel}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {eventCards.length ? header : null}
    </View>
  );
}

function PeopleInlinePanel({
  baseUrl,
  contactCards,
  contactsStateKind,
  onOpenContact,
  onOpenHref,
  panel,
  thread
}: {
  baseUrl: string;
  contactCards: ContactSummary[];
  contactsStateKind: ResourceKind;
  onOpenContact: (contactId: string) => void;
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  thread: ConversationThreadView;
}) {
  const { colors, styles } = useStyles();
  const prioritizedContacts = prioritizeConversationContacts(thread, contactCards);

  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {contactsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取人脉。</Text>
      ) : null}
      {contactsStateKind === "offline" || contactsStateKind === "failure" ? (
        <Text style={styles.errorText}>人脉暂时不可用。</Text>
      ) : null}
      {contactsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的人脉。</Text>
      ) : null}
      {prioritizedContacts.length > 0 ? (
        <View style={styles.contactCardStack}>
          {prioritizedContacts.slice(0, 3).map((contact) => {
            const avatar = contactAvatarFor(contact);

            return (
              <Pressable
                accessibilityRole="button"
                key={contact.id}
                onPress={() => onOpenContact(contact.id)}
                style={({ pressed }) => [
                  styles.contactSuggestionCard,
                  pressed ? styles.pressed : null
                ]}
              >
                <View
                  style={[
                    styles.contactAvatar,
                    contactAvatarToneStyle(avatar.tone, styles)
                  ]}
                >
                  {contact.imageUrl ? (
                    <Image
                      resizeMode="cover"
                      source={{ uri: assetUrl(baseUrl, contact.imageUrl) }}
                      style={styles.contactAvatarImage}
                    />
                  ) : (
                    <Text style={styles.contactAvatarText}>
                      {avatar.initial}
                    </Text>
                  )}
                </View>
                <View style={styles.contactSuggestionText}>
                  <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                    {contact.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                    {[
                      contact.status,
                      contact.valueLabels.slice(0, 2).join(" / ")
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                    {contact.nextAction}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function FollowupsInlinePanel({
  followupTasks,
  followupsStateKind,
  onOpenHref,
  panel
}: {
  followupTasks: FollowupTaskView[];
  followupsStateKind: ResourceKind;
  onOpenHref: (href: string) => void;
  panel: ConversationInlinePanelView;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {followupsStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取待办。</Text>
      ) : null}
      {followupsStateKind === "offline" || followupsStateKind === "failure" ? (
        <Text style={styles.errorText}>待办暂时不可用。</Text>
      ) : null}
      {followupTasks.length > 0 ? (
        <View style={styles.followupCardStack}>
          {followupTasks.slice(0, 3).map((task) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`打开待办详情：${task.title}`}
              disabled={!conversationTaskDetailHref(task.id)}
              key={task.id}
              onPress={() => onOpenHref(conversationTaskDetailHref(task.id)!)}
              style={({ pressed }) => [
                styles.followupSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.followupStatusColumn}>
                <Text style={styles.followupPriority}>{task.priorityLabel}</Text>
                <Text style={styles.followupDue}>{task.dueLabel}</Text>
              </View>
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                  {task.title}
                </Text>
                <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                  {followupInlineContextLabel(task)}
                </Text>
                <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                  {task.recommendedAction}
                </Text>
              </View>
              <Ionicons color={colors.accent} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      ) : followupsStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有需要复核的跟进。</Text>
      ) : null}
    </View>
  );
}

function ScheduleInlinePanel({
  onOpenHref,
  panel,
  scheduleItems,
  scheduleStateKind
}: {
  onOpenHref: (href: string) => void;
  panel: ConversationInlinePanelView;
  scheduleItems: ScheduleItem[];
  scheduleStateKind: ResourceKind;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>全部</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {scheduleStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取日程。</Text>
      ) : null}
      {scheduleStateKind === "offline" || scheduleStateKind === "failure" ? (
        <Text style={styles.errorText}>日程暂时不可用。</Text>
      ) : null}
      {scheduleItems.length > 0 ? (
        <View style={styles.scheduleCardStack}>
          {scheduleItems.slice(0, 3).map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`打开待办详情：${item.title}`}
              disabled={!conversationTaskDetailHref(item.id)}
              key={item.id}
              onPress={() => onOpenHref(conversationTaskDetailHref(item.id)!)}
              style={({ pressed }) => [
                styles.scheduleSuggestionCard,
                pressed ? styles.pressed : null
              ]}
            >
              <View style={styles.scheduleDateBadge}>
                <Text numberOfLines={2} style={styles.scheduleDateText}>
                  {item.dayLabel}
                </Text>
                {item.timeLabel ? (
                  <Text style={styles.scheduleTimeText}>{item.timeLabel}</Text>
                ) : null}
              </View>
              <View style={styles.eventSuggestionText}>
                <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.eventSuggestionDetail}>
                  {item.priority}
                </Text>
                <Text numberOfLines={2} style={styles.inlinePanelDetail}>
                  {item.recommendedAction}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : scheduleStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的日程。</Text>
      ) : null}
    </View>
  );
}

function ProfileInlinePanel({
  onOpenHref,
  panel,
  profile,
  profileStateKind
}: {
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
  panel: ConversationInlinePanelView;
  profile: ProfileSummary | null;
  profileStateKind: ResourceKind;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlinePanelHeader}>
        <View style={styles.inlinePanelTitleBlock}>
          <Text style={styles.panelTitle}>{panel.title}</Text>
          <Text style={styles.inlinePanelDetail}>{panel.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref(panel.actionHref)}
          style={({ pressed }) => [
            styles.inlinePanelAction,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.inlinePanelActionText}>完善</Text>
          <Ionicons color={colors.accent} name="chevron-forward" size={15} />
        </Pressable>
      </View>
      {profileStateKind === "loading" ? (
        <Text style={styles.inlinePanelDetail}>正在读取档案。</Text>
      ) : null}
      {profileStateKind === "offline" || profileStateKind === "failure" ? (
        <Text style={styles.errorText}>档案暂时不可用。</Text>
      ) : null}
      {profile ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenHref("/profile")}
          style={({ pressed }) => [
            styles.profileSuggestionCard,
            pressed ? styles.pressed : null
          ]}
        >
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {profile.displayName.trim().slice(0, 1) || "O"}
            </Text>
          </View>
          <View style={styles.profileSuggestionText}>
            <Text numberOfLines={1} style={styles.eventSuggestionTitle}>
              {profile.displayName}
            </Text>
            <Text numberOfLines={2} style={styles.eventSuggestionDetail}>
              {profile.headline}
            </Text>
            <View style={styles.profileChipRow}>
              {profile.offering.slice(0, 3).map((item) => (
                <Text numberOfLines={1} key={item} style={styles.profileChip}>
                  {item}
                </Text>
              ))}
            </View>
          </View>
        </Pressable>
      ) : profileStateKind === "empty" ? (
        <Text style={styles.inlinePanelDetail}>现在还没有可展示的档案。</Text>
      ) : null}
    </View>
  );
}

function contactAvatarToneStyle(tone: ReturnType<typeof contactAvatarFor>["tone"], styles: ReturnType<typeof useStyles>["styles"]) {
  if (tone === "amber") return styles.contactAvatarAmber;
  if (tone === "emerald") return styles.contactAvatarEmerald;
  if (tone === "rose") return styles.contactAvatarRose;
  if (tone === "sky") return styles.contactAvatarSky;
  return styles.contactAvatarViolet;
}

function QuickRouteDock({
  onOpenHref
}: {
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
}) {
  const { colors, styles } = useStyles();
  const iconForRoute = (
    href: ConversationQuickRouteView["href"]
  ): keyof typeof Ionicons.glyphMap => {
    if (href === "/events") return "calendar-outline";
    if (href === "/contacts" || href === "/contacts/list") {
      return "people-outline";
    }
    if (href === "/followups") return "checkmark-done-outline";
    if (href === "/schedule") return "time-outline";
    return "person-circle-outline";
  };

  return (
    <View style={styles.quickRouteDock}>
      <Text style={styles.quickRouteLabel}>通用入口</Text>
      <View style={styles.quickRouteGrid}>
        {conversationQuickRoutes().map((route) => (
          <Pressable
            accessibilityRole="button"
            key={route.href}
            onPress={() => onOpenHref(route.href)}
            style={({ pressed }) => [
              styles.quickRouteButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={colors.accent}
              name={iconForRoute(route.href)}
              size={17}
            />
            <Text numberOfLines={1} style={styles.quickRouteTitle}>
              {route.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MessageBubble({ baseUrl, message, onOpenHref }: { baseUrl: string; message: ChatMessageView; onOpenHref: (href: string) => void }) {
  const { colors, styles } = useStyles();
  const isUser = message.role === "user";
  const links = conversationRecordLinks(message.content, baseUrl);
  const [linkError, setLinkError] = useState<string | null>(null);

  return (
    <View accessibilityLabel={isUser ? "我的消息" : "Orbit AI 回复"} style={[styles.messageBubble, isUser ? styles.userBubble : null]}>
      <Text style={[styles.messageLabel, !isUser ? styles.assistantLabel : null]}>{isUser ? "你" : "IORBIT"}</Text>
      {isUser ? <Text selectable style={[styles.messageText, styles.messageTextUser]}>{message.content}</Text> : <MarkdownContent content={message.content} isUser={false} />}
      {links.map((link) => (
        <Pressable
          accessibilityLabel={`打开${link.kind}详情：${link.id}`}
          accessibilityRole="link"
          key={link.href}
          onPress={() => {
            Keyboard.dismiss();
            setLinkError(null);
            if (link.external) void Linking.openURL(link.href).catch(() => setLinkError("链接暂时无法打开，请稍后重试。"));
            else onOpenHref(link.href);
          }}
          style={styles.recordLink}
        >
          <Ionicons color={colors.accent} name={link.kind === "人脉" ? "person-outline" : link.kind === "待办" ? "checkbox-outline" : link.kind === "行动" ? "flash-outline" : "calendar-outline"} size={20} />
          <Text style={styles.recordLinkText}>{link.kind}详情 · {link.id}{link.external ? " · 网页" : ""}</Text>
          <Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ))}
      {/(?:https?:\/\/|orbit:\/\/|\]\()/iu.test(message.content) ? <Text style={styles.linkBoundary}>详情入口仅支持当前服务的记录；未提供入口的链接不会跳转。</Text> : null}
      {linkError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{linkError}</Text> : null}
    </View>
  );
}

function MarkdownContent({
  content,
  isUser
}: {
  content: string;
  isUser: boolean;
}) {
  const { styles } = useStyles();
  const blocks = markdownBlocksFor(content);

  if (blocks.length === 0) {
    return null;
  }

  const groups: { number?: string; blocks: MarkdownBlockView[] }[] = [];
  for (const block of blocks) {
    const number = !block.quote && block.kind === "listItem" ? /^(\d+)[.)]$/u.exec(block.marker ?? "")?.[1] : undefined;
    const previous = groups.at(-1);
    if (number) groups.push({ number, blocks: [{ ...block, kind: "paragraph" }] });
    else if (previous?.number && block.kind === "paragraph" && !block.quote) previous.blocks.push(block);
    else groups.push({ blocks: [block] });
  }

  return (
    <View style={styles.markdownStack}>
      {groups.map((group, index) => group.number ? <View key={index} style={styles.numberedRow}>
        <Text style={styles.numberedMarker}>{group.number}</Text>
        <View style={styles.numberedCopy}>{group.blocks.map((block, blockIndex) => <MarkdownBlock block={block} isUser={isUser} detail={blockIndex > 0} key={blockIndex} />)}</View>
      </View> : <MarkdownBlock block={group.blocks[0]!} isUser={isUser} key={index} />)}
    </View>
  );
}

function MarkdownBlock({
  block,
  isUser,
  detail = false
}: {
  block: MarkdownBlockView;
  isUser: boolean;
  detail?: boolean;
}) {
  const { styles } = useStyles();
  const textStyle = [
    styles.messageText,
    detail ? styles.numberedDetail : null,
    block.quote ? styles.markdownQuoteText : null,
    isUser ? styles.messageTextUser : null
  ];

  if (block.kind === "listItem") {
    return (
      <View
        style={[
          styles.listItemRow,
          block.quote ? styles.markdownQuoteBlock : null
        ]}
      >
        <Text style={[styles.listBullet, isUser ? styles.messageTextUser : null]}>
          {block.marker ?? "•"}
        </Text>
        <Text style={textStyle}>
          {block.segments.map((segment, index) => (
            <MarkdownSegment
              isUser={isUser}
              key={`${segment.kind}-${index}`}
              segment={segment}
            />
          ))}
        </Text>
      </View>
    );
  }

  const paragraph = (
    <Text selectable style={textStyle}>
      {block.segments.map((segment, index) => (
        <MarkdownSegment
          isUser={isUser}
          key={`${segment.kind}-${index}`}
          segment={segment}
        />
      ))}
    </Text>
  );

  if (block.quote) {
    return <View style={styles.markdownQuoteBlock}>{paragraph}</View>;
  }

  return paragraph;
}

function MarkdownSegment({
  isUser,
  segment
}: {
  isUser: boolean;
  segment: MarkdownInlineView;
}) {
  const { styles } = useStyles();
  return (
    <Text
      style={[
        segment.kind === "strong" ? styles.markdownStrong : null,
        segment.kind === "code" ? styles.markdownCode : null,
        isUser ? styles.messageTextUser : null
      ]}
    >
      {segment.text}
    </Text>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  readingSafeArea: { backgroundColor: colors.surface, flex: 1 },
  readingRoot: { flex: 1, maxWidth: layout.contentMax, width: "100%", alignSelf: "center" },
  readingFallback: { paddingHorizontal: layout.pageInset, paddingTop: spacing.md, gap: spacing.lg },
  readingHistory: { flex: 1 },
  readingContent: { gap: 16, paddingTop: 16, paddingBottom: 24, paddingHorizontal: layout.pageInset },
  threadBrand: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandMark: { width: 18, height: 18 },
  composerPlusButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  numberedRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  numberedMarker: { color: colors.accent, fontSize: 22, fontWeight: "800", lineHeight: 24, minWidth: 22 },
  numberedCopy: { flex: 1, minWidth: 0, gap: 4 },
  numberedDetail: { color: colors.text2, fontSize: 14, lineHeight: 23 },
  failureCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 12 },
  failureStack: { gap: 12 },
  failureHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  failureTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800", flexShrink: 1 },
  failureBody: { color: colors.text2, fontSize: 14, lineHeight: 22 },
  failureCode: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  failureActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  failurePrimary: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  failurePrimaryText: { color: colors.surface, fontSize: 14, lineHeight: 22, fontWeight: "700" },
  failureSecondary: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  failureSecondaryText: { color: colors.ink, fontSize: 14, lineHeight: 22, fontWeight: "600" },
  routesPanel: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  composerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordLink: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm },
  recordLinkText: { flex: 1, color: colors.accent, fontSize: typography.small, fontWeight: "600", lineHeight: 20 },
  linkBoundary: { color: colors.muted, fontSize: typography.small, lineHeight: 20 },
  backButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  aiRunActionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  aiRunHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  aiRunMetric: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
    maxWidth: "100%",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  aiRunMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  aiRunOutput: {
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    padding: spacing.md
  },
  aiRunPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  aiRunReference: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  aiRunReferenceStack: {
    gap: spacing.sm
  },
  aiRunReferenceText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  aiRunResult: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  aiRunSafetyText: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  composerPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.ink,
    borderWidth: 1.5,
    gap: 4,
    marginBottom: 0,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 16,
    marginHorizontal: layout.pageInset
  },
  contactAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  contactAvatarAmber: {
    backgroundColor: colors.amberSoft
  },
  contactAvatarEmerald: {
    backgroundColor: colors.liveSoft
  },
  contactAvatarRose: {
    backgroundColor: colors.roseSoft
  },
  contactAvatarSky: {
    backgroundColor: colors.skySoft
  },
  contactAvatarImage: {
    borderRadius: radius.pill,
    height: "100%",
    width: "100%"
  },
  contactAvatarText: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
  },
  contactAvatarViolet: {
    backgroundColor: colors.accentSofter
  },
  contactCardStack: {
    gap: spacing.sm
  },
  contactSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  contactSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 6
  },
  eventCardStack: {
    gap: spacing.sm
  },
  eventStatusBadge: {
    alignSelf: "stretch",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
    textAlign: "center"
  },
  eventSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.card,
    borderWidth: 0,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: 12
  },
  eventPanelHeader: { alignItems: "center" },
  eventSuggestionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16,
    minWidth: 0
  },
  eventSuggestionAction: {
    color: colors.accent,
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  eventSuggestionFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingTop: spacing.xs
  },
  eventSuggestionMediaColumn: {
    flexShrink: 0,
    gap: spacing.xs,
    width: 64
  },
  eventSuggestionMeta: {
    gap: spacing.xxs
  },
  eventSuggestionMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  eventSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  eventSuggestionThumbFrame: {
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    height: 52,
    overflow: "hidden",
    width: 64
  },
  eventSuggestionThumbImage: {
    borderRadius: radius.sm
  },
  eventSuggestionThumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,10,16,0.10)"
  },
  eventSuggestionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18
  },
  followupCardStack: {
    gap: spacing.sm
  },
  followupDue: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  followupPriority: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "900",
    lineHeight: 16
  },
  followupStatusColumn: {
    alignItems: "flex-start",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.sm,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: 82
  },
  followupSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  profileAvatarText: {
    color: colors.accent,
    fontSize: typography.section,
    fontWeight: "900",
    lineHeight: 22
  },
  profileChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text2,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    maxWidth: "100%",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  profileChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  profileSuggestionCard: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  profileSuggestionText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  intentPanel: {
    gap: spacing.sm
  },
  taskInteractionActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
    flexWrap: "wrap"
  },
  taskInteractionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  taskInteractionCopy: { flex: 1, gap: 4, minWidth: 0 },
  taskInteractionEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  taskInteractionFailed: { borderColor: colors.rose },
  taskInteractionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  taskInteractionIcon: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  taskInteractionPrimary: {
    ...createControlStyles(colors).primaryButton
  },
  taskInteractionPrimaryText: {
    ...createControlStyles(colors).primaryButtonText,
    color: colors.onAccent
  },
  taskInteractionReason: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  taskInteractionSecondary: {
    ...createControlStyles(colors).secondaryButton
  },
  taskInteractionSecondaryText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.text2
  },
  taskInteractionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  },
  intentBlock: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  intentTitle: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  inlinePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingVertical: spacing.lg
  },
  inlinePanelAction: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  inlinePanelActionText: {
    ...textStyles.small,
    color: colors.accent,
    flexShrink: 1
  },
  inlinePanelDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  inlinePanelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  inlinePanelStack: {
    gap: spacing.sm
  },
  inlinePanelTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  listBullet: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    width: 14
  },
  listItemRow: {
    alignItems: "flex-start",
    flexDirection: "row"
  },
  markdownCode: {
    backgroundColor: colors.surface3,
    borderRadius: radius.xs,
    color: colors.ink,
    fontSize: typography.caption,
    overflow: "hidden"
  },
  markdownStack: {
    gap: 14
  },
  markdownQuoteBlock: {
    borderLeftColor: colors.border,
    borderLeftWidth: 3,
    paddingLeft: spacing.sm
  },
  markdownQuoteText: {
    color: colors.text2
  },
  markdownStrong: {
    color: colors.ink,
    fontWeight: "800"
  },
  messageBubble: {
    alignSelf: "stretch",
    gap: spacing.sm
  },
  messageLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "600",
    lineHeight: 18
  },
  assistantLabel: { color: colors.accent },
  messageStack: {
    gap: 14
  },
  messagePanel: {
    gap: spacing.sm
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "400"
  },
  messageTextUser: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24
  },
  messageTime: {
    color: colors.text4,
    fontSize: typography.caption
  },
  panelTitle: {
    ...textStyles.section,
    color: colors.ink
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  scheduleCardStack: {
    gap: spacing.sm
  },
  scheduleDateBadge: {
    alignItems: "flex-start",
    backgroundColor: colors.skySoft,
    borderRadius: radius.sm,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: 86
  },
  scheduleDateText: {
    color: colors.sky,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15
  },
  scheduleSuggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  scheduleTimeText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  quickRouteButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexBasis: "18%",
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 58,
    minWidth: 58,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  quickRouteDock: {
    gap: spacing.sm
  },
  quickRouteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  quickRouteLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  quickRouteTitle: {
    color: colors.text2,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 44,
    width: 44,
    justifyContent: "center",
  },
  sendButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  threadEyebrow: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    letterSpacing: 0.6
  },
  threadHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 3.5
  },
  threadNextAction: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  threadSurface: {
    backgroundColor: colors.surface,
    flex: 1
  },
  threadTitle: {
    color: colors.text3,
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 16
  },
  threadTitleBlock: {
    flex: 1,
    gap: 1,
    alignItems: "center",
    minWidth: 0
  },
  userBubble: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16
  }
}));
