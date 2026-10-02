/**
 * 「概览」（Network v2 第 66–171 行）。
 *
 * W0052（RN-10）：三块改接真实来源，数据由服务端组装成 `NetworkOverviewData`（`network-overview-cockpit-model.ts`）：
 * - AI 人脉驾驶舱 4 卡 = 快照句子（只来自快照 blocks 或数字模板）+ 规则数字（与分析页同一函数）；无快照不放占位句；
 * - 关系档位 = 新认识／有往来／核心／待唤醒全量人数（来自分析的全量档位分布，不来自名单），重点联系人 2 位；
 * - 最近动态 = 关系时间线最近 5 条（姓名链接、来源徽标、摘要、时间），时间线读失败只让这一块显示「来源暂时不可用」。
 * 人数（环形图中心、按来源、卡片、meta）全部是全量口径；手动阶段（待了解／推进中……）不再出现在概览。
 * 示例期由 `buildDemoNetworkOverview` 给同一形态的示例数据（不读快照、时间线与计划）。
 */
"use client";

import { useState } from "react";

import { DemoTag, useDemoMode } from "../../_demo/demo-mode-core";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { formatTimelineTime, TIMELINE_SOURCE_LABEL, useNetworkDemoDetail } from "./network-detail-modal";
import { NETWORK_TIER_GROUPS, STAGE_BAR_BG, STAGE_BAR_FG, TIER_CHIP, TIER_LABEL, donut, stageClip } from "./network-model";
import type { NetworkOverviewData, OverviewMeta } from "./network-overview-cockpit-model";
import { distributionRows, type DistKey } from "./network-overview-model";
import { NetworkAvatar, NetworkShell } from "./network-shell";

const DIST_SEGS: { key: DistKey; zh: string; en: string }[] = [
  { key: "industry", zh: "按行业", en: "By industry" },
  { key: "region", zh: "按地区", en: "By region" },
  { key: "source", zh: "按来源", en: "By source" },
];

type Translate = (copy: { en: string; zh: string }) => string;

// 只用 UTC 分量，服务端与客户端渲染结果一致（避免 hydration 差异）。
export function formatMonthDay(iso: string, t: Translate, relative = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (relative && d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)) return t({ zh: "今天", en: "today" });
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return t({ zh: `${m}月${day}日`, en: `${m}/${day}` });
}

const contactsEn = (n: number) => `${n} ${n === 1 ? "contact" : "contacts"}`;

function metaText(meta: OverviewMeta, t: Translate): string {
  switch (meta.kind) {
    case "snapshot": {
      const at = formatMonthDay(meta.generatedAt, t, true);
      return t({ zh: `生成于${at} · 基于 ${meta.contactCount} 人`, en: `Generated ${at} · based on ${contactsEn(meta.contactCount)}` });
    }
    case "total": return t({ zh: `依据 ${meta.total} 位联系人`, en: `Based on ${contactsEn(meta.total)}` });
    case "ai_unavailable": return t({ zh: "AI 分析暂时不可用", en: "AI analysis temporarily unavailable" });
    case "pending": return t({ zh: "分析生成中", en: "Analysis in progress" });
    default: return t({ zh: "来源暂时不可用", en: "Source temporarily unavailable" });
  }
}

