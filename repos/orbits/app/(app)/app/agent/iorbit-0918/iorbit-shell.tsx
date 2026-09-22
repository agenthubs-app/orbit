/**
 * iOrbit（对话域）壳（Orbit_0918）。
 *
 * JSX 与样式来自 docs/designs/Orbit_0918/iOrbit.dc.html：
 *   11–13  字体 <link>（由既有 layout 提供，壳不重复注入）
 *   14–22  全局 CSS（* / body / a / a:hover / input,textarea,button / ::placeholder / @keyframes）
 *   25     页面包裹 min-height:100vh; background:#FBFBFE; overflow-x:clip
 *   27–41  顶栏：按「审阅修订」5 沿用 `AccountTopNav active="agent"`，设计的药丸头整体记一条偏差
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
 * 历史抽屉：设计的抽屉（786–804）是任务 4；本任务先把既有抽屉 / 删除二次确认 / toast
 * 原样挂在壳上，能力一条不丢（它们的样式在冻结表的 `[data-orbit-real-page="agent"]`
 * 作用域里，外层 div 正好带着这个作用域）。
 */
"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { AccountTopNav } from "../../orbit-account-shell";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitAgentViewModel } from "../../orbit-agent-route-view-model";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import type { EventRegistrationAvailability } from "../../orbit-event-registration-view-model";
import { hasPendingOrbitAgentHandoff } from "../../orbit-global-ask/orbit-ask-draft";
import { Icon } from "../../orbit-reference-primitives";
import { ORBIT_Z } from "../../orbit-z";
import { AgentHistoryDeleteDialog, AgentMobileHistoryDrawer, CONSOLE_STYLES } from "../orbit-real-agent";
import { IOrbitChat } from "./iorbit-chat";
import { IOrbitHome } from "./iorbit-home";
import { useAgentChat } from "./use-agent-chat";
import { useAgentHistory } from "./use-agent-history";

export interface IOrbitShellProps {
  home: OrbitHomeViewModel | null;
  /** 服务端解析出的 `?q=`／`?session=`：任一存在即直接落在对话分支（SSR 与首帧一致）。 */
  initialDeepLink?: boolean;
  registrationAvailabilityByEventId: Readonly<Record<string, EventRegistrationAvailability>>;
  viewModel: OrbitAgentViewModel;
}

