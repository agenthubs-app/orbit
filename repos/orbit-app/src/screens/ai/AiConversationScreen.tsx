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
  aiEntityDraftActionPath,
  taskSuggestionAcceptPath,
  taskSuggestionDismissPath
} from "../../api/endpoints";
import { AiEntityDraftCard } from "./cards/AiEntityDraftCard";
import {
  aiEntityDraftCardView,
  readAiEntityDraft,
  type AiEntityDraft
} from "../../view-models/ai-entity-draft";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { NeedsNetworkState } from "../../components/NeedsNetworkState";
import { OfflineNotice } from "../../components/OfflineNotice";
import { useLocalAiConversation, useLocalAiSessions } from "../../hooks/useLocalAiSessions";
import { layout, textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { iorbitBrandMark } from "../../design/iorbit-brand";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { OrbitTranslator } from "../../i18n/messages";
import { aiConversationListSchema, aiSessionReadSchema, aiSessionReceiptMatches, aiReplyPayload, aiReliableSendReceipt, aiReliableSendRecovery, aiTaskReceipt, type AiConversationPayload, type AiSession } from "../../api/ai-history-contract";
import type { AiSessionOriginInputContract, AiSessionReferenceContract } from "../../api/contract/ai-sessions";
import { updateAiSessionOrganization } from "../../api/ai-session-management";
import { useMobileViewport } from "../../platform/use-mobile-viewport";
import { ContactMentionPicker, type MentionContact } from "./ContactMentionPicker";
import { ContactReferenceChip } from "./ContactReferenceChip";
import { AiEntityCardList } from "./cards/AiEntityCard";
import { sessionContactArtifacts, sessionEntityCardTurns } from "../../view-models/ai-artifacts";
import { aiSessionArtifactRecoverySchema } from "../../api/schema/ai-artifacts";
import {
  conversationAiRunReferencesFor,
  conversationPayloadToThreadView,
  conversationQuickRoutes,
  conversationRecordLinks,
  conversationTaskDetailHref,
  markdownBlocksFor,
  pendingConversationThreadView,
  type ChatMessageView,
  type ConversationQuickRouteView,
  type ConversationThreadView,
  type MarkdownBlockView,
  type MarkdownInlineView,
  type TaskInteractionView
} from "../../view-models/conversations";
import { noteSourceFromParams } from "../../view-models/note-suggestions";

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
  references: readonly AiSessionReferenceContract[];
  requestId: string;
  sessionId: string;
};
type SendRequest = { path: string; message: string; history?: { content: string; role: "user" | "assistant" }[] | undefined; reliable?: ReliableSendAttempt; revision: number; sourceNote?: { id: string; version: number } };
type PendingSessionSave = { session: AiSession; revision: number; canonicalize: boolean; waitForTask: boolean; delta?: AiSession["messages"] };
/** Sprint 0112: an older page of the opened session, loaded from the top of the history. */
type EarlierPage = { cursor: string; hasMore: boolean; messages: AiSession["messages"]; nextCursor: string | null; recovery: unknown };
type EarlierStatus = "idle" | "loading" | "error";
export type EarlierMessagesView = { allLoaded: boolean; hasMore: boolean; onLoad: () => void; status: EarlierStatus };

function mergeRecovery(recoveries: readonly unknown[]): unknown {
  const parsed = recoveries.flatMap((recovery) => {
    const result = aiSessionArtifactRecoverySchema.safeParse(recovery);
    return result.success ? [result.data] : [];
  });
  if (parsed.length === 0) return recoveries[0];
  return {
    turns: parsed.flatMap((recovery) => recovery.turns),
    truncated: parsed.some((recovery) => recovery.truncated),
    ...(parsed.some((recovery) => recovery.unavailable) ? { unavailable: true } : {}),
    ...(parsed.some((recovery) => recovery.oversized) ? { oversized: true } : {}),
  };
}

