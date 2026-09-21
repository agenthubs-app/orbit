/**
 * 「AI 人脉分析」子页（Network v2 第 393–609 行；不含 610–707 洞察视图）。
 * 数据 = ContactsAnalysisView 各区块；设计 mock 句子/数字一律不渲染：
 * 结构诊断 h2 = analysis.summary，分布小结 = structure.summary，结构洞察 = coverage.summary，
 * 机会 hero = opportunities.summary / coverage.summary；关系健康只渲染 structure.health 真实返回的行
 * （设计第四块「决策层占比」与「平均近 30 天互动」无来源，不渲染）；目标覆盖「引荐路径」无来源，不渲染。
 * 「⟳ 刷新机会」「✦ 去 iOrbit 分析」「◈ 设置关系目标」沿用旧 workspace 的 recompute / stashAgentPrefill / AnalysisGoalEditor 逻辑。
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { stashAgentPrefill } from "../../orbit-global-ask/orbit-ask-draft";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AnalysisGoalEditor } from "../analysis/analysis-goal-editor";
import { contactsAnalysisToView, type AnalysisDimension, type ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { donut, toPerson } from "./network-model";
import { formatMonthDay } from "./network-overview";
import { healthRows } from "./network-overview-model";
import { NetworkShell } from "./network-shell";

export type AnalysisTabKey = "struct" | "opp";

const RANK_COLORS = [["#4B4FC7", "#FFFFFF"], ["#6B8FB5", "#FFFFFF"], ["#9C7A3E", "#FFFFFF"], ["#8A8FB0", "#FFFFFF"], ["#C9CBEA", "#2E3270"]] as const;
const DIMS: { key: AnalysisDimension; zh: string; en: string }[] = [
  { key: "industry", zh: "行业", en: "Industry" },
  { key: "location", zh: "地区", en: "Region" },
  { key: "role", zh: "角色", en: "Role" },
  { key: "relationship", zh: "关系", en: "Relationship" },
];
// 设计 coverage 数组的三组 tag 色 + icon/icon 色，按 severity 高→低依次对应。
const SEVERITY_TAG = {
  high: { bg: "#FBE4E1", fg: "#B5473A", zh: "优先拓展", en: "Expand first", icon: "▮", iconBg: "#DDDEFA", iconFg: "#2E3270" },
  medium: { bg: "#FBF1DC", fg: "#8A6420", zh: "重点关注", en: "Watch closely", icon: "❋", iconBg: "#E6F1EC", iconFg: "#2F6B4F" },
  low: { bg: "#ECEEFB", fg: "#2E3270", zh: "持续跟进", en: "Keep following", icon: "▦", iconBg: "#ECEEFB", iconFg: "#4B4FC7" },
} as const;

export function NetworkAnalysis({ viewModel, analysis, initialTab }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView; initialTab: AnalysisTabKey }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const [view, setView] = useState(analysis);
  const [tab, setTab] = useState<AnalysisTabKey>(initialTab);
  const [dim, setDim] = useState<AnalysisDimension>("industry");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
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
      const response = await fetch("/api/mobile/contacts-dashboard", { cache: "no-store" });
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

  const structure = ready && view.structure.state === "ready" ? view.structure.data : null;
  const coverage = ready && view.coverage.state === "ready" ? view.coverage.data : null;
  const opportunities = ready && view.opportunities.state === "ready" ? view.opportunities.data : null;
  const goal = ready && "data" in view.goal ? view.goal.data : null;
  const total = people.length;
  const dimTitle = t(DIMS.find((d) => d.key === dim) ?? DIMS[0]);
  const buckets = structure ? structure.dimensions[dim] : [];
  const dimD = donut(buckets.map((b) => [b.label, b.count] as const));
  const health = healthRows(view);
  const strong = structure?.health.find((h) => h.id === "strong");
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
          <div className="nw-an-sec">
            <div className="nw-an-hero">
              <div className="nw-an-hero-copy">
                <span className="nw-an-hero-star">✦</span>
                <div className="nw-an-hero-text">
                  <span className="nw-an-eyebrow">{t({ en: "Structure diagnosis", zh: "结构诊断" })}</span>
                  <h2 className="nw-h2-26">{view.state === "ready" ? view.summary || t({ en: "No summary yet", zh: "暂无总结" }) : emptyCopy(view.state)}</h2>
                </div>
              </div>
              <button type="button" className="btn nw-an-outline" onClick={() => setTab("opp")}>{t({ en: "View related insights →", zh: "查看相关洞察 →" })}</button>
            </div>

            <div className="nw-pipe-grid">
              <div className="nw-ov-card">
                <div className="nw-card-head">
                  <h2 className="nw-h2">{t({ en: `${dimTitle} distribution`, zh: `${dimTitle}分布` })}</h2>
                  <span className="nw-ai-desc">{t({ en: `${buckets.length} groups, ${total} contacts`, zh: `共 ${buckets.length} 个领域，${total} 位联系人` })}</span>
                </div>
                {structure ? (
                  <div className="nw-dim-wrap">
                    <div className="nw-dim-donut" style={{ background: dimD.bg }}>
                      <div className="nw-dim-donut-inner">
                        <strong className="nw-dim-donut-n">{total}</strong>
                        <span className="nw-ai-desc">{t({ en: "contacts", zh: "联系人" })}</span>
                      </div>
                    </div>
                    <div className="nw-dim-legend">
                      {dimD.rows.map((d) => (
                        <div key={d.label} className="nw-dim-row">
                          <span className="nw-dim-dot" style={{ background: d.color }}></span>
                          <span className="nw-dim-row-copy"><strong className="nw-dim-row-label">{d.label}</strong><span className="nw-ai-desc">{t({ en: `${d.n} · ${d.pct}`, zh: `${d.n} 人 · ${d.pct}` })}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : emptyBlock(secState("structure"))}
              </div>

              <div className="nw-cockpit">
                <div className="nw-dims">
                  {DIMS.map((dm) => {
                    const on = dim === dm.key;
                    return <button key={dm.key} type="button" className="btn nw-dim-btn" onClick={() => setDim(dm.key)} style={{ background: on ? "#0E1225" : "#FFFFFF", color: on ? "#FFFFFF" : "#3B3F7A", borderColor: on ? "#0E1225" : "#E8E9F6" }}>{t(dm)}</button>;
                  })}
                </div>
                <div className="nw-top-head">
                  <h3 className="nw-h3">{dimTitle} Top 5</h3>
                  <span className="nw-ai-desc">{t({ en: "Sorted by contact count", zh: "按联系人数量排序" })}</span>
                </div>
                <div className="nw-top-thead"><span>#</span><span>{dimTitle}</span><span className="nw-right">{t({ en: "Contacts", zh: "联系人" })}</span><span className="nw-right">{t({ en: "Share", zh: "占比" })}</span></div>
                {dimD.rows.slice(0, 5).map((r, i) => (
                  <a key={r.label} className="nw-top-row" href={buckets[i]?.href}>
                    <span className="nw-top-rank" style={{ background: RANK_COLORS[i][0], color: RANK_COLORS[i][1] }}>{i + 1}</span>
                    <span>{r.label}</span><strong className="nw-top-n">{r.n}</strong><span className="nw-top-pct">{r.pct}</span>
                  </a>
                ))}
                {structure && dimD.rows.length === 0 ? <div className="nw-empty">{t({ en: "No data in this dimension", zh: "当前维度暂无数据" })}</div> : null}
                {!structure ? emptyBlock(secState("structure")) : null}
                <div className="nw-dim-sum">
                  <span className="nw-dim-sum-icon">▮</span>
                  <span className="nw-card-head"><strong className="nw-dim-sum-t">{t({ en: `${dimTitle} summary`, zh: `${dimTitle}分布小结` })}</strong><span className="nw-dim-sum-p">{structure?.summary || t({ en: "No summary yet", zh: "暂无总结" })}</span></span>
                </div>
              </div>
            </div>

            <div className="nw-insight">
              <div className="nw-insight-copy">
                <span className="nw-insight-icon">✦</span>
                <div className="nw-insight-text">
                  <strong className="nw-insight-t">{t({ en: "Structure insight", zh: "结构洞察" })}</strong>
                  {coverage ? <p className="nw-insight-p">{coverage.summary}</p> : emptyBlock(secState("coverage"))}
                </div>
              </div>
              <button type="button" className="btn nw-an-outline" onClick={() => setTab("opp")}>{t({ en: "View suggestions →", zh: "查看具体建议 →" })}</button>
            </div>

            <div className="nw-cockpit">
              <div className="nw-ov-head">
                <h2 className="nw-h2">{t({ en: "Relationship health", zh: "关系健康" })}</h2>
                <button type="button" className="btn nw-textlink" onClick={() => setTab("opp")}>{t({ en: "View details →", zh: "查看详细分析 →" })}</button>
              </div>
              {health.length > 0 ? (
                <div className="nw-health-grid">
                  {health.map((h) => (
                    <div key={h.icon} className="nw-health-item">
                      <span className="nw-health-icon" style={{ background: h.iconBg, color: h.iconFg }}>{h.icon}</span>
                      <span className="nw-health-copy">
                        <span className="nw-ai-desc">{t(h.label)}</span>
                        <span className="nw-health-row"><strong className="nw-health-n">{h.n}</strong><span className="nw-health-tag" style={{ background: h.iconBg, color: h.iconFg }}>{t(h.tag)}</span></span>
                        <span className="nw-health-desc">{t(h.desc)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : emptyBlock(secState("structure"))}
              <div className="nw-health-foot">
                <strong className="nw-suggest-title">{t({ en: "More metrics", zh: "更多关键指标" })}</strong>
                <span className="nw-health-kv">{t({ en: "Strong ties", zh: "强关系占比" })} <strong className="nw-health-kv-v">{strong ? `${strong.percentage}%` : dash}</strong></span>
                <span className="nw-health-kv">{t({ en: "New contacts", zh: "最近新增联系人" })} <strong className="nw-health-kv-v">{ready ? t({ en: String(view.metrics.newContacts), zh: `${view.metrics.newContacts} 位` }) : dash}</strong></span>
                <a className="btn nw-textlink nw-textlink-end" href="/app/contacts">{t({ en: "View all data →", zh: "查看完整数据 →" })}</a>
              </div>
            </div>
          </div>
        ) : (
          <div className="nw-an-sec">
            <div className="nw-an-hero-opp">
              <div className="nw-an-hero-copy-opp">
                <span className="nw-an-hero-star-28">✦</span>
                <div className="nw-an-hero-text">
                  <h2 className="nw-h2-26">{opportunities ? opportunities.summary || t({ en: "No summary yet", zh: "暂无总结" }) : emptyCopy(secState("opportunities"))}</h2>
                  {coverage ? <p className="nw-an-hero-p">{coverage.summary}</p> : null}
                </div>
              </div>
              <div className="nw-hero-chips">
                <span className="nw-hero-chip">✦ {t({ en: "Find opportunities", zh: "发现机会" })}</span>
                <span className="nw-hero-chip">✦ {t({ en: "Close gaps", zh: "补齐短板" })}</span>
                <span className="nw-hero-chip">✦ {t({ en: "Grow influence", zh: "拓展影响力" })}</span>
              </div>
            </div>

            <div className="nw-opp-grid">
              <div className="nw-ov-card">
                <div className="nw-goal-head">
                  <div className="nw-card-head">
                    <h2 className="nw-h2">{t({ en: "Goal coverage", zh: "目标覆盖" })}</h2>
                    <span className="nw-ai-desc">{goal ? goal.text || t({ en: "No relationship goal yet", zh: "尚未设置关系目标" }) : emptyCopy(secState("goal"))}</span>
                  </div>
                  <button type="button" className="btn nw-refresh" disabled={busy || !ready} onClick={() => refresh(true)}>⟳ {t({ en: "Refresh", zh: "刷新机会" })}</button>
                </div>
                <div className="nw-goal-body">
                  <div className="nw-dial">
                    <span className="nw-dial-ring"></span>
                    <span className="nw-dial-ring-2"></span>
                    <span className="nw-dial-dot-1"></span>
                    <span className="nw-dial-dot-2"></span>
                    <span className="nw-dial-dot-3"></span>
                    <span className="nw-dial-center"><strong className="nw-goal-score">{coverage ? `${coverage.score} / 100` : "— —"}</strong><span className="nw-dial-label">{t({ en: "coverage", zh: "覆盖度" })}</span></span>
                  </div>
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

              <div className="nw-cov-card">
                <div className="nw-goal-head">
                  <div className="nw-card-head">
                    <h2 className="nw-h2">{t({ en: "Coverage suggestions", zh: "覆盖建议" })}</h2>
                    <span className="nw-ai-desc">{t({ en: "Gaps between your network structure and your goal.", zh: "基于你的人脉结构与关系目标，为你识别以下缺口方向。" })}</span>
                  </div>
                </div>
                {coverage ? coverage.gaps.map((c) => {
                  const tag = SEVERITY_TAG[c.severity];
                  return (
                    <a key={c.id} className="btn nw-cov-row" href="/app/contacts">
                      <span className="nw-cov-icon" style={{ background: tag.iconBg, color: tag.iconFg }}>{tag.icon}</span>
                      <span className="nw-cov-copy"><strong className="nw-suggest-title">{c.label}</strong><span className="nw-cov-desc">{c.action}</span></span>
                      <span className="nw-suggest-tag" style={{ background: tag.bg, color: tag.fg }}>{t(tag)}</span>
                      <span className="nw-suggest-arrow">›</span>
                    </a>
                  );
                }) : emptyBlock(secState("coverage"))}
                {coverage && coverage.gaps.length === 0 ? <div className="nw-empty">{t({ en: "No coverage gaps", zh: "暂无覆盖缺口" })}</div> : null}
              </div>
            </div>

            <div className="nw-cockpit">
              <div className="nw-act-head">
                <span className="nw-act-title"><h2 className="nw-h2">{t({ en: "Suggested actions", zh: "建议动作" })}</h2><span className="nw-ai-desc">{t({ en: "Recommended from your network structure and goal gap, by priority.", zh: "根据当前人脉结构与目标差距，为你推荐以下行动，按优先级排序。" })}</span></span>
              </div>
              {opportunities ? (
                <div className="nw-act-grid">
                  {opportunities.actions.map((a, i) => (
                    <a key={a.id} className="btn nw-act" href={a.primary.href}>
                      <span className="nw-act-rank">{i + 1}</span>
                      <span className="nw-act-copy">
                        <span className="nw-act-row"><strong className="nw-suggest-title">{a.title}</strong><span className="nw-act-tag" style={{ background: "#ECEEFB", color: "#2E3270" }}>{a.dueLabel}</span></span>
                        <span className="nw-act-desc">{a.contactName ? `${a.contactName} · ${a.judgment}` : a.judgment}</span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : emptyBlock(secState("opportunities"))}
              {opportunities && opportunities.actions.length === 0 ? <div className="nw-empty">{t({ en: "No priority actions right now", zh: "当前没有优先行动建议" })}</div> : null}
            </div>

            <div className="nw-cockpit">
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
                        <span className="nw-act-desc">{d.reason}</span>
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