export function IOrbitShell({
  home,
  initialDeepLink = false,
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
    moveHistorySession,
    pendingDeleteHistory,
    renameHistoryGroup,
    renameHistorySession,
    sessionGroups,
    setHistoryDeleteError,
    setHistoryFeedback,
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
    ask,
    chatDraft,
    chatOpen,
    histOpen,
    messages,
    navigate,
    newChat,
    newChatInGroup,
    pickHistory,
    setActiveQ,
    setActiveSessionId,
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

  // 进对话是非破坏性的（和「← 返回概览」对称）：已有线程照旧留着，只把 URL 与视图
  // 对齐；「◷ 历史记录」额外把抽屉打开。想开空线程走抽屉里的「新对话」。
  const openChat = (withHistory = false) => {
    navigate("/agent");
    setView("chat");
    if (withHistory) setHistOpen(true);
  };

  return (
    <div
      aria-busy={thinking}
      data-orbit-agent-request-state={thinking ? "pending" : "idle"}
      data-orbit-ask-clearance="manual"
      data-orbit-real-page="agent"
      style={{ "--text-3": "#6B6F99", "--text-4": "#9FA3C4" } as CSSProperties}
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
        <AccountTopNav active="agent" />
        <main className="ir-main">
          {inChat ? (
            <IOrbitChat
              ask={(query, retryAssistantIndex) => {
                void ask(query, retryAssistantIndex);
              }}
              chatDraft={chatDraft}
              messages={messages}
              navigate={navigate}
              onBack={() => setView("home")}
              onDraftChange={setChatDraft}
              onOpenHistory={() => setHistOpen(true)}
              onSubmitDraft={submitChatDraft}
              taskSuggestions={taskSuggestions}
              thinking={thinking}
              userInitial={home?.account.initial || "A"}
              viewModel={viewModel}
            />
          ) : (
            <IOrbitHome
              home={home}
              navigate={(href) => {
                if (typeof window !== "undefined") window.location.href = href;
              }}
              onAsk={(query) => {
                setView("chat");
                void ask(query);
              }}
              onOpenChat={() => openChat()}
              onOpenHistory={() => openChat(true)}
              onOpenSession={(sessionId) => {
                setView("chat");
                // 抽屉列表里有就直接用那一行；没有（例如概览的三张卡来自另一页）时
                // 交给 `pickHistory` 自己按 sessionId 拉，恢复路径完全一致。
                pickHistory(
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
      </div>

      {/* 既有历史能力（抽屉 / 删除二次确认 / toast）原样保留，设计的抽屉是任务 4 */}
      {histOpen ? (
        <AgentMobileHistoryDrawer
          activeQ={activeQ}
          activeSessionId={activeSessionId}
          groupMutationPending={groupMutationPending}
          groups={sessionGroups}
          history={storedHistory}
          language={language}
          onClose={() => setHistOpen(false)}
          onDelete={deleteHistorySession}
          onCreateGroup={(name) => { void createHistoryGroup(name); }}
          onDeleteGroup={(group) => { void deleteHistoryGroup(group); }}
          onFilterGroup={setSelectedSessionGroupId}
          onNavigate={navigate}
          onNewChat={newChat}
          onNewInGroup={newChatInGroup}
          onMove={moveHistorySession}
          onPick={pickHistory}
          onRename={renameHistorySession}
          onRenameGroup={(group, name) => { void renameHistoryGroup(group, name); }}
          onTogglePin={togglePinnedHistorySession}
          pendingSessionId={historyMutationSessionId}
          sessionGroups={sessionGroups}
        />
      ) : null}
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
            color={historyFeedback.kind === "error" ? "var(--danger)" : "var(--accent)"}
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

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。前缀 [data-orbit-real-page="iorbit-0918"]。
export const IORBIT_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
/* ── 设计 14–22 的全局 CSS + 25 行的页面包裹 ── */
[data-orbit-real-page="iorbit-0918"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip;
  /* 双层作用域（「审阅修订」2）：外层 [data-orbit-real-page="agent"] 把字号压到 15px、
     行高压到 1.65，设计的 body 两者都没写（=16px / normal），这里显式还原。行高不还原时
     每个块的行盒都高 2px，面包屑→标题→副标题会累积出 5–6px 的纵向漂移。 */
  font-size: 16px; line-height: normal; }
[data-orbit-real-page="iorbit-0918"] * { box-sizing: border-box; }
[data-orbit-real-page="iorbit-0918"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="iorbit-0918"] a:hover { color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] input, [data-orbit-real-page="iorbit-0918"] textarea, [data-orbit-real-page="iorbit-0918"] button { font-family: inherit; }
[data-orbit-real-page="iorbit-0918"] input::placeholder, [data-orbit-real-page="iorbit-0918"] textarea::placeholder { color: #9FA3C4; }
/* 视觉隐藏的屏幕标题（设计无此元素；既有测试与审计要 data-orbit-agent-screen-title） */
[data-orbit-real-page="iorbit-0918"] .ir-screen-title { clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
/* ── <main>（设计 43）与概览屏外层（设计 47）── */
[data-orbit-real-page="iorbit-0918"] .ir-main { max-width: 1240px; margin: 0 auto; padding: 14px 40px 72px; display: flex; flex-direction: column; gap: 26px; }
[data-orbit-real-page="iorbit-0918"] .ir-home { display: flex; flex-direction: column; gap: 26px; animation: orbit-fade .3s ease; }
/* ── 标题行（设计 49–55）── */
[data-orbit-real-page="iorbit-0918"] .ir-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 24px; }
[data-orbit-real-page="iorbit-0918"] .ir-head-copy { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
[data-orbit-real-page="iorbit-0918"] .ir-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(34px, 4vw, 46px); line-height: 1.1; letter-spacing: -0.03em; }
[data-orbit-real-page="iorbit-0918"] .ir-sub { margin: 0; font-size: 16px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-today { font-size: 14px; color: #6B6F99; }
/* ── 提问行 + chips + 打开对话（设计 57–74）── */
[data-orbit-real-page="iorbit-0918"] .ir-grid-ask { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 16px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-ask-col { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-ask { display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 20px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; box-shadow: 0 6px 24px rgba(59,63,122,0.06); }
[data-orbit-real-page="iorbit-0918"] .ir-ask-icon { color: #4B4FC7; font-size: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-ask-input { flex: 1; min-width: 0; border: 0; border-radius: 0; outline: none; background: transparent; font-size: 15px; color: #0E1225;
  /* 设计 input 保留 Chrome 默认 padding 1px 2px；基类 reset 清成 0，这里补回 */
  padding: 1px 2px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-ask-send { width: 36px; height: 36px; border: 0; border-radius: 50%; background: #ECEEFB; color: #2E3270; font-size: 15px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  padding: 0; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-ask-send:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-ask-send:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-chips { display: flex; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-chip { padding: 9px 16px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chip { padding: 9px 16px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .ir-chip:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-chip:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chip:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-open-chat { justify-self: start; display: flex; align-items: center; gap: 12px; padding: 16px 22px; border: 1px solid #B9BCEB; border-radius: 16px; background: #FFFFFF; color: #2E3270; font-size: 16px; font-weight: 500; cursor: pointer;
  height: auto; justify-content: flex-start; white-space: nowrap; text-align: left; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-open-chat:hover { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-open-chat:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-open-chat-icon { width: 30px; height: 30px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-caret { color: #9FA3C4; }
/* ── 卡片栅格与卡片（设计 77 / 79 / 109 / 148 / 172 / 195 / 214）── */
[data-orbit-real-page="iorbit-0918"] .ir-grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 20px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-card { border: 1px solid #E8E9F6; border-radius: 20px; background: #FFFFFF; padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-16 { gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-14 { gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #E8E9F6; }
[data-orbit-real-page="iorbit-0918"] .ir-card-title { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-icon { width: 30px; height: 30px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-h { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; }
[data-orbit-real-page="iorbit-0918"] .ir-card-link { font-size: 13px; color: #4B4FC7; }
/* ── 今日日程（设计 84–107）── */
[data-orbit-real-page="iorbit-0918"] .ir-brief { padding: 16px 18px; border-radius: 14px; background: #ECEEFB; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-brief-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-brief-icon { color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-brief-line { font-size: 13px; line-height: 1.7; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-row { display: grid; grid-template-columns: 96px 14px minmax(0, 1fr); gap: 14px; align-items: flex-start; padding: 12px 0; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-div { border-top: 1px solid #F1F1FA; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-time { font-size: 13px; color: #6B6F99; padding-top: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-dot { display: block; width: 10px; height: 10px; margin-top: 6px; border-radius: 50%; }
[data-orbit-real-page="iorbit-0918"] .ir-tone-a { background: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-tone-b { background: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-tone-c { background: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-meta { font-size: 13px; color: #6B6F99; }
/* ── 日历（设计 112–144）── */
[data-orbit-real-page="iorbit-0918"] .ir-cal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 18px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-left { display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-bar { display: flex; align-items: center; justify-content: space-between; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-month { font-size: 16px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-nav { display: flex; gap: 6px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn { width: 28px; height: 28px; border: 1px solid #E8E9F6; border-radius: 8px; background: #FFFFFF; color: #6B6F99; cursor: pointer;
  /* 设计 117/118 的 button 没写 font-size，浏览器默认 13.3333px；.btn 基类会压成 15px。 */
  padding: 0; font-size: 13.3333px; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn[aria-disabled="true"] { cursor: default; opacity: 0.6; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-wd { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-blank { position: relative; height: 34px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-day { position: relative; height: 34px; border: 0; border-radius: 50%; background: transparent; color: #0E1225; font-size: 13px; font-weight: 400; cursor: pointer;
  padding: 0; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-day:active { transform: none; }
/* 设计 126 的 font-weight:{{ d.weight }} 是动态值：用修饰类，不内联（「审阅修订」21） */
[data-orbit-real-page="iorbit-0918"] .btn.ir-day-on { background: #4B4FC7; color: #FFFFFF; font-weight: 700; }
[data-orbit-real-page="iorbit-0918"] .ir-day-dot { position: absolute; left: 50%; bottom: 1px; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: transparent; }
[data-orbit-real-page="iorbit-0918"] .ir-day-dot-a { background: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-day-dot-b { background: #B9BCEB; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel { border-radius: 14px; background: #F7F7FD; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel-count { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; flex: none; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-copy { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-meta { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-title { font-size: 14px; font-weight: 500; }
/* ── 已报名活动（设计 152–169）── */
[data-orbit-real-page="iorbit-0918"] .ir-event { display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 14px; background: #FFFFFF; }
[data-orbit-real-page="iorbit-0918"] .ir-event:hover { background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-event-date { width: 76px; height: 66px; flex: none; border-radius: 12px; color: #2E3270; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
[data-orbit-real-page="iorbit-0918"] .ir-bg-a { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .ir-bg-b { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .ir-event-month { font-size: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-event-day { font-size: 22px; font-family: 'Noto Serif SC', serif; font-weight: 900; }
[data-orbit-real-page="iorbit-0918"] .ir-event-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page="iorbit-0918"] .ir-event-title { font-size: 15px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-event-meta { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-event-chip { padding: 6px 12px; border-radius: 999px; background: #E6F1EC; color: #2F6B4F; font-size: 12px; }
/* ── 建议与行动（设计 176–192）── */
[data-orbit-real-page="iorbit-0918"] .ir-signal { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-action { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; cursor: pointer;
  height: auto; justify-content: flex-start; font-size: 15px; font-weight: 400; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-action:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-action:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-action-icon { width: 34px; height: 34px; flex: none; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-action-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-action-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-action-desc { font-size: 13px; color: #6B6F99; }
/* 设计没有画 done / snooze / 刷新，既有写操作必须保留（「审阅修订」10）：沿用 chip 口径 */
[data-orbit-real-page="iorbit-0918"] .ir-signal-ops { display: flex; gap: 8px; padding-left: 48px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-signal-op, [data-orbit-real-page="iorbit-0918"] .btn.ir-refresh { padding: 5px 12px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #6B6F99; font-size: 12px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-signal-op:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-refresh:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-signal-op:active, [data-orbit-real-page="iorbit-0918"] .btn.ir-refresh:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-refresh { align-self: flex-start; }
/* ── 联系人机会（设计 199–211）── */
[data-orbit-real-page="iorbit-0918"] .ir-person { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-person:hover { background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-person-avatar { width: 44px; height: 44px; flex: none; border-radius: 50%; color: #2E3270; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-person-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-person-name-row { display: flex; align-items: baseline; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-person-name { font-size: 15px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-person-meta { font-size: 13px; color: #6B6F99; }
/* ── 本周推进（设计 218–234）── */
[data-orbit-real-page="iorbit-0918"] .ir-goal { padding: 16px 18px; border-radius: 14px; background: #ECEEFB; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
[data-orbit-real-page="iorbit-0918"] .ir-goal-copy { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page="iorbit-0918"] .ir-goal-title { font-size: 14px; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-goal-text { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-progress { display: flex; flex-direction: column; gap: 8px; min-width: 140px; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-row { display: flex; justify-content: space-between; font-size: 12px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-value { font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-track { display: block; height: 6px; border-radius: 999px; background: #FFFFFF; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-fill { display: block; height: 6px; border-radius: 999px; background: #4B4FC7; transition: width .3s ease; }
[data-orbit-real-page="iorbit-0918"] .ir-tasks { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-task { display: flex; align-items: center; gap: 12px; padding: 4px 0; text-align: left; }
[data-orbit-real-page="iorbit-0918"] .ir-task-box { width: 20px; height: 20px; flex: none; border: 1px solid #DDDEFA; border-radius: 6px; background: #FFFFFF; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-task-box-done { border-color: #4B4FC7; background: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-task-text { font-size: 14px; color: #0E1225; text-decoration: none; }
[data-orbit-real-page="iorbit-0918"] .ir-task-text-done { color: #9FA3C4; text-decoration: line-through; }
/* ── 继续对话（设计 239–251）── */
[data-orbit-real-page="iorbit-0918"] .ir-resume-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-note { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-actions { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-history-btn { display: flex; align-items: center; gap: 8px; padding: 9px 16px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-history-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-history-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-enter-btn { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-enter-btn:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-enter-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-resume-card { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; cursor: pointer;
  height: auto; justify-content: flex-start; font-size: 15px; font-weight: 400; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-resume-card:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-resume-card:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-icon { width: 32px; height: 32px; flex: none; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-copy { flex: 1; display: flex; flex-direction: column; gap: 3px; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-card-title { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-card-meta { font-size: 12px; color: #9FA3C4; }
/* ══ 对话屏（设计 256–319）══════════════════════════════════════════════ */
[data-orbit-real-page="iorbit-0918"] .ir-chat { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
/* ── 面包屑（设计 258）── */
[data-orbit-real-page="iorbit-0918"] .ir-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-crumb-link { color: #6B6F99; }
/* ── 标题行 + 两枚按钮（设计 259–267）── */
[data-orbit-real-page="iorbit-0918"] .ir-chat-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-head-copy { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(30px, 3.4vw, 40px); letter-spacing: -0.03em; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-actions { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-back-btn { display: flex; align-items: center; gap: 8px; padding: 11px 18px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer;
  height: auto; font-weight: 400; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-back-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-back-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chat-history-btn { display: flex; align-items: center; gap: 8px; padding: 11px 18px; border: 1px solid #B9BCEB; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; cursor: pointer;
  height: auto; font-weight: 400; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chat-history-btn:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chat-history-btn:active { transform: none; }
/* ── 两列栅格与线程卡（设计 269–270）；右列 aside（321–343）是任务 4 ── */
[data-orbit-real-page="iorbit-0918"] .ir-chat-grid { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr); gap: 22px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-thread { border: 1px solid #E8E9F6; border-radius: 20px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
/* ── 日期分隔（设计 271）── */
[data-orbit-real-page="iorbit-0918"] .ir-day-sep { align-self: center; padding: 6px 16px; border-radius: 999px; background: #F7F7FD; font-size: 12px; color: #6B6F99; }
/* ── 用户回合（设计 272–275）── */
[data-orbit-real-page="iorbit-0918"] .ir-user-row { display: flex; justify-content: flex-end; align-items: flex-start; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-user-bubble { padding: 12px 16px; border-radius: 14px; background: #ECEEFB; font-size: 14px; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-user-avatar { width: 32px; height: 32px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
/* ── 助手回合（设计 276–297）；时间戳与 ♡ / ⌄ 无来源，省略 ── */
[data-orbit-real-page="iorbit-0918"] .ir-a-row { display: flex; gap: 12px; align-items: flex-start; }
[data-orbit-real-page="iorbit-0918"] .ir-a-avatar { width: 32px; height: 32px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-a-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-a-name-row { display: flex; align-items: baseline; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-a-name { font-size: 14px; }
/* 设计 280 的气泡 + 281 的正文字号/颜色（正文由 AgentMarkdown 渲染，样式落在容器上） */
[data-orbit-real-page="iorbit-0918"] .ir-a-body { padding: 18px; border-radius: 16px; background: #F7F7FD; display: flex; flex-direction: column; gap: 14px; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-a-note { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-a-tools { display: flex; gap: 14px; color: #9FA3C4; font-size: 14px; }
/* 设计没有重试按钮（既有能力，「审阅修订」8）：沿用追问 chip 的形 */
[data-orbit-real-page="iorbit-0918"] .btn.ir-retry { align-self: flex-start; padding: 7px 14px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-retry:hover { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-retry:active { transform: none; }
/* ── 追问 chips（设计 299–304）：同一个类既给链接也给按钮元素，写两条规则 ── */
[data-orbit-real-page="iorbit-0918"] .ir-followups { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
[data-orbit-real-page="iorbit-0918"] .ir-followup { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-followup { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .ir-followup:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-followup:hover { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-followup:active { transform: none; }
/* ── 输入区（设计 305–309）── */
[data-orbit-real-page="iorbit-0918"] .ir-composer { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; border: 1px solid #DDDEFA; border-radius: 16px; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-composer-plus { width: 32px; height: 32px; flex: none; border-radius: 10px; background: #FFFFFF; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-composer-input { flex: 1; min-width: 0; border: 0; border-radius: 0; outline: none; background: transparent; font-size: 14px; color: #0E1225;
  /* 设计 input 保留 Chrome 默认 padding 1px 2px；基类 reset 清成 0，这里补回 */
  padding: 1px 2px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send { width: 36px; height: 36px; border: 0; border-radius: 50%; background: #ECEEFB; color: #2E3270; font-size: 15px; cursor: pointer;
  padding: 0; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send:disabled { color: #9FA3C4; cursor: default; }
/* ── 试试这些问题（设计 310–314）── */
[data-orbit-real-page="iorbit-0918"] .ir-try { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-try-chip { padding: 7px 14px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 12px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-try-chip:hover { border-color: #B9BCEB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-try-chip:active { transform: none; }
/* ── 空态 / 加载提示（设计无此元素）── */
[data-orbit-real-page="iorbit-0918"] .ir-note { margin: 0; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-note-error { color: #B5473A; }
/* 设计稿无响应式声明；窄屏收紧 <main> 侧边距（1240 宽度下不生效） */
@media (max-width: 900px) {
  [data-orbit-real-page="iorbit-0918"] .ir-main { padding: 14px 16px 72px; }
}
`;
