/**
 * W0049：「AI 人脉分析」的「结构」标签（从 network-analysis.tsx 抽出；机会标签仍在原文件）。
 *
 * 从上到下：① 结构诊断（快照 `diagnosis` 块，带依据）② 四维分布（行业两级／地区／角色层级／关系强度，
 * 环形图 + Top5，与计划人脉需求相关的行业分组高亮，每个图例项与 Top5 都可进名单）③ 关系健康四档与较 30 天前的变化
 * ④ 2–3 条结构洞察（快照 `insight` 块，每条可展开依据联系人；没有可见依据的块不显示）。
 *
 * 数字只来自 ContactsAnalysisView.structure（全量规则计算），不来自名单（名单最多 30 条）；
 * 文字只来自快照块（已是界面语言）与本文件模板；依据只列本人范围内解析到的联系人。
 * 快照不存在 → ①④不渲染；快照读取失败 → ①④显示「来源暂时不可用」；②③照常。
 */
"use client";

import { useId, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import {
  healthTiles,
  STRUCTURE_TAB_DIMENSION_COPY,
  STRUCTURE_TAB_DIMENSIONS,
  structureDimensionView,
  tierChangeLabel,
  type EvidencePerson,
  type StructureBlockView,
  type StructureRow,
  type StructureTabDimension,
  type StructureTabExtras,
} from "../analysis/structure-tab-model";
import { DONUT_COLORS } from "./network-model";
import { formatMonthDay } from "./network-overview";
import { TIER_HEALTH_META } from "./network-overview-model";

const RANK_COLORS = [["#4B4FC7", "#FFFFFF"], ["#6B8FB5", "#FFFFFF"], ["#9C7A3E", "#FFFFFF"], ["#8A8FB0", "#FFFFFF"], ["#C9CBEA", "#2E3270"]] as const;

// W0052：档位图标、文案与配色和概览共用 TIER_HEALTH_META（原本两处重复）。
const HEALTH_META = TIER_HEALTH_META;

const NO_EXTRAS: StructureTabExtras = { highlights: null, snapshot: { state: "none" }, tierHistory: null };

function conic(rows: readonly StructureRow[], total: number): string {
  if (total <= 0) return "#F0F1F8";
  let acc = 0;
  const stops = rows.map((row, index) => {
    const start = (acc / total) * 360;
    acc += row.count;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}deg ${(acc / total) * 360}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/** 依据图标：点开列出联系人姓名链接（只渲染解析到的本人联系人；一个都没有时不渲染）。W0050 机会标签复用。 */
export function EvidenceToggle({ people }: { people: readonly EvidencePerson[] }) {
  const { t, preserveHref } = useOrbitLanguage();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (people.length === 0) return null;
  return (
    <span className="nw-evidence" data-network-evidence="">
      <button type="button" className="btn nw-evidence-btn" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        ⓘ {t({ zh: `依据 ${people.length} 位`, en: `Evidence: ${people.length} ${people.length === 1 ? "contact" : "contacts"}` })}
      </button>
      {open ? (
        <span id={listId} className="nw-evidence-list" role="list">
          {people.map((person) => (
            <a key={person.id} role="listitem" className="nw-evidence-link" href={preserveHref(person.href)}>{person.name}</a>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function InsightCard({ block }: { block: StructureBlockView }) {
  return (
    <div className="nw-insight-item" data-network-insight={block.key}>
      <span className="nw-insight-icon">✦</span>
      <span className="nw-insight-text">
        <p className="nw-insight-p">{block.text}</p>
        <EvidenceToggle people={block.evidence} />
      </span>
    </div>
  );
}

export function NetworkAnalysisStructure({ view, extras = NO_EXTRAS, onOpenOpportunities }: {
  view: ContactsAnalysisView;
  extras?: StructureTabExtras;
  onOpenOpportunities: () => void;
}) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const [dim, setDim] = useState<StructureTabDimension>("industry");
  const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null);
  const ready = view.state === "ready";
  const sectionState = ready ? view.structure.state : view.state;
  const structure = ready && "data" in view.structure ? view.structure : null;
  const dimension = structure ? structureDimensionView(structure, dim, extras.highlights) : null;
  const rows = dimension?.rows ?? [];
  const total = dimension?.total ?? 0;
  const dimTitle = t(STRUCTURE_TAB_DIMENSION_COPY[dim]);
  const emptyCopy = sectionState === "pending" ? t({ en: "Analysis in progress", zh: "分析生成中" }) : t({ en: "Source temporarily unavailable", zh: "来源暂时不可用" });
  const unavailable = t({ en: "Source temporarily unavailable", zh: "来源暂时不可用" });
  const emptyBlock = <div className="nw-empty">{emptyCopy}</div>;
  const noData = <div className="nw-empty">{t({ en: "No data in this dimension", zh: "当前维度暂无数据" })}</div>;
  const snapshot = extras.snapshot;
  const anyHighlight = rows.some((row) => row.highlighted || row.children?.some((child) => child.highlighted));
  const primary = dim === "industry" ? rows.find((row) => row.id === selectedPrimary) ?? rows.find((row) => row.children && row.children.length > 0) ?? null : null;
  const tiles = structure ? healthTiles(structure.data.health, extras.tierHistory) : [];
  const core = structure?.data.health.find((item) => item.id === "core");
  const pct = (value: number) => `${value}%`;
  const mark = <span className="nw-plan-mark" aria-label={t({ zh: "与计划人脉需求相关", en: "Related to your plan's network needs" })}>◆</span>;

  return (
    <div className="nw-an-sec">
      {snapshot.state === "ready" && snapshot.diagnosis ? (
        <div className="nw-an-hero" data-network-section="diagnosis">
          <div className="nw-an-hero-copy">
            <span className="nw-an-hero-star">✦</span>
            <div className="nw-an-hero-text">
              <span className="nw-an-eyebrow">{t({ en: "Structure diagnosis", zh: "结构诊断" })}</span>
              <h2 className="nw-h2-26">{snapshot.diagnosis.text}</h2>
              <span className="nw-an-hero-meta">
                <span className="nw-ai-desc">
                  {t({ zh: `基于 ${snapshot.contactCount} 位联系人`, en: `Based on ${snapshot.contactCount} ${snapshot.contactCount === 1 ? "contact" : "contacts"}` })}
                  {snapshot.generatedAt ? ` · ${t({ zh: "生成于", en: "Generated" })} ${formatMonthDay(snapshot.generatedAt, t)}` : ""}
                  {snapshot.outdated ? ` · ${t({ zh: "人脉有新变化，稍后自动更新", en: "Your network changed; this will update shortly" })}` : ""}
                </span>
                <EvidenceToggle people={snapshot.diagnosis.evidence} />
              </span>
            </div>
          </div>
          <button type="button" className="btn nw-an-outline" onClick={onOpenOpportunities}>{t({ en: "View related opportunities →", zh: "查看相关机会 →" })}</button>
        </div>
      ) : snapshot.state === "unavailable" ? (
        <div className="nw-empty" data-network-section="diagnosis">{unavailable}</div>
      ) : null}

      <div className="nw-pipe-grid">
        <div className="nw-ov-card" data-network-section="structure">
          <div className="nw-card-head">
            <h2 className="nw-h2">{t({ en: `${dimTitle} distribution`, zh: `${dimTitle}分布` })}</h2>
            <span className="nw-ai-desc">{t({ en: `${rows.length} ${rows.length === 1 ? "group" : "groups"}, ${total} ${total === 1 ? "contact" : "contacts"}`, zh: `共 ${rows.length} 个分组，${total} 位联系人` })}</span>
          </div>
          {dimension && rows.length > 0 ? (
            <div className="nw-dim-wrap">
              <div className="nw-dim-donut" style={{ background: conic(rows, total) }}>
                <div className="nw-dim-donut-inner">
                  <strong className="nw-dim-donut-n">{total}</strong>
                  <span className="nw-ai-desc">{t({ en: "contacts", zh: "联系人" })}</span>
                </div>
              </div>
              <div className="nw-dim-legend">
                {rows.map((row, index) => {
                  const selectable = dim === "industry" && Boolean(row.children?.length);
                  const content = (
                    <>
                      <span className="nw-dim-dot" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}></span>
                      <span className="nw-dim-row-copy"><strong className="nw-dim-row-label">{row.label}{row.highlighted ? mark : null}</strong><span className="nw-ai-desc">{t({ en: `${row.count} · ${pct(row.percentage)}`, zh: `${row.count} 人 · ${pct(row.percentage)}` })}</span></span>
                    </>
                  );
                  // 每个图例项都能进名单（不止 Top 5）；行业一级另有「看二级分布」按钮，两个控件并列、不嵌套。
                  return (
                    <div key={row.id} className="nw-dim-row nw-dim-legend-row" data-network-bucket={row.id} data-network-highlight={row.highlighted ? "" : undefined}>
                      {selectable ? (
                        <button type="button" className={`btn nw-dim-row-btn${primary?.id === row.id ? " nw-dim-row-on" : ""}`} aria-pressed={primary?.id === row.id} aria-label={t({ zh: `查看「${row.label}」的二级分布`, en: `Show ${row.label} sub-industries` })} onClick={() => setSelectedPrimary(row.id)}>{content}</button>
                      ) : (
                        <span className="nw-dim-row-main">{content}</span>
                      )}
                      <a className="nw-dim-row-link" href={preserveHref(row.href)} data-network-list={row.id} aria-label={t({ zh: `「${row.label}」名单`, en: `${row.label} contacts` })}>{t({ zh: "名单 →", en: "List →" })}</a>
                    </div>
                  );
                })}
                {primary?.children?.length ? (
                  <div className="nw-sub-top" data-network-secondary={primary.id}>
                    <strong className="nw-sub-top-t">{t({ zh: `${primary.label} · 细分 Top 5`, en: `${primary.label} · Top 5 sub-industries` })}</strong>
                    {primary.children.slice(0, 5).map((child) => (
                      <a key={child.id} className="nw-sub-top-row" href={preserveHref(child.href)} data-network-bucket={child.id} data-network-highlight={child.highlighted ? "" : undefined}>
                        <span>{child.label}{child.highlighted ? mark : null}</span>
                        <span className="nw-ai-desc">{t({ en: `${child.count} · ${pct(child.percentage)}`, zh: `${child.count} 人 · ${pct(child.percentage)}` })}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
                {anyHighlight ? <span className="nw-plan-legend">{mark} {t({ zh: "与计划人脉需求相关", en: "Related to your plan's network needs" })}</span> : null}
              </div>
            </div>
          ) : structure ? noData : emptyBlock}
        </div>

        <div className="nw-cockpit" data-network-section="top">
          <div className="nw-dims">
            {STRUCTURE_TAB_DIMENSIONS.map((key) => (
              <button key={key} type="button" className={`btn nw-dim-btn${dim === key ? " nw-dim-btn-on" : ""}`} aria-pressed={dim === key} onClick={() => setDim(key)}>{t(STRUCTURE_TAB_DIMENSION_COPY[key])}</button>
            ))}
          </div>
          <div className="nw-top-head">
            <h3 className="nw-h3">{dimTitle} Top 5</h3>
            <span className="nw-ai-desc">{t({ en: "Sorted by contact count; open a group to see its contacts", zh: "按联系人数量排序，点分组查看名单" })}</span>
          </div>
          <div className="nw-top-thead"><span>#</span><span>{dimTitle}</span><span className="nw-right">{t({ en: "Contacts", zh: "联系人" })}</span><span className="nw-right">{t({ en: "Share", zh: "占比" })}</span></div>
          {rows.slice(0, 5).map((row, index) => (
            <a key={row.id} className="nw-top-row" href={preserveHref(row.href)} data-network-bucket={row.id} data-network-highlight={row.highlighted ? "" : undefined}>
              <span className="nw-top-rank" style={{ background: RANK_COLORS[index]![0], color: RANK_COLORS[index]![1] }}>{index + 1}</span>
              <span>{row.label}{row.highlighted ? mark : null}</span><strong className="nw-top-n">{row.count}</strong><span className="nw-top-pct">{pct(row.percentage)}</span>
            </a>
          ))}
          {structure && rows.length === 0 ? noData : null}
          {!structure ? emptyBlock : null}
        </div>
      </div>

      <div className="nw-cockpit" data-network-section="health">
        <div className="nw-ov-head">
          <h2 className="nw-h2">{t({ en: "Relationship health", zh: "关系健康" })}</h2>
          <a className="btn nw-textlink" href={preserveHref("/app/contacts/pipeline")}>{t({ en: "View pipeline →", zh: "查看关系管线 →" })}</a>
        </div>
        {structure && tiles.some((tile) => tile.count > 0) ? (
          <div className="nw-health-grid">
            {tiles.map((tile) => {
              const meta = HEALTH_META[tile.id];
              return (
                <a key={tile.id} className="nw-health-item" href={preserveHref(`/app/contacts/analysis/tier/${tile.id}`)} data-network-tier={tile.id}>
                  <span className="nw-health-icon" style={{ background: meta.bg, color: meta.fg }}>{meta.icon}</span>
                  <span className="nw-health-copy">
                    <span className="nw-ai-desc">{t(meta.label)}</span>
                    <span className="nw-health-row"><strong className="nw-health-n">{tile.count}</strong><span className="nw-health-tag" style={{ background: meta.bg, color: meta.fg }} data-network-tier-change={tile.change.kind}>{t({ zh: "较 30 天前", en: "vs 30 days ago" })} {tierChangeLabel(tile.change, language)}</span></span>
                    <span className="nw-health-desc">{t(meta.desc)}</span>
                  </span>
                </a>
              );
            })}
          </div>
        ) : structure ? <div className="nw-empty">{t({ en: "No relationship health data yet", zh: "暂无关系健康数据" })}</div> : emptyBlock}
        <div className="nw-health-foot">
          <strong className="nw-suggest-title">{t({ en: "More metrics", zh: "更多关键指标" })}</strong>
          <span className="nw-health-kv">{t({ en: "Core share", zh: "核心关系占比" })} <strong className="nw-health-kv-v">{core ? pct(core.percentage) : "—"}</strong></span>
          <span className="nw-health-kv">{t({ en: "New contacts", zh: "最近新增联系人" })} <strong className="nw-health-kv-v">{ready ? t({ en: String(view.metrics.newContacts), zh: `${view.metrics.newContacts} 位` }) : "—"}</strong></span>
          <a className="btn nw-textlink nw-textlink-end" href={preserveHref("/app/contacts")}>{t({ en: "View all data →", zh: "查看完整数据 →" })}</a>
        </div>
      </div>
      {snapshot.state === "ready" && snapshot.insights.length > 0 ? (
        <div className="nw-cockpit" data-network-section="insights">
          <div className="nw-ov-head">
            <h2 className="nw-h2">{t({ en: "Structure insights", zh: "结构洞察" })}</h2>
            <button type="button" className="btn nw-textlink" onClick={onOpenOpportunities}>{t({ en: "View suggestions →", zh: "查看具体建议 →" })}</button>
          </div>
          <div className="nw-insight-list">
            {snapshot.insights.map((block) => <InsightCard key={block.key} block={block} />)}
          </div>
        </div>
      ) : snapshot.state === "unavailable" ? (
        <div className="nw-cockpit" data-network-section="insights">
          <h2 className="nw-h2">{t({ en: "Structure insights", zh: "结构洞察" })}</h2>
          <div className="nw-empty">{unavailable}</div>
        </div>
      ) : null}

    </div>
  );
}
