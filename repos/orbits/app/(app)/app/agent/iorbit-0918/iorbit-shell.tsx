/**
 * iOrbit（对话域）壳（Orbit_0918）。
 *
 * JSX 与样式来自 docs/designs/Orbit_0918/iOrbit.dc.html：
 *   11–13  字体 <link>（由既有 layout 提供，壳不重复注入）
 *   14–22  全局 CSS（* / body / a / a:hover / input,textarea,button / ::placeholder / @keyframes）
 *   25     页面包裹 min-height:100vh; background:#FBFBFE; overflow-x:clip
 *   27–41  顶栏：R07 起由新壳 Orbit2026Shell 统一提供（示例药丸由 ShellDemoPill 填进 demoPill 插槽）
 *   43     <main> max-width 1240px、margin 0 auto、padding 14px 40px 72px、列间距 26px
 *
 * 作用域双层（「审阅修订」2）：外层保留 `data-orbit-real-page="agent"`（冻结的
 * `orbit-reference-styles.tsx` 有 44 条该作用域规则，含顶栏 `.orbit-agent-history-btn`），
 * 内层再加 `data-orbit-real-page="iorbit-0918"` 承载 `IORBIT_STYLES`；冻结文件一行未改。
 *
 * 任务 3 的形态（「审阅修订」1 / 15）：壳持有视图（概览 / 对话）**并且是两个 hook 的
 * 唯一所有者**——`useAgentHistory()` → `useAgentChat({ history, suggests })` →
 * `bindChat(...)`（顺序由 1c 报告固定，接错会抛错）。单套 DOM：移动端不再单独一棵树，
 * 旧的 `height:100dvh` 应用框 + 内部滚动容器 + 固定输入坞换成设计的普通文档流，
 * 自动滚到底改为新回合出现时 `scrollIntoView`（在 `iorbit-chat.tsx` 里）。
 * `OrbitRealAgent` 不再被渲染（任务 6 删除），因此全局仍然只有一份 hook 实例，
 * `useOrbitAskTarget` / `takePendingAsk()` / `takeAgentPrefill()` 只注册与消费一次。
 *
 * 历史抽屉（任务 4）：设计 786–804 的 `iorbit-history-drawer.tsx`，挂在内层
 * `iorbit-0918` 作用域里（`position:fixed`，DOM 位置不影响布局，但 `ir-*` 皮肤要靠
 * 这个祖先选择器）。桌面与移动共用这一个抽屉——旧的 `AgentMobileHistoryDrawer` 根类
 * 是 `orbit-mobile-only`，在参考样式表里是 `display:none !important` 且不在 ≤640px 的
 * @media 内，桌面宽度下挂得上却看不见；新抽屉没有这层类。桌面侧原来的常驻 `<aside>`
 * 侧栏与拖拽宽度按计划不再渲染（设计无侧栏，本计划唯一的能力移除），历史能力全部
 * 经这一个抽屉进入。删除二次确认（`AgentHistoryDeleteDialog`）与 toast 仍挂在壳上。
 *
 * 示例模式（W0004）：服务端判定本人处于引导期且开关打开时传入 `guide`，壳整个换成
 * `IOrbitDemoShell`——它**不挂** `useAgentHistory()` / `useAgentChat()`，因此不会自动
 * 请求 `/api/ai/conversations/**`、不恢复 `?session=`；全局提问框、别处暂存的待发提问
 * 与 `?q=` 都被取出清掉并改弹拦截层（`DemoAskTarget` / `DemoHandoffGuard`），
 * 不会留到之后的真实壳里自动发出。
 * 概览屏由 `DemoModeProvider` 切到示例数据，写操作都被拦下。`guide` 为空时一切照旧。
 *
 * R25：W0008 的 v1 计划回答卡片（`?plan=`）与 W0014 的只读示例问答随 v1 计划一起删除；示例壳只剩概览，
 * 最近对话里的示例会话点了照旧拦下。
 */
"use client";

import { ShellDemoPill } from "../../orbit-2026/shell/ShellDemoPill";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import {
  DemoAskTarget,
  DemoBanner,
  DemoHandoffGuard,
  DemoInterceptLayer,
  DemoModeProvider,
  type DemoModeView,
} from "../../_demo/demo-mode-context";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitAgentViewModel } from "../../orbit-agent-route-view-model";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import { hasPendingOrbitAgentHandoff } from "../../orbit-global-ask/orbit-ask-draft";
import { Icon } from "../../orbit-reference-primitives";
import { ORBIT_Z } from "../../orbit-z";
import { CONSOLE_STYLES } from "./console-styles";
import { AgentHistoryDeleteDialog } from "./iorbit-rich-components";
import { IOrbitChat } from "./iorbit-chat";
import { IOrbitChatAside } from "./iorbit-chat-aside";
import { IOrbitHistoryDrawer } from "./iorbit-history-drawer";
import { IOrbitHome } from "./iorbit-home";
import type { HomeEventPoolCandidate } from "../../../../../features/agent/home-event-pool";
import { IORBIT_STYLES } from "./iorbit-styles";
import { useAgentChat } from "./use-agent-chat";
import { useAgentHistory } from "./use-agent-history";
import { noteContactNavigation } from "../../contacts/network-0918/detail-return-recorder";

