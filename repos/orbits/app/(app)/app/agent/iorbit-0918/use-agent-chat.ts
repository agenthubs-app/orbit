"use client";

// iOrbit（对话域）对话状态 hook：从 `../orbit-real-agent.tsx` 逐字搬入的
// messages/panel/thinking/chatDraft/activeSessionId 状态、`ask`、
// `persistCurrentSession`、`restoreSession`、hydration、`?q=` / `?session=` /
// localStorage、navigate/pushState 与全局提问接线。行为零改动：
// `window.setTimeout` 与 60s `AGENT_REQUEST_TIMEOUT_MS` abort 保持原样
// （后者留在 `iorbit-model.ts` 的 `fetchAgentConversation` 里）。
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  AiSessionGroupContract,
  AiSessionOrganizationContract,
  AiSessionOriginInputContract,
} from "../../../../../shared/contract/ai-sessions";
import { reliableAiSendReceiptSchema } from "../../../../../shared/api-schema/ai-sessions";
import type {
  OrbitAgentHistoryView,
  OrbitAgentViewModel,
} from "../../orbit-agent-route-view-model";
import { useOrbitAskTarget } from "../../orbit-global-ask/orbit-ask-context";
import { takeAgentPrefill, takePendingAsk, type OrbitAgentPrefill } from "../../orbit-global-ask/orbit-ask-draft";
import { useOrbitLanguage } from "../../orbit-language-context";
import { productHref } from "../../orbit-public-shell";
import { createAgentChatSessionMutationQueue } from "../agent-chat-session-mutations";
import {
  loadAgentChatGroups,
  patchAgentChatSessionOrganization,
} from "../agent-chat-history-organization";
import { useAgentTaskSuggestions } from "../agent-task-interaction-client";
import { parseAgentTaskInteraction } from "../agent-task-interaction-view-model";
import {
  AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
  AgentRequestTimeoutError,
  agentSuggestLabel,
  artifactOfKind,
  createAgentSessionId,
  currentAgentQuery,
  currentAgentSessionId,
  eventItemsFromArtifact,
  evidenceRefsFromArtifacts,
  fetchAgentConversation,
  historyContentFor,
  isRecord,
  loadStoredAgentChatSession,
  panelFromMessages,
  peopleItemsFromArtifact,
  persistStoredAgentChatSession,
  prepareAgentFailedRequestRetry,
  titleFromMessages,
  todoItemsFromArtifact,
  upsertAgentChatSummary,
  type AgentHistoryFeedback,
  type AgentMessage,
  type AgentPanel,
  type AgentSessionSummary,
  type AgentReliableRequest,
  type AgentStoredChatSession,
} from "./iorbit-model";

// 任务 1c：会话列表 / 分组 / 乐观写队列 / toast 的所有权在 `use-agent-history`，
// 这里只接收它的 ref 与 setter（不复制一份 state）。
export interface AgentChatHistoryStore {
  historyMutationQueue: ReturnType<typeof createAgentChatSessionMutationQueue>;
  setHistoryFeedback: Dispatch<SetStateAction<AgentHistoryFeedback | null>>;
  setSessionGroups: Dispatch<SetStateAction<AiSessionGroupContract[]>>;
  setStoredSessions: Dispatch<SetStateAction<AgentSessionSummary[]>>;
  storedSessionsRef: MutableRefObject<AgentSessionSummary[]>;
}

