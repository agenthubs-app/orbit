"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccountTopNav } from "../../orbit-account-shell";
import { useOrbitLanguage } from "../../orbit-language-context";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../orbit-layout-constants";
import { CrmSidebar } from "../orbit-crm-sidebar";
import { AnalysisGoalEditor } from "./analysis-goal-editor";
import { contactsAnalysisToView, type AnalysisDimension, type ContactsAnalysisView } from "./contacts-analysis-view-model";

export type AnalysisTab = "overview" | "structure" | "opportunities";
const colors = ["var(--accent)", "var(--sky)", "var(--live)", "#a790ce", "#d49b64", "#809b96"];

export function ContactsAnalysisShell({ children, count }: { children: ReactNode; count?: number }) {
  const { t, preserveHref } = useOrbitLanguage();
  return <main className="orbit-page" data-orbit-real-page="contacts-analysis">
    <AccountTopNav active="cards" />
    <div className="analysis-layout">
      <div className="analysis-sidebar"><CrmSidebar active="dashboard" counts={count === undefined ? {} : { list: count }} /></div>
      <div className="analysis-main scroll" data-appscroll>
        <nav className="analysis-mobile-nav noscroll" data-analysis-mobile-nav aria-label={t({ zh: "人脉分区", en: "Contact sections", ja: "人脈メニュー" })}>
          <a className="chip" href={preserveHref("/app/contacts")}>{t({ zh: "全部", en: "All", ja: "すべて" })}</a>
          <a className="chip" href={preserveHref("/app/contacts/pipeline")}>{t({ zh: "关系进展", en: "Relationship progress", ja: "関係の進展" })}</a>
          <a className="chip is-active" aria-current="page" href={preserveHref("/app/contacts/dashboard")}>{t({ zh: "人脉分析", en: "Network analysis", ja: "人脈分析" })}</a>
          <a className="chip" href={preserveHref("/app/contacts/intros")}>{t({ zh: "引荐", en: "Introductions", ja: "紹介" })}</a>
          <a className="chip" href={preserveHref("/app/contacts/all-actions")}>{t({ zh: "操作记录", en: "All actions", ja: "操作履歴" })}</a>
        </nav>
        {children}
      </div>
    </div>
    <style>{`
      .analysis-layout{display:grid;grid-template-columns:${ORBIT_LEFT_SIDEBAR_WIDTH}px minmax(0,1fr);height:calc(100dvh - 64px)}
      .analysis-mobile-nav{display:none;gap:8px;overflow-x:auto;margin-bottom:22px;padding:4px 0 10px}.analysis-mobile-nav a{flex-shrink:0;text-decoration:none}
      .analysis-sidebar{background:var(--bg-sunken);overflow:auto}.analysis-main{padding:28px 32px 60px;overflow:auto;min-width:0}
      .analysis-content{max-width:1200px;margin:0 auto}.analysis-head{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:20px}
      .analysis-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px}.analysis-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
      .analysis-card{padding:22px;min-width:0;overflow-wrap:anywhere}.analysis-card h2{margin:0 0 14px;font-size:18px}.analysis-card h3{font-size:15px}.analysis-muted{color:var(--text-3);font-size:13px;line-height:1.7}
      .analysis-tabs{display:flex;gap:6px;border-bottom:1px solid var(--border);margin-bottom:22px;padding-bottom:8px}.analysis-tabs button{flex:1;max-width:180px}
      .analysis-chart{display:grid;grid-template-columns:minmax(160px,.9fr) minmax(0,1.1fr);gap:22px;align-items:center}.analysis-legend{display:grid;gap:6px;max-height:420px;overflow:auto}
      .analysis-bucket{display:flex;align-items:center;gap:8px;text-align:left;background:transparent;border:1px solid transparent;border-radius:10px;padding:10px;color:var(--text-2);font:inherit;font-size:13px;cursor:pointer}
      .analysis-bucket[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent)}.analysis-bucket span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}
      .analysis-notice{padding:14px 18px;border:1px solid var(--border);border-radius:12px;margin:14px 0}.analysis-main a{overflow-wrap:anywhere}.analysis-main button:focus-visible,.analysis-main a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
      @media(max-width:900px){.analysis-layout{grid-template-columns:1fr;height:auto;min-height:calc(100dvh - 64px)}.analysis-sidebar{display:none}.analysis-mobile-nav{display:flex}.analysis-main{padding:22px 16px 90px;overflow:visible}.analysis-grid{grid-template-columns:1fr}.analysis-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.analysis-chart{grid-template-columns:1fr}.analysis-chart svg{max-width:240px;margin:auto}.analysis-card{padding:18px}}
    `}</style>
  </main>;
}