export interface IOrbitShellProps {
  /**
   * 服务端读取的本人社群加入状态（W0003），下传给概览的活动小模组。W0037：示例壳也收它
   * （与 `demoEventCandidates` 一起，是示例壳仅有的两个真实字段）。
   */
  communityJoined?: boolean;
  /**
   * W0036：示例期服务端读到的「近期可报名」真实活动（只给示例壳；RH-03 活动始终真实）。
   * 真实壳不用它：真实期的活动池由首页从 snapshot + 计划算出。
   */
  demoEventCandidates?: readonly HomeEventPoolCandidate[];
  /** 示例模式（W0004）：非空即渲染示例壳；开关关闭或不在引导期时为空。 */
  guide?: DemoModeView | null;
  /** W0022：服务端引导开关是否打开（只给真实壳的概览；示例壳不用）。 */
  guideEnabled?: boolean;
  home: OrbitHomeViewModel | null;
  /** 服务端解析出的 `?q=`／`?session=`：任一存在即直接落在对话分支（SSR 与首帧一致）。 */
  initialDeepLink?: boolean;
  /**
   * 服务端解析出的 `?history=1`：进页即把历史抽屉打开。
   * 任务 5：设计 509 / 673 在 strategy / contacts 两屏的页头上也画了「◷ 历史记录」，
   * 但抽屉的数据在壳的两个 hook 里，兄弟路由拿不到。那两屏的按钮因此是指向
   * `/app/agent?history=1` 的链接，落到壳上再开抽屉——真实能力，不是假按钮。
   */
  initialHistoryOpen?: boolean;
  viewModel: OrbitAgentViewModel;
}

export function IOrbitShell(props: IOrbitShellProps) {
  // 分支放在任何 hook 之前：示例壳与真实壳是两棵不同的组件树，hook 顺序各自稳定。
  // 示例期间不把任何真实数据（`home`、`viewModel`——后者的 suggests 带真实人名与草稿）交给示例壳。
  if (props.guide) {
    return (
      <IOrbitDemoShell
        communityJoined={props.communityJoined}
        demoEventCandidates={props.demoEventCandidates}
        guide={props.guide}
      />
    );
  }
  return <IOrbitLiveShell {...props} />;
}

/**
 * 示例壳：同一套外层作用域、顶栏与概览屏，但没有对话 / 历史的两个 hook。
 * 概览屏里的「打开对话」「历史」和其余会话都经 `guardWrite` 拦下；只有示例问答
 * （W0014）切到只读对话分支。
 */
function IOrbitDemoShell({
  communityJoined,
  demoEventCandidates,
  guide,
}: {
  communityJoined?: boolean;
  demoEventCandidates?: readonly HomeEventPoolCandidate[];
  guide: DemoModeView;
}) {
  return (
    <DemoModeProvider view={guide}>
      <IOrbitDemoBody communityJoined={communityJoined} demoEventCandidates={demoEventCandidates} />
    </DemoModeProvider>
  );
}

/** 示例壳的内容：概览的全部数据都来自示例人物（`_demo/demo-persona.ts`）。 */
function IOrbitDemoBody({
  communityJoined,
  demoEventCandidates,
}: {
  communityJoined?: boolean;
  demoEventCandidates?: readonly HomeEventPoolCandidate[];
}) {
  const { t } = useOrbitLanguage();
  return (
    <>
      <DemoAskTarget />
      <DemoHandoffGuard />
      <div
        data-orbit-agent-request-state="idle"
        data-orbit-ask-clearance="manual"
        data-orbit-guide-demo="on"
        data-orbit-real-page="agent"
        style={{ "--ink-3-text": "#6B6F99" } as CSSProperties}
      >
        <style>{CONSOLE_STYLES}</style>
        <div data-orbit-real-page="iorbit-0918">
          <style>{IORBIT_STYLES}</style>
          <h1 className="ir-screen-title" data-orbit-agent-screen-title>
            {t({ en: "iOrbit workspace", zh: "iOrbit 工作区" })}
          </h1>
          <ShellDemoPill />
          <main className="ir-main">
            <DemoBanner />
            <IOrbitHome
              communityJoined={communityJoined}
              demoEventCandidates={demoEventCandidates}
              home={null}
              navigate={() => undefined}
              onAsk={() => undefined}
              onOpenChat={() => undefined}
              onOpenHistory={() => undefined}
              onOpenSession={() => undefined}
            />
          </main>
          <DemoInterceptLayer />
        </div>
      </div>
    </>
  );
}