function recoveryIncomplete(recovery: unknown): boolean {
  const parsed = aiSessionArtifactRecoverySchema.safeParse(recovery);
  return parsed.success && Boolean(parsed.data.unavailable || parsed.data.oversized);
}
type ConversationJournalState = {
  draftMessage: string; latestData: AiConversationPayload | null; resolvedConversationId: string | null;
  savedSessionId: string | null; sessionSnapshot: AiSession | null; pendingSave: PendingSessionSave | null;
  saveError: string | null; saveNotice: string | null; sendError: string | null; sendCode: string | null; failedRequest: SendRequest | null;
  actionError: string | null; acceptedTaskId: string | null; taskInteractionResolution: "accepted" | "dismissed" | null;
  selectedReferences: AiSessionReferenceContract[];
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

function rawConversationThread(payload: AiConversationPayload, fallbackTitle: string, language: "en" | "ja" | "zh"): ConversationThreadView {
  return {
    ...conversationPayloadToThreadView(payload, language),
    title: payload.conversations.find(item => item.conversationId === payload.activeConversationId)?.title || fallbackTitle,
    assistantMessage: payload.assistantMessage,
    messages: payload.messages.map(item => ({ id: item.messageId, role: item.role, content: item.content, createdAt: item.createdAt }))
  };
}

function rawSessionThread(session: AiSession, recovery: unknown, translate: OrbitTranslator, language: "en" | "ja" | "zh"): ConversationThreadView {
  const parsed = aiSessionArtifactRecoverySchema.safeParse(recovery);
  return {
    activeConversationId: session.id, title: session.customTitle?.trim() || session.title,
    assistantMessage: session.messages.findLast(item => item.role === "assistant")?.text ?? "",
    messages: session.messages.map((item, index) => ({ id: item.id ?? `${session.id}:message:${index}`, role: item.role, content: item.text, createdAt: typeof item.createdAt === "string" ? item.createdAt : session.updatedAt })),
    nextAction: "", proposedToolIntents: [], contactArtifacts: sessionContactArtifacts(session, recovery),
    // Sprint 0112: a restored turn's cards render under that turn's reply.
    entityCards: null, entityCardTurns: sessionEntityCardTurns(session, recovery, translate, language),
    contactArtifactNotice: parsed.success && Boolean(parsed.data.truncated || parsed.data.unavailable || parsed.data.oversized)
  };
}

export function AiConversationScreen({ scopeKey, isScopeCurrent = () => true, claimInitialPrompt, allowInitialPrompt = true, initialDraft, initialReferences = [], journal: providedJournal, sessionOrigin }: {
  scopeKey?: string; isScopeCurrent?: () => boolean; claimInitialPrompt?: () => boolean; allowInitialPrompt?: boolean; initialDraft?: string; initialReferences?: readonly AiSessionReferenceContract[]; journal?: AiConversationJournal; sessionOrigin?: AiSessionOriginInputContract;
} = {}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const viewport = useMobileViewport();
  const { id, initialMessage, initialMessageConsumed, source, sourceNoteId, sourceNoteVersion } = useLocalSearchParams<{
    id?: string | string[]; initialMessage?: string | string[]; initialMessageConsumed?: string | string[]; source?: string | string[]; sourceNoteId?: string | string[]; sourceNoteVersion?: string | string[];
  }>();
  const conversationId = firstParam(id);
  const initialPrompt = allowInitialPrompt ? optionalParam(initialMessage).trim() : "";
  const sourceNote = noteSourceFromParams({ sourceNoteId, sourceNoteVersion });
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
  // Private artifact evidence must be reauthorized, not retained after a failed refresh.
  const state = useApiResource<unknown>(path, () => false, { ...readOptions, cachePolicy: "network-only" });
  const [draftMessage, setDraftMessage] = useJournalState(journal, "draftMessage", isDraftConversation && optionalParam(initialMessageConsumed) !== "1" ? initialDraft ?? initialPrompt : "");
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
  const [selectedReferences, setSelectedReferences] = useJournalState(journal, "selectedReferences", initialReferences.map(reference => ({ ...reference })));
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskInteractionBusy, setTaskInteractionBusy] = useState(false);
  // Sprint 0085: the card the user is being asked to confirm. Edits live here
  // until they confirm, so a correction never writes on its own.
  const [entityDraftBusy, setEntityDraftBusy] = useState(false);
  const [entityDraftOverride, setEntityDraftOverride] = useState<AiEntityDraft | null>(null);
  const [entityDraftEdits, setEntityDraftEdits] = useState<Record<string, string>>({});
  const [acceptedTaskId, setAcceptedTaskId] = useJournalState(journal, "acceptedTaskId", null);
  const [taskInteractionResolution, setTaskInteractionResolution] = useJournalState(journal, "taskInteractionResolution", null);
  const submittedInitialPrompt = useRef<string | null>(null);
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const sendOperation = useRef<AbortController | null>(null);
  const saveOperation = useRef<AbortController | null>(null);
  const taskOperation = useRef<AbortController | null>(null);
  const earlierOperation = useRef<AbortController | null>(null);
  const [earlierPages, setEarlierPages] = useState<EarlierPage[]>([]);
  const [earlierStatus, setEarlierStatus] = useState<EarlierStatus>("idle");
  const [firstRecoveryOverride, setFirstRecoveryOverride] = useState<unknown>(undefined);
  const refreshOverlay = useRef<unknown>(undefined);
  const owns = () => mounted.current && isScopeCurrent();
  const ownsRequest = (controller: AbortController) => owns() && !controller.signal.aborted;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (journal.interruptedRequest) {
        journal.failedRequest = journal.interruptedRequest;
        journal.sendError = locale.t("aiConversation.interrupted");
      }
      if (journal.pendingSave) journal.saveError = locale.t("aiConversation.savePending");
      requests.current.forEach(controller => controller.abort()); requests.current.clear();
    };
  }, [client, scopeKey]);
  useEffect(() => {
    setEarlierPages([]); setEarlierStatus("idle"); setFirstRecoveryOverride(undefined);
  }, [conversationId]);
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
  // Sprint 0118 (AI B3): an opened stored session is kept on the device. Opening marks it opened; the
  // device copy shows at once and whenever the server cannot be read, with the cards of the last online read.
  const localConversation = useLocalAiConversation(isStoredAgentSession && !isDraftConversation ? conversationId : null);
  const localSessionList = useLocalAiSessions(false);
  const serverUnreachable = state.kind === "offline" || state.kind === "failure";
  const localSummary = localSessionList.rows.find((row) => row.id === conversationId) ?? null;
  const localSession: AiSession | null = isStoredAgentSession && !loadedSession && localConversation.messages.length > 0 && (state.kind === "loading" || serverUnreachable)
    ? {
        id: conversationId, title: localSummary?.title ?? locale.t("aiConversation.sessionTitle"), createdAt: localSummary?.createdAt ?? new Date(0).toISOString(),
        updatedAt: localSummary?.updatedAt ?? new Date(0).toISOString(), ...(localSummary?.organization.customTitle ? { customTitle: localSummary.organization.customTitle } : {}),
        messages: localConversation.messages.map((message) => ({ id: message.id, role: message.role, text: message.text, ...(message.references ? { references: message.references } : {}) })),
      } as AiSession
    : null;
  const conversationOffline = Boolean(localSession) && serverUnreachable;
  const missingLocalSessionOffline = isStoredAgentSession && !localSession
    && localConversation.freshness.readable && localConversation.freshness.offline && serverUnreachable;
  const saveLocalCards = localConversation.saveCards;
  // Keyed on the read itself (a new object only when the server answered again), not on the parsed
  // session, which is a new object on every render.
  useEffect(() => {
    if (loadedSession && sessionRead?.success && sessionRead.data.artifactRecovery !== undefined) saveLocalCards(sessionRead.data.artifactRecovery);
  }, [loadedData, saveLocalCards]);
  const conversationRead = loadedData && !isStoredAgentSession ? aiConversationListSchema.safeParse(loadedData) : null;
  const readInvalid = loadedData !== null && (isStoredAgentSession ? !loadedSession : !conversationRead?.success);
  const previousSession = sessionSnapshot ?? loadedSession;
  // Sprint 0112: the first page comes from the resource; older pages are
  // prepended as the reader asks for them, each with its own turns' cards.
  const firstPage = sessionRead?.success ? sessionRead.data.page : undefined;
  const lastEarlierPage = earlierPages.at(-1);
  const earlierCursor = lastEarlierPage ? lastEarlierPage.nextCursor : firstPage?.nextCursor ?? null;
  const hasEarlier = Boolean(earlierCursor) && (lastEarlierPage ? lastEarlierPage.hasMore : firstPage?.hasMore === true);
  const earlierMessages = [...earlierPages].reverse().flatMap((page) => page.messages);
  const firstRecovery = firstRecoveryOverride ?? (sessionRead?.success ? sessionRead.data.artifactRecovery : undefined);
  const combinedRecovery = earlierPages.length ? mergeRecovery([firstRecovery, ...earlierPages.map((page) => page.recovery)]) : firstRecovery;
  const withEarlier = (session: AiSession): AiSession => {
    if (earlierMessages.length === 0) return session;
    const ids = new Set(session.messages.flatMap((message) => message.id ? [message.id] : []));
    return { ...session, messages: [...earlierMessages.filter((message) => !message.id || !ids.has(message.id)), ...session.messages] };
  };
  const earlier: EarlierMessagesView = {
    allLoaded: Boolean(firstPage) && !hasEarlier && earlierPages.length > 0,
    hasMore: hasEarlier,
    onLoad: () => { void loadEarlier(); },
    status: earlierStatus,
  };
  const generatedThread = latestData ? rawConversationThread(latestData, locale.t("aiConversation.sessionTitle"), locale.language) : null;
  const previousThread = generatedThread && previousSession ? rawSessionThread(withEarlier(previousSession), combinedRecovery, locale.t, locale.language) : null;
  const submittedMessage = journal.interruptedRequest?.message ?? failedRequest?.message;
  const initialThread: ConversationThreadView | null = !isDraftConversation ? null : submittedMessage ? pendingConversationThreadView(submittedMessage, locale.language)
    : { activeConversationId: null, assistantMessage: "", messages: [], nextAction: "", proposedToolIntents: [], title: locale.t("aiConversation.newChat") };
  const resolvedThread = generatedThread
    ? previousThread
      ? { ...generatedThread, title: previousThread.title, messages: previousThread.messages, entityCardTurns: previousThread.entityCardTurns ?? [] }
      : generatedThread
    : loadedSession ? rawSessionThread(withEarlier(loadedSession), combinedRecovery, locale.t, locale.language)
    : localSession ? rawSessionThread(localSession, localConversation.cards, locale.t, locale.language)
    : conversationRead?.success ? rawConversationThread(conversationRead.data, locale.t("aiConversation.sessionTitle"), locale.language)
    : initialThread && failedRequest ? { ...initialThread, title: locale.t("aiConversation.noAnswer"), messages: initialThread.messages.filter(item => item.role === "user") } : initialThread;
  const resultScopeReady = owns() && (isDraftConversation || (!state.refreshing && (state.kind === "success" || state.kind === "empty") && !readInvalid));
  const thread = resolvedThread ? { ...resolvedThread, contactArtifacts: resultScopeReady ? resolvedThread.contactArtifacts ?? [] : [] } : null;

  function changeDraft(value: string) {
    if (!owns()) return;
    draftValue.current = value;
    draftRevision.current++;
    journal.draftRevision = draftRevision.current;
    setDraftMessage(value);
  }

  async function loadEarlier() {
    const cursor = earlierCursor;
    if (!owns() || !cursor || !hasEarlier || earlierOperation.current) return;
    const controller = new AbortController(); earlierOperation.current = controller; requests.current.add(controller);
    setEarlierStatus("loading");
    const result = await client.get<unknown>(`${aiConversationSessionPath(conversationId)}?${new URLSearchParams({ cursor }).toString()}`, { signal: controller.signal });
    if (!ownsRequest(controller)) return;
    requests.current.delete(controller); earlierOperation.current = null;
    const parsed = result.success && result.status >= 200 && result.status < 300 ? aiSessionReadSchema.safeParse(result.data) : null;
    const read = parsed?.success ? parsed.data : null;
    if (!read?.session || read.session.id !== conversationId || !read.page) { setEarlierStatus("error"); return; }
    const page: EarlierPage = { cursor, hasMore: read.page.hasMore, messages: read.session.messages, nextCursor: read.page.nextCursor, recovery: read.artifactRecovery };
    setEarlierPages(earlierPages.some((existing) => existing.cursor === cursor) ? earlierPages : [...earlierPages, page]);
    setEarlierStatus("idle");
  }

  /** Re-reads only the pages whose cards could not all be restored. */
  async function retryCards() {
    if (!owns() || earlierOperation.current) return;
    const controller = new AbortController(); earlierOperation.current = controller; requests.current.add(controller);
    const reread = async (cursor: string | null) => {
      const path = cursor ? `${aiConversationSessionPath(conversationId)}?${new URLSearchParams({ cursor }).toString()}` : aiConversationSessionPath(conversationId);
      const result = await client.get<unknown>(path, { signal: controller.signal });
      const parsed = result.success && result.status >= 200 && result.status < 300 ? aiSessionReadSchema.safeParse(result.data) : null;
      return parsed?.success && parsed.data.session?.id === conversationId ? parsed.data.artifactRecovery : undefined;
    };
    if (recoveryIncomplete(firstRecovery)) {
      const recovery = await reread(null);
      if (!ownsRequest(controller)) return;
      if (recovery !== undefined) setFirstRecoveryOverride(recovery);
    }
    const next: EarlierPage[] = [];
    for (const page of earlierPages) {
      const recovery = recoveryIncomplete(page.recovery) ? await reread(page.cursor) : undefined;
      if (!ownsRequest(controller)) return;
      next.push(recovery !== undefined ? { ...page, recovery } : page);
    }
    setEarlierPages(next);
    requests.current.delete(controller); earlierOperation.current = null;
  }

  function refresh() {
    if (!owns()) return;
    // Refresh reads only. It never consumes a draft or replays an initial write.
    if (!isDraftConversation && !sendOperation.current && !saveOperation.current && !taskOperation.current && !pendingSaveRef.current
      && (state.kind === "success" || state.kind === "empty")) refreshOverlay.current = state.data;
    state.refresh();
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
        references: selectedReferences,
        sessionId,
      },
    };
  }

  async function persistAndCanonicalizeDraftConversation(pending: PendingSessionSave) {
    if (!owns() || saveOperation.current) return;
    const controller = new AbortController();
    saveOperation.current = controller; requests.current.add(controller);
    setSaving(true); setSaveError(null);
    // Sprint 0112: only this turn's messages are sent; the server merges them by
    // id and never drops messages the client has not loaded.
    const posted: AiSession = pending.delta ? { ...pending.session, messages: pending.delta } : pending.session;
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.aiConversationSessions, { body: { session: posted }, signal: controller.signal });
    if (!ownsRequest(controller)) return;
    if (result.success && result.status >= 200 && result.status < 300 && aiSessionReceiptMatches(result.data, posted)) {
      const receipt = aiSessionReadSchema.parse(result.data).session!;
      const saved: AiSession = pending.delta ? { ...receipt, messages: pending.session.messages } : receipt;
      const limited = posted.messages.length > receipt.messages.length
        || posted.messages.some(message => message.text.trim().length > 12000)
        || pending.session.title.trim().length > 120 || (pending.session.customTitle?.trim().length ?? 0) > 120;
      setSavedSessionId(saved.id);
      setSessionSnapshot(saved);
      if (limited) setSaveNotice(locale.t("aiConversation.savedTruncated"));
      pendingSaveRef.current = null; setPendingSave(null);
      if (pending.canonicalize && !pending.waitForTask && !limited && !saveNotice && draftRevision.current === pending.revision && !draftValue.current.trim()) {
        router.replace({ params: { id: saved.id, source: "session" }, pathname: "/ai/[id]" });
      }
    } else {
      setSaveError(result.success ? locale.t("aiConversation.generatedUnsaved") : locale.t("aiConversation.saveFailure", { error: result.error.message }));
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
    setActionError(null);
    // Sprint 0085: a new question clears the card the previous reply offered.
    setEntityDraftOverride(null); setEntityDraftEdits({});
    const result = await client.post<unknown>(request.path, {
      body: {
        locale: locale.language,
        message: request.message,
        ...(request.history ? { history: request.history } : {}),
        ...(request.sourceNote ? { sourceNote: request.sourceNote } : {}),
        ...(request.reliable ? {
          ...request.reliable,
          protocolVersion: 2,
          references: request.reliable.references
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
      const nextThread = rawConversationThread(payload, locale.t("aiConversation.sessionTitle"), locale.language);
      const preserveSourceDraft = Boolean(request.sourceNote && ["failed", "needs_date_confirmation"].includes(nextThread.taskInteraction?.state ?? ""));
      if (draftRevision.current === request.revision && !preserveSourceDraft) { draftValue.current = ""; setDraftMessage(""); }
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
        let session: AiSession = previousSession
          ? { ...previousSession, messageRevision: receipt?.messageRevision, messages: [...previousSession.messages, ...messages], updatedAt: now }
          : { id: request.reliable.sessionId, title: request.message.slice(0, 120), createdAt: messages[0]?.createdAt ?? now, updatedAt: now, pinned: false, messageRevision: receipt?.messageRevision, messages };
        if (!previousSession && sessionOrigin?.initialGroupId) {
          const grouped = await updateAiSessionOrganization(client, session.id, {
            expectedRevision: 0,
            mutationId: randomUUID(),
            patch: { groupId: sessionOrigin.initialGroupId },
          }, controller.signal);
          if (!ownsRequest(controller)) return;
          if (grouped.ok && grouped.value.organization) {
            session = {
              ...session,
              customTitle: grouped.value.organization.customTitle ?? undefined,
              organization: grouped.value.organization,
              pinned: grouped.value.organization.pinned,
            };
          } else {
            setSaveNotice(locale.t("aiConversation.groupFailure"));
          }
        }
        setSavedSessionId(session.id);
        setSessionSnapshot(session);
        pendingSaveRef.current = null; setPendingSave(null);
        if (isDraftConversation && !nextThread.taskInteraction?.state && draftRevision.current === request.revision && !draftValue.current.trim()) {
          router.replace({ params: { id: session.id, source: "session" }, pathname: "/ai/[id]" });
        }
      } else if (isDraftConversation || isStoredAgentSession || previousSession) {
        const turnStart = payload.messages.findLastIndex(item => item.role === "user");
        const messages = payload.messages.slice(turnStart).filter((item): item is typeof item & { role: "user" | "assistant" } => item.role === "user" || item.role === "assistant")
          .map(item => ({
            ...(item.role === "user" && request.reliable?.references.length
              ? { references: request.reliable.references.map(reference => ({ ...reference })) }
              : {}),
            role: item.role,
            text: item.content,
          }));
        const runId = conversationAiRunReferencesFor(payload)[0]?.id;
        const identity = (runId || `${payload.activeConversationId}-${Date.now()}`).replace(/[^A-Za-z0-9_-]/gu, "-");
        const now = new Date().toISOString();
        const session: AiSession = previousSession
          ? { ...previousSession, messages: [...previousSession.messages, ...messages], updatedAt: now }
          : { id: `agent-session-mobile-${identity}`, title: request.message.slice(0, 120), createdAt: now, updatedAt: now, pinned: false, messages };
        const pending: PendingSessionSave = { session, delta: messages, revision: request.revision, canonicalize: isDraftConversation, waitForTask: ["suggested", "needs_date_confirmation"].includes(nextThread.taskInteraction?.state ?? "") };
        setSessionSnapshot(session); pendingSaveRef.current = pending; setPendingSave(pending);
        await persistAndCanonicalizeDraftConversation(pending);
      }
    } else {
      setFailedRequest(request);
      const unknown = Boolean(request.reliable) && (!result.success || receipt?.state === "pending" || receipt?.state === "outcome_unknown");
      setSendError(unknown ? locale.t("aiConversation.outcomeUnknown") : result.success ? locale.t("aiConversation.incomplete") : result.error.message);
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
    await submitRequest(requestForSend({ path: sendPath, message, revision: draftRevision.current, history: history?.length ? history : undefined, ...(sourceNote ? { sourceNote } : {}) }));
  }

  function addMention(contact: MentionContact) {
    if (!owns() || selectedReferences.some(reference => reference.type === "contact" && reference.id === contact.id)) return;
    setSelectedReferences([...selectedReferences, { id: contact.id, type: "contact" }]);
    if (!draftValue.current.includes(`@${contact.name}`)) changeDraft(`${draftValue.current}${draftValue.current && !/\s$/u.test(draftValue.current) ? " " : ""}@${contact.name} `);
  }

  function removeReference(reference: AiSessionReferenceContract) {
    if (!owns()) return;
    setSelectedReferences(selectedReferences.filter(item => item.type !== reference.type || item.id !== reference.id));
  }

  useEffect(() => {
    if (!owns() || !isDraftConversation || !initialPrompt || submittedInitialPrompt.current === initialPrompt) return;
    submittedInitialPrompt.current = initialPrompt;
    if (!claimInitialPrompt?.()) {
      if (optionalParam(initialMessageConsumed) === "1" && !latestData && !failedRequest) {
        setFailedRequest({ path: ORBIT_API_ENDPOINTS.conversations, message: initialPrompt, revision: draftRevision.current, ...(sourceNote ? { sourceNote } : {}) });
        setSendError(locale.t("aiConversation.duplicateUnknown"));
      }
      return;
    }
    void submitRequest(requestForSend({ path: ORBIT_API_ENDPOINTS.conversations, message: initialPrompt, revision: draftRevision.current, ...(sourceNote ? { sourceNote } : {}) }));
  }, [client, initialPrompt, isDraftConversation, sourceNote?.id, sourceNote?.version]);

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
    setSendError(recovery ? locale.t("aiConversation.stillUnknown") : result.success ? locale.t("aiConversation.inspectLater") : result.error.message);
    setSendCode(recovery?.receipt.state ?? (result.success ? "OUTCOME_UNKNOWN" : result.error.code));
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
      if (savedSessionId && !saveNotice && !draftValue.current.trim()) router.replace({ params: { id: savedSessionId, source: "session" }, pathname: "/ai/[id]" });
    } else setActionError(result.success ? locale.t("aiConversation.operationUnconfirmed") : result.error.message);
    requests.current.delete(controller); taskOperation.current = null; setTaskInteractionBusy(false);
  }

  /**
   * The only path from a card to a record. Field edits are sent as a revision
   * first, so the write carries what the user sees rather than what the model
   * first proposed.
   */
  async function resolveEntityDraft(action: "confirm" | "cancel") {
    const draft = entityDraftOverride ?? thread?.entityDraft ?? null;
    if (!owns() || !draft || entityDraftBusy || taskOperation.current || sendOperation.current) return;
    const controller = new AbortController(); taskOperation.current = controller; requests.current.add(controller);
    setEntityDraftBusy(true); setActionError(null);

    const edits = Object.entries(entityDraftEdits).filter(([, value]) => value.trim());
    let current = draft;
    if (action === "confirm" && edits.length > 0) {
      const revised = await client.post<unknown>(aiEntityDraftActionPath(draft.draftId), {
        body: { action: "revise", fields: Object.fromEntries(edits.map(([k, v]) => [k, v.trim()])) },
        signal: controller.signal,
      });
      if (!ownsRequest(controller)) return;
      const next = revised.success && revised.status >= 200 && revised.status < 300
        ? readAiEntityDraft((revised.data as { draft?: unknown } | null)?.draft)
        : null;
      if (!next) {
        setActionError(revised.success ? locale.t("aiConversation.operationUnconfirmed") : revised.error.message);
        requests.current.delete(controller); taskOperation.current = null; setEntityDraftBusy(false);
        return;
      }
      current = next;
      setEntityDraftOverride(next);
      setEntityDraftEdits({});
    }

    const result = await client.post<unknown>(aiEntityDraftActionPath(current.draftId), {
      body: { action }, signal: controller.signal,
    });
    if (!ownsRequest(controller)) return;
    const settled = result.success && result.status >= 200 && result.status < 300
      ? readAiEntityDraft((result.data as { draft?: unknown } | null)?.draft)
      : null;
    if (settled) {
      setEntityDraftOverride(settled);
    } else {
      // A refused write keeps the card confirmable; show the server's reason
      // rather than a generic failure the user cannot act on.
      setActionError(result.success ? locale.t("aiConversation.operationUnconfirmed") : result.error.message);
    }
    requests.current.delete(controller); taskOperation.current = null; setEntityDraftBusy(false);
  }

  function openHref(href: string) {
    if (owns()) router.push(href as Href);
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.readingSafeArea,
        viewport.visibleHeight === null
          ? null
          : { height: viewport.visibleHeight, maxHeight: viewport.visibleHeight }
      ]}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top} style={[styles.readingRoot, !thread ? styles.readingFallback : null]}>
      {!thread ? <Pressable accessibilityLabel={locale.t("aiConversation.back")} accessibilityRole="button" onPress={() => { if (owns()) router.back(); }} style={styles.backButton}>
        <Ionicons color={colors.ink} name="arrow-back-outline" size={24} />
      </Pressable> : null}
      {!isDraftConversation && state.kind === "loading" && !localSession ? <LoadingState /> : null}
      {conversationOffline ? <OfflineNotice lastSyncedAt={localConversation.freshness.lastSyncedAt} /> : null}
      {!isDraftConversation && !conversationOffline && (state.kind === "offline" || missingLocalSessionOffline) ? (
        <NeedsNetworkState message={locale.t("sync.notOnDevice")} onRetry={refresh} />
      ) : null}
      {!isDraftConversation && !conversationOffline && !missingLocalSessionOffline && state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {readInvalid ? <ErrorState title={locale.t("aiConversation.readUnreadable")} message={locale.t("aiConversation.readInvalid")} /> : null}
      {!thread && state.kind !== "loading" ? <Pressable accessibilityRole="button" onPress={refresh} style={styles.failureSecondary}><Text style={styles.failureSecondaryText}>{locale.t("aiConversation.retryRead")}</Text></Pressable> : null}
      {state.kind === "empty" && !thread ? (
        <EmptyState message={locale.t("aiConversation.emptyBody")} title={locale.t("aiConversation.emptyTitle")} />
      ) : null}
      {thread ? (
        <ConversationThread
          baseUrl={baseUrl}
          scopeKey={scopeKey}
          draftMessage={draftMessage}
          selectedReferences={selectedReferences}
          onBack={() => openHref("/ai")}
          onChangeDraft={changeDraft}
          onAddMention={addMention}
          onRemoveReference={removeReference}
          onOpenHref={openHref}
          onResolveTaskSuggestion={resolveTaskSuggestion}
          onRefresh={refresh}
          refreshing={state.refreshing}
          earlier={earlier}
          onRetryCards={recoveryIncomplete(combinedRecovery) ? () => { void retryCards(); } : undefined}
          onSend={sendMessage}
          sendError={sendError}
          sendCode={sendCode}
          actionError={actionError}
          saveError={saveError}
          saveNotice={saveNotice}
          saving={saving}
          writingBlocked={!!pendingSave || saving || taskInteractionBusy || conversationOffline}
          sendLabelSuffix={conversationOffline ? locale.t("sync.needsNetwork") : undefined}
          retrySendLabel={locale.t(failedRequest?.reliable && ["OUTCOME_UNKNOWN", "pending", "outcome_unknown"].includes(sendCode ?? "") ? "aiConversation.checkResult" : "aiConversation.regenerate")}
          onRetrySend={() => { if (failedRequest) void recoverRequest(failedRequest); }}
          onEditQuestion={() => { if (failedRequest && owns()) { changeDraft(failedRequest.message); setSendError(null); setSendCode(null); } }}
          onRetrySave={() => { if (pendingSave) void persistAndCanonicalizeDraftConversation(pendingSave); }}
          sending={sending}
          taskInteractionBusy={taskInteractionBusy}
          taskInteractionResolution={taskInteractionResolution}
          entityDraftBusy={entityDraftBusy}
          entityDraftEdits={entityDraftEdits}
          entityDraftOverride={entityDraftOverride}
          onEditEntityDraftField={(field, value) =>
            setEntityDraftEdits((previous) => ({ ...previous, [field]: value }))}
          onResolveEntityDraft={resolveEntityDraft}
          thread={acceptedTaskId && thread.taskInteraction ? { ...thread, taskInteraction: { ...thread.taskInteraction, taskId: acceptedTaskId } } : thread}
        />
      ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConversationThread({
  baseUrl,
  scopeKey,
  draftMessage,
  selectedReferences,
  onBack,
  onChangeDraft,
  onAddMention,
  onRemoveReference,
  onOpenHref,
  onResolveTaskSuggestion,
  onRefresh,
  refreshing,
  earlier,
  onRetryCards,
  onSend,
  sendError,
  sendCode,
  actionError,
  saveError,
  saveNotice,
  saving,
  writingBlocked,
  sendLabelSuffix,
  onRetrySend,
  retrySendLabel,
  onEditQuestion,
  onRetrySave,
  sending,
  taskInteractionBusy,
  taskInteractionResolution,
  entityDraftBusy,
  entityDraftEdits,
  entityDraftOverride,
  onEditEntityDraftField,
  onResolveEntityDraft,
  thread
}: {
  baseUrl: string;
  scopeKey?: string | undefined;
  draftMessage: string;
  selectedReferences: readonly AiSessionReferenceContract[];
  onBack: () => void;
  onChangeDraft: (value: string) => void;
  onAddMention: (contact: MentionContact) => void;
  onRemoveReference: (reference: AiSessionReferenceContract) => void;
  onOpenHref: (href: string) => void;
  onResolveTaskSuggestion: (action: "accept" | "dismiss") => void;
  onRefresh: () => void;
  refreshing: boolean;
  earlier?: EarlierMessagesView;
  onRetryCards?: (() => void) | undefined;
  onSend: () => void;
  sendError: string | null;
  sendCode: string | null;
  actionError: string | null;
  saveError: string | null;
  saveNotice: string | null;
  saving: boolean;
  writingBlocked: boolean;
  /** Sprint 0118: "needs a connection" while the conversation shows its offline device copy. */
  sendLabelSuffix?: string | undefined;
  onRetrySend: () => void;
  retrySendLabel: string;
  onEditQuestion: () => void;
  onRetrySave: () => void;
  sending: boolean;
  taskInteractionBusy: boolean;
  taskInteractionResolution: "accepted" | "dismissed" | null;
  entityDraftBusy: boolean;
  entityDraftEdits: Record<string, string>;
  entityDraftOverride: AiEntityDraft | null;
  onEditEntityDraftField: (field: string, value: string) => void;
  onResolveEntityDraft: (action: "confirm" | "cancel") => void;
  thread: ConversationThreadView;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const [routesOpen, setRoutesOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [referenceNames, setReferenceNames] = useState<Record<string, string>>({});
  const { fontScale } = useWindowDimensions();
  const minimumInputHeight = Math.max(44, Math.ceil(22 * fontScale + 12));
  const [inputHeight, setInputHeight] = useState(44);
  const historyScroll = useRef<ScrollView>(null);
  const followNewMessages = useRef(false);
  // Sprint 0112: when earlier messages are prepended, keep what the reader sees in place.
  const contentHeight = useRef(0);
  const scrollOffset = useRef(0);
  const userDragged = useRef(false);
  const messageCount = useRef(thread.messages.length);
  messageCount.current = thread.messages.length;
  const pendingAnchor = useRef<{ count: number; height: number; offset: number } | null>(null);
  // Prepended messages can lay out in more than one pass (text, then cards); keep
  // compensating their growth briefly unless the reader starts scrolling.
  const settlingAnchor = useRef<{ height: number; until: number } | null>(null);
  const turnCards = new Map((thread.entityCardTurns ?? []).map((turn) => [turn.assistantMessageId, turn.cards]));
  const requestEarlier = () => {
    if (!earlier || earlier.status === "loading" || !earlier.hasMore) return;
    pendingAnchor.current = { count: thread.messages.length, height: contentHeight.current, offset: scrollOffset.current };
    earlier.onLoad();
  };
  useEffect(() => { if (earlier?.status === "error") pendingAnchor.current = null; }, [earlier?.status]);
  // The latest assistant turn anchors both the inline panels and the entity
  // cards. Matching on message id instead looks tidier but breaks on the
  // reliable-send path, which rebuilds the saved session's messages with
  // client-side ids — the cards then silently render nowhere.
  const inlinePanelAnchorIndex = thread.messages.reduce(
    (lastIndex, message, index) => (message.role === "assistant" ? index : lastIndex),
    -1
  );
  // The override is what the user has been acting on; the thread value is what
  // the latest reply carried. A settled card stays visible so the transcript
  // still reads as a sequence of decisions.
  const draft = entityDraftOverride ?? thread.entityDraft ?? null;
  const draftCardView = draft
    ? aiEntityDraftCardView(
        Object.keys(entityDraftEdits).length > 0
          ? { ...draft, fields: { ...draft.fields, ...entityDraftEdits } }
          : draft,
        locale.t,
      )
    : null;

  return (
    <View style={styles.threadSurface}>
      <View accessibilityLabel={locale.t("aiConversation.navigation")} style={styles.threadHeader}>
        <Pressable accessibilityLabel={locale.t("aiConversation.back")} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onBack(); }} style={styles.backButton}>
          <Ionicons color={colors.ink} name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.threadTitleBlock}>
          <View style={styles.threadBrand}><Image accessible={false} source={iorbitBrandMark} testID="iorbit-brand-mark" style={styles.brandMark} /><Text style={styles.threadEyebrow}>IORBIT</Text></View>
          <Text numberOfLines={1} style={styles.threadTitle}>
            {thread.title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={locale.t("aiConversation.moreOptions")}
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
          // Scrolling back up to the top of the history loads the page before it.
          const movingUp = contentOffset.y < scrollOffset.current;
          scrollOffset.current = contentOffset.y;
          if (userDragged.current && movingUp && contentOffset.y < 48) requestEarlier();
        }}
        onScrollBeginDrag={() => { userDragged.current = true; settlingAnchor.current = null; }}
        scrollEventThrottle={100}
        onContentSizeChange={(_width, height) => {
          const anchor = pendingAnchor.current;
          contentHeight.current = height;
          if (anchor && messageCount.current > anchor.count) {
            pendingAnchor.current = null;
            settlingAnchor.current = { height, until: Date.now() + 1500 };
            const y = Math.max(0, anchor.offset + height - anchor.height);
            scrollOffset.current = y;
            historyScroll.current?.scrollTo({ y, animated: false });
            return;
          }
          const settling = settlingAnchor.current;
          if (settling && Date.now() < settling.until) {
            const y = Math.max(0, scrollOffset.current + height - settling.height);
            settlingAnchor.current = { ...settling, height };
            scrollOffset.current = y;
            historyScroll.current?.scrollTo({ y, animated: false });
            return;
          }
          settlingAnchor.current = null;
          if (followNewMessages.current) historyScroll.current?.scrollToEnd({ animated: true });
        }}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={colors.accent} />}
        style={styles.readingHistory}
      >
      <View style={styles.messagePanel}>
        {earlier && (earlier.hasMore || earlier.status === "error") ? (
          earlier.status === "loading" ? (
            <View accessibilityLiveRegion="polite" style={styles.earlierRow}>
              <Text style={styles.earlierMuted}>{locale.t("aiConversation.loadingEarlier")}</Text>
            </View>
          ) : earlier.status === "error" ? (
            <View style={[styles.earlierRow, styles.earlierFailure]}>
              <Text accessibilityRole="alert" style={styles.earlierError}>{locale.t("aiConversation.loadEarlierFailed")}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={requestEarlier} style={({ pressed }) => [styles.earlierInline, pressed ? styles.pressed : null]}>
                <Text style={styles.earlierLink}>{locale.t("aiConversation.retryEarlier")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={requestEarlier} style={({ pressed }) => [styles.earlierRow, styles.earlierButton, pressed ? styles.pressed : null]}>
              <Text style={styles.earlierLink}>{locale.t("aiConversation.loadEarlier")}</Text>
            </Pressable>
          )
        ) : earlier?.allLoaded ? (
          <View style={styles.earlierRow}><Text style={styles.earlierMuted}>{locale.t("aiConversation.allMessagesLoaded")}</Text></View>
        ) : null}
        {thread.messages.length === 0 ? (
          <EmptyState message={locale.t("aiConversation.emptyBody")} title={locale.t("aiConversation.emptyTitle")} />
        ) : (
          <View style={styles.messageStack}>
            {thread.messages.map((message, index) => (
              <Fragment key={message.id}>
                <MessageBubble baseUrl={baseUrl} message={message} onOpenHref={onOpenHref} />
                {turnCards.get(message.id)?.length ? (
                  <AiEntityCardList onOpenHref={onOpenHref} views={turnCards.get(message.id)!} />
                ) : null}
                {/* Sprint 0094: one card shape for all five entities. The contact
                    panel that used to be here rendered only contact recommendations
                    and marked everything else "unsupported", which is why events,
                    tasks, schedules and notes never appeared as cards at all. */}
                {index === inlinePanelAnchorIndex && thread.entityCards?.cards.length ? (
                  <AiEntityCardList onOpenHref={onOpenHref} views={thread.entityCards.cards} />
                ) : null}
              </Fragment>
            ))}
          </View>
        )}
      </View>
      {thread.contactArtifactNotice ? <Text accessibilityRole="alert" style={{ ...textStyles.small, color: colors.ink }}>{locale.t("aiContactArtifact.partial")}</Text> : null}
      {thread.contactArtifactNotice && onRetryCards ? (
        <Pressable accessibilityRole="button" onPress={onRetryCards} style={({ pressed }) => [styles.earlierInline, pressed ? styles.pressed : null]}>
          <Text style={styles.earlierLink}>{locale.t("aiConversation.retryCards")}</Text>
        </Pressable>
      ) : null}
      {thread.taskInteraction ? (
        <TaskInteractionCard
          busy={taskInteractionBusy}
          interaction={thread.taskInteraction}
          onResolve={onResolveTaskSuggestion}
          onOpenHref={onOpenHref}
          resolution={taskInteractionResolution}
        />
      ) : null}
      {draftCardView ? (
        <AiEntityDraftCard
          busy={entityDraftBusy}
          onCancel={() => onResolveEntityDraft("cancel")}
          onConfirm={() => onResolveEntityDraft("confirm")}
          onEditField={onEditEntityDraftField}
          onOpenRecord={onOpenHref}
          view={draftCardView}
        />
      ) : null}
      {thread.proposedToolIntents.length > 0 ? (
        <View style={styles.intentPanel}>
          <Text style={styles.panelTitle}>{locale.t("aiConversation.suggestedActions")}</Text>
          {thread.proposedToolIntents.map((intent) => (
            <View key={intent.id} style={styles.intentBlock}>
              <Text style={styles.intentTitle}>{intent.label}</Text>
              <Text style={styles.bodyText}>{intent.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {/* Sprint 0085: the "AI 运行依据" panel is gone. It appeared under every
          single reply, took half a screen, and said the same thing each time.
          Where a reply came from now rides on the entity card's source line and
          on the record's own detail page. */}
      {sendError ? <View accessibilityLiveRegion="polite" style={styles.failureStack}>
        <Text style={[styles.messageLabel, styles.assistantLabel]}>IORBIT</Text>
        <View style={styles.failureCard}>
        <View style={styles.failureHeading}><Ionicons color={colors.rose} name="alert-circle-outline" size={28} /><Text style={styles.failureTitle}>{locale.t("aiConversation.answerFailed")}</Text></View>
        <Text style={styles.failureBody}>{sendError}</Text>
        <View style={styles.failureActions}>
          <Pressable accessibilityRole="button" onPress={onRetrySend} disabled={sending || writingBlocked} style={styles.failurePrimary}><Text style={styles.failurePrimaryText}>{retrySendLabel}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onEditQuestion} disabled={sending} style={styles.failureSecondary}><Text style={styles.failureSecondaryText}>{locale.t("aiConversation.editQuestion")}</Text></Pressable>
        </View>
        </View>
        {sendCode ? <Text selectable style={styles.failureCode}>{sendCode}</Text> : null}
      </View> : null}
      {actionError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{actionError}</Text> : null}
      {saveError ? <View accessibilityLiveRegion="polite" style={styles.failureCard}>
        <Text style={styles.failureTitle}>{locale.t("aiConversation.replyUnsaved")}</Text><Text style={styles.failureBody}>{saveError}</Text>
        <Pressable accessibilityRole="button" onPress={onRetrySave} disabled={saving} style={styles.failurePrimary}><Text style={styles.failurePrimaryText}>{locale.t("aiConversation.retrySave")}</Text></Pressable>
      </View> : null}
      {sending || saving ? <Text accessibilityLiveRegion="polite" style={styles.threadNextAction}>{locale.t(saving ? "aiConversation.saving" : "aiConversation.replying")}</Text> : null}
      </ScrollView>
      {saveNotice ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { marginHorizontal: layout.pageInset }]}>{saveNotice}</Text> : null}
      <View testID="conversation-composer" style={styles.composerPanel}>
        {sendLabelSuffix ? <Text style={styles.threadNextAction}>{`${locale.t("aiConversation.sendMessage")} · ${sendLabelSuffix}`}</Text> : null}
        {selectedReferences.length > 0 ? <View style={styles.referenceRow}>{selectedReferences.map(reference => (
          <ContactReferenceChip key={`${reference.type}:${reference.id}`} id={reference.id} knownName={referenceNames[reference.id]} scopeKey={scopeKey}
            onRemove={() => onRemoveReference(reference)} style={styles.referenceChip} textStyle={styles.referenceChipText} />
        ))}</View> : null}
        {mentionsOpen ? <ContactMentionPicker scopeKey={scopeKey} onSelect={(contact) => {
          setReferenceNames(names => ({ ...names, [contact.id]: contact.name })); onAddMention(contact); setMentionsOpen(false);
        }} selectedIds={selectedReferences.filter(reference => reference.type === "contact").map(reference => reference.id)} /> : null}
        <TextInput
          accessibilityLabel={locale.t("ai.message")}
          multiline
          numberOfLines={1}
          onChangeText={(value) => { if (!value) setInputHeight(minimumInputHeight); onChangeDraft(value); }}
          onContentSizeChange={(event) => setInputHeight(Math.min(120, Math.max(minimumInputHeight, event.nativeEvent.contentSize.height)))}
          placeholder={locale.t("aiConversation.continuePlaceholder")}
          placeholderTextColor={colors.text4}
          style={[styles.input, { height: Math.max(minimumInputHeight, inputHeight) }]}
          textAlignVertical="top"
          value={draftMessage}
        />
        <View style={styles.composerActions}>
        <Pressable accessibilityLabel={locale.t("aiConversation.mentionContact")} accessibilityRole="button" onPress={() => setMentionsOpen(value => !value)} style={styles.composerPlusButton}>
          <Text style={styles.mentionButtonText}>@</Text>
        </Pressable>
        <Pressable accessibilityLabel={locale.t("aiConversation.openShortcuts")} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRoutesOpen(!routesOpen); }} style={styles.composerPlusButton}>
          <Ionicons color={colors.ink} name="add" size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel={sendLabelSuffix ? `${locale.t("aiConversation.sendMessage")} · ${sendLabelSuffix}` : locale.t("aiConversation.sendMessage")}
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
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const completed = interaction.state === "created" || resolution === "accepted";
  const dismissed = resolution === "dismissed";
  const failed = interaction.state === "failed";
  const needsDate = interaction.state === "needs_date_confirmation";

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
              ? locale.t("aiConversation.taskFailed")
              : needsDate
                ? locale.t("aiConversation.taskNeedsDate")
              : completed
                ? locale.t("aiConversation.taskAdded")
                : dismissed
                  ? locale.t("aiConversation.taskDismissed")
                  : locale.t("aiConversation.taskSuggestion")}
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
            <Text style={styles.taskInteractionSecondaryText}>{locale.t("aiConversation.dismissTask")}</Text>
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
              {locale.t(busy ? "aiConversation.processing" : "aiConversation.addTask")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {interaction.sourceNoteId ? (
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("aiConversation.returnSourceNote")} onPress={() => onOpenHref(`/notes/${encodeURIComponent(interaction.sourceNoteId!)}`)} style={styles.recordLink}>
          <Text style={styles.recordLinkText}>{locale.t("aiConversation.viewSourceNote")}</Text><Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ) : null}
      {completed && conversationTaskDetailHref(interaction.taskId) ? (
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("aiConversation.openTaskNamed", { title: interaction.title })} onPress={() => onOpenHref(conversationTaskDetailHref(interaction.taskId)!)} style={styles.recordLink}>
          <Text style={styles.recordLinkText}>{locale.t("aiConversation.viewTask")}</Text><Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

function QuickRouteDock({
  onOpenHref
}: {
  onOpenHref: (href: ConversationQuickRouteView["href"]) => void;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const iconForRoute = (
    href: ConversationQuickRouteView["href"]
  ): keyof typeof Ionicons.glyphMap => {
    if (href === "/events") return "calendar-outline";
    if (href === "/contacts" || href === "/contacts/list") {
      return "people-outline";
    }
    if (href === "/tasks" || href === "/followups") return "checkmark-done-outline";
    if (href === "/schedule") return "time-outline";
    return "person-circle-outline";
  };

  return (
    <View style={styles.quickRouteDock}>
      <Text style={styles.quickRouteLabel}>{locale.t("aiConversation.commonEntries")}</Text>
      <View style={styles.quickRouteGrid}>
        {conversationQuickRoutes(locale.language).map((route) => (
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
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const isUser = message.role === "user";
  const links = conversationRecordLinks(message.content, baseUrl);
  const [linkError, setLinkError] = useState<string | null>(null);

  return (
    <View accessibilityLabel={locale.t(isUser ? "aiConversation.myMessage" : "aiConversation.aiReply")} style={[styles.messageBubble, isUser ? styles.userBubble : null]}>
      <Text style={[styles.messageLabel, !isUser ? styles.assistantLabel : null]}>{isUser ? locale.t("aiConversation.you") : "IORBIT"}</Text>
      {isUser ? <Text selectable style={[styles.messageText, styles.messageTextUser]}>{message.content}</Text> : <MarkdownContent content={message.content} isUser={false} />}
      {links.map((link) => (
        <Pressable
          accessibilityLabel={locale.t("aiConversation.openRecordNamed", { kind: link.kind, id: link.id })}
          accessibilityRole="link"
          key={link.href}
          onPress={() => {
            Keyboard.dismiss();
            setLinkError(null);
            if (link.external) void Linking.openURL(link.href).catch(() => setLinkError(locale.t("aiConversation.linkFailed")));
            else onOpenHref(link.href);
          }}
          style={styles.recordLink}
        >
          <Ionicons color={colors.accent} name={link.kind === "人脉" ? "person-outline" : link.kind === "待办" ? "checkbox-outline" : link.kind === "行动" ? "flash-outline" : "calendar-outline"} size={20} />
          <Text style={styles.recordLinkText}>{locale.t("aiConversation.recordDetail", { kind: link.kind, id: link.id, web: link.external ? locale.t("aiConversation.web") : "" })}</Text>
          <Ionicons color={colors.accent} name="arrow-up-right-box-outline" size={18} />
        </Pressable>
      ))}
      {/(?:https?:\/\/|orbit:\/\/|\]\()/iu.test(message.content) ? <Text style={styles.linkBoundary}>{locale.t("aiConversation.linkBoundary")}</Text> : null}
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
  // Sprint 0112: the top-of-history row follows the ledger's load-more row (hairline border, link text).
  earlierRow: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  earlierButton: { borderColor: colors.border, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  earlierFailure: { flexDirection: "row", gap: spacing.sm },
  earlierInline: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  earlierLink: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
  earlierMuted: { color: colors.text2, fontSize: typography.small, lineHeight: 20 },
  earlierError: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  routesPanel: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  composerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mentionButtonText: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  referenceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingTop: spacing.xs },
  referenceChip: { backgroundColor: colors.surface2, borderRadius: radius.pill, minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.sm },
  referenceChipText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
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
  panelTitle: {
    ...textStyles.section,
    color: colors.ink
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
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