export function ContactsAnalysisWorkspace(props: { initialView: ContactsAnalysisView; initialTab?: AnalysisTab }) {
  return <ContactsAnalysisShell count={props.initialView.state === "ready" ? props.initialView.metrics.contacts : undefined}><ContactsAnalysisContent {...props} /></ContactsAnalysisShell>;
}

export function ContactsAnalysisContent({ initialView, initialTab = "overview" }: { initialView: ContactsAnalysisView; initialTab?: AnalysisTab }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const [view, setView] = useState(initialView);
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  const [dimension, setDimension] = useState<AnalysisDimension>("industry");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalSaved, setGoalSaved] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
      if (mounted.current) { setView(next); if (recomputed && next.state === "ready") setGoalSaved(false); }
    } catch {
      if (mounted.current) setError(recomputed
        ? t({ zh: "机会已重算，但新数据暂未加载。请刷新查看。", en: "Opportunities were recomputed, but the updated data could not load. Please refresh.", ja: "再計算は完了しましたが、更新データを読み込めませんでした。再読み込みしてください。" })
        : t({ zh: "操作未完成，已保留当前数据。请重试。", en: "The operation failed. Your current data is still shown. Please retry.", ja: "操作に失敗しました。現在のデータを保持しています。再試行してください。" }));
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const unavailable = (section: string, state: string) => <p className="analysis-muted" data-analysis-unavailable={section}>{state === "pending" ? t({ zh: "正在生成分析，请稍后刷新。", en: "Analysis is being prepared. Refresh shortly.", ja: "分析を準備中です。しばらくして再読み込みしてください。" }) : t({ zh: "这部分数据暂不可用，请刷新重试。", en: "This section is unavailable. Refresh to retry.", ja: "このデータは利用できません。再読み込みしてください。" })}</p>;
  const tabs = [
    ["overview", t({ zh: "概览", en: "Overview", ja: "概要" })],
    ["structure", t({ zh: "结构", en: "Structure", ja: "構成" })],
    ["opportunities", t({ zh: "机会", en: "Opportunities", ja: "機会" })],
  ] as const;
  const dimensions = [
    ["industry", t({ zh: "行业", en: "Industry", ja: "業種" })], ["location", t({ zh: "地区", en: "Location", ja: "地域" })],
    ["role", t({ zh: "角色", en: "Role", ja: "役割" })], ["relationship", t({ zh: "关系", en: "Relationship", ja: "関係" })],
  ] as const;
  const coverage = view.state === "ready" ? <section className="card analysis-card"><h2>{t({ zh: "目标覆盖", en: "Goal coverage", ja: "目標のカバー率" })}</h2>
    {"data" in view.coverage ? <><div style={{ fontSize: 36, color: "var(--accent)" }}>{view.coverage.data.score}<span style={{ fontSize: 16 }}> / 100</span></div><p className="analysis-muted">{view.coverage.data.summary}</p>{view.coverage.data.gaps.map((gap) => <div key={gap.id} className="analysis-notice"><strong>{gap.label}</strong><span className="analysis-muted"> · {gap.current} / {gap.target}</span><p>{gap.action}</p><a href={preserveHref("/app/contacts")}>{t({ zh: "查看人脉", en: "View contacts", ja: "人脈を見る" })}</a></div>)}</> : unavailable("coverage", view.coverage.state)}
  </section> : null;
  return <div className="analysis-content">
    <header className="analysis-head"><div><h1 className="h-display" style={{ margin: 0 }}>{t({ zh: "人脉分析", en: "Network analysis", ja: "人脈分析" })}</h1><p className="analysis-muted">{t({ zh: "围绕你的关系目标，查看结构与下一步行动。", en: "Explore your network and next steps around your relationship goal.", ja: "関係づくりの目標に合わせて、人脈の構成と次の行動を確認。" })}</p></div><button className="btn btn-ghost" data-analysis-refresh disabled={busy} onClick={() => refresh()}>{t({ zh: "刷新", en: "Refresh", ja: "再読み込み" })}</button></header>
    {error ? <div className="analysis-notice" role="alert">{error}</div> : null}
    {view.state !== "ready" ? <section className="card analysis-card">{unavailable("analysis", view.state)}</section> : <>
      <section className="card analysis-card" style={{ marginBottom: 18 }}><div className="analysis-head" style={{ marginBottom: 0 }}><div><div className="eyebrow">{t({ zh: "当前关系目标", en: "Relationship goal", ja: "現在の目標" })}</div>{"data" in view.goal ? <p>{view.goal.data.text || t({ zh: "尚未设置关系目标", en: "No relationship goal yet", ja: "目標はまだ設定されていません" })}</p> : unavailable("goal", view.goal.state)}</div>{"data" in view.goal && view.goal.data.canEdit ? <button className="btn btn-ghost btn-sm" data-analysis-goal-edit disabled={busy} onClick={() => setEditingGoal(true)}>{t({ zh: "编辑目标", en: "Edit goal", ja: "目標を編集" })}</button> : <a className="btn btn-ghost btn-sm" href={preserveHref("/app/profile")}>{t({ zh: "完善个人资料", en: "Complete profile", ja: "プロフィールを入力" })}</a>}</div></section>
      {goalSaved ? <p role="status" className="analysis-muted">{t({ zh: "目标已保存，现有建议仍是上次分析。请在机会页重算。", en: "Goal saved. Suggestions still reflect the previous analysis. Recompute them in Opportunities.", ja: "目標を保存しました。提案は前回の分析結果です。「機会」で再計算してください。" })}</p> : null}
      {editingGoal && "data" in view.goal && view.goal.data.id ? <AnalysisGoalEditor key={view.goal.data.id} profileId={view.goal.data.id} initialGoal={view.goal.data.text} onClose={() => setEditingGoal(false)} onSaved={(text) => {
        setView((current) => current.state === "ready" && "data" in current.goal ? { ...current, goal: { ...current.goal, data: { ...current.goal.data, text } } } : current);
        setEditingGoal(false); setGoalSaved(true);
      }} /> : null}
      <div className="analysis-tabs" role="tablist" aria-label={t({ zh: "人脉分析视图", en: "Analysis views", ja: "分析ビュー" })}>{tabs.map(([id, label], index) => <button key={id} role="tab" id={`analysis-tab-${id}`} aria-controls={`analysis-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={`btn ${tab === id ? "btn-primary" : "btn-ghost"}`} data-analysis-tab={id} onClick={() => setTab(id)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3; setTab(tabs[next][0]); document.getElementById(`analysis-tab-${tabs[next][0]}`)?.focus(); }}>{label}</button>)}</div>
      {view.metrics.contacts === 0 ? <p className="analysis-notice">{t({ zh: "还没有联系人，添加后可查看人脉结构。", en: "Add your first contact to start exploring your network.", ja: "連絡先を追加すると、人脈の構成を確認できます。" })} <a href={preserveHref("/app/contacts/new")}>{t({ zh: "添加联系人", en: "Add contact", ja: "連絡先を追加" })}</a></p> : null}
      <div role="tabpanel" id={`analysis-panel-${tab}`} aria-labelledby={`analysis-tab-${tab}`}>
        {tab === "overview" ? <>
          <p className="analysis-muted">{view.summary}</p>
          <div className="analysis-metrics" data-analysis-metrics>{[
            [t({ zh: "总人脉", en: "Contacts", ja: "人脈数" }), view.metrics.contacts], [t({ zh: "高价值关系", en: "High-value ties", ja: "価値の高い関係" }), view.metrics.highValue],
            [t({ zh: "待联系", en: "To contact", ja: "連絡予定" }), view.metrics.pendingFollowups], [t({ zh: "沉睡关系", en: "Dormant ties", ja: "休眠中の関係" }), view.metrics.dormant],
          ].map(([label, count]) => <section className="card analysis-card" key={label}><div className="analysis-muted">{label}</div><div style={{ fontSize: 32, marginTop: 8 }}>{count}</div></section>)}</div>
          <div className="analysis-grid">{coverage}<section className="card analysis-card"><h2>{t({ zh: "最近动态", en: "Recent activity", ja: "最近の動き" })}</h2>{view.activity.length ? view.activity.map((item) => <div key={item.id} className="analysis-notice"><p>{item.label}</p><div className="analysis-muted">{item.source} · <time dateTime={item.occurredAt}>{item.occurredAt.slice(0, 10)}</time></div></div>) : <p className="analysis-muted">{t({ zh: "暂无最近动态", en: "No recent activity", ja: "最近の動きはありません" })}</p>}</section></div>
        </> : null}
        {tab === "structure" ? <>{"data" in view.structure ? <div className="analysis-grid"><section className="card analysis-card"><h2>{t({ zh: "人脉结构", en: "Network structure", ja: "人脈の構成" })}</h2><div className="analysis-tabs">{dimensions.map(([id, label]) => <button key={id} className={`btn btn-sm ${dimension === id ? "btn-primary" : "btn-ghost"}`} aria-pressed={dimension === id} data-analysis-dimension={id} onClick={() => { setDimension(id); setSelected(null); }}>{label}</button>)}</div>
          {(() => {
            const buckets = view.structure.data.dimensions[dimension];
            const active = buckets.find((bucket) => bucket.id === selected) ?? buckets[0];
            let offset = 0;
            return buckets.length ? <><div className="analysis-chart"><svg viewBox="0 0 240 240" role="img" aria-label={t({ zh: "当前维度的占比分布", en: "Distribution in the selected dimension", ja: "選択した区分の構成比" })} style={{ width: "100%" }}><circle cx="120" cy="120" r="88" fill="none" stroke="var(--border)" strokeWidth="24" />{buckets.map((bucket, index) => { const start = offset; offset += bucket.percentage; return <circle key={bucket.id} cx="120" cy="120" r="88" fill="none" stroke={colors[index % colors.length]} strokeWidth={active?.id === bucket.id ? 32 : 22} pathLength="100" strokeDasharray={`${bucket.percentage} ${100 - bucket.percentage}`} strokeDashoffset={-start} transform="rotate(-90 120 120)" onClick={() => setSelected(bucket.id)} style={{ cursor: "pointer" }}><title>{`${bucket.label}: ${bucket.count} (${bucket.percentage}%)`}</title></circle>; })}<text x="120" y="116" textAnchor="middle" fill="var(--ink)" fontSize="32">{active?.count}</text><text x="120" y="143" textAnchor="middle" fill="var(--text-3)" fontSize="14">{active?.percentage}%</text></svg><div className="analysis-legend">{buckets.map((bucket, index) => <button className="analysis-bucket" key={bucket.id} data-analysis-bucket={bucket.id} aria-pressed={active?.id === bucket.id} onClick={() => setSelected(bucket.id)}><span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: colors[index % colors.length] }} /><span>{bucket.label}</span><span>{bucket.count} · {bucket.percentage}%</span></button>)}</div></div>{active ? <div className="analysis-notice"><strong>{active.label}</strong>{active.missingData ? <p className="analysis-muted">{t({ zh: "这组联系人尚未填写该信息。", en: "These contacts have not provided this information.", ja: "このグループでは、この情報が未入力です。" })}</p> : null}<p><a className="btn btn-ghost btn-sm" data-analysis-detail href={preserveHref(active.href)}>{t({ zh: "查看分组详情", en: "View group details", ja: "グループ詳細を見る" })}</a></p></div> : null}</> : <p className="analysis-muted">{t({ zh: "当前维度暂无数据", en: "No data in this dimension", ja: "この区分のデータはありません" })}</p>;
          })()}</section><section className="card analysis-card"><h2>{t({ zh: "关系健康", en: "Relationship health", ja: "関係の健全性" })}</h2><p className="analysis-muted">{view.structure.data.summary}</p>{view.structure.data.health.map((item) => <div className="analysis-notice" key={item.id}><strong>{item.id === "strong" ? t({ zh: "强关系", en: "Strong", ja: "強い関係" }) : item.id === "warm" ? t({ zh: "中关系", en: "Warm", ja: "中程度の関係" }) : t({ zh: "弱关系", en: "Weak", ja: "弱い関係" })}</strong><p>{item.count} · {item.percentage}%</p><meter min={0} max={100} value={item.percentage} style={{ width: "100%" }} /><p className="analysis-muted">{t({ zh: "跟进风险", en: "Follow-up risk", ja: "フォローアップのリスク" })}: {item.risk === "high" ? t({ zh: "高", en: "High", ja: "高" }) : item.risk === "moderate" ? t({ zh: "中", en: "Moderate", ja: "中" }) : t({ zh: "低", en: "Low", ja: "低" })}</p></div>)}</section></div> : unavailable("structure", view.structure.state)}</> : null}
        {tab === "opportunities" ? <div data-analysis-opportunities><div className="analysis-head"><h2 className="h-section">{t({ zh: "下一步行动", en: "Next actions", ja: "次の行動" })}</h2><button className="btn btn-ghost btn-sm" data-analysis-recompute disabled={busy} onClick={() => refresh(true)}>{t({ zh: "重算机会", en: "Recompute opportunities", ja: "機会を再計算" })}</button></div><div className="analysis-grid"><div>{"data" in view.opportunities ? <><p className="analysis-muted">{view.opportunities.data.summary}</p>{view.opportunities.data.actions.map((action) => <article className="card analysis-card" key={action.id} style={{ marginBottom: 14 }}><div className="eyebrow">{action.contactName} · {action.dueLabel}</div><h3>{action.title}</h3><p>{action.judgment}</p><h4>{t({ zh: "依据", en: "Evidence", ja: "根拠" })}</h4>{action.evidence.length ? <ul>{action.evidence.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="analysis-muted" data-analysis-evidence-unavailable>{t({ zh: "尚无可读依据，请打开联系人核对来源后再行动。", en: "Readable evidence is unavailable. Check the contact’s sources before acting.", ja: "参照できる根拠がありません。行動する前に連絡先の情報源を確認してください。" })}</p>}{action.steps.length ? <><h4>{t({ zh: "建议步骤", en: "Suggested steps", ja: "推奨する手順" })}</h4><ol>{action.steps.map((item, i) => <li key={i}>{item}</li>)}</ol></> : null}<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="btn btn-primary btn-sm" href={preserveHref(action.primary.href)}>{action.primary.label}</a>{action.secondary ? <a className="btn btn-ghost btn-sm" href={preserveHref(action.secondary.href)}>{action.secondary.label}</a> : null}</div></article>)}{view.opportunities.data.actions.length === 0 ? <p className="analysis-notice">{t({ zh: "当前没有优先行动建议", en: "No priority actions right now", ja: "現在、優先する行動はありません" })}</p> : null}{view.opportunities.data.dormant.map((item) => <article className="card analysis-card" key={item.id} style={{ marginTop: 14 }}><h3><a href={preserveHref(item.href)}>{item.name}</a></h3><p>{item.reason}</p><p className="analysis-muted">{item.action}</p></article>)}</> : unavailable("opportunities", view.opportunities.state)}</div>{coverage}</div></div> : null}
      </div>
      <p className="analysis-muted" style={{ marginTop: 22 }}>{t({ zh: "数据生成时间", en: "Data generated", ja: "データ生成日時" })}: <time dateTime={view.generatedAt}>{view.generatedAt.replace("T", " ").slice(0, 19)} UTC</time></p>
    </>}
  </div>;
}
