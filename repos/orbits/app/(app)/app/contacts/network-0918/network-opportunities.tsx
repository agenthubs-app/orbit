/**
 * W0050（RN-08）：「AI 人脉分析」的「机会」标签（从 network-analysis.tsx 拆出）。数据 = 服务端 `loadOpportunitiesTab`。
 *
 * 五块（从上到下）：① 规则覆盖度（计划人脉需求的确认关联 ÷ 目标人数；无计划时只换这一块为「去生成计划」）
 * ② 缺口补法（每条还缺人的需求：≤2 场活动、「待确认 N」打开同一个确认组件、快照 gap 句子带依据）
 * ③ 本周建议动作（计划本周行动直链 `/app/agent/plan#plan-action-<id>`，「N 位待确认」入口）
 * ④ 待唤醒（dormant 且与目标相关，规则拼句带依据，「起草邮件」= 模板草稿，不发送、不保存）
 * ⑤ 报告卡（W0048a 快照：生成于／基于 N 人／新增 M 人未纳入；「重新分析」= 用户主动池 1 次操作）。
 *
 * 不再有：「⟳ 刷新机会」、固定阈值覆盖拨盘、「高价值／核心关系」两行、规则重排的建议动作、「去 iOrbit 分析」。
 * 本组件不请求 `/api/dashboard/opportunities/recompute`、`/api/contacts/needs-matches`，也不调用任何模型。
 */
"use client";

import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { PlanMatchDialog, PlanMatchSheet } from "../../agent/iorbit-0918/plan-match-sheet";
import type { PlanMatchCandidate } from "../../agent/iorbit-0918/plan-match-client";
import { newPlanIdempotencyKey } from "../../agent/iorbit-0918/iorbit-plan-client";
import type { NetworkSnapshotView } from "../../../../../features/network-analysis/contract";
import type { DormantRow, NeedCoverageRow, OpportunitiesTabView } from "../analysis/opportunities-view-model";
import { PLAN_HREF, reportCardModel, type ReportCardLimit } from "../analysis/opportunities-report-card";
import { EvidenceToggle } from "./network-analysis-structure";

type Translate = ReturnType<typeof useOrbitLanguage>["t"];

const UNAVAILABLE = { en: "Source temporarily unavailable", zh: "来源暂时不可用" } as const;

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="nw-empty">{children}</div>;
}

