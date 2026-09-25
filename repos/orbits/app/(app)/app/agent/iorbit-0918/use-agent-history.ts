"use client";

// iOrbit（对话域）历史记录状态 hook：从 `../orbit-real-agent.tsx` 与
// `./use-agent-chat.ts` 逐字搬入的会话列表 / 分组 / 置顶 / 重命名 / 删除 /
// 乐观写队列 / toast 反馈 / 侧栏拖拽宽度 / 跨标签 `window.focus` 刷新。
//
// 归属划分（任务 1c）：会话列表与分组的**唯一所有者**是本 hook——
// `storedSessions` / `storedSessionsRef` / `sessionGroups` /
// `historyMutationQueue` / `historyFeedback` 都只在这里声明一次，
// `use-agent-chat` 通过入参拿到这几个 setter / ref（不再自己持有一份）。
// 反方向（删除当前会话后要清空对话线程）走 `bindChat` 注册的桥接对象，
// 因为两个 hook 互相需要对方的一小块，而 state 不允许复制。
// 行为零改动：被搬的语句本体逐字保留，唯一的文本改动是删除当前会话那段
// 对话侧重置改为 `chat.` 前缀（见任务报告）。
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import type {
  AiSessionGroupContract,
  AiSessionOrganizationContract,
} from "../../../../../shared/contract/ai-sessions";
import type { OrbitAgentHistoryView } from "../../orbit-agent-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { createAgentChatSessionMutationQueue } from "../agent-chat-session-mutations";
import {
  createAgentChatGroup,
  deleteAgentChatGroup,
  loadAgentChatGroups,
  patchAgentChatSessionOrganization,
  renameAgentChatGroup,
} from "../agent-chat-history-organization";
import {
  AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
  HISTORY_SIDEBAR_DEFAULT_WIDTH,
  HISTORY_SIDEBAR_MAX_WIDTH,
  HISTORY_SIDEBAR_MIN_WIDTH,
  agentChatHistorySessionsToHistory,
  clampHistorySidebarWidth,
  createAgentSessionId,
  deleteStoredAgentChatSession,
  loadStoredAgentChatSessions,
  upsertAgentChatSummary,
  type AgentHistoryFeedback,
  type AgentMessage,
  type AgentPanel,
  type AgentSessionSummary,
} from "./iorbit-model";

// 删除当前会话时要重置的对话侧状态。`use-agent-chat` 在组件里通过 `bindChat`
// 注册；它们全是 `useState` 的 setter 与 ref，引用稳定。
export interface AgentHistoryChatBridge {
  activeSessionIdRef: MutableRefObject<string | null>;
  navigate: (prototypeHref: string) => void;
  setActiveQ: Dispatch<SetStateAction<string>>;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setChatOpen: Dispatch<SetStateAction<boolean>>;
  setHistOpen: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  setPanel: Dispatch<SetStateAction<AgentPanel | null>>;
  setThinking: Dispatch<SetStateAction<boolean>>;
}