export function useAgentChat({ history, suggests }: { history: AgentChatHistoryStore; suggests: OrbitAgentViewModel["suggests"] }) {
  const {
    historyMutationQueue,
    setHistoryFeedback,
    setSessionGroups,
    setStoredSessions,
    storedSessionsRef,
  } = history;
  const { language, preserveHref } = useOrbitLanguage();
  // dashboard ⇄ 对话页：有消息（或点了「新对话」）即进入对话页，返回键回 dashboard。
  const [chatOpen, setChatOpen] = useState(false);
  const [agentPrefill, setAgentPrefill] = useState<OrbitAgentPrefill | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const taskSuggestions = useAgentTaskSuggestions((original, next) => {
    // Object identity confines a delayed response to its original message.
    // Switching sessions or starting a new chat must not patch the new thread.
    setMessages((current) => current.map((message) =>
      message.role === "assistant" && message.taskInteraction === original
        ? { ...message, taskInteraction: next } : message,
    ));
  });
  const [panel, setPanel] = useState<AgentPanel | null>(null);
  const [thinking, setThinking] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [activeQ, setActiveQ] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const languageRef = useRef(language);
  const messagesRef = useRef<AgentMessage[]>(messages);
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  const historyHydratedRef = useRef(false);
  const skipRestoredSessionPersistenceRef = useRef(false);
  const suppressReliableSessionPersistenceRef = useRef(false);
  const reliableMessageRevisionRef = useRef<number | null>(null);
  const initialGroupIdRef = useRef<string | null>(null);
  const initialOrganizationRef = useRef<{ organization: AiSessionOrganizationContract; sessionId: string } | null>(null);
  const activeSessionDetailRef = useRef<AgentStoredChatSession | null>(null);

  languageRef.current = language;
  messagesRef.current = messages;
  activeSessionIdRef.current = activeSessionId;

  const navigate = useCallback((prototypeHref: string) => {
    const href = preserveHref(productHref(prototypeHref));
    if (typeof window === "undefined") return;

    if (href.startsWith("/app/agent")) {
      window.history.pushState({}, "", href);
      setActiveQ(new URL(href, window.location.origin).searchParams.get("q") ?? "");
      return;
    }

    window.location.href = href;
  }, [preserveHref]);

  const restoreSession = useCallback((session: AgentStoredChatSession) => {
    activeSessionDetailRef.current = session;
    skipRestoredSessionPersistenceRef.current = true;
    setHistOpen(false);
    setMessages(session.messages);
    setPanel(session.panel ?? panelFromMessages(session.messages));
    setChatOpen(true);
    setThinking(false);
    setChatDraft("");
    setActiveQ("");
    setActiveSessionId(session.id);
    activeSessionIdRef.current = session.id;
    initialGroupIdRef.current = session.organization?.groupId ?? null;
    reliableMessageRevisionRef.current = session.messageRevision ?? session.messages.length;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
        session.id,
      );
    }
  }, []);

  const persistCurrentSession = useCallback((
    nextMessages: readonly AgentMessage[],
    nextPanel: AgentPanel | null,
  ) => {
    if (!historyHydratedRef.current || nextMessages.length === 0) {
      return;
    }

    if (skipRestoredSessionPersistenceRef.current) {
      skipRestoredSessionPersistenceRef.current = false;
      return;
    }

    if (suppressReliableSessionPersistenceRef.current) {
      return;
    }

    const hasUserMessage = nextMessages.some((message) => message.role === "user");
    if (!hasUserMessage) {
      return;
    }

    const sessionId = activeSessionIdRef.current ?? createAgentSessionId();
    const now = new Date().toISOString();
    const existingSession = storedSessionsRef.current.find(
      (item) => item.id === sessionId,
    );
    const existingDetail = activeSessionDetailRef.current?.id === sessionId
      ? activeSessionDetailRef.current
      : null;
    const customTitle = (existingSession?.organization.customTitle ?? existingDetail?.customTitle)?.trim();
    const autoTitle = titleFromMessages(nextMessages);
    const session: AgentStoredChatSession = {
      createdAt: existingSession?.createdAt ?? now,
      customTitle,
      id: sessionId,
      messageRevision:
        reliableMessageRevisionRef.current ??
        existingSession?.messageRevision ??
        nextMessages.length,
      messages: [...nextMessages],
      origin: existingDetail?.origin,
      organization:
        existingSession?.organization ??
        existingDetail?.organization ??
        (initialOrganizationRef.current?.sessionId === sessionId
          ? initialOrganizationRef.current.organization
          : undefined),
      panel: nextPanel,
      pinned: existingSession?.organization.pinned ?? existingDetail?.pinned,
      title: customTitle || autoTitle,
      updatedAt: now,
    };
    const nextSessions = upsertAgentChatSummary(
      storedSessionsRef.current,
      session,
    );
    activeSessionDetailRef.current = session;

    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    storedSessionsRef.current = nextSessions;
    setStoredSessions(nextSessions);
    void historyMutationQueue.save(session.id, () => {
      // A name/pin change ahead of this queued snapshot may have just committed.
      const latest = storedSessionsRef.current.find((item) => item.id === session.id);
      return persistStoredAgentChatSession({
        ...session,
        customTitle: latest?.organization.customTitle ?? session.customTitle,
        organization: latest?.organization ?? session.organization,
        pinned: latest?.organization.pinned ?? session.pinned,
        title: latest?.organization.customTitle?.trim() || session.title,
      });
    }).then((persisted) => {
      if (!persisted) {
        setHistoryFeedback({
          kind: "error",
          text:
            languageRef.current === "zh"
              ? "对话已显示在当前页面，但未能保存到历史记录。请检查存储配置后重试。"
              : "This conversation is visible for now but could not be saved to history. Check storage and try again.",
        });
      }
    });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
        sessionId,
      );
    }
  }, [historyMutationQueue]);

  // 真实链路：把用户消息发给 Orbit Agent conversation API（planner → 白名单工具 →
  // 可复核 artifact → synthesis），并把 contact_recommendations artifact 映射到侧边栏。
  const ask = useCallback(async (
    query: string,
    retryAssistantIndex?: number,
    originOverride?: AiSessionOriginInputContract,
  ) => {
    const locale = languageRef.current === "zh" ? "zh" : "en";
    const failureText =
      locale === "zh"
        ? "iOrbit 暂时无法完成这次回复，请稍后再试。"
        : "The agent could not complete this reply. Please try again.";

    // 发送前抓取已有轮次作为对话历史，让服务端 planner 能接住追问里的指代；
    // 推荐轮附带结构化明细，追问时间/地点/理由时模型可直接作答。
    const retry =
      typeof retryAssistantIndex === "number"
        ? prepareAgentFailedRequestRetry(
            messagesRef.current,
            retryAssistantIndex,
          )
        : null;
    const failedMessage =
      typeof retryAssistantIndex === "number"
        ? messagesRef.current[retryAssistantIndex]
        : null;
    const retryRequest =
      failedMessage?.role === "assistant"
        ? failedMessage.reliableRequest
        : undefined;
    const sessionId =
      retryRequest?.sessionId ??
      activeSessionIdRef.current ??
      createAgentSessionId();
    const existingSession = storedSessionsRef.current.find(
      (session) => session.id === sessionId,
    );
    const stableId = (kind: "message" | "request") => {
      const id = globalThis.crypto?.randomUUID?.() ?? createAgentSessionId();
      return `${kind}:${id}`;
    };
    const reliableRequest: AgentReliableRequest =
      retryRequest ?? {
        clientMessageId: stableId("message"),
        expectedMessageRevision:
          existingSession?.messageRevision ?? 0,
        locale,
        message: query,
        ...(existingSession
          ? {}
          : {
              origin: originOverride ?? {
                entryClient: "web",
                entryPointId: "ai.new_chat",
                initialGroupId: initialGroupIdRef.current,
                kind: "manual",
                template: null,
              },
            }),
        protocolVersion: 2,
        references: [],
        requestId: stableId("request"),
        sessionId,
      };
    const historySource = retry?.historyMessages ?? messagesRef.current;
    const history = historySource
      .map((turn) => ({ content: historyContentFor(turn), role: turn.role }))
      .filter((turn) => turn.content)
      .slice(-8);

    suppressReliableSessionPersistenceRef.current = true;
    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    if (retry) {
      setMessages(retry.visibleMessages);
    } else {
      setMessages((current) => [
        ...current,
        { id: reliableRequest.clientMessageId, role: "user", text: query },
      ]);
    }
    setThinking(true);
    // 等待回复期间保留现有侧边栏；新回复带结果时才替换。

    try {
      const response = await fetchAgentConversation(
        JSON.stringify({ history, ...reliableRequest }),
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: {
          actionIds?: unknown;
          artifacts?: unknown;
          assistantMessage?: string;
          runId?: unknown;
          taskInteraction?: unknown;
          messages?: unknown;
          reliableSend?: unknown;
        };
        error?: { code?: string; message?: string };
        success?: boolean;
      } | null;
      const reliableReceipt = reliableAiSendReceiptSchema.safeParse(
        payload?.data?.reliableSend,
      );

      if (
        reliableReceipt.success &&
        reliableReceipt.data.state !== "completed"
      ) {
        setMessages((current) => [
          ...current,
          {
            items: [],
            kind: "people",
            panelTitle: "",
            reliableRequest,
            retryRequest: query,
            role: "assistant",
            text:
              locale === "zh"
                ? "请求结果尚未确认。再次检查会复用同一请求，不会重复生成。"
                : "The result is not confirmed yet. Checking again reuses this request without generating twice.",
          },
        ]);
        return;
      }

      if (
        !response.ok ||
        payload?.success !== true ||
        !payload.data ||
        !reliableReceipt.success
      ) {
        // 服务端错误原文是内部诊断（provider 名、英文超时串），不拼进用户文案——
        // 这里只做归类：超时给「通常重试一次即可」的可操作说法，其余走通用文案。
        // 原文进 console 供排查，与「普通用户对话不展示内部诊断」的边界一致。
        if (payload?.error?.message) {
          console.warn("[agent] conversation request failed:", payload.error.code, payload.error.message);
        }
        const providerTimedOut =
          payload?.error?.code === "MODEL_REQUEST_FAILED" ||
          /timed out/i.test(payload?.error?.message ?? "");
        const errorText = providerTimedOut
          ? locale === "zh"
            ? "iOrbit 的模型没有按时返回，这通常是临时的，请重新提交一次。未执行任何外部动作。"
            : "The model did not answer in time — this is usually temporary. Resubmit the request. No external action was taken."
          : failureText;

        setMessages((current) => [
          ...current,
          {
            items: [],
            kind: "people",
            panelTitle: "",
            reliableRequest,
            retryRequest: query,
            role: "assistant",
            text: errorText,
          },
        ]);
        return;
      }

      const contactArtifact = artifactOfKind(
        payload.data.artifacts,
        "contact_recommendations",
      );
      const eventArtifact = artifactOfKind(
        payload.data.artifacts,
        "event_recommendations",
      );
      const followupArtifact = artifactOfKind(
        payload.data.artifacts,
        "followup_queue",
      );
      const peopleItems = peopleItemsFromArtifact(contactArtifact);
      const eventItems =
        peopleItems.length > 0 ? [] : eventItemsFromArtifact(eventArtifact);
      const todoItems =
        peopleItems.length > 0 || eventItems.length > 0
          ? []
          : todoItemsFromArtifact(followupArtifact);
      const kind: "people" | "events" | "todos" =
        eventItems.length > 0 ? "events" : todoItems.length > 0 ? "todos" : "people";
      const items =
        kind === "events" ? eventItems : kind === "todos" ? todoItems : peopleItems;
      const activeArtifact =
        kind === "events"
          ? eventArtifact
          : kind === "todos"
            ? followupArtifact
            : contactArtifact;
      const panelTitle =
        activeArtifact?.result?.presentation?.title?.trim() ||
        (kind === "events"
          ? locale === "zh"
            ? "活动推荐"
            : "Recommended events"
          : kind === "todos"
            ? locale === "zh"
              ? "行程与跟进"
              : "Schedule & follow-ups"
            : locale === "zh"
              ? "人脉推荐"
              : "Recommended contacts");
      const evidenceRefs = evidenceRefsFromArtifacts(payload.data.artifacts);
      const taskInteraction = parseAgentTaskInteraction(payload.data.taskInteraction);
      const taskOnlyMessage = taskInteraction?.state === "created"
        ? locale === "zh" ? `已创建待办：${taskInteraction.title}` : `Task created: ${taskInteraction.title}`
        : taskInteraction?.state === "suggested"
          ? locale === "zh" ? `要把“${taskInteraction.title}”加入待办吗？` : `Add "${taskInteraction.title}" to your tasks?`
          : taskInteraction?.state === "failed"
            ? locale === "zh" ? `待办“${taskInteraction.title}”暂时没有写入成功，请稍后重试。` : `The task "${taskInteraction.title}" was not saved. Please try again.`
            : null;
      const assistantText = items.length === 0 && evidenceRefs.length === 0
        ? taskOnlyMessage ?? (locale === "zh"
          ? "本次没有从你已授权的人脉、活动或跟进记录中找到可核查的结果，因此不会把泛化回答展示成真实推荐，也没有执行任何外部动作。请先导入联系人或补充可用记录后重试。"
          : "No verifiable result was found in your authorized contacts, events, or follow-ups. A generic answer will not be presented as a real recommendation, and no external action was taken. Import contacts or add usable records, then retry.")
        : payload.data.assistantMessage?.trim() ||
          activeArtifact?.result?.generatedView?.summary ||
          failureText;
      const runId =
        typeof payload.data.runId === "string" && payload.data.runId.trim()
          ? payload.data.runId.trim()
          : undefined;
      const actionIds = Array.isArray(payload.data.actionIds)
        ? payload.data.actionIds.flatMap((actionId) =>
            typeof actionId === "string" && actionId.trim()
              ? [actionId.trim()]
              : [],
          )
        : [];
      const assistantMessageId = Array.isArray(payload.data.messages)
        ? [...payload.data.messages]
            .reverse()
            .find(
              (message) =>
                isRecord(message) &&
                message.role === "assistant" &&
                typeof message.messageId === "string",
            )?.messageId
        : undefined;
      reliableMessageRevisionRef.current =
        reliableReceipt.data.messageRevision ??
        reliableRequest.expectedMessageRevision + 2;
      if (!existingSession && initialGroupIdRef.current) {
        const organization = await patchAgentChatSessionOrganization(sessionId, {
          expectedRevision: 0,
          mutationId: stableId("request"),
          patch: { groupId: initialGroupIdRef.current },
        });
        if (organization) {
          initialOrganizationRef.current = { organization, sessionId };
        } else {
          setHistoryFeedback({
            kind: "error",
            text: locale === "zh"
              ? "回复已保存，但会话暂未加入所选分组。请在历史记录中重试移动。"
              : "The reply was saved, but the conversation was not added to the selected group. Move it from history to retry.",
          });
        }
      }
      suppressReliableSessionPersistenceRef.current = false;
      setMessages((current) => [
        ...current,
        {
          actionIds,
          evidenceRefs,
          items,
          kind,
          id:
            typeof assistantMessageId === "string"
              ? assistantMessageId
              : `assistant:${reliableRequest.requestId}`,
          panelTitle,
          role: "assistant",
          runId,
          taskInteraction,
          text: assistantText,
        },
      ]);

      setPanel(items.length > 0 ? { items, kind, panelTitle } : null);
    } catch (error) {
      const requestFailureText =
        error instanceof AgentRequestTimeoutError
          ? locale === "zh"
            ? "浏览器已停止等待，服务器结果尚未确认。再次检查会复用同一请求，不会重复生成。"
            : "The browser stopped waiting before the server confirmed a result. Checking again reuses the same request and will not generate it twice."
          : failureText;
      setMessages((current) => [
        ...current,
          {
            items: [],
            kind: "people",
            panelTitle: "",
            reliableRequest,
            retryRequest: query,
          role: "assistant",
          text: requestFailureText,
        },
      ]);
    } finally {
      setThinking(false);
    }
  }, []);

  const submitChatDraft = useCallback(() => {
    const query = chatDraft.trim();

    if (!query || thinking) return;

    setChatDraft("");
    void ask(query);
  }, [ask, chatDraft, thinking]);

  useEffect(() => {
    let cancelled = false;

    const hydrateHistory = async () => {
      const sessionId = currentAgentSessionId();
      const [session, groups] = await Promise.all([
        sessionId ? loadStoredAgentChatSession(sessionId) : Promise.resolve(null),
        loadAgentChatGroups(),
      ]);

      if (cancelled) {
        return;
      }

      setSessionGroups(groups);
      historyHydratedRef.current = true;

      if (session) {
        restoreSession(session);
        return;
      }

      const query = currentAgentQuery();
      setActiveQ(query);
      if (query) {
        setMessages([]);
        setPanel(null);
        setActiveSessionId(null);
        activeSessionIdRef.current = null;
        void ask(query);
        return;
      }
      setAgentPrefill(takeAgentPrefill());
    };

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [ask, restoreSession]);

  useEffect(() => {
    persistCurrentSession(messages, panel);
  }, [messages, panel, persistCurrentSession]);

  const pickHistory = (item: OrbitAgentHistoryView) => {
    if (item.sessionId) {
      void loadStoredAgentChatSession(item.sessionId).then((storedSession) => {
        if (!storedSession) {
          return;
        }

        const nextSessions = upsertAgentChatSummary(
          storedSessionsRef.current,
          storedSession,
        );
        storedSessionsRef.current = nextSessions;
        setStoredSessions(nextSessions);
        restoreSession(storedSession);
        navigate(`/agent?session=${encodeURIComponent(storedSession.id)}`);
      });
      return;
    }

    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    activeSessionDetailRef.current = null;
    reliableMessageRevisionRef.current = null;
    suppressReliableSessionPersistenceRef.current = false;
    navigate(`/agent?q=${encodeURIComponent(item.q)}`);
    void ask(item.q);
  };

  const clearConversation = (openChat: boolean, initialGroupId: string | null = null) => {
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setThinking(false);
    setChatDraft("");
    setActiveQ("");
    setActiveSessionId(null);
    setChatOpen(openChat);
    activeSessionIdRef.current = null;
    activeSessionDetailRef.current = null;
    initialGroupIdRef.current = initialGroupId;
    initialOrganizationRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY);
    }
    navigate("/agent");
  };

  // 「新对话」：进入对话页的空态；「返回」：回 dashboard（当前对话已在历史里）。
  const newChat = () => clearConversation(true);
  const newChatInGroup = (groupId: string) => clearConversation(true, groupId);
  const backToDashboard = () => clearConversation(false);

  // 记忆化：useOrbitAskTarget 用引用相等判断是否重新注册，每次渲染都造新数组会死循环。
  const orbChips = useMemo(
    () =>
      suggests.slice(0, 3).map((suggest) => ({
        label: agentSuggestLabel(suggest.label, language === "ja" ? "en" : language),
        query: suggest.q,
      })),
    [language, suggests],
  );

  // 全局输入框在这一页直接落到当前对话，不再跳转。
  const askTarget = useMemo(
    () => ({ busy: thinking, chips: orbChips, onAsk: ask }),
    [ask, orbChips, thinking],
  );

  useOrbitAskTarget(askTarget);

  // 从别的页面发起的提问：来源页把它暂存在 sessionStorage，这里取出来跑一次。
  // takePendingAsk 读完即删，配合 ref 兜住 StrictMode 的双次挂载。
  const pendingAskRan = useRef(false);

  useEffect(() => {
    if (pendingAskRan.current) return;
    pendingAskRan.current = true;

    const pending = takePendingAsk();

    if (!pending) return;

    // 上下文拼进消息本体，而不是偷偷加在 system prompt 里：用户在对话里
    // 看到的那句话，就是我们真正发出去的那句话。
    const message = pending.context
      ? languageRef.current === "zh"
        ? `${pending.query}\n\n（我正在看${pending.context}）`
        : `${pending.query}\n\n(I'm currently looking at ${pending.context}.)`
      : pending.query;

    setChatOpen(true);
    void ask(message);
  }, [ask]);
  return {
    activeQ,
    activeSessionId,
    activeSessionIdRef,
    agentPrefill,
    ask,
    backToDashboard,
    chatDraft,
    chatOpen,
    clearConversation,
    histOpen,
    languageRef,
    messages,
    navigate,
    newChat,
    newChatInGroup,
    panel,
    pickHistory,
    restoreSession,
    setActiveQ,
    setActiveSessionId,
    setAgentPrefill,
    setChatDraft,
    setChatOpen,
    setHistOpen,
    setMessages,
    setPanel,
    setThinking,
    submitChatDraft,
    taskSuggestions,
    thinking,
  };
}