function IOrbitLiveShell({
  communityJoined = false,
  guideEnabled = false,
  home,
  initialDeepLink = false,
  initialHistoryOpen = false,
  viewModel,
}: IOrbitShellProps) {
  const { language, t } = useOrbitLanguage();
  const {
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
    loadMoreHistory,
    moveHistorySession,
    pendingDeleteHistory,
    renameHistoryGroup,
    renameHistorySession,
    selectedSessionGroupId,
    sessionGroups,
    setHistoryDeleteError,
    setHistoryFeedback,
    setHistoryQuery,
    setPendingDeleteHistory,
    setSelectedSessionGroupId,
    setSessionGroups,
    setStoredSessions,
    storedHistory,
    storedSessionsRef,
    togglePinnedHistorySession,
  } = useAgentHistory();
  const {
    activeQ,
    activeSessionId,
    activeSessionIdRef,
    agentPrefill,
    ask,
    chatDraft,
    chatOpen,
    earlier,
    histOpen,
    loadEarlier,
    messages,
    navigate,
    newChat,
    newChatInGroup,
    pickHistory,
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
  } = useAgentChat({
    history: {
      historyMutationQueue,
      setHistoryFeedback,
      setSessionGroups,
      setStoredSessions,
      storedSessionsRef,
    },
    suggests: viewModel.suggests,
  });
  bindChat({
    activeSessionIdRef,
    navigate,
    setActiveQ,
    setActiveSessionId,
    setChatOpen,
    setHistOpen,
    setMessages,
    setPanel,
    setThinking,
  });

  const [view, setView] = useState<"chat" | "home">(initialDeepLink ? "chat" : "home");
  const inChat = view === "chat";

  // `chatOpen` 由 hook 自己置起的三条路径（pendingAsk 交接单、`?session=` 恢复、
  // 历史记录里挑一条）都必须把视图带到对话。只认**上升沿**：返回概览是非破坏性的
  // （「审阅修订」17，线程与 `chatOpen` 都留着），不能让它立刻被弹回对话。
  const previousChatOpen = useRef(chatOpen);
  useEffect(() => {
    if (chatOpen && !previousChatOpen.current) setView("chat");
    previousChatOpen.current = chatOpen;
  }, [chatOpen]);

  // 别的页面写在 sessionStorage 里的待办提问／预填由 `use-agent-chat` 的
  // `takePendingAsk()` / `takeAgentPrefill()` 消费（「审阅修订」6）；这里只「看」
  // 不「取」，把视图先切到对话，免得那句话在概览屏上悄悄发出去。
  useEffect(() => {
    if (hasPendingOrbitAgentHandoff()) setView("chat");
  }, []);

  // 任务 5：strategy / contacts 两屏页头的「◷ 历史记录」是指向 `/app/agent?history=1`
  // 的链接（那两条路由没有壳的 hook，抽屉挂不上）。落到壳上就开抽屉，留在概览屏。
  useEffect(() => {
    if (initialHistoryOpen) setHistOpen(true);
  }, [initialHistoryOpen, setHistOpen]);

  // 任务 2 遗留 8：`navigate` 用 pushState 绕过 Next router，浏览器「后退」只还原
  // URL。监听 `popstate`，让后退键把视图退回概览（线程不清空）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      const search = new URLSearchParams(window.location.search);
      setView(search.get("q") || search.get("session") ? "chat" : "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 联系人分析页的「✦ 去 iOrbit 分析」（`contacts/network-0918/network-analysis.tsx:82`）
  // 把问题连同结构化 origin 写进 sessionStorage，hook 在 hydration 时
  // `takeAgentPrefill()` 取出（读完即删）。旧实现把它填进 dashboard 的简报输入框、
  // 由用户确认后带 origin 发出（`orbit-real-agent.tsx` 1740-1748 的 `onBriefAsk`）。
  // 这里落到对话输入区：不自动发送（用户先看见自己的原话），发送时补上 origin。
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!agentPrefill || prefilledRef.current) return;
    prefilledRef.current = true;
    setChatDraft(agentPrefill.query);
    setView("chat");
  }, [agentPrefill, setChatDraft]);

  const submitDraft = () => {
    const query = chatDraft.trim();
    // 任务 3 遗留：原来要求「一字未改」才带 origin，用户随手改一个词，结构化
    // 交接单（entryPointId / sourceDataVersion / template）就悄悄掉了。旧实现
    // （`orbit-real-agent.tsx:1749-1752` 的 `onBriefAsk`）带的是**用户实际提交的
    // 那句话** + 原 origin，origin 记的是来源入口而不是问题原文，改词不影响它。
    if (agentPrefill && !thinking && query) {
      const origin = agentPrefill.origin;
      setAgentPrefill(null);
      setChatDraft("");
      void ask(query, undefined, origin);
      return;
    }
    submitChatDraft();
  };

  // 交接单是**一次性**的。旧实现把它放在 dashboard 的一次性简报框里，用户一旦去做
  // 别的事，那个框连同 origin 就没了；新形态落在会话级输入区，如果只在 `submitDraft`
  // 里清，它会一直挂着——用户没发预填、转手点了个追问 chip、再从抽屉打开一条旧会话、
  // 然后问一个不相干的问题，那句话的请求体就会带上另一次分析的 `entryPointId` /
  // `sourceDataVersion` / `template`。因此：任何一次**没有用到它**的提问，以及开新
  // 对话 / 切到别的会话，都让它当场作废。
  const dropPrefill = () => setAgentPrefill(null);
  const askWithoutPrefill = (query: string, retryAssistantIndex?: number) => {
    dropPrefill();
    void ask(query, retryAssistantIndex);
  };
  const askFromThread = askWithoutPrefill;
  const startNewChat = () => {
    dropPrefill();
    newChat();
  };
  const startNewChatInGroup = (groupId: string) => {
    dropPrefill();
    newChatInGroup(groupId);
  };
  const openHistoryEntry = (item: Parameters<typeof pickHistory>[0]) => {
    dropPrefill();
    pickHistory(item);
  };

  // 进对话是非破坏性的（和「← 返回概览」对称）：已有线程照旧留着，只把 URL 与视图
  // 对齐。想开空线程走抽屉里的「新对话」。
  const openChat = () => {
    navigate("/agent");
    setView("chat");
  };

  return (
    <div
      aria-busy={thinking}
      data-orbit-agent-request-state={thinking ? "pending" : "idle"}
      data-orbit-ask-clearance="manual"
      data-orbit-real-page="agent"
      style={{ "--ink-3-text": "#6B6F99" } as CSSProperties}
    >
      {/* 回合内既有富组件（PanelCards / 任务卡 / 草稿卡 / 欢迎屏）与历史抽屉的皮肤：
          都是 `[data-orbit-real-page="agent"]` 作用域，外层 div 正好带着它。
          设计没有这些槽位，整体记一条偏差；类名全是 `ir-` 以外的旧类，不与新皮肤相撞。 */}
      <style>{CONSOLE_STYLES}</style>
      <div data-orbit-real-page="iorbit-0918">
        <style>{IORBIT_STYLES}</style>
        <h1
          className="ir-screen-title"
          data-orbit-agent-screen-title
        >
          {t({ en: "iOrbit workspace", zh: "iOrbit 工作区" })}
        </h1>
        <main className="ir-main">
          {inChat ? (
            <IOrbitChat
              ask={askFromThread}
              aside={
                <IOrbitChatAside
                  home={home}
                  onAsk={(query) => askWithoutPrefill(query)}
                  viewModel={viewModel}
                />
              }
              chatDraft={chatDraft}
              earlier={earlier}
              messages={messages}
              onLoadEarlier={() => void loadEarlier()}
              navigate={navigate}
              onBack={() => setView("home")}
              onDraftChange={setChatDraft}
              onOpenHistory={() => setHistOpen(true)}
              onSubmitDraft={submitDraft}
              taskSuggestions={taskSuggestions}
              thinking={thinking}
              userInitial={home?.account.initial || "A"}
              viewModel={viewModel}
            />
          ) : (
            <IOrbitHome
              communityJoined={communityJoined}
              guideEnabled={guideEnabled}
              home={home}
              navigate={(href) => {
                if (typeof window === "undefined") return;
                // W0059：去联系人详情前记下来路（不是联系人详情的 href 什么都不写）。
                noteContactNavigation(href);
                window.location.href = href;
              }}
              onAsk={(query) => {
                setView("chat");
                askWithoutPrefill(query);
              }}
              onOpenChat={() => openChat()}
              // 任务 4：抽屉是浮在当前屏之上的遮罩（设计 786），从概览打开时**留在概览**
              // ——任务 2 修订轮 1 让它顺带进对话，是因为当时抽屉还挂在旧组件里、
              // 必须先进对话分支才挂得上。挑中某条会话时 hook 置 chatOpen，壳照旧切视图。
              onOpenHistory={() => setHistOpen(true)}
              onOpenSession={(sessionId) => {
                setView("chat");
                // 抽屉列表里有就直接用那一行；没有（例如概览的三张卡来自另一页）时
                // 交给 `pickHistory` 自己按 sessionId 拉，恢复路径完全一致。
                openHistoryEntry(
                  storedHistory.find((item) => item.sessionId === sessionId) ?? {
                    group: "",
                    id: sessionId,
                    q: "",
                    sessionId,
                    title: "",
                    when: "",
                  },
                );
              }}
            />
          )}
        </main>
        {/* 设计 786–804 的抽屉（任务 4）。移动端不再单独一棵树（「审阅修订」15）：
            桌面与移动共用这一个抽屉，历史记录、新对话、分组、置顶、重命名、移动、
            删除全部经它进入。删除二次确认与 toast 仍由壳挂在下面。 */}
        {histOpen ? (
          <IOrbitHistoryDrawer
            activeQ={activeQ}
            activeSessionId={activeSessionId}
            groupMutationPending={groupMutationPending}
            groups={sessionGroups}
            history={storedHistory}
            historyHasMore={historyPageHasMore}
            historyLoading={historyPageLoading}
            historyQuery={historyQuery}
            language={language}
            onClose={() => setHistOpen(false)}
            onCreateGroup={(name) => { void createHistoryGroup(name); }}
            onDelete={deleteHistorySession}
            onDeleteGroup={(group) => { void deleteHistoryGroup(group); }}
            onFilterGroup={setSelectedSessionGroupId}
            onLoadMore={() => { void loadMoreHistory(); }}
            onMove={moveHistorySession}
            onSearch={setHistoryQuery}
            // iOrbit 合并前终审 2：抽屉里的「新对话」与挑一条历史都必须把视图带到
            // 对话。`chatOpen` 的同步只认上升沿（「返回概览」刻意不清 `chatOpen`），
            // 所以从对话 → 返回概览 → 抽屉 → 挑一条时，URL 与线程都换了、人还留在
            // 概览屏；「新对话」则是线程被悄悄清空。这里与 `onOpenSession` 同口径，
            // 由壳显式 `setView("chat")`。
            onNewChat={() => {
              startNewChat();
              setView("chat");
            }}
            onNewInGroup={(groupId) => {
              startNewChatInGroup(groupId);
              setView("chat");
            }}
            onPick={(item) => {
              openHistoryEntry(item);
              setView("chat");
            }}
            onRename={renameHistorySession}
            onRenameGroup={(group, name) => { void renameHistoryGroup(group, name); }}
            onTogglePin={togglePinnedHistorySession}
            pendingSessionId={historyMutationSessionId}
            selectedGroupId={selectedSessionGroupId}
          />
        ) : null}
      </div>

      {pendingDeleteHistory ? (
        <AgentHistoryDeleteDialog
          error={historyDeleteError}
          history={pendingDeleteHistory}
          onCancel={() => {
            setHistoryDeleteError(null);
            setPendingDeleteHistory(null);
          }}
          onConfirm={() => {
            void confirmDeleteHistorySession();
          }}
          pending={historyMutationSessionId === pendingDeleteHistory.sessionId}
        />
      ) : null}
      {historyFeedback ? (
        <div
          className="nc-toast show"
          data-orbit-agent-history-feedback={historyFeedback.kind}
          role={historyFeedback.kind === "error" ? "alert" : "status"}
          style={{
            bottom: 24,
            left: "50%",
            maxWidth: "min(520px, calc(100vw - 32px))",
            opacity: 1,
            pointerEvents: "auto",
            position: "fixed",
            transform: "translateX(-50%)",
            zIndex: ORBIT_Z.toast,
          }}
        >
          <Icon
            color={historyFeedback.kind === "error" ? "var(--coral-text)" : "var(--accent-text)"}
            name={historyFeedback.kind === "error" ? "x" : "check"}
            size={15}
          />
          <span>{historyFeedback.text}</span>
          <button
            aria-label={t({ en: "Dismiss", zh: "关闭提示" })}
            className="btn btn-icon btn-quiet"
            onClick={() => setHistoryFeedback(null)}
            style={{ height: 24, marginLeft: 4, width: 24 }}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { IORBIT_STYLES } from "./iorbit-styles";
