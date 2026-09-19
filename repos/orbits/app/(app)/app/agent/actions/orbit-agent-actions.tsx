/**
 * 建议与行动（Orbit_0918 iOrbit actions 屏）主界面（server component）。
 *
 * 视觉 = 0918 设计稿（面包屑、serif 900 标题、今日进度环、三档分组白卡）；
 * 数据 = 操作账本真实条目；写操作复用既有控件：
 *   需要你决定 → OrbitTodayDecisionForm（确认/稍后/忽略，与 Today 同一写入口）
 *   建议今天做 / 可稍后 → OrbitAllActionsControls（撤销/重试/取消）
 * 空态/失败态如实呈现，不放设计稿 mock 内容。
 */
import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { OrbitLanguage } from "../../orbit-language-core";
import { OrbitAllActionsControls } from "../../contacts/all-actions/orbit-all-actions-controls";
import { OrbitTodayDecisionForm } from "../../today/orbit-today-decision-form";
import type { AgentActionsRouteViewModel } from "./actions-route-view-model";

const COPY = {
  en: {
    backHome: "← Back to iOrbit",
    breadcrumbHome: "iOrbit",
    crumb: "Suggested actions",
    decide: "Needs your decision",
    decideIcon: "!",
    empty: "Nothing needs you right now — Orbit is watching the rest.",
    failureTitle: "The action ledger is temporarily unavailable.",
    later: "Can wait",
    laterIcon: "◷",
    progress: "Today's progress",
    progressDone: "done",
    retry: "Reload",
    ringOf: "of",
    title: "Suggested actions",
    today: "Do today",
    todayIcon: "⚡",
  },
  zh: {
    backHome: "← 返回概览",
    breadcrumbHome: "iOrbit",
    crumb: "建议与行动",
    decide: "需要你决定",
    decideIcon: "!",
    empty: "当前没有待你处理的事——其余的 Orbit 都盯着。",
    failureTitle: "操作账本暂时不可用。",
    later: "可稍后",
    laterIcon: "◷",
    progress: "今日进度",
    progressDone: "已完成",
    retry: "重新加载",
    ringOf: "/",
    title: "建议与行动",
    today: "建议今天做",
    todayIcon: "⚡",
  },
} as const;

type ActionsCopy = Record<keyof (typeof COPY)["zh"], string>;

const STATUS_LABELS: Record<string, { en: string; zh: string }> = {
  approved: { en: "Confirmed", zh: "已确认" },
  awaiting_confirmation: { en: "Awaiting confirmation", zh: "等待确认" },
  deferred: { en: "Deferred", zh: "稍后处理" },
  executing: { en: "Executing", zh: "正在执行" },
};

const ENTRY_TITLE_LABELS: Record<string, string> = {
  "Save to Agent Memory": "保存到智能记忆",
  "保存到 Agent Memory": "保存到智能记忆",
};

function entryTitle(value: string): string {
  return ENTRY_TITLE_LABELS[value] ?? value;
}

function ProgressRing({
  completed,
  copy,
  total,
}: {
  completed: number;
  copy: ActionsCopy;
  total: number;
}) {
  const ratio = total > 0 ? Math.min(1, completed / total) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="aga-ring" role="img" aria-label={`${copy.progress}: ${completed} ${copy.ringOf} ${total}`}>
      <svg height="84" width="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" fill="none" r={radius} stroke="#ECEEFB" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          fill="none"
          r={radius}
          stroke="#4B4FC7"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          strokeLinecap="round"
          strokeWidth="8"
          transform="rotate(-90 42 42)"
        />
      </svg>
      <span className="aga-ring-text">
        <strong>{completed}</strong>
        <span>{copy.ringOf} {total} {copy.progressDone}</span>
      </span>
    </div>
  );
}

function EntryCard({
  copy,
  entry,
  expanded,
  language,
}: {
  copy: ActionsCopy;
  entry: AgentLedgerEntry;
  expanded: boolean;
  language: OrbitLanguage;
}) {
  const status = STATUS_LABELS[entry.status];
  return (
    <article className="aga-entry" data-orbit-agent-action-entry={entry.entryId}>
      <div className="aga-entry-main">
        <strong className="aga-entry-title">{entryTitle(entry.title)}</strong>
        {entry.contactName ? (
          <span className="aga-entry-meta">
            {entry.contactName}
            {entry.organization ? ` · ${entry.organization}` : ""}
          </span>
        ) : null}
        {entry.whyNow ? <span className="aga-entry-why">{entry.whyNow}</span> : null}
        {entry.preview ? <span className="aga-entry-preview">{entry.preview}</span> : null}
        {entry.evidenceChips.length > 0 ? (
          <span className="aga-entry-chips">
            {entry.evidenceChips.map((chip) => (
              <span className="aga-chip" key={chip.evidenceId}>{chip.label}</span>
            ))}
          </span>
        ) : null}
      </div>
      <div className="aga-entry-side">
        {status ? (
          <span className="aga-status">{language === "zh" ? status.zh : status.en}</span>
        ) : null}
        {entry.status === "awaiting_confirmation" ? (
          <OrbitTodayDecisionForm
            entryId={entry.entryId}
            operations={entry.operations}
            status={entry.status}
          />
        ) : (
          <OrbitAllActionsControls
            canCancel={entry.status === "approved" || entry.status === "executing"}
            canRetry={entry.status === "failed" || entry.status === "partially_failed"}
            canUndo={entry.undoable}
            entryId={entry.entryId}
          />
        )}
      </div>
      {expanded ? null : null}
    </article>
  );
}