export function NetworkOverview({ analysis, overview }: { analysis: ContactsAnalysisView; overview: NetworkOverviewData }) {
  const { t, language } = useOrbitLanguage();
  const [dist, setDist] = useState<DistKey>("industry");
  const dd = donut(distributionRows(dist, analysis, overview.sources, language));
  const dash = "—";
  const newContacts = analysis.state === "ready" ? String(analysis.metrics.newContacts) : dash;
  // W0005 示例模式：名字带「示例」角标、点开在本页弹示例详情；分析文案说明是示例人物的，不说「你的人脉」。
  const demo = useDemoMode();
  const demoDetail = useNetworkDemoDetail("/app/contacts/dashboard");
  const total = overview.total;
  const meta = demo
    ? t({ zh: `示例人物的人脉分析 · 依据 ${total ?? dash} 位示例联系人`, en: `Demo persona's network analysis · based on ${total ?? dash} demo contacts` })
    : metaText(overview.meta, t);
  const highlights = overview.highlights;

  return (
    <NetworkShell screen="overview" modal={demoDetail.modal}>
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
                  <strong className="nw-donut-n">{total ?? dash}</strong>
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

          <div className="nw-cockpit" data-network-section="cockpit">
            <div className="nw-cockpit-head">
              <div className="nw-cockpit-title">
                <span className="nw-ai-star">✦</span>
                <div className="nw-card-head">
                  <h2 className="nw-h2">{t({ en: "AI network cockpit", zh: "AI 人脉驾驶舱" })}</h2>
                  <span className="nw-ai-desc">{demo
                    ? t({ en: "Demo persona's network analysis: how the cockpit spots opportunities and suggests next steps.", zh: "示例人物的人脉分析：看看驾驶舱如何发现机会、给出下一步建议。" })
                    : t({ en: "From your network data: spot opportunities and get the next step.", zh: "基于你的人脉数据，发现机会，给出下一步建议。" })}</span>
                </div>
              </div>
              <span className="nw-cockpit-meta">{meta}</span>
            </div>
            <div className="nw-suggest-list">
              {overview.cards.map((c) => (
                <a key={c.id} className="btn nw-cockpit-card" href={c.href} data-overview-card={c.id}>
                  <span className="nw-suggest-icon">{c.icon}</span>
                  <span className="nw-suggest-copy">
                    <span className="nw-cockpit-label">{t(c.title)}</span>
                    <strong className={c.cta ? "nw-suggest-title nw-cockpit-plan-cta" : "nw-suggest-title nw-cockpit-n"}>{c.value ? t(c.value) : dash}</strong>
                    {c.sentence ? <span className="nw-suggest-desc nw-cockpit-sentence">{t(c.sentence)}</span> : null}
                  </span>
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

        <div className="nw-ov-card" data-network-section="tiers">
          <div className="nw-ov-head">
            <h2 className="nw-h2">{t({ en: "Relationship tiers", zh: "关系档位" })}</h2>
            <a className="nw-link" href="/app/contacts/pipeline">{t({ en: "View full pipeline →", zh: "查看完整管线 →" })}</a>
          </div>
          <div className="nw-stage-bar">
            {overview.tiers.map((segment, i) => (
              <a key={segment.id} className="btn nw-stage-seg" href={segment.href} data-network-tier={segment.id} style={{ background: STAGE_BAR_BG[i], color: STAGE_BAR_FG[i], clipPath: stageClip(i as 0 | 1 | 2 | 3) }}>
                <span className="nw-stage-label">{t(TIER_LABEL[segment.id])}</span>
                <strong className="nw-stage-n">{segment.count ?? dash}</strong>
              </a>
            ))}
          </div>
          {highlights === null ? null : highlights.length > 0 ? (
            <div className="nw-hl-grid">
              {highlights.map((p) => (
                <a key={p.contactId} className="btn nw-hl" href={p.href} data-network-highlight={p.tier} onClick={(event) => demoDetail.openFromHref(event, p.href)}>
                  <NetworkAvatar initial={p.name.slice(0, 1)} size={44} />
                  <span className="nw-hl-copy">
                    <strong className="nw-suggest-title">{p.name}{demo ? <DemoTag /> : null}</strong>
                    <span className="nw-ai-desc">{p.lastSignalAt ? t({ zh: `最近往来 ${formatMonthDay(p.lastSignalAt, t)}`, en: `Last in touch ${formatMonthDay(p.lastSignalAt, t)}` }) : dash}</span>
                  </span>
                  <span className="nw-hl-stage" style={{ background: TIER_CHIP[p.tier].bg, color: TIER_CHIP[p.tier].fg }}>{t(TIER_LABEL[p.tier])}</span>
                  <span className="nw-suggest-arrow">›</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="nw-empty">{t({ en: "No core or active relationships yet", zh: "还没有核心或有往来的关系" })}</div>
          )}
        </div>

        <div className="nw-recent-card" data-network-section="activity">
          <div className="nw-ov-head">
            <h2 className="nw-h2">{t({ en: "Recent activity", zh: "最近动态" })}</h2>
            <a className="nw-link" href="/app/contacts">{t({ en: "View all contacts →", zh: "查看全部人脉 →" })}</a>
          </div>
          {overview.activity.state === "unavailable" ? (
            <div className="nw-empty" role="status">{t({ en: "Source temporarily unavailable", zh: "来源暂时不可用" })}</div>
          ) : overview.activity.rows.length === 0 ? (
            <div className="nw-empty">{t({ en: "No activity yet", zh: "还没有互动记录" })}</div>
          ) : (
            <>
              <div className="nw-recent-thead">
                <span></span><span>{t({ en: "Contact", zh: "联系人" })}</span><span>{t({ en: "Source", zh: "来源" })}</span><span>{t({ en: "Summary", zh: "摘要" })}</span><span>{t({ en: "When", zh: "时间" })}</span>
              </div>
              {overview.activity.rows.map((row) => (
                <div key={row.id} className="nw-recent-row" data-timeline-source={row.source}>
                  <NetworkAvatar initial={row.name ? row.name.slice(0, 1) : "◷"} />
                  <strong className="nw-recent-name">
                    {row.name && row.href
                      ? <a className="nw-recent-link" href={row.href} onClick={(event) => demoDetail.openFromHref(event, row.href!)}>{row.name}</a>
                      : dash}
                    {row.name && demo ? <DemoTag /> : null}
                  </strong>
                  <span className="nw-recent-badge">{t(TIMELINE_SOURCE_LABEL[row.source])}</span>
                  <span className="nw-recent-org">{t(row.summary)}</span>
                  <span className="nw-recent-last">{formatTimelineTime(row, t)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </NetworkShell>
  );
}
