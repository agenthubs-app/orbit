"use client";

// R11b 人脈分析（Web）: the locked page (b5 #38), 構造 (#39 / #40), 機会 (#41), インサイト (b5 #36's cards on the Web grid)
// and iOrbit の見立て (the snapshot; 设计稿无, its own states). Every number is a field of NetworkAnalysisViewDTO; every AI
// sentence is a snapshot block with its evidence; a card without data is left out (§2 B-5).
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import type { NetworkAnalysisDistribution, NetworkAnalysisGap, NetworkAnalysisInsight, NetworkAnalysisOpportunity, NetworkAnalysisViewDTO } from "../../../../../shared/contract/network-analysis-view";
import type { NetworkSnapshotView, NetworkSnapshotViewBlock } from "../../../../../features/network-analysis/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Avatar, Button, Icon, useStandardCopy } from "../ui";
import { bucketLabel, industryName, monthLabel, tokyoMonthDay, useAnalysisT, type AnalysisT } from "./analysis-labels";
import type { DrillSelection } from "./DrillList";
import styles from "./network-analysis.module.css";

/** A snapshot evidence person: keyed by the snapshot's record id; `contactId` opens the contact. */
export interface EvidencePerson { contactId: string; name: string }

const RING_COLORS = ["var(--plum-900)", "var(--plum-700)", "var(--plum-500)", "var(--plum-300)"] as const;