export function useAgentHistory() {
  const { language, t } = useOrbitLanguage();

  // 对话侧桥接：组件在 `useAgentChat` 返回后调用 `bindChat` 写入。只有事件
  // 处理器（删除二次确认）会读它，那时必定已经渲染过一次。
  const chatRef = useRef<AgentHistoryChatBridge | null>(null);
  const bindChat = useCallback((bridge: AgentHistoryChatBridge) => {
    chatRef.current = bridge;
  }, []);

  const languageRef = useRef(language);
  languageRef.current = language;

  const [storedSessions, setStoredSessions] = useState<AgentSessionSummary[]>([]);
  const [sessionGroups, setSessionGroups] = useState<AiSessionGroupContract[]>([]);

  const [historyMutationQueue] = useState(createAgentChatSessionMutationQueue);

  const [historyFeedback, setHistoryFeedback] = useState<AgentHistoryFeedback | null>(null);

  const storedSessionsRef = useRef<AgentSessionSummary[]>(storedSessions);
  storedSessionsRef.current = storedSessions;
  const [historySidebarResizing, setHistorySidebarResizing] = useState(false);
  const [historySidebarWidth, setHistorySidebarWidth] = useState(
    HISTORY_SIDEBAR_DEFAULT_WIDTH,
  );
  const [selectedSessionGroupId, setSelectedSessionGroupId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyPageHasMore, setHistoryPageHasMore] = useState(false);
  const [historyPageCursor, setHistoryPageCursor] = useState<string | null>(null);
  const [historyPageLoading, setHistoryPageLoading] = useState(false);
  const [groupMutationPending, setGroupMutationPending] = useState(false);
  const [historyDeleteError, setHistoryDeleteError] = useState<string | null>(null);
  const [historyMutationSessionId, setHistoryMutationSessionId] = useState<string | null>(null);
  const [pendingDeleteHistory, setPendingDeleteHistory] = useState<OrbitAgentHistoryView | null>(null);
  const historyResizeRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const historyMutationSessionIdRef = useRef<string | null>(null);
  const historyPageGenerationRef = useRef(0);

  const storedHistory = useMemo(
    () => agentChatHistorySessionsToHistory(storedSessions, language, sessionGroups)
      .filter((item) => !selectedSessionGroupId || item.groupId === selectedSessionGroupId),
    [language, selectedSessionGroupId, sessionGroups, storedSessions],
  );

  useEffect(() => {
    let cancelled = false;
    const refreshAcrossClients = (clearCurrentPage: boolean) => {
      const generation = ++historyPageGenerationRef.current;
      if (clearCurrentPage) {
        storedSessionsRef.current = [];
        setStoredSessions([]);
        setHistoryPageCursor(null);
        setHistoryPageHasMore(false);
      }
      setHistoryPageLoading(true);
      void Promise.all([
        loadStoredAgentChatSessions({ groupId: selectedSessionGroupId, q: historyQuery }),
        loadAgentChatGroups(),
      ]).then(([page, groups]) => {
        if (cancelled || generation !== historyPageGenerationRef.current) return;
        if (page) {
          storedSessionsRef.current = page.items;
          setStoredSessions(page.items);
          setHistoryPageCursor(page.nextCursor);
          setHistoryPageHasMore(page.hasMore);
        } else {
          storedSessionsRef.current = [];
          setStoredSessions([]);
          setHistoryPageCursor(null);
          setHistoryPageHasMore(false);
        }
        setSessionGroups(groups);
      }).finally(() => {
        if (!cancelled && generation === historyPageGenerationRef.current) setHistoryPageLoading(false);
      });
    };
    const refreshOnFocus = () => refreshAcrossClients(false);
    refreshAcrossClients(true);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [historyQuery, selectedSessionGroupId]);

  const loadMoreHistory = async () => {
    const cursor = historyPageCursor;
    if (!historyPageHasMore || !cursor || historyPageLoading) return;
    const generation = historyPageGenerationRef.current;
    setHistoryPageLoading(true);
    try {
      const page = await loadStoredAgentChatSessions({ cursor, groupId: selectedSessionGroupId, q: historyQuery });
      if (!page || generation !== historyPageGenerationRef.current) return;
      const merged = [...storedSessionsRef.current];
      const existing = new Set(merged.map((session) => session.id));
      for (const session of page.items) if (!existing.has(session.id)) merged.push(session);
      storedSessionsRef.current = merged;
      setStoredSessions(merged);
      setHistoryPageCursor(page.nextCursor);
      setHistoryPageHasMore(page.hasMore);
    } finally {
      if (generation === historyPageGenerationRef.current) setHistoryPageLoading(false);
    }
  };

  useEffect(() => {
    if (!historySidebarResizing) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const resize = historyResizeRef.current;
      if (!resize) {
        return;
      }

      setHistorySidebarWidth(
        clampHistorySidebarWidth(
          resize.startWidth + event.clientX - resize.startX,
        ),
      );
    };
    const stopResize = () => {
      historyResizeRef.current = null;
      setHistorySidebarResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [historySidebarResizing]);

  const startHistorySidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      historyResizeRef.current = {
        startWidth: historySidebarWidth,
        startX: event.clientX,
      };
      setHistorySidebarResizing(true);
    },
    [historySidebarWidth],
  );

  const resizeHistorySidebarWithKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const nextWidth =
        event.key === "ArrowLeft"
          ? historySidebarWidth - 16
          : event.key === "ArrowRight"
            ? historySidebarWidth + 16
            : event.key === "Home"
              ? HISTORY_SIDEBAR_MIN_WIDTH
              : event.key === "End"
                ? HISTORY_SIDEBAR_MAX_WIDTH
                : null;

      if (nextWidth === null) {
        return;
      }

      event.preventDefault();
      setHistorySidebarWidth(clampHistorySidebarWidth(nextWidth));
    },
    [historySidebarWidth],
  );

  const updateHistorySession = async (
    sessionId: string,
    patch: Partial<Pick<AiSessionOrganizationContract, "customTitle" | "groupId" | "pinned">>,
    successText: string,
  ): Promise<boolean> => {
    if (historyMutationSessionIdRef.current) {
      return false;
    }

    const currentSession = storedSessionsRef.current.find(
      (session) => session.id === sessionId,
    );

    if (!currentSession) {
      return false;
    }

    historyMutationSessionIdRef.current = sessionId;
    setHistoryMutationSessionId(sessionId);
    setHistoryFeedback(null);

    try {
      let savedOrganization: AiSessionOrganizationContract | null = null;
      const persisted = await historyMutationQueue.save(sessionId, () => {
        const latest = storedSessionsRef.current.find((session) => session.id === sessionId) ?? currentSession;
        return patchAgentChatSessionOrganization(sessionId, {
          expectedRevision: latest.organization?.revision ?? 0,
          mutationId: globalThis.crypto?.randomUUID?.() ?? createAgentSessionId(),
          patch,
        }).then((organization) => {
          savedOrganization = organization;
          return organization !== null;
        });
      });
      if (!persisted) {
        setHistoryFeedback({
          kind: "error",
          text:
            languageRef.current === "zh"
              ? "未能保存对话历史更改，页面保持原状态。请稍后重试。"
              : "The history change could not be saved, so nothing changed. Please try again.",
        });
        return false;
      }

      const latest = storedSessionsRef.current.find((session) => session.id === sessionId) ?? currentSession;
      if (!savedOrganization) return false;
      const nextSessions = upsertAgentChatSummary(storedSessionsRef.current, {
        ...latest,
        organization: savedOrganization,
      });
      storedSessionsRef.current = nextSessions;
      setStoredSessions(nextSessions);
      setHistoryFeedback({ kind: "success", text: successText });
      return true;
    } finally {
      historyMutationSessionIdRef.current = null;
      setHistoryMutationSessionId(null);
    }
  };

  const togglePinnedHistorySession = (item: OrbitAgentHistoryView) => {
    if (!item.sessionId) {
      return;
    }

    void updateHistorySession(
      item.sessionId,
      { pinned: !item.pinned },
      item.pinned
        ? t({ en: "Conversation unpinned", zh: "已取消置顶" })
        : t({ en: "Conversation pinned", zh: "对话已置顶" }),
    );
  };

  const renameHistorySession = (
    item: OrbitAgentHistoryView,
    title: string,
  ) => {
    if (!item.sessionId) {
      return;
    }

    const customTitle = title.trim();
    if (!customTitle) {
      return;
    }

    void updateHistorySession(
      item.sessionId,
      { customTitle },
      t({ en: "Conversation renamed", zh: "对话已重命名" }),
    );
  };

  const moveHistorySession = (item: OrbitAgentHistoryView, groupId: string | null) => {
    if (!item.sessionId) return;
    void updateHistorySession(
      item.sessionId,
      { groupId },
      t({ en: "Conversation moved", zh: "已移动对话" }),
    );
  };

  const createHistoryGroup = async (name: string) => {
    if (groupMutationPending) return;
    setGroupMutationPending(true);
    const id = `group:${globalThis.crypto?.randomUUID?.() ?? createAgentSessionId()}`;
    const group = await createAgentChatGroup({
      id,
      mutationId: globalThis.crypto?.randomUUID?.() ?? createAgentSessionId(),
      name: name.trim(),
    });
    if (group) {
      setSessionGroups((current) => [...current.filter((item) => item.id !== group.id), group]);
      setHistoryFeedback({ kind: "success", text: t({ en: "Group created", zh: "已创建分组" }) });
    } else {
      setHistoryFeedback({ kind: "error", text: t({ en: "The group was not saved. Refresh and try again.", zh: "分组尚未保存，请刷新后重试。" }) });
    }
    setGroupMutationPending(false);
  };

  const renameHistoryGroup = async (group: AiSessionGroupContract, name: string) => {
    if (groupMutationPending) return;
    setGroupMutationPending(true);
    const saved = await renameAgentChatGroup(group.id, {
      expectedRevision: group.revision,
      mutationId: globalThis.crypto?.randomUUID?.() ?? createAgentSessionId(),
      name: name.trim(),
    });
    if (saved) {
      setSessionGroups((current) => current.map((item) => item.id === saved.id ? saved : item));
      setHistoryFeedback({ kind: "success", text: t({ en: "Group renamed", zh: "已重命名分组" }) });
    } else {
      setHistoryFeedback({ kind: "error", text: t({ en: "The group name was not saved. Refresh and try again.", zh: "分组名称尚未保存，请刷新后重试。" }) });
    }
    setGroupMutationPending(false);
  };

  const deleteHistoryGroup = async (group: AiSessionGroupContract) => {
    if (groupMutationPending) return;
    setGroupMutationPending(true);
    const deleted = await deleteAgentChatGroup(group.id, {
      expectedRevision: group.revision,
      mutationId: globalThis.crypto?.randomUUID?.() ?? createAgentSessionId(),
    });
    if (deleted) {
      setSessionGroups((current) => current.filter((item) => item.id !== group.id));
      setStoredSessions((current) => {
        const next = current.map((session) => session.organization?.groupId === group.id ? {
          ...session,
          organization: { ...session.organization, groupId: null, revision: session.organization.revision + 1 },
        } : session);
        storedSessionsRef.current = next;
        return next;
      });
      if (selectedSessionGroupId === group.id) setSelectedSessionGroupId(null);
      setHistoryFeedback({ kind: "success", text: t({ en: "Group deleted; conversations kept", zh: "已删除分组并保留全部对话" }) });
    } else {
      setHistoryFeedback({ kind: "error", text: t({ en: "The group was not deleted. Refresh and try again.", zh: "分组尚未删除，请刷新后重试。" }) });
    }
    setGroupMutationPending(false);
  };

  const deleteHistorySession = (item: OrbitAgentHistoryView) => {
    if (!item.sessionId) {
      return;
    }

    setHistoryDeleteError(null);
    setPendingDeleteHistory(item);
  };

  const confirmDeleteHistorySession = async () => {
    const item = pendingDeleteHistory;
    const sessionId = item?.sessionId;
    if (!item || !sessionId || historyMutationSessionIdRef.current) {
      return;
    }

    historyMutationSessionIdRef.current = sessionId;
    setHistoryMutationSessionId(sessionId);
    setHistoryDeleteError(null);
    setHistoryFeedback(null);

    try {
      const persisted = await historyMutationQueue.remove(sessionId, () => deleteStoredAgentChatSession(sessionId));
      if (!persisted) {
        setHistoryDeleteError(
          languageRef.current === "zh"
            ? "未能删除这个对话，历史记录保持不变。请稍后重试。"
            : "This conversation could not be deleted, so your history is unchanged. Please try again.",
        );
        return;
      }

      const nextSessions = storedSessionsRef.current.filter(
        (session) => session.id !== sessionId,
      );
      storedSessionsRef.current = nextSessions;
      setStoredSessions(nextSessions);
      setPendingDeleteHistory(null);
      setHistoryFeedback({
        kind: "success",
        text: t({ en: "Conversation deleted", zh: "对话已删除" }),
      });

      // 任务 1c 的唯一文本改动：对话侧重置改走 `bindChat` 注册的桥接对象。
      // `chat` 在组件首次渲染后必定非空（本函数只从删除二次确认里调用）；
      // 若为空说明接线写错了（hook 顺序反了、漏调 `bindChat`），必须响亮地炸，
      // 不能在「对话已删除」的成功 toast 下面静默留着被删的会话与陈旧深链。
      const chat = chatRef.current;
      if (!chat) {
        throw new Error("useAgentHistory: bindChat() was never called");
      }

      if (chat.activeSessionIdRef.current !== sessionId) {
        return;
      }

      chat.setHistOpen(false);
      chat.setMessages([]);
      chat.setPanel(null);
      chat.setThinking(false);
      chat.setActiveQ("");
      chat.setActiveSessionId(null);
      chat.setChatOpen(false);
      chat.activeSessionIdRef.current = null;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY);
      }
      chat.navigate("/agent");
    } finally {
      historyMutationSessionIdRef.current = null;
      setHistoryMutationSessionId(null);
    }
  };

  return {
    bindChat,
    confirmDeleteHistorySession,
    createHistoryGroup,
    deleteHistoryGroup,
    deleteHistorySession,
    groupMutationPending,
    historyDeleteError,
    historyFeedback,
    historyMutationQueue,
    historyMutationSessionId,
    historyPageHasMore,
    historyPageLoading,
    historyQuery,
    historySidebarResizing,
    historySidebarWidth,
    moveHistorySession,
    loadMoreHistory,
    pendingDeleteHistory,
    renameHistoryGroup,
    renameHistorySession,
    resizeHistorySidebarWithKeyboard,
    selectedSessionGroupId,
    sessionGroups,
    setHistoryDeleteError,
    setHistoryFeedback,
    setHistoryQuery,
    setPendingDeleteHistory,
    setSelectedSessionGroupId,
    setSessionGroups,
    setStoredSessions,
    startHistorySidebarResize,
    storedHistory,
    storedSessions,
    storedSessionsRef,
    togglePinnedHistorySession,
  };
}
