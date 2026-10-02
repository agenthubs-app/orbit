/**
 * W0051（RN-09）：「AI 人脉分析」第三个标签「洞察」（`/app/contacts/dashboard?tab=insight`）。数据 = 服务端 `loadInsightsTab`。
 *
 * 每人一条：关系一句（和目标的关系）、依据（可点开）、下一步、强度档；服务端分页 30 条，
 * 排序 相关度／强度档／最近往来，筛选 行业／地区／强度档（GET 表单，URL 驱动，可分享、可回退）。
 * 状态行：待生成／明天更新／未设目标／失败各有真实文案。本组件只读，不调用任何模型。
 */
"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { InsightsTabRow, InsightsTabView } from "../analysis/insights-tab";
import { INSIGHT_EVIDENCE_ICON, INSIGHT_EVIDENCE_LABEL, INSIGHT_STATE_COPY, insightEvidenceHref } from "./network-insight-copy";
import { NETWORK_TIER_GROUPS, TIER_CHIP, TIER_LABEL, TIER_STYLE } from "./network-model";
import { NetworkChip } from "./network-shell";

const SORT_LABEL = {
  recent: { en: "Most recent contact", zh: "最近往来" },
  relevance: { en: "Goal relevance", zh: "目标相关度" },
  tier: { en: "Relationship tier", zh: "强度档" },
} as const;

function InsightStatus({ row }: { row: InsightsTabRow }) {
  const { t } = useOrbitLanguage();
  const view = row.insight;
  const copy = view.state === "no_goal"
    ? INSIGHT_STATE_COPY.noGoal
    : view.inProgress
      ? INSIGHT_STATE_COPY.inProgress
      : view.state === "pending"
        ? (view.deferredUntil ? INSIGHT_STATE_COPY.deferred : INSIGHT_STATE_COPY.pending)
        : view.state === "failed"
          ? INSIGHT_STATE_COPY.failed
          : view.state === "none" ? INSIGHT_STATE_COPY.none : null;
  const kind = view.state === "pending" && view.deferredUntil ? "deferred" : view.state;
  return copy ? <span className="nw-insight-status" data-insight-row-status={kind}>{t(copy)}</span> : null;
}

function InsightRow({ row }: { row: InsightsTabRow }) {
  const { t } = useOrbitLanguage();
  const view = row.insight;
  const showText = view.goalRelation && view.nextStep && view.state !== "no_goal";
  return (
    <div className="nw-insight-row" data-network-insight-row={row.contactId} data-insight-state={view.state}>
      <div className="nw-insight-who">
        <a className="nw-row-name" href={row.href}>{row.name}</a>
        {row.subtitle ? <span className="nw-row-org-2">{row.subtitle}</span> : null}
        <span data-network-tier={row.tier ?? "unscored"}>
          {row.tier
            ? <NetworkChip bg={TIER_CHIP[row.tier].bg} fg={TIER_CHIP[row.tier].fg}><span className="nw-tier-dot" aria-hidden="true" style={{ background: TIER_STYLE[row.tier].fg }}></span>{t(TIER_LABEL[row.tier])}</NetworkChip>
            : <NetworkChip bg="#F7F7FD" fg="#6B6F99">{t({ zh: "未评估", en: "Not scored" })}</NetworkChip>}
        </span>
        {view.goalUpdated ? <NetworkChip bg="#FFF4E5" fg="#8A5300">{t(INSIGHT_STATE_COPY.goalUpdated)}</NetworkChip> : null}
      </div>
      <div className="nw-insight-what">
        {showText ? (
          <>
            <p className="nw-insight-rel" data-insight-goal-relation>{t(view.goalRelation!)}</p>
            {view.evidence.length ? (
              <span className="nw-insight-evidence" aria-label={t({ en: "Evidence", zh: "依据" })}>
                {view.evidence.map((evidence) => (
                  <a key={evidence.id} className="nw-topic" href={insightEvidenceHref(evidence, row.href)} data-insight-evidence={evidence.source}>
                    {INSIGHT_EVIDENCE_ICON[evidence.source]} {t(INSIGHT_EVIDENCE_LABEL[evidence.source])}
                  </a>
                ))}
              </span>
            ) : null}
            <p className="nw-insight-next" data-insight-next-step><strong>{t({ en: "Next step: ", zh: "下一步：" })}</strong>{t(view.nextStep!)}</p>
          </>
        ) : null}
        <InsightStatus row={row} />
      </div>
    </div>
  );
}

