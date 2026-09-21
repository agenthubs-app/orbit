/**
 * 「概览」（Network v2 第 66–171 行）。数据 = OrbitContactsViewModel.connections + ContactsAnalysisView。
 * 设计稿 mock（428/128/85%/「↗ +25%」/AI 文案）一律不渲染；驾驶舱四卡 = cockpit(analysis) 真实计数，
 * 「最近动态」= analysis.activity（真实 occurredAt，后端最多 3 条；活动条目不是联系人，故标题改为「最近动态」）。
 */
"use client";

import { useMemo, useState } from "react";

import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { NETWORK_STAGES, STAGE_BAR_BG, STAGE_BAR_FG, STAGE_CHIP, STAGE_LABEL, donut, stageClip, stageCounts, toPerson } from "./network-model";
import { cockpit, distributionRows, type DistKey } from "./network-overview-model";
import { NetworkAvatar, NetworkShell } from "./network-shell";

const DIST_SEGS: { key: DistKey; zh: string; en: string }[] = [
  { key: "industry", zh: "按行业", en: "By industry" },
  { key: "region", zh: "按地区", en: "By region" },
  { key: "source", zh: "按来源", en: "By source" },
];

// 只用 UTC 分量，服务端与客户端渲染结果一致（避免 hydration 差异）。
export function formatMonthDay(iso: string, t: (copy: { en: string; zh: string }) => string, relative = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (relative && d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)) return t({ zh: "今天", en: "today" });
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return t({ zh: `${m}月${day}日`, en: `${m}/${day}` });
}

