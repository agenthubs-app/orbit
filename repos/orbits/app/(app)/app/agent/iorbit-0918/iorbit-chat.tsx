/**
 * iOrbit 对话屏（Orbit_0918）。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html 第 256–319 行：
 *   258      面包屑 `iOrbit / 对话`
 *   259–267  标题行 + 「← 返回概览」 +「◷ 历史记录」
 *   269–270  两列栅格（右列 aside 是任务 4）+ 线程卡
 *   271      日期分隔
 *   272–275  用户气泡 + 首字母头像
 *   276–297  助手回合（头像 / 名字 / 正文 / 事件卡 / 收尾句 / 反应行）
 *   299–304  追问 chips（右对齐；其中两枚是导航）
 *   305–309  输入区（＋ / input / →）
 *   310–314  试试这些问题
 *
 * 设计没有画的既有能力一律保留（计划「审阅修订」9），每条都在报告的偏差表里：
 * `AgentActionStatusCard`、`AgentTaskInteractionCard`（经 `PanelCards` 的待办卡）、
 * `AgentInlineDraftResult`（同上）、`PanelCards`、重试按钮（onClick 表达式逐字保留，
 * 「审阅修订」8）、`ThinkingIndicator`、`AgentMarkdown`（`next/dynamic` 必须留在本文件，
 * `tests/performance/orbit-agent-markdown-split.test.ts` 指着它）、per-message `note` 行、
 * 用户行与助手行的复制按钮、`useAgentTaskSuggestions` 的身份补丁（在 `use-agent-chat` 里）、
 * `AgentWelcome` 空态。
 *
 * 设计有、但没有来源的两处按「不得出现 mock」处理：助手时间戳（`AgentMessage` 无时间
 * 字段）省略；♡ / ⌄ 反应省略（`tests/pages/app-agent-feedback-controls.test.ts:38`
 * 明令对话里不得出现 `AgentOutcomeFeedback`，「审阅修订」24）。
 */
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitAgentViewModel } from "../../orbit-agent-route-view-model";
import { AgentActionStatusCard } from "../agent-action-status-card";
import { AgentTaskInteractionCard } from "../agent-task-interaction-card";
import type { useAgentTaskSuggestions } from "../agent-task-interaction-client";
import {
  AgentMessageCopyButton,
  AgentWelcome,
  PanelCards,
  ThinkingIndicator,
} from "./iorbit-rich-components";
import { agentSuggestLabel, iorbitSelectedDayLabel, type AgentMessage } from "./iorbit-model";

// 首屏不加载 markdown 渲染器（门禁：tests/performance/orbit-agent-markdown-split.test.ts）。
const AgentMarkdown = dynamic(() => import("../agent-markdown"), {
  loading: () => <div aria-hidden="true" className="orbit-agent-markdown" />,
});

export interface IOrbitChatProps {
  /** `use-agent-chat` 的 `ask`：第二个参数是重试时的助手回合下标。 */
  ask: (query: string, retryAssistantIndex?: number) => void;
  /** 设计 321–343 的右栏（`iorbit-chat-aside.tsx`），由壳组装后传入。 */
  aside?: ReactNode;
  chatDraft: string;
  messages: readonly AgentMessage[];
  navigate: (href: string) => void;
  /** 非破坏性返回（「审阅修订」17）：只切视图，不清空线程。 */
  onBack: () => void;
  onDraftChange: (value: string) => void;
  onOpenHistory: () => void;
  onSubmitDraft: () => void;
  /** `useAgentTaskSuggestions` 的延迟补丁：按对象身份只打回原回合。 */
  taskSuggestions: ReturnType<typeof useAgentTaskSuggestions>;
  thinking: boolean;
  /** 设计 274 的首字母头像：取 profile 的真实首字母，无资料时回落「A」。 */
  userInitial: string;
  viewModel: OrbitAgentViewModel;
}

