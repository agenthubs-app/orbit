/**
 * 「AI 人脉分析」子页（Network v2 第 393–609 行；不含 610–707 洞察视图）。
 * 数据 = ContactsAnalysisView 各区块；设计 mock 句子/数字一律不渲染：
 * 结构诊断 hero = analysis.summary，分布小结 = structure.summary，结构洞察 = coverage.summary，
 * 机会 hero = opportunities.summary / coverage.summary——W0043 起这些句子为空串时整块不渲染（W43-3，等 W0049／W0050 快照填回）；
 * 关系健康只渲染 structure.health 真实返回的行（设计第四块「决策层占比」与「平均近 30 天互动」无来源，不渲染）；
 * 目标覆盖「引荐路径」无来源，不渲染；覆盖度分数与缺口在 W0050 之前不显示（W43-2），覆盖区为关系目标文字 + 「生成计划」入口。
 * 区块状态（W0043）：empty 与 ready 一样取数据、显示该区块真实空态；只有 unavailable／整页 error 显示「来源暂时不可用」，pending 显示「分析生成中」。
 * 「⟳ 刷新机会」「✦ 去 iOrbit 分析」「◈ 设置关系目标」沿用旧 workspace 的 recompute / stashAgentPrefill / AnalysisGoalEditor 逻辑。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { stashAgentPrefill } from "../../orbit-global-ask/orbit-ask-draft";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AnalysisGoalEditor } from "../analysis/analysis-goal-editor";
import { contactsAnalysisToView, type ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import type { StructureTabExtras } from "../analysis/structure-tab-model";
import { formatMonthDay } from "./network-overview";
import { MOBILE_CONTACTS_DASHBOARD_ROLE_COUNTS_QUERY } from "../../../../../shared/api-schema/mobile-contacts-dashboard";
import { NetworkAnalysisStructure } from "./network-analysis-structure";
import { NetworkShell } from "./network-shell";

export type AnalysisTabKey = "struct" | "opp";

/**
 * `viewModel`（名单，最多 30 条）在 W0049 之后只留给示例期与后续标签；结构标签的人数一律来自 `analysis` 的全量分布。
 * `structureExtras`：服务端加载的快照诊断／洞察、计划需求高亮与 30 天变化；缺省时①④不渲染、无高亮、变化显示「—」。
 */