export function NetworkInsights({ view, onEditGoal }: { view: InsightsTabView; onEditGoal: (() => void) | null }) {
  const { t, preserveHref } = useOrbitLanguage();
  const base = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams({ tab: "insight" });
    const merged: Record<string, string | null> = {
      country: view.query.country,
      industry: view.query.industry,
      sort: view.query.sort === "relevance" ? null : view.query.sort,
      tier: view.query.tier,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return preserveHref(`/app/contacts/dashboard?${params}`);
  };
  return (
    <div className="nw-cockpit" data-network-section="insights">
      <div className="nw-act-head">
        <span className="nw-card-head">
          <h2 className="nw-h2">{t({ en: "Per-contact insights", zh: "每人洞察" })}</h2>
          <span className="nw-ai-desc">{t({ en: "How each person relates to your goal, with evidence and a next step. Updated in the background when their data changes.", zh: "每个人和你目标的关系、依据与下一步。资料变化后在后台更新，打开页面不调用 AI。" })}</span>
        </span>
        {!view.hasGoal && onEditGoal ? <button type="button" className="btn nw-textlink" onClick={onEditGoal} data-insight-set-goal>◈ {t({ en: "Set relationship goal", zh: "设置关系目标" })}</button> : null}
      </div>
      {!view.hasGoal ? <p className="nw-insight-status" data-insights-no-goal>{t(INSIGHT_STATE_COPY.noGoal)}</p> : null}
      <form className="nw-filters" action="/app/contacts/dashboard" method="get" data-insights-filters>
        <input type="hidden" name="tab" value="insight" />
        <select name="sort" defaultValue={view.query.sort} aria-label={t({ en: "Sort", zh: "排序" })}>
          {(["relevance", "tier", "recent"] as const).map((sort) => <option key={sort} value={sort}>{t(SORT_LABEL[sort])}</option>)}
        </select>
        <select name="industry" defaultValue={view.query.industry ?? ""} aria-label={t({ en: "Industry", zh: "行业" })}>
          <option value="">{t({ en: "All industries", zh: "全部行业" })}</option>
          {view.options.industries.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
        </select>
        <select name="country" defaultValue={view.query.country ?? ""} aria-label={t({ en: "Region", zh: "地区" })}>
          <option value="">{t({ en: "All regions", zh: "全部地区" })}</option>
          {view.options.countries.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
        </select>
        <select name="tier" defaultValue={view.query.tier ?? ""} aria-label={t({ en: "Tier", zh: "强度档" })}>
          <option value="">{t({ en: "All tiers", zh: "全部档位" })}</option>
          {NETWORK_TIER_GROUPS.map((tier) => <option key={tier} value={tier}>{t(TIER_LABEL[tier])}</option>)}
        </select>
        <button type="submit" className="btn">{t({ en: "Apply", zh: "应用" })}</button>
      </form>
      {view.state === "unavailable" ? (
        <div className="nw-empty">{t({ en: "Insights are temporarily unavailable", zh: "洞察暂时读不到" })}</div>
      ) : view.rows.length === 0 ? (
        <div className="nw-empty" data-insights-empty>{t({ en: "No insights yet. They are generated after a memo, an enrichment or a plan link.", zh: "还没有洞察：写 memo、补全资料或在计划里关联联系人后，会在后台生成。" })}</div>
      ) : (
        <>
          <span className="nw-card-hint" data-insights-total={view.total}>{t({ en: `${view.total} people · page ${view.page}`, zh: `共 ${view.total} 位 · 第 ${view.page} 页` })}</span>
          <div className="nw-insight-list">{view.rows.map((row) => <InsightRow key={row.contactId} row={row} />)}</div>
        </>
      )}
      <div className="nw-filters" data-insights-pager>
        {view.page > 1 ? <a className="btn" href={base({ page: view.page - 1 > 1 ? String(view.page - 1) : null })}>{t({ en: "Previous page", zh: "上一页" })}</a> : null}
        {view.hasNext ? <a className="btn" href={base({ page: String(view.page + 1) })} data-insights-next>{t({ en: "Next page", zh: "下一页" })}</a> : null}
      </div>
    </div>
  );
}