export function OrbitAgentActions({
  language,
  viewModel,
}: {
  language: OrbitLanguage;
  viewModel: AgentActionsRouteViewModel;
}) {
  const copy = COPY[language === "zh" ? "zh" : "en"];
  const tierMeta = {
    decide: { icon: copy.decideIcon, tint: "#FBECEA", color: "#B5473A", title: copy.decide },
    later: { icon: copy.laterIcon, tint: "#F1F1FA", color: "#6B6F99", title: copy.later },
    today: { icon: copy.todayIcon, tint: "#ECEEFB", color: "#4B4FC7", title: copy.today },
  } as const;

  return (
    <main data-orbit-real-page="agent-actions" className="aga-page">
      <style>{ACTIONS_STYLES}</style>
      <div className="aga-inner">
        <span className="aga-crumb">
          <a href="/app/agent">{copy.breadcrumbHome}</a> / {copy.crumb}
        </span>
        <a className="btn btn-ghost aga-back" href="/app/agent">{copy.backHome}</a>
        <header className="aga-header">
          <div>
            <h1 className="h-display aga-title">{copy.title}</h1>
          </div>
          <ProgressRing completed={viewModel.completedToday} copy={copy} total={viewModel.todaysTotal} />
        </header>

        {viewModel.state === "failure" ? (
          <section className="aga-card" role="alert">
            <strong>{copy.failureTitle}</strong>
            <span className="aga-entry-why">{viewModel.failureMessage}</span>
            <span>
              <a className="btn btn-ghost btn-sm" href="/app/agent/actions">{copy.retry}</a>
            </span>
          </section>
        ) : null}

        {viewModel.state === "empty" ? (
          <section className="aga-card aga-empty">{copy.empty}</section>
        ) : null}

        {viewModel.state === "success"
          ? viewModel.tiers.map((tier) => {
              const meta = tierMeta[tier.key];
              return (
                <section className="aga-tier" data-orbit-agent-actions-tier={tier.key} key={tier.key}>
                  <div className="aga-tier-head">
                    <span className="aga-tier-label">
                      <span className="aga-tier-icon" style={{ background: meta.tint, color: meta.color }}>{meta.icon}</span>
                      <strong className="h-display aga-tier-title">{meta.title}</strong>
                    </span>
                    <span className="aga-tier-count">{tier.entries.length} {language === "zh" ? "项" : "items"}</span>
                  </div>
                  {tier.entries.length === 0 ? (
                    <div className="aga-card aga-empty">{copy.empty}</div>
                  ) : (
                    tier.entries.map((entry) => (
                      <EntryCard
                        copy={copy}
                        entry={entry}
                        expanded={viewModel.selectedEntryId === entry.entryId}
                        key={entry.entryId}
                        language={language}
                      />
                    ))
                  )}
                </section>
              );
            })
          : null}
      </div>
    </main>
  );
}

/* Orbit_0918 actions 屏作用域样式：全部走类选择器 + 设计 token，不碰全局。 */
const ACTIONS_STYLES = `
[data-orbit-real-page="agent-actions"] {
  --ink: #0E1225; --text: #0E1225; --text-2: #3B3F7A; --text-3: #6B6F99; --text-4: #9FA3C4;
  --bg: #FBFBFE; --surface: #FFFFFF; --surface-2: #F7F7FD;
  --border: #E8E9F6; --border-2: #DDDEFA; --accent: #4B4FC7; --accent-soft: #ECEEFB;
  background: var(--bg); color: var(--text); min-height: 100dvh;
}
.aga-inner { margin: 0 auto; max-width: 920px; padding: 24px 24px 96px; display: flex; flex-direction: column; gap: 20px; }
.aga-crumb { font-size: 13px; color: var(--text-4); }
.aga-crumb a { color: var(--text-3); text-decoration: none; }
.aga-back { align-self: flex-start; }
.aga-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.aga-title { margin: 0; font-size: clamp(30px, 3.4vw, 40px); letter-spacing: -0.03em; }
.aga-ring { position: relative; width: 84px; height: 84px; flex: none; }
.aga-ring-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; color: var(--text-3); }
.aga-ring-text strong { font-size: 20px; color: var(--ink); }
.aga-tier { display: flex; flex-direction: column; gap: 12px; }
.aga-tier-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.aga-tier-label { display: flex; align-items: center; gap: 10px; }
.aga-tier-icon { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.aga-tier-title { font-size: 19px; letter-spacing: -0.02em; }
.aga-tier-count { font-size: 13px; color: var(--text-3); }
.aga-card, .aga-entry { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px; }
.aga-empty { color: var(--text-3); font-size: 14px; }
.aga-entry { display: flex; gap: 16px; justify-content: space-between; flex-wrap: wrap; }
.aga-entry-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.aga-entry-title { font-size: 15px; font-weight: 500; }
.aga-entry-meta { font-size: 13px; color: var(--text-2); }
.aga-entry-why { font-size: 13px; color: var(--text-3); }
.aga-entry-preview { font-size: 13px; color: var(--text-2); }
.aga-entry-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.aga-chip { font-size: 12px; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; }
.aga-entry-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.aga-status { font-size: 12px; color: var(--text-3); }
@media (max-width: 640px) {
  .aga-inner { padding: 18px 16px 72px; }
  .aga-entry-side { align-items: flex-start; }
}
`;