export function NetworkAnalysis({ analysis, initialTab, structureExtras }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView; initialTab: AnalysisTabKey; structureExtras?: StructureTabExtras }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const [view, setView] = useState(analysis);
  const [tab, setTab] = useState<AnalysisTabKey>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dash = "—";
  const ready = view.state === "ready";
  const emptyCopy = (state: string) => state === "pending" ? t({ en: "Analysis in progress", zh: "分析生成中" }) : t({ en: "Source temporarily unavailable", zh: "来源暂时不可用" });
  const emptyBlock = (state: string) => <div className="nw-empty">{emptyCopy(state)}</div>;

  // 旧 workspace 的 refresh(true)：POST 重算机会后重新拉取分析。
  const refresh = async (recompute = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    let recomputed = false;
    try {
      if (recompute) {
        const response = await fetch("/api/dashboard/opportunities/recompute", { method: "POST" });
        const body = await response.json();
        if (!response.ok || body?.success !== true || !["success", "empty"].includes(body?.data?.state) || !Number.isFinite(Date.parse(body?.data?.recomputedAt))) throw new Error("recompute");
        recomputed = true;
      }
      const response = await fetch(`/api/mobile/contacts-dashboard?${MOBILE_CONTACTS_DASHBOARD_ROLE_COUNTS_QUERY}`, { cache: "no-store" });
      const body = await response.json();
      const next = response.ok && body?.success === true ? contactsAnalysisToView(body.data, language) : { state: "error" as const };
      if (next.state === "error") throw new Error("refresh");
      if (mounted.current) setView(next);
    } catch {
      if (mounted.current) setError(recomputed
        ? t({ zh: "机会已重算，但新数据暂未加载。请刷新查看。", en: "Opportunities were recomputed, but the updated data could not load. Please refresh." })
        : t({ zh: "操作未完成，已保留当前数据。请重试。", en: "The operation failed. Your current data is still shown. Please retry." }));
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  // 旧 workspace 的 requestAnalysis：把结构化请求暂存后跳 iOrbit。
  const requestAnalysis = () => {
    if (view.state !== "ready" || view.analysis.state !== "ready" || typeof window === "undefined") return;
    stashAgentPrefill({
      origin: { entryClient: "web", entryPointId: "contacts.analysis", initialGroupId: null, kind: "structured", sourceDataVersion: view.analysis.current.sourceDataVersion, template: { id: "contacts.analysis", version: 1 } },
      query: t({ zh: "请根据我的关系目标和当前人脉数据生成分析报告，指出结构缺口和最值得推进的下一步。", en: "Analyze my current network against my relationship goal, including structural gaps and the next steps worth prioritizing." }),
      returnTo: "/app/contacts/dashboard?tab=opportunities",
    });
    window.location.href = preserveHref("/app/agent");
  };

  // empty 与 ready 都带数据：empty 走各区块自己的空态，不落入「来源暂时不可用」。
  const structure = ready && "data" in view.structure ? view.structure.data : null;
  const coverage = ready && "data" in view.coverage ? view.coverage.data : null;
  const opportunities = ready && "data" in view.opportunities ? view.opportunities.data : null;
  const goal = ready && "data" in view.goal ? view.goal.data : null;
  const strong = structure?.health.find((h) => h.id === "core");
  const secState = (key: "structure" | "coverage" | "opportunities" | "goal") => (view.state === "ready" ? view[key].state : view.state);

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
          {([["struct", { zh: "结构", en: "Structure" }], ["opp", { zh: "机会", en: "Opportunities" }]] as const).map(([key, label]) => (
            <button key={key} type="button" className={`btn nw-atab ${tab === key ? "nw-tab-on" : "nw-tab-off"}`} onClick={() => setTab(key)}>{t(label)}</button>
          ))}
        </div>
        {error ? <div className="nw-empty" role="alert">{error}</div> : null}

        {tab === "struct" ? (
          <NetworkAnalysisStructure view={view} extras={structureExtras} onOpenOpportunities={() => setTab("opp")} />
        ) : (
          <div className="nw-an-sec">
            {opportunities?.summary ? (
              <div className="nw-an-hero-opp">
                <div className="nw-an-hero-copy-opp">
                  <span className="nw-an-hero-star-28">✦</span>
                  <div className="nw-an-hero-text">
                    <h2 className="nw-h2-26">{opportunities.summary}</h2>
                    {coverage?.summary ? <p className="nw-an-hero-p">{coverage.summary}</p> : null}
                  </div>
                </div>
                <div className="nw-hero-chips">
                  <span className="nw-hero-chip">✦ {t({ en: "Find opportunities", zh: "发现机会" })}</span>
                  <span className="nw-hero-chip">✦ {t({ en: "Close gaps", zh: "补齐短板" })}</span>
                  <span className="nw-hero-chip">✦ {t({ en: "Grow influence", zh: "拓展影响力" })}</span>
                </div>
              </div>
            ) : null}

            <div className="nw-opp-grid">
              <div className="nw-ov-card" data-network-section="goal">
                <div className="nw-goal-head">
                  <div className="nw-card-head">
                    <h2 className="nw-h2">{t({ en: "Goal coverage", zh: "目标覆盖" })}</h2>
                    <span className="nw-ai-desc">{goal ? goal.text || t({ en: "No relationship goal yet", zh: "尚未设置关系目标" }) : emptyCopy(secState("goal"))}</span>
                  </div>
                  <button type="button" className="btn nw-refresh" disabled={busy || !ready} onClick={() => refresh(true)}>⟳ {t({ en: "Refresh", zh: "刷新机会" })}</button>
                </div>
                <div className="nw-goal-body">
                  <div className="nw-goal-rows">
                    {([
                      { icon: "◈", label: t({ en: "High-value relationships", zh: "高价值关系" }), n: ready ? view.metrics.highValue : null, bg: "#E6F1EC", fg: "#2F6B4F" },
                      { icon: "◎", label: t({ en: "Core relationships", zh: "核心关系" }), n: strong ? strong.count : null, bg: "#ECEEFB", fg: "#4B4FC7" },
                    ]).map((g) => (
                      <span key={g.icon} className="nw-goal-row">
                        <span className="nw-goal-icon" style={{ background: g.bg, color: g.fg }}>{g.icon}</span>
                        <span className="nw-goal-label">{g.label}</span>
                        <strong className="nw-goal-n">{g.n ?? dash}</strong><span className="nw-suggest-arrow">›</span>
                      </span>
                    ))}
                  </div>
                </div>
                {goal?.canEdit && goal.id ? (
                  <button type="button" className="btn nw-goal-cta" disabled={busy} onClick={() => setEditingGoal(true)}>◈ {t({ en: "Set relationship goal", zh: "设置关系目标" })}</button>
                ) : (
                  <a className="btn nw-goal-cta" href={preserveHref("/app/profile")}>◈ {t({ en: "Complete your profile", zh: "完善个人资料" })}</a>
                )}
              </div>

              <div className="nw-cov-card" data-network-section="coverage">
                <div className="nw-goal-head">
                  <div className="nw-card-head">
                    <h2 className="nw-h2">{t({ en: "Coverage suggestions", zh: "覆盖建议" })}</h2>
                    <span className="nw-ai-desc">{t({ en: "Generate a relationship plan from your goal; coverage gaps are measured against that plan.", zh: "按你的关系目标生成计划后，覆盖缺口将对照计划来衡量。" })}</span>
                  </div>
                </div>
                {/* W43-2：W0050 之前不显示固定阈值的覆盖度分数与缺口；只显示关系目标文字 + 「生成计划」入口。
                    覆盖与目标两个区块都可读（ready／empty）才显示入口；pending／unavailable／error 显示对应状态，不放入口。 */}
                {coverage && goal ? (
                  <a className="btn nw-cov-row" href={preserveHref("/app/agent/plan")} data-network-coverage-goal="">
                    <span className="nw-cov-icon" style={{ background: "#ECEEFB", color: "#4B4FC7" }}>◈</span>
                    <span className="nw-cov-copy"><strong className="nw-suggest-title">{goal.text || t({ en: "No relationship goal yet", zh: "尚未设置关系目标" })}</strong><span className="nw-cov-desc">{t({ en: "Relationship goal", zh: "关系目标" })} · <strong>✦ {t({ en: "Generate a plan", zh: "生成计划" })}</strong></span></span>
                    <span className="nw-suggest-arrow">›</span>
                  </a>
                ) : emptyBlock(!coverage ? secState("coverage") : secState("goal"))}
              </div>
            </div>

            <div className="nw-cockpit" data-network-section="actions">
              <div className="nw-act-head">
                <span className="nw-act-title"><h2 className="nw-h2">{t({ en: "Suggested actions", zh: "建议动作" })}</h2><span className="nw-ai-desc">{t({ en: "Recommended from your network structure and goal gap, by priority.", zh: "根据当前人脉结构与目标差距，为你推荐以下行动，按优先级排序。" })}</span></span>
              </div>
              {opportunities ? (
                <div className="nw-act-grid">
                  {opportunities.actions.map((a, i) => (
                    <a key={a.id} className="btn nw-act" href={a.primary.href}>
                      <span className="nw-act-rank">{i + 1}</span>
                      <span className="nw-act-copy">
                        <span className="nw-act-row"><strong className="nw-suggest-title">{a.title}</strong>{a.dueLabel ? <span className="nw-act-tag" style={{ background: "#ECEEFB", color: "#2E3270" }}>{a.dueLabel}</span> : null}</span>
                        {a.contactName || a.judgment ? <span className="nw-act-desc">{[a.contactName, a.judgment].filter(Boolean).join(" · ")}</span> : null}
                      </span>
                    </a>
                  ))}
                </div>
              ) : emptyBlock(secState("opportunities"))}
              {opportunities && opportunities.actions.length === 0 ? <div className="nw-empty">{t({ en: "No priority actions right now", zh: "当前没有优先行动建议" })}</div> : null}
            </div>

            <div className="nw-cockpit" data-network-section="dormant">
              <div className="nw-act-head">
                <span className="nw-act-title"><h2 className="nw-h2">{t({ en: "Dormant relationships", zh: "待唤醒关系" })}</h2><span className="nw-ai-desc">{t({ en: "High-value contacts you have not reached in a while.", zh: "较久未联系的高价值联系人。" })}</span></span>
              </div>
              {opportunities ? (
                <div className="nw-act-grid">
                  {opportunities.dormant.map((d, i) => (
                    <a key={d.id} className="btn nw-act" href={d.href}>
                      <span className="nw-act-rank">{i + 1}</span>
                      <span className="nw-act-copy">
                        <span className="nw-act-row"><strong className="nw-suggest-title">{d.name}</strong><span className="nw-act-tag" style={{ background: "#FBF1DC", color: "#8A6420" }}>{t({ en: "Dormant", zh: "沉睡" })}</span></span>
                        {d.organization || d.reason ? <span className="nw-act-desc">{[d.organization, d.reason].filter(Boolean).join(" · ")}</span> : null}
                      </span>
                    </a>
                  ))}
                </div>
              ) : emptyBlock(secState("opportunities"))}
              {opportunities && opportunities.dormant.length === 0 ? <div className="nw-empty">{t({ en: "No dormant relationships", zh: "暂无待唤醒关系" })}</div> : null}
            </div>

            <div className="nw-report">
              <div className="nw-report-copy">
                <span className="nw-report-icon">▤</span>
                <span className="nw-card-head">
                  <strong className="nw-report-t">{t({ en: "Network analysis report", zh: "人脉分析报告" })}</strong>
                  <span className="nw-report-status">{ready && view.analysis.state === "ready" && view.analysis.report
                    ? `${t({ en: "Generated", zh: "生成于" })} ${formatMonthDay(view.analysis.report.generatedAt, t)}${view.analysis.stale ? ` · ${t({ en: "needs a new analysis", zh: "需要重新分析" })}` : ""}`
                    : t({ en: "Not generated yet", zh: "尚未生成" })}</span>
                  <span className="nw-report-desc">{t({ en: "Combines your network and needs into analysis and actions that help you seize opportunities and close gaps.", zh: "结合现有人脉与需求，整理分析和行动建议，帮助你更好地把握机会、补齐短板。" })}</span>
                </span>
              </div>
              {ready && view.analysis.state === "ready" ? (
                <button type="button" className="btn nw-report-cta" onClick={requestAnalysis}><span className="nw-report-cta-pill">✦ {view.analysis.report ? t({ en: "Analyze again with iOrbit", zh: "去 iOrbit 重新分析" }) : t({ en: "Analyze with iOrbit", zh: "去 iOrbit 分析" })}</span></button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </NetworkShell>
  );
}