export function NetworkOverview({ viewModel, analysis }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView }) {
  const { t } = useOrbitLanguage();
  const [dist, setDist] = useState<DistKey>("industry");
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
  const counts = useMemo(() => stageCounts(people), [people]);
  const dd = donut(distributionRows(dist, analysis, people));
  const cards = cockpit(analysis);
  const ready = analysis.state === "ready";
  const dash = "—";
  const newContacts = ready ? String(analysis.metrics.newContacts) : dash;
  const meta = ready
    ? t({ zh: `更新于${formatMonthDay(analysis.generatedAt, t, true)} · 依据 ${people.length} 位联系人`, en: `Updated ${formatMonthDay(analysis.generatedAt, t, true)} · based on ${people.length} contacts` })
    : t({ zh: `分析生成中 · 依据 ${people.length} 位联系人`, en: `Analysis in progress · based on ${people.length} contacts` });
  const highlights = people.filter((p) => p.stage === "advance").slice(0, 2);
  const activity = ready ? analysis.activity : [];

  return (
    <NetworkShell screen="overview" total={people.length}>
      <div className="nw-pipe">
        <div className="nw-pipe-grid">
          <div className="nw-pipe-card">
            <div className="nw-dist-head">
              <h2 className="nw-h2">{t({ en: "Network distribution", zh: "人脉分布" })}</h2>
              <div className="nw-seg">
                {DIST_SEGS.map((sg) => (
                  <button key={sg.key} type="button" className="btn nw-seg-btn" onClick={() => setDist(sg.key)} style={{ background: dist === sg.key ? "#0E1225" : "transparent", color: dist === sg.key ? "#FFFFFF" : "#3B3F7A" }}>{t(sg)}</button>
                ))}
              </div>
            </div>
            <div className="nw-donut-wrap">
              <div className="nw-donut" style={{ background: dd.bg }}>
                <div className="nw-donut-inner">
                  <strong className="nw-donut-n">{people.length}</strong>
                  <span className="nw-ai-desc">{t({ en: "contacts", zh: "联系人" })}</span>
                </div>
              </div>
              <div className="nw-dist-legend">
                {dd.rows.map((d) => (
                  <div key={d.label} className="nw-dist-row">
                    <span className="nw-dist-dot" style={{ background: d.color }}></span>
                    <span className="nw-dist-label">{d.label}</span>
                    <strong className="nw-dist-n">{d.n}</strong>
                    <span className="nw-dist-pct">{d.pct}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="nw-dist-foot">{t({ en: `${newContacts} new recently`, zh: `最近新增 ${newContacts} 位` })}</div>
          </div>

          <div className="nw-cockpit">
            <div className="nw-cockpit-head">
              <div className="nw-cockpit-title">
                <span className="nw-ai-star">✦</span>
                <div className="nw-card-head">
                  <h2 className="nw-h2">{t({ en: "AI network cockpit", zh: "AI 人脉驾驶舱" })}</h2>
                  <span className="nw-ai-desc">{t({ en: "From your network data: spot opportunities and get the next step.", zh: "基于你的人脉数据，发现机会，给出下一步建议。" })}</span>
                </div>
              </div>
              <span className="nw-cockpit-meta">{meta}</span>
            </div>
            <div className="nw-suggest-list">
              {cards.map((c) => (
                <a key={c.href + c.icon} className="btn nw-cockpit-card" href={c.href}>
                  <span className="nw-suggest-icon">{c.icon}</span>
                  <span className="nw-suggest-copy">
                    <strong className="nw-suggest-title"><span className="nw-cockpit-n">{c.n ?? dash}</span>{t({ zh: " 位", en: " " })}{t(c.title)}</strong>
                    <span className="nw-suggest-desc">{t(c.desc)}</span>
                  </span>
                  <span className="nw-suggest-tag" style={{ background: c.tagBg, color: c.tagFg }}>{t(c.tag)}</span>
                  <span className="nw-suggest-arrow">›</span>
                </a>
              ))}
            </div>
            <div className="nw-cockpit-foot">
              <a className="btn nw-cockpit-cta" href="/app/contacts/dashboard?tab=structure">{t({ en: "View full analysis →", zh: "查看完整分析 →" })}</a>
              <a className="btn nw-cockpit-agent" href="/app/agent"><strong className="nw-suggest-title">✦ {t({ en: "Hand to iOrbit", zh: "交给 iOrbit" })}</strong><span className="nw-cockpit-agent-hint">{t({ en: "Let AI analyse and act for you", zh: "让 AI 帮你分析并执行" })}</span></a>
            </div>
          </div>
        </div>

        <div className="nw-ov-card">
          <div className="nw-ov-head">
            <h2 className="nw-h2">{t({ en: "Relationship pipeline", zh: "关系推进管线" })}</h2>
            <a className="nw-link" href="/app/contacts/pipeline">{t({ en: "View full pipeline →", zh: "查看完整管线 →" })}</a>
          </div>
          <div className="nw-stage-bar">
            {NETWORK_STAGES.map((stage, i) => (
              <a key={stage} className="btn nw-stage-seg" href="/app/contacts/pipeline" style={{ background: STAGE_BAR_BG[i], color: STAGE_BAR_FG[i], clipPath: stageClip(i as 0 | 1 | 2 | 3) }}>
                <span className="nw-stage-label">{t(STAGE_LABEL[stage])}</span>
                <strong className="nw-stage-n">{counts[stage]}</strong>
              </a>
            ))}
          </div>
          {highlights.length > 0 ? (
            <div className="nw-hl-grid">
              {highlights.map((p) => (
                <a key={p.id} className="btn nw-hl" href={p.href}>
                  <NetworkAvatar initial={p.initial} size={44} />
                  <span className="nw-hl-copy"><strong className="nw-suggest-title">{p.name}</strong><span className="nw-ai-desc">{p.next || dash}</span></span>
                  <span className="nw-hl-stage" style={{ background: STAGE_CHIP.advance.bg, color: STAGE_CHIP.advance.fg }}>{t(STAGE_LABEL.advance)}</span>
                  <span className="nw-suggest-arrow">›</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="nw-empty">{t({ en: "No relationships advancing this week", zh: "本周没有正在推进的关系" })}</div>
          )}
        </div>

        <div className="nw-recent-card">
          <div className="nw-ov-head">
            <h2 className="nw-h2">{t({ en: "Recent activity", zh: "最近动态" })}</h2>
            <a className="nw-link" href="/app/contacts">{t({ en: "View all contacts →", zh: "查看全部人脉 →" })}</a>
          </div>
          <div className="nw-recent-thead">
            <span></span><span>{t({ en: "Activity", zh: "动态" })}</span><span>{t({ en: "Source", zh: "来源" })}</span><span>{t({ en: "Industry", zh: "行业" })}</span><span>{t({ en: "Status", zh: "关系状态" })}</span><span>{t({ en: "When", zh: "最近互动" })}</span><span></span>
          </div>
          {activity.map((a) => (
            <div key={a.id} className="nw-recent-row">
              <NetworkAvatar initial="◷" />
              <strong className="nw-recent-name">{a.label}</strong>
              <span className="nw-recent-org">{a.source}</span>
              <span className="nw-recent-ind">{dash}</span>
              <span></span>
              <span className="nw-recent-last">{formatMonthDay(a.occurredAt, t)}</span>
            </div>
          ))}
          {activity.length === 0 ? (
            <div className="nw-empty">{t({ en: "No activity yet", zh: "还没有互动记录" })}</div>
          ) : null}
        </div>
      </div>
    </NetworkShell>
  );
}