export function IOrbitChat({
  ask,
  aside,
  chatDraft,
  messages,
  navigate,
  onBack,
  onDraftChange,
  onOpenHistory,
  onSubmitDraft,
  taskSuggestions,
  thinking,
  userInitial,
  viewModel,
}: IOrbitChatProps) {
  const { language, t } = useOrbitLanguage();
  const panelLanguage = language === "zh" ? "zh" : "en";
  const endRef = useRef<HTMLDivElement | null>(null);

  // 设计是普通文档流（不再有 height:100dvh 的内部滚动容器，「审阅修订」15）：
  // **新回合出现时**把线程末尾滚进视野，取代旧实现的 `scroll.scrollTop = scrollHeight`。
  // 首帧（含 `?session=` 恢复整段历史）不滚：滚的是整个窗口，一上来就跳到底会把
  // 面包屑、标题与顶栏推出视野。
  const turnCountRef = useRef<number | null>(null);
  useEffect(() => {
    const count = messages.length;
    const previous = turnCountRef.current;
    turnCountRef.current = count;
    if (previous === null) return;
    // `?session=` 恢复会把整段历史一次性灌进来（0 → N，且没有 thinking）：那是「打开
    // 旧对话」，应该停在页首而不是跳到底。只有正在等回答、或已经在对话里又多了一轮
    // 时才滚。
    if (thinking || (previous > 0 && count > previous)) {
      endRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [messages, thinking]);

  const today = new Date();
  const dayLabel = iorbitSelectedDayLabel(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
    language === "zh" ? "zh" : "en",
  );

  // 设计 300–303 的四枚追问：两枚发消息，两枚是导航（`goStrategy` / `goContacts`）。
  // 导航两枚的文案取设计自己的导航说法，不沿用 306 那句带具体行业的 mock。
  const followupAsks = [
    t({ en: "How do I sign up for these events?", zh: "这些活动怎么报名？" }),
    t({ en: "Recommend more events like these", zh: "推荐更多类似活动" }),
  ];
  const followupLinks = [
    { href: "/app/agent/strategy", label: t({ en: "Draft a plan for me", zh: "帮我制定推进计划" }) },
    {
      href: "/app/agent/strategy?view=contacts",
      label: t({ en: "Who should I contact first?", zh: "我应该先联系谁？" }),
    },
  ];

  const hasThread = messages.length > 0 || thinking;

  return (
    <div className="ir-chat">
      {/* 258 */}
      <span className="ir-crumb">
        <a
          className="ir-crumb-link"
          href="/app/agent"
          onClick={(event) => {
            event.preventDefault();
            onBack();
          }}
        >
          iOrbit
        </a>
        {` / ${t({ en: "Chat", zh: "对话" })}`}
      </span>

      {/* 259–267 */}
      <div className="ir-chat-head">
        <div className="ir-chat-head-copy">
          <h2 className="ir-chat-h1">{t({ en: "Chat", zh: "对话" })}</h2>
          <p className="ir-chat-sub">
            {t({
              en: "Tell iOrbit what you need — it answers with your events and contacts in view.",
              zh: "与 iOrbit 分享你的问题，我会结合活动与人脉信息，为你提供个性化的建议。",
            })}
          </p>
        </div>
        <span className="ir-chat-actions">
          <button className="btn ir-back-btn" onClick={onBack} type="button">
            {t({ en: "← Back to overview", zh: "← 返回概览" })}
          </button>
          <button className="btn ir-chat-history-btn" onClick={onOpenHistory} type="button">
            {t({ en: "◷ History", zh: "◷ 历史记录" })}
          </button>
        </span>
      </div>

      {/* 269：左列线程 + 右列 aside（321–343，任务 4 由壳传入） */}
      <div className="ir-chat-grid">
        <section className="ir-thread" data-orbit-iorbit-thread>
          {hasThread ? <span className="ir-day-sep">{`${t({ en: "Today", zh: "今天" })} · ${dayLabel}`}</span> : null}

          {messages.map((message, index) =>
            message.role === "user" ? (
              <div className="ir-user-row" key={`user-${index}`}>
                <AgentMessageCopyButton text={message.text} />
                <span className="ir-user-bubble">{message.text}</span>
                <span className="ir-user-avatar">{userInitial}</span>
              </div>
            ) : (
              <div className="ir-a-row" key={`assistant-${index}`}>
                {/* 设计 277 的助手头像是 ✦ 字形（与概览屏的 `ir-ask-icon` / `ir-card-icon`
                    同一套），不是旧控制台的 `AgentStar` SVG */}
                <span className="ir-a-avatar">✦</span>
                <span className="ir-a-col">
                  <span className="ir-a-name-row">
                    <strong className="ir-a-name">iOrbit</strong>
                  </span>
                  <span className="ir-a-body">
                    {message.note ? (
                      <span className="ir-a-note">{message.note}</span>
                    ) : null}
                    <AgentMarkdown text={message.text} />
                    {message.taskInteraction ? (
                      <AgentTaskInteractionCard
                        interaction={message.taskInteraction}
                        language={panelLanguage}
                        {...taskSuggestions.forInteraction(message.taskInteraction)}
                      />
                    ) : null}
                    {message.items.length > 0 ? (
                      <PanelCards
                        language={panelLanguage}
                        navigate={navigate}
                        panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }}
                        t={t}
                      />
                    ) : null}
                    {message.runId && message.actionIds?.length ? (
                      <AgentActionStatusCard
                        actionIds={message.actionIds}
                        language={panelLanguage}
                        navigate={navigate}
                        runId={message.runId}
                        showRunDetails={false}
                      />
                    ) : null}
                    {message.retryRequest ? (
                      <button
                        className="btn ir-retry"
                        data-agent-message-retry-request
                        disabled={thinking}
                        onClick={() => void ask(message.retryRequest!, index)}
                        type="button"
                      >
                        {language === "zh" ? "重新提交请求" : "Retry request"}
                      </button>
                    ) : null}
                  </span>
                  {/* 设计 296 的 ⧉ = 既有复制能力；♡ / ⌄ 省略（「审阅修订」24） */}
                  <span className="ir-a-tools">
                    <AgentMessageCopyButton text={message.text} />
                  </span>
                </span>
              </div>
            ),
          )}

          {thinking ? (
            <div className="ir-a-row orbit-agent-thinking-turn">
              <span className="ir-a-avatar">✦</span>
              <span className="ir-a-col">
                <span className="ir-a-body">
                  <ThinkingIndicator t={t} />
                </span>
              </span>
            </div>
          ) : null}

          {/* 设计的对话屏没有空态；旧实现的欢迎屏是真实能力，保留（「审阅修订」9） */}
          {hasThread ? null : <AgentWelcome onPick={(query) => ask(query)} viewModel={viewModel} />}

          <div ref={endRef} />

          {/* 299–304 */}
          {hasThread ? (
            <div className="ir-followups">
              {followupAsks.map((label) => (
                <button
                  className="btn ir-followup"
                  key={label}
                  onClick={() => ask(label)}
                  type="button"
                >
                  {label}
                </button>
              ))}
              {followupLinks.map((link) => (
                <a className="ir-followup" href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}

          {/* 305–309 */}
          <form
            aria-busy={thinking}
            className="ir-composer"
            data-orbit-agent-chat-composer
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitDraft();
            }}
          >
            {/* 设计 306 的「＋」是附件入口，今天没有上传能力 → aria-disabled 的静态标记 */}
            <span
              aria-disabled="true"
              className="ir-composer-plus"
              title={t({ en: "Attachments are not available yet", zh: "附件功能即将开放" })}
            >
              ＋
            </span>
            <input
              aria-label={t({
                en: "Ask Orbit about contacts, events, and relationship to-dos",
                zh: "询问 Orbit 人脉、活动与关系待办",
              })}
              className="ir-composer-input"
              data-orbit-agent-chat-input
              disabled={thinking}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={t({
                en: "Tell me what you need — events, the right people, meeting prep…",
                zh: "告诉我你想了解什么？例如：推荐活动、寻找合适的人脉、准备会议资料…",
              })}
              type="text"
              value={chatDraft}
            />
            <button
              aria-label={t({ en: "Send Ask Orbit message", zh: "发送给 Orbit" })}
              // 合并前终审 6：设计定稿是 36px 圆钮，但项目口径（`.hit-44` ::after，
              // `tests/pages/orbit-agent-api-ui.test.ts:61-62`）要求发送键保留 44px
              // 热区。视觉尺寸一像素不动，只补回被换屏丢掉的热区。
              className="btn ir-composer-send hit-44"
              data-orbit-agent-submit="true"
              disabled={thinking || !chatDraft.trim()}
              type="submit"
            >
              →
            </button>
          </form>

          {/* 310–314：三枚示例问题复用真实的 `viewModel.suggests` */}
          <span className="ir-try">
            {t({ en: "Try one of these:", zh: "试试这些问题：" })}
            {viewModel.suggests.slice(0, 3).map((suggest) => (
              <button
                className="btn ir-try-chip"
                key={suggest.label}
                onClick={() => ask(suggest.q)}
                type="button"
              >
                {agentSuggestLabel(suggest.label, language === "ja" ? "en" : language)}
              </button>
            ))}
          </span>
        </section>
        {aside}
      </div>
    </div>
  );
}