/** kit .ring: r = (size − stroke) / 2, each slice 3 px shorter than its share (the gap), starting at 12 o'clock. */
export function AnalysisRing({ size, stroke, slices, children, label }: { size: number; stroke: number; slices: { value: number; color: string }[]; children: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={styles.ring} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} />
        {slices.map((slice, index) => {
          const share = slice.value * circumference;
          const node = <circle key={index} cx={size / 2} cy={size / 2} r={r} stroke={slice.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, share - 3)} ${circumference}`} strokeDashoffset={-offset} />;
          offset += share;
          return node;
        })}
      </svg>
      <div className={styles.ringCenter}>{children}</div>
    </div>
  );
}

function useWhy() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return { open, id, toggle: () => setOpen((value) => !value) };
}

function WhyToggle({ why, label, push = false }: { why: ReturnType<typeof useWhy>; label: string; push?: boolean }) {
  return <button type="button" className={`btn ${styles.why} ${push ? styles.pushRight : ""}`} aria-expanded={why.open} aria-controls={why.id} aria-label={label} title={label} onClick={why.toggle}>?</button>;
}

/* ---------- 锁定 (b5 #38) ---------- */

/** 「分析の例」: a fixed SAMPLE preview (G09), the board's own example rows. */
const SAMPLE_ROWS = [["sampleIndustry1", 105], ["sampleIndustry2", 83], ["sampleIndustry3", 63], ["sampleIndustry4", 35]] as const;

export function LockedView({ total, required, missing }: { total: number; required: number; missing: number }) {
  const t = useAnalysisT();
  const copy = useStandardCopy();
  return (
    <div className={styles.wgrid} data-analysis-locked>
      <div className={`${styles.guide} ${styles.span12}`}>
        <div className={styles.row} style={{ gap: 28 }}>
          <AnalysisRing size={140} stroke={13} slices={[{ value: Math.min(1, total / required), color: "var(--plum-700)" }]} label={`${total}/${required}`}>
            <div className={styles.bigNum} style={{ fontSize: 34 }}>{total}<small>/{required}</small></div>
          </AnalysisRing>
          <div className={styles.grow}>
            <div className={styles.lockTitle}>{t("lockTitle", { n: missing })}</div>
            <div className={styles.lockSub}>{t("lockBodyWeb")}</div>
            <div className={styles.row} style={{ gap: 10, marginTop: 16 }}>
              <Link href="/app/contacts/new/scan" className={`btn ${styles.btn} ${styles.btnPrimary}`}><Icon name="scan" size={16} />{t("lockAddCards")}</Link>
              <Link href="/app/contacts/new/import?kind=csv" className={`btn ${styles.btn}`}><Icon name="upload" size={16} />{t("lockImportCsv")}</Link>
            </div>
          </div>
        </div>
      </div>
      {([["🧱", "emoLav", "tabStructure", "previewStructureBody"], ["🔭", "emoTeal", "tabOpportunities", "previewOpportunitiesBody"], ["💡", "emoApricot", "tabInsight", "previewInsightBody"]] as const).map(([emoji, tone, title, body]) => (
        <div key={title} className={`${styles.previewCard} ${styles.span4}`}>
          <span className={`${styles.emo} ${styles[tone]}`} aria-hidden>{emoji}</span>
          <div><b>{t(title)}</b><div className={styles.lbl}>{t(body)}</div></div>
        </div>
      ))}
      <div className={`${styles.card} ${styles.span12}`}>
        <div className={styles.cardH}><h3>{t("sampleTitle")} <span className={styles.sampleTag}>{copy.sample.tag}</span></h3></div>
        <div className={`${styles.faded} ${styles.grid2}`} aria-hidden>
          {SAMPLE_ROWS.map(([id, count]) => (
            <div key={id} className={`${styles.dim} ${styles.dimStatic}`}><span>{t(id)}</span><div className={styles.bar}><i style={{ width: `${(count / 105) * 100}%` }} /></div><b className={styles.score}>{count}</b><span /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 構造 (b5 #39 / #40) ---------- */

function DimensionCard({ title, distribution, onOpen, selected }: { title: string; distribution: NetworkAnalysisDistribution; onOpen: (selection: DrillSelection) => void; selected: DrillSelection | null }) {
  const t = useAnalysisT();
  const { language } = useOrbitLanguage();
  const max = Math.max(1, ...distribution.buckets.map((bucket) => bucket.count));
  return (
    <div className={`${styles.card} ${styles.span4}`} data-analysis-dimension={distribution.dimension}>
      <div className={styles.cardH}><h3>{title}</h3><span className={styles.more} aria-hidden><Icon name="right" size={16} /></span></div>
      {distribution.buckets.map((bucket, index) => {
        const label = bucketLabel(distribution.dimension, bucket.id, t, language);
        const pressed = selected?.dimension === distribution.dimension && selected.bucketId === bucket.id;
        return (
          <button key={bucket.id} type="button" className={`btn ${styles.dim}`} aria-pressed={pressed} aria-label={t("openDimension", { label })} onClick={() => onOpen({ dimension: distribution.dimension, bucketId: bucket.id })}>
            <span>{label}</span>
            <div className={`${styles.bar} ${index === 0 ? "" : styles.barRose}`}><i style={{ width: `${(bucket.count / max) * 100}%` }} /></div>
            <b className={styles.score}>{bucket.count}</b>
            <Icon name="right" size={16} />
          </button>
        );
      })}
    </div>
  );
}

function GapCard({ gap, total, block, names, onOpenPerson }: { gap: NetworkAnalysisGap; total: number; block: NetworkSnapshotViewBlock | null; names: Record<string, EvidencePerson>; onOpenPerson: (id: string) => void }) {
  const t = useAnalysisT();
  const why = useWhy();
  const route = block?.evidence.contactIds.map((id) => names[id]).find(Boolean);
  return (
    <div className={`${styles.gap} ${styles.span7}`} data-analysis-gap={gap.needId}>
      <div className={styles.row} style={{ gap: 8 }}>
        <span className={styles.gapEmoji} aria-hidden>🧩</span>
        <b className={styles.gapTitle}>{t("gapTitle", { title: gap.title })}</b>
        <WhyToggle why={why} label={t("gapWhy", { total })} />
      </div>
      <div className={styles.gapBody}>{t("gapBody", { target: gap.targetCount, linked: gap.linkedCount })}{block ? block.text : gap.linkedCount === 0 ? t("gapHint") : null}</div>
      {why.open ? <div id={why.id} className={styles.whyBody}>{t("gapWhy", { total })}</div> : null}
      {route ? <Button size="sm" className={styles.btnOnSurface} label={t("gapRoute")} onClick={() => onOpenPerson(route.contactId)} /> : null}
    </div>
  );
}

export function StructureView({ view, snapshot, names, selected, onOpen, onOpenPerson }: {
  view: NetworkAnalysisViewDTO; snapshot: NetworkSnapshotView | null; names: Record<string, EvidencePerson>; selected: DrillSelection | null;
  onOpen: (selection: DrillSelection) => void; onOpenPerson: (id: string) => void;
}) {
  const t = useAnalysisT();
  const { language } = useOrbitLanguage();
  const structure = view.structure!;
  const industries = structure.industries;
  const gap = structure.gaps?.[0] ?? null;
  const gapBlock = gap ? snapshot?.blocks.find((block) => block.kind === "gap" && block.needId === gap.needId) ?? null : null;
  return (
    <div className={styles.wgrid} data-analysis-tab="structure">
      <div className={`${styles.card} ${styles.span5}`} data-analysis-dimension="industry">
        <div className={styles.cardH}><h3>{t("industry")}</h3><span className={styles.lbl}>{t("tapForList")}</span></div>
        <div className={styles.ringRow}>
          <AnalysisRing size={140} stroke={13} label={t("industry")} slices={industries.buckets.map((bucket, index) => ({ value: industries.total ? bucket.count / industries.total : 0, color: RING_COLORS[Math.min(index, 3)]! }))}>
            <div className={styles.bigNum} style={{ fontSize: 30 }}>{industries.total}</div>
            <div className={styles.lbl}>{t("peopleUnit")}</div>
          </AnalysisRing>
          <div className={styles.legend}>
            {industries.buckets.map((bucket, index) => {
              const label = bucketLabel("industry", bucket.id, t, language);
              return (
                <button key={bucket.id} type="button" className={`btn ${styles.leg}`} aria-pressed={selected?.dimension === "industry" && selected.bucketId === bucket.id} aria-label={t("openDimension", { label })} onClick={() => onOpen({ dimension: "industry", bucketId: bucket.id })}>
                  <i style={{ background: RING_COLORS[Math.min(index, 3)] }} /><span>{label}</span><b className={styles.score}>{bucket.count}</b><Icon name="right" size={16} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {gap ? <GapCard gap={gap} total={industries.total} block={gapBlock} names={names} onOpenPerson={onOpenPerson} /> : structure.gaps === null ? (
        <div className={`${styles.gap} ${styles.span7}`} data-analysis-gap="unavailable"><div className={styles.gapBody}>{t("gapUnavailable")}</div></div>
      ) : null}
      <DimensionCard title={t("seniority")} distribution={structure.seniority} onOpen={onOpen} selected={selected} />
      <DimensionCard title={t("region")} distribution={structure.regions} onOpen={onOpen} selected={selected} />
      <DimensionCard title={t("met")} distribution={structure.mets} onOpen={onOpen} selected={selected} />
    </div>
  );
}

/* ---------- 機会 (b5 #41) ---------- */

const OPPORTUNITY_LOOK = {
  reconnect: { emoji: "🔁", tone: "emoPink", title: "oppReconnect", why: "oppReconnectWhy" },
  stalled: { emoji: "⏳", tone: "emoApricot", title: "oppStalled", why: "oppStalledWhy" },
} as const;

function OpportunityCard({ card, onOpen }: { card: NetworkAnalysisOpportunity; onOpen: (selection: DrillSelection) => void }) {
  const t = useAnalysisT();
  const why = useWhy();
  const look = OPPORTUNITY_LOOK[card.kind];
  const body = card.kind === "reconnect" ? t("oppReconnectBody") : t("oppStalledBody", { days: card.averageDays ?? 0 });
  return (
    <div className={`${styles.card} ${styles.span6}`} data-analysis-opportunity={card.kind}>
      <div className={styles.row} style={{ gap: 12 }}>
        <span className={`${styles.emo} ${styles[look.tone]}`} aria-hidden>{look.emoji}</span>
        <div className={styles.grow}><b className={styles.oppTitle}>{t(look.title)}</b><div className={styles.lbl}>{body}</div></div>
        <div className={styles.mid}>{card.count}<small className={styles.lbl}>{t("peopleUnit")}</small></div>
      </div>
      <div className={styles.oppFoot}>
        <div className={styles.avs}>{card.preview.map((person) => <Avatar key={person.id} name={person.name} size="sm" />)}</div>
        {card.preview[0] ? <span className={styles.lbl}>{card.count > 1 ? t("others", { name: card.preview[0].name }) : card.preview[0].name}</span> : null}
        <WhyToggle push why={why} label={t(look.why)} />
        <Button size="sm" label={t("openList")} onClick={() => onOpen({ dimension: "opportunity", bucketId: card.kind })} />
      </div>
      {why.open ? <div id={why.id} className={styles.whyBody}>{t(look.why)}</div> : null}
    </div>
  );
}

export function OpportunitiesView({ view, onOpen }: { view: NetworkAnalysisViewDTO; onOpen: (selection: DrillSelection) => void }) {
  const t = useAnalysisT();
  const cards = view.opportunities ?? [];
  return (
    <div className={styles.wgrid} data-analysis-tab="opportunities">
      {cards.length ? cards.map((card) => <OpportunityCard key={card.kind} card={card} onOpen={onOpen} />) : <div className={`${styles.card} ${styles.span12}`}><p className={styles.lbl}>{t("oppEmpty")}</p></div>}
    </div>
  );
}

/* ---------- インサイト (b5 #36 cards on the Web grid) ---------- */

function InsightCard({ insight }: { insight: NetworkAnalysisInsight }) {
  const t = useAnalysisT();
  const { language } = useOrbitLanguage();
  const why = useWhy();
  const industry = insight.industryId ? industryName(insight.industryId, language) : "";
  if (insight.kind === "met_path") {
    const top = Math.max(1, insight.eventRate ?? 0, insight.referralRate ?? 0);
    return (
      <div className={`${styles.card} ${styles.span4}`} data-analysis-insight="met_path">
        <div className={styles.row}><span className={styles.chip}>{t("insightMetChip")}</span><WhyToggle push why={why} label={t("insightMetWhy", { industry, n: insight.sample ?? 0 })} /></div>
        <b className={styles.headline}>{t("insightMetHeadline", { industry, share: insight.eventShare ?? 0, referral: insight.referralRate ?? 0, event: insight.eventRate ?? 0 })}</b>
        <div className={styles.cmp}><span>{t("metEvent")}</span><div className={`${styles.bar} ${styles.barRose}`}><i style={{ width: `${((insight.eventRate ?? 0) / top) * 100}%` }} /></div><b className={styles.score}>{insight.eventRate}%</b></div>
        <div className={styles.cmp}><span>{t("metReferral")}</span><div className={styles.bar}><i style={{ width: `${((insight.referralRate ?? 0) / top) * 100}%` }} /></div><b className={styles.score}>{insight.referralRate}%</b></div>
        <div className={styles.lbl} style={{ marginTop: 4 }}>{t("insightMetCaption", { industry, n: insight.sample ?? 0 })}</div>
        {why.open ? <div id={why.id} className={styles.whyBody}>{t("insightMetWhy", { industry, n: insight.sample ?? 0 })}</div> : null}
      </div>
    );
  }
  const months = insight.months ?? [];
  const max = Math.max(1, ...months.map((month) => month.added));
  const headline = t("insightGrowthHeadline", { industry, n: insight.added ?? 0 });
  return (
    <div className={`${styles.card} ${styles.span4}`} data-analysis-insight="growth">
      <div className={styles.row}><span className={styles.chip}>{t("insightGrowthChip")}</span><WhyToggle push why={why} label={t("insightGrowthWhy", { industry })} /></div>
      <b className={styles.headline}>{insight.planNeedTitle ? t("insightGrowthPlan", { headline, title: insight.planNeedTitle }) : headline}</b>
      <div className={styles.minibars} aria-hidden>{months.map((month, index) => <i key={month.month} className={index === months.length - 1 ? styles.hi : ""} style={{ height: `${Math.max(4, (month.added / max) * 96)}%` }} />)}</div>
      {months.length ? <div className={`${styles.between} ${styles.lbl}`}><span>{monthLabel(months[0]!.month, t, language)}</span><span>{monthLabel(months.at(-1)!.month, t, language)}</span></div> : null}
      {why.open ? <div id={why.id} className={styles.whyBody}>{t("insightGrowthWhy", { industry })}</div> : null}
    </div>
  );
}

/** iOrbit の見立て: the snapshot's diagnosis / insight / plan sentences with their evidence (设计稿无; not in the pixel gate). */
export function SnapshotCard({ snapshot, failed, names, onOpenPerson, onRecompute, recomputing }: {
  snapshot: NetworkSnapshotView | null; failed: boolean; names: Record<string, EvidencePerson>; onOpenPerson: (id: string) => void; onRecompute: () => void; recomputing: boolean;
}) {
  const t = useAnalysisT();
  const blocks = (snapshot?.blocks ?? []).filter((block) => block.kind !== "gap");
  const status = failed ? t("aiUnavailable")
    : snapshot?.freshness.recovering || snapshot?.freshness.job === "queued" || snapshot?.freshness.job === "running" ? t("aiUpdating")
    : snapshot?.freshness.job === "deferred" ? t("aiDeferred")
    : snapshot?.state === "ready" && snapshot.generatedAt ? t("aiAsOf", { date: tokyoMonthDay(snapshot.generatedAt) })
    : t("aiNone");
  return (
    <div className={`${styles.card} ${styles.span12}`} data-analysis-snapshot={failed ? "failed" : snapshot?.state ?? "none"}>
      <div className={styles.cardH}><h3>{t("aiTitle")}</h3><span className={styles.lbl}>{status}</span></div>
      {blocks.map((block) => (
        <div key={block.key} className={styles.aiBlock}>
          <div className={styles.aiText}>{block.text}</div>
          <div className={styles.evidence}>
            <span className={styles.lbl}>{t("aiEvidence", { names: "" })}</span>
            {block.evidence.contactIds.flatMap((id) => (names[id] ? [names[id]!] : [])).map((person) => <button key={person.contactId} type="button" onClick={() => onOpenPerson(person.contactId)}>{person.name}</button>)}
          </div>
        </div>
      ))}
      {snapshot?.freshness.stale && blocks.length ? <p className={styles.lbl} style={{ marginTop: 8 }}>{t("aiStale")}</p> : null}
      {!failed && snapshot && snapshot.state !== "unavailable" ? <Button size="sm" className={styles.btnStart} label={t("recompute")} loading={recomputing} onClick={onRecompute} /> : null}
    </div>
  );
}

export function InsightsView({ view, snapshotSlot }: { view: NetworkAnalysisViewDTO; snapshotSlot: ReactNode }) {
  const t = useAnalysisT();
  const insights = view.insights ?? [];
  return (
    <div className={styles.wgrid} data-analysis-tab="insight">
      {insights.length ? insights.map((insight) => <InsightCard key={insight.kind} insight={insight} />)
        : <div className={`${styles.card} ${styles.span12}`}><p className={styles.lbl}>{view.lock.state === "open" && view.lock.reference ? t("insightsThin") : t("insightsNone")}</p></div>}
      {snapshotSlot}
    </div>
  );
}

export type { AnalysisT };