function CoverageSection({ view, goal, onEditGoal }: { view: OpportunitiesTabView["coverage"]; goal: string | null; onEditGoal: (() => void) | null }) {
  const { t, preserveHref } = useOrbitLanguage();
  return (
    <div className="nw-cockpit" data-network-section="coverage">
      <div className="nw-act-head">
        <span className="nw-card-head">
          <h2 className="nw-h2">{t({ en: "Plan coverage", zh: "规则覆盖度" })}</h2>
          <span className="nw-ai-desc">{t({ en: "Confirmed contacts on each network need of your plan, against how many you need.", zh: "按计划的人脉需求：已确认关联的人数 ÷ 需要认识的人数。" })}</span>
        </span>
        {onEditGoal ? <button type="button" className="btn nw-textlink" onClick={onEditGoal}>◈ {t({ en: "Set relationship goal", zh: "设置关系目标" })}</button> : null}
      </div>
      {goal ? <p className="nw-op-goal">{t({ en: "Relationship goal: ", zh: "关系目标：" })}{goal}</p> : null}
      {view.state === "no_plan" ? (
        <div className="nw-op-noplan" data-network-coverage-no-plan="">
          <span className="nw-ai-desc">{t({ en: "No active plan yet. Once you generate one, coverage is measured against its network needs.", zh: "还没有生效的计划。生成计划后，这里按计划的人脉需求计算覆盖度。" })}</span>
          <a className="nw-op-cta" href={preserveHref(PLAN_HREF)}>✦ {t({ en: "Go generate a plan", zh: "去生成计划" })}</a>
        </div>
      ) : view.state === "unavailable" ? (
        <Empty>{t({ en: "Your plan can't be read right now", zh: "计划暂时读不到" })}</Empty>
      ) : view.percent === null ? (
        <Empty>{t({ en: "Your plan has no network needs yet", zh: "计划里还没有人脉需求" })}</Empty>
      ) : (
        <div className="nw-op-cov">
          <div className="nw-op-cov-total" data-network-coverage-percent={view.percent}>
            <strong className="nw-op-cov-n">{view.percent}%</strong>
            <span className="nw-op-bar"><span className="nw-op-bar-fill" style={{ width: `${view.percent}%` }} /></span>
          </div>
          <ul className="nw-op-needs">
            {view.needs.map((need) => (
              <li key={need.needId} className="nw-op-need" data-network-need={need.needId}>
                <span className="nw-op-need-copy">
                  <strong className="nw-suggest-title">{need.title}</strong>
                  {need.phaseTitle ? <span className="nw-ai-desc">{need.phaseTitle}</span> : null}
                </span>
                <span className="nw-op-need-n" data-network-need-count="">
                  {t({ en: `Have ${need.have} / ${need.target}`, zh: `已有 ${need.have}／${need.target}` })}
                  {need.missing > 0 ? <span className="nw-op-missing">{t({ en: ` · ${need.missing} to go`, zh: ` · 还缺 ${need.missing}` })}</span> : <span className="nw-op-done">{t({ en: " · covered", zh: " · 已满足" })}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function eventDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", { day: "numeric", month: language === "zh" ? "numeric" : "short", timeZone: "Asia/Tokyo" }).format(date);
}

function GapRow({ need, onOpenMatches }: { need: NeedCoverageRow; onOpenMatches: (need: NeedCoverageRow) => void }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  return (
    <li className="nw-op-gap" data-network-gap={need.needId}>
      <div className="nw-op-gap-head">
        <strong className="nw-suggest-title">{t({ en: `${need.missing} more for “${need.title}”`, zh: `「${need.title}」还缺 ${need.missing} 位` })}</strong>
        {need.pendingCount ? (
          <button type="button" className="btn nw-op-pending" data-network-gap-pending={need.pendingCount} onClick={() => onOpenMatches(need)}>
            {t({ en: `${need.pendingCount} to confirm`, zh: `待确认 ${need.pendingCount}` })}
          </button>
        ) : null}
      </div>
      {need.gapNote ? (
        <p className="nw-op-gap-note" data-network-gap-note="">
          {need.gapNote.text} <EvidenceToggle people={need.gapNote.evidence} />
        </p>
      ) : null}
      {need.events.length > 0 ? (
        <ul className="nw-op-events">
          {need.events.map((event) => (
            <li key={event.eventId}>
              <a className="nw-op-event" href={preserveHref(event.href)} data-network-gap-event={event.eventId}>
                <span className="nw-op-event-t">{event.title}</span>
                <span className="nw-ai-desc">
                  {eventDate(event.startsAt, language)} · {event.reason.kind === "plan"
                    ? t({ en: "Named in your plan", zh: "计划点名" })
                    : t({ en: `Matches: ${event.reason.tokens.join(", ")}`, zh: `命中：${event.reason.tokens.join("、")}` })}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <span className="nw-ai-desc">{t({ en: "No upcoming events match this need yet.", zh: "暂时没有对得上这条需求的近期活动。" })}</span>
      )}
    </li>
  );
}

function GapsSection({ view, onOpenMatches }: { view: OpportunitiesTabView["coverage"]; onOpenMatches: (need: NeedCoverageRow) => void }) {
  const { t, preserveHref } = useOrbitLanguage();
  const gaps = view.state === "ready" ? view.needs.filter((need) => need.missing > 0) : [];
  return (
    <div className="nw-cockpit" data-network-section="gaps">
      <div className="nw-act-head">
        <span className="nw-card-head">
          <h2 className="nw-h2">{t({ en: "How to close the gaps", zh: "缺口补法" })}</h2>
          <span className="nw-ai-desc">{t({ en: "Upcoming events and existing contacts that may fit each unmet need.", zh: "每条还缺人的需求：可以去的活动，以及可能对得上的现有联系人。" })}</span>
        </span>
        {view.state === "ready" && gaps.length > 0 ? <a className="nw-link" href={preserveHref(PLAN_HREF)}>{t({ en: "View all →", zh: "查看全部 →" })}</a> : null}
      </div>
      {view.state === "unavailable" ? <Empty>{t({ en: "Your plan can't be read right now", zh: "计划暂时读不到" })}</Empty>
        : view.state === "no_plan" ? <Empty>{t({ en: "Gaps show up here once you have a plan.", zh: "生成计划后，这里列出每条需求的补法。" })}</Empty>
          : view.percent === null ? <Empty>{t({ en: "Your plan has no network needs yet", zh: "计划里还没有人脉需求" })}</Empty>
            : gaps.length === 0 ? <Empty>{t({ en: "Every network need is covered", zh: "所有人脉需求都已满足" })}</Empty>
              : <ul className="nw-op-gaps">{gaps.map((need) => <GapRow key={need.needId} need={need} onOpenMatches={onOpenMatches} />)}</ul>}
    </div>
  );
}

function ActionsSection({ actions, onOpenAllMatches }: { actions: OpportunitiesTabView["weekActions"]; onOpenAllMatches: () => void }) {
  const { t, preserveHref } = useOrbitLanguage();
  return (
    <div className="nw-cockpit" data-network-section="actions">
      <div className="nw-act-head">
        <span className="nw-act-title nw-op-title"><h2 className="nw-h2">{t({ en: "Suggested this week", zh: "本周建议动作" })}</h2><span className="nw-ai-desc">{t({ en: "This week's actions from your plan.", zh: "来自你的计划的本周行动。" })}</span></span>
        {actions.pendingMatches ? (
          <button type="button" className="btn nw-op-pending" data-network-pending-matches={actions.pendingMatches} onClick={onOpenAllMatches}>
            {t({ en: `${actions.pendingMatches} ${actions.pendingMatches === 1 ? "contact" : "contacts"} to confirm`, zh: `${actions.pendingMatches} 位待确认` })}
          </button>
        ) : null}
      </div>
      {actions.planActions === null ? <Empty>{t(UNAVAILABLE)}</Empty>
        : actions.planActions.length === 0 ? <Empty>{t({ en: "No plan actions due this week", zh: "本周没有待办的计划行动" })}</Empty>
          : (
            <div className="nw-act-grid">
              {actions.planActions.map((action, index) => (
                <a key={action.id} className="btn nw-act" href={preserveHref(action.href)} data-network-week-action={action.id}>
                  <span className="nw-act-rank">{index + 1}</span>
                  <span className="nw-act-copy">
                    <span className="nw-act-row">
                      <strong className="nw-suggest-title">{action.title}</strong>
                      <span className="nw-act-tag" style={action.weeksOverdue > 0 ? { background: "#FBF1DC", color: "#8A6420" } : { background: "#ECEEFB", color: "#2E3270" }}>
                        {action.weeksOverdue > 0
                          ? t({ en: `Postponed ${action.weeksOverdue} ${action.weeksOverdue === 1 ? "week" : "weeks"}`, zh: `已延后 ${action.weeksOverdue} 周` })
                          : t({ en: "This week", zh: "本周" })}
                      </span>
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
    </div>
  );
}

function DormantItem({ row, index }: { row: DormantRow; index: number }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const requestDraft = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(row.contactId)}/reconnect-draft`, {
        body: JSON.stringify({ language: language === "zh" ? "zh" : "en" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; data?: { draft?: { subject?: unknown; body?: unknown } } } | null;
      const value = body?.data?.draft;
      if (!response.ok || body?.success !== true || typeof value?.subject !== "string" || typeof value.body !== "string") throw new Error("draft");
      setDraft({ body: value.body, subject: value.subject });
      setState("idle");
    } catch {
      setState("error");
    }
  };
  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li className="nw-op-dormant" data-network-dormant={row.contactId}>
      <span className="nw-act-rank">{index + 1}</span>
      <span className="nw-act-copy nw-op-dormant-copy">
        <span className="nw-act-row">
          <a className="nw-op-name" href={preserveHref(`/app/contacts/${encodeURIComponent(row.contactId)}`)}>{row.name}</a>
          <span className="nw-act-tag" style={{ background: "#FBF1DC", color: "#8A6420" }}>{t({ en: "To re-engage", zh: "待唤醒" })}</span>
        </span>
        <span className="nw-act-desc">
          {row.why} <a className="nw-op-evidence" href={preserveHref(row.evidence.href)} data-network-dormant-evidence={row.evidence.recordId}>ⓘ {t({ en: "Evidence", zh: "依据" })}</a>
        </span>
        {draft ? (
          <span className="nw-op-draft" data-network-dormant-draft="">
            <input className="nw-op-draft-subject" aria-label={t({ en: "Subject", zh: "主题" })} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
            <textarea className="nw-op-draft-body" aria-label={t({ en: "Email draft", zh: "邮件草稿" })} rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            <span className="nw-op-draft-foot">
              <button type="button" className="btn nw-textlink" onClick={() => void copy()}>{copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy", zh: "复制" })}</button>
              <span className="nw-ai-desc">{t({ en: "Only a draft — Orbit never sends it.", zh: "只是草稿，Orbit 不会替你发送。" })}</span>
            </span>
          </span>
        ) : row.draftAvailable ? (
          <button type="button" className="btn nw-textlink" data-network-dormant-draft-button="" disabled={state === "loading"} onClick={() => void requestDraft()}>
            ✉ {state === "loading" ? t({ en: "Drafting…", zh: "正在起草…" }) : t({ en: "Draft an email", zh: "起草邮件" })}
          </button>
        ) : null}
        {state === "error" ? <span className="nw-op-error" role="alert">{t({ en: "Couldn't draft the email. Try again.", zh: "没能起草邮件，请重试。" })}</span> : null}
      </span>
    </li>
  );
}

function DormantSection({ rows }: { rows: OpportunitiesTabView["dormant"] }) {
  const { t, preserveHref } = useOrbitLanguage();
  return (
    <div className="nw-cockpit" data-network-section="dormant">
      <div className="nw-act-head">
        <span className="nw-act-title nw-op-title"><h2 className="nw-h2">{t({ en: "Worth reconnecting", zh: "待唤醒" })}</h2><span className="nw-ai-desc">{t({ en: "Once-active contacts, quiet for 60 days, that relate to your goal.", zh: "曾经有往来、60 天没联系、且与目标相关的人。" })}</span></span>
        {rows && rows.length > 0 ? <a className="nw-link" href={preserveHref("/app/contacts/pipeline")}>{t({ en: "View all →", zh: "查看全部 →" })}</a> : null}
      </div>
      {rows === null ? <Empty>{t(UNAVAILABLE)}</Empty>
        : rows.length === 0 ? <Empty>{t({ en: "No dormant relationships", zh: "暂无待唤醒关系" })}</Empty>
          : <ul className="nw-op-dormants">{rows.map((row, index) => <DormantItem key={row.contactId} row={row} index={index} />)}</ul>}
    </div>
  );
}

function ReportSection({ report, onReport }: { report: NetworkSnapshotView; onReport: (next: NetworkSnapshotView) => void }) {
  const { t, language } = useOrbitLanguage();
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<ReportCardLimit>(null);
  const [error, setError] = useState(false);
  const card = reportCardModel(report, language, limit);
  const recompute = async () => {
    if (busy || !card.button || card.button.disabled) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/network/snapshot/recompute?lang=${language === "zh" ? "zh" : "en"}`, {
        body: JSON.stringify({ idempotencyKey: newPlanIdempotencyKey("snapshot-manual") }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; data?: NetworkSnapshotView; error?: { context?: { reason?: string } } } | null;
      if (response.status === 429) {
        const reason = body?.error?.context?.reason;
        setLimit(reason === "USER_DAILY_LIMIT" ? "user" : "manual");
        return;
      }
      if (!response.ok || body?.success !== true || !body.data) throw new Error("recompute");
      onReport(body.data);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="nw-report" data-network-section="report">
      <div className="nw-report-copy">
        <span className="nw-report-icon">▤</span>
        <span className="nw-card-head">
          <strong className="nw-report-t">{t({ en: "Network analysis report", zh: "人脉分析报告" })}</strong>
          <span className="nw-report-status" data-network-report-status="">{card.status}</span>
          {card.note ? <span className="nw-report-desc" data-network-report-note="">{card.note}</span> : null}
          {card.button?.hint ? <span className="nw-report-desc" data-network-report-hint="">{card.button.hint}</span> : null}
          {error ? <span className="nw-op-error" role="alert">{t({ en: "The analysis could not be generated. Try again later.", zh: "没能生成分析，请稍后再试。" })}</span> : null}
        </span>
      </div>
      {card.button ? (
        <button type="button" className="btn nw-report-cta" data-network-report-button="" disabled={busy || card.button.disabled} onClick={() => void recompute()}>
          <span className={card.button.disabled ? "nw-report-cta-pill nw-op-pill-off" : "nw-report-cta-pill"}>{busy ? t({ en: "Analyzing…", zh: "正在分析…" }) : `✦ ${card.button.label}`}</span>
        </button>
      ) : null}
    </div>
  );
}

export function NetworkOpportunities({ view, goal, onEditGoal }: { view: OpportunitiesTabView; goal: string | null; onEditGoal: (() => void) | null }) {
  const { t } = useOrbitLanguage();
  const [report, setReport] = useState(view.report);
  const [coverage, setCoverage] = useState(view.coverage);
  const [pendingMatches, setPendingMatches] = useState(view.weekActions.pendingMatches);
  const [sheet, setSheet] = useState<{ heading: string; candidates: PlanMatchCandidate[] } | null>(null);
  const allCandidates = coverage.state === "ready" ? coverage.needs.flatMap((need) => need.candidates) : [];
  // 「是」= 服务端已把这位联系人关联到该需求（与覆盖度同一事实来源 contact_links）：本地同步 have／missing 与总百分比；
  // 「不是」只移除候选。两者都减待确认数。
  const onDecided = (candidateId: string, decision: "accept" | "dismiss") => {
    const decided = allCandidates.find((candidate) => candidate.id === candidateId);
    setCoverage((current) => {
      if (current.state !== "ready") return current;
      const needs = current.needs.map((need) => {
        if (!need.candidates.some((candidate) => candidate.id === candidateId)) return need;
        const have = decision === "accept" ? need.have + 1 : need.have;
        return {
          ...need,
          candidates: need.candidates.filter((candidate) => candidate.id !== candidateId),
          have,
          missing: Math.max(0, need.target - have),
          pendingCount: Math.max(0, (need.pendingCount ?? 1) - 1),
        };
      });
      const total = needs.reduce((sum, need) => sum + need.target, 0);
      const covered = needs.reduce((sum, need) => sum + Math.min(need.have, need.target), 0);
      return { ...current, needs, percent: total > 0 ? Math.round((covered / total) * 100) : null };
    });
    if (decided && !allCandidates.some((candidate) => candidate.id !== candidateId && candidate.contactId === decided.contactId)) {
      setPendingMatches((value) => (value ? Math.max(0, value - 1) : value));
    }
  };
  return (
    <div className="nw-an-sec" data-network-opportunities="">
      <CoverageSection view={coverage} goal={goal} onEditGoal={onEditGoal} />
      <GapsSection view={coverage} onOpenMatches={(need) => setSheet({ candidates: need.candidates, heading: t({ en: `Who may fit “${need.title}”`, zh: `可能对应「${need.title}」的人` }) })} />
      <ActionsSection actions={{ ...view.weekActions, pendingMatches }} onOpenAllMatches={() => setSheet({ candidates: allCandidates, heading: t({ en: "Who may fit your plan", zh: "可能对应你的计划的人" }) })} />
      <DormantSection rows={view.dormant} />
      <ReportSection report={report} onReport={setReport} />
      {sheet ? (
        <PlanMatchDialog label={t({ en: "Plan matches", zh: "计划匹配" })} onClose={() => setSheet(null)}>
          <PlanMatchSheet candidates={sheet.candidates} heading={sheet.heading} onDecided={(candidateId, decision) => onDecided(candidateId, decision)} />
        </PlanMatchDialog>
      ) : null}
    </div>
  );
}
