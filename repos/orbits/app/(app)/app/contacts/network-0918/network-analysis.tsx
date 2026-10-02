/**
 * 「AI 人脉分析」子页（Network v2 第 393–609 行；不含 610–707 洞察视图）。
 * 标签由 URL 驱动（W0050，W50-5）：`?tab=structure|opportunities|insight`，服务端只读当前标签的数据；标签是普通链接，可分享、可回退。
 * - 洞察（W0051）：`NetworkInsights`，数据 = `loadInsightsTab` 的 `InsightsTabView`（只读 contact_insights，0 次 AI）；
 * - 结构（W0049）：`NetworkAnalysisStructure`，数据 = ContactsAnalysisView + `structureExtras`；
 * - 机会（W0050）：`NetworkOpportunities`，数据 = `loadOpportunitiesTab` 的 `OpportunitiesTabView`；缺省（未加载）时各块如实「来源暂时不可用」。
 * 「⟳ 刷新机会」「✦ 去 iOrbit 分析」与旧覆盖拨盘在 W0050 下线；「◈ 设置关系目标」沿用 AnalysisGoalEditor。
 */
"use client";

import { useState } from "react";

import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AnalysisGoalEditor } from "../analysis/analysis-goal-editor";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import type { OpportunitiesTabView } from "../analysis/opportunities-view-model";
import type { InsightsTabView } from "../analysis/insights-tab";
import type { StructureTabExtras } from "../analysis/structure-tab-model";
import { NetworkAnalysisStructure } from "./network-analysis-structure";
import { NetworkOpportunities } from "./network-opportunities";
import { NetworkInsights } from "./network-insights";
import { NetworkShell } from "./network-shell";

export type AnalysisTabKey = "struct" | "opp" | "insight";

export const ANALYSIS_TAB_HREF: Readonly<Record<AnalysisTabKey, string>> = {
  insight: "/app/contacts/dashboard?tab=insight",
  opp: "/app/contacts/dashboard?tab=opportunities",
  struct: "/app/contacts/dashboard?tab=structure",
};

/** 机会数据未加载（组件单测、服务端读取前）时的如实空态。 */
const UNLOADED_OPPORTUNITIES: OpportunitiesTabView = {
  coverage: { state: "unavailable" },
  dormant: null,
  report: {
    blocks: [],
    contactCount: 0,
    freshness: { job: "none", newContactCount: 0, stale: false },
    generatedAt: null,
    quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } },
    state: "unavailable",
  },
  weekActions: { pendingMatches: null, planActions: null },
};

/** 洞察数据未加载（组件单测）时的如实空态。 */
const UNLOADED_INSIGHTS: InsightsTabView = {
  hasGoal: false,
  hasNext: false,
  options: { countries: [], industries: [] },
  page: 1,
  pageSize: 30,
  query: { country: null, industry: null, page: 1, sort: "relevance", tier: null },
  rows: [],
  state: "unavailable",
  total: 0,
};

/**
 * `viewModel`（名单，最多 30 条）在 W0049 之后只留给示例期与后续标签；结构标签的人数一律来自 `analysis` 的全量分布。
 * `structureExtras`：服务端加载的快照诊断／洞察、计划需求高亮与 30 天变化；缺省时①④不渲染、无高亮、变化显示「—」。
 * `opportunities`：服务端只在 `?tab=opportunities` 时加载。
 */
export function NetworkAnalysis({ analysis, initialTab, structureExtras, opportunities, insights }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView; initialTab: AnalysisTabKey; structureExtras?: StructureTabExtras; opportunities?: OpportunitiesTabView; insights?: InsightsTabView }) {
  const { t, preserveHref } = useOrbitLanguage();
  const [view, setView] = useState(analysis);
  const [editingGoal, setEditingGoal] = useState(false);
  const tab = initialTab;
  const ready = view.state === "ready";
  const goal = ready && "data" in view.goal ? view.goal.data : null;
  const openOpportunities = () => { if (typeof window !== "undefined") window.location.href = preserveHref(ANALYSIS_TAB_HREF.opp); };

  return (
    <NetworkShell screen="analysis" modal={editingGoal && goal?.id ? (
      <AnalysisGoalEditor key={goal.id} profileId={goal.id} initialGoal={goal.text} initialUpdatedAt={goal.updatedAt} onClose={() => setEditingGoal(false)} onSaved={(text, updatedAt) => {
        setView((current) => current.state === "ready" && "data" in current.goal ? { ...current, goal: { ...current.goal, data: { ...current.goal.data, text, updatedAt } } } : current);
        setEditingGoal(false);
      }} />
    ) : null}>
      <div className="nw-an">
        <div className="nw-head">
          <div className="nw-an-copy">
            <a className="btn nw-back" href="/app/contacts/dashboard">← {t({ en: "Back to network", zh: "返回人脉" })}</a>
            <h1 className="nw-h1">{t({ en: "AI network analysis", zh: "AI 人脉分析" })}</h1>
            <p className="nw-sub">{t({ en: "From your network data: see the structure, find opportunities and get actionable next steps.", zh: "基于你的人脉数据，发现结构、挖掘机会，获得可执行的拓展建议。" })}</p>
          </div>
          <a className="btn nw-btn-primary" href="/app/contacts/new">＋ {t({ en: "Import contacts", zh: "导入人脉" })}</a>
        </div>
        <div className="nw-tabs">
          {([["struct", { zh: "结构", en: "Structure" }], ["opp", { zh: "机会", en: "Opportunities" }], ["insight", { zh: "洞察", en: "Insights" }]] as const).map(([key, label]) => (
            <a key={key} className={`btn nw-atab ${tab === key ? "nw-tab-on" : "nw-tab-off"}`} href={preserveHref(ANALYSIS_TAB_HREF[key])} aria-current={tab === key ? "page" : undefined} data-network-analysis-tab={key}>{t(label)}</a>
          ))}
        </div>

        {tab === "struct" ? (
          <NetworkAnalysisStructure view={view} extras={structureExtras} onOpenOpportunities={openOpportunities} />
        ) : tab === "insight" ? (
          <NetworkInsights
            view={insights ?? UNLOADED_INSIGHTS}
            onEditGoal={goal?.canEdit && goal.id ? () => setEditingGoal(true) : null}
          />
        ) : (
          <NetworkOpportunities
            view={opportunities ?? UNLOADED_OPPORTUNITIES}
            goal={goal ? goal.text || null : null}
            onEditGoal={goal?.canEdit && goal.id ? () => setEditingGoal(true) : null}
          />
        )}
      </div>
    </NetworkShell>
  );
}
