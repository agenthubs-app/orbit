"use client";

// R26 評価の詳細 → 2026-11-15「調べた結果」: the result in the 1440 rail (event-relevance-proposal ⑦ right), the 1024
// single page / drawer and the 390 full screen. No score any more: the facts read from the page, the same
// 「あなたに関係すること」 card as the event detail, the fields that could not be read, 元のページ / 参加予定に追加.
import type { EventAssessmentContract, EventAssessmentFacts } from "../../../../../shared/contract/event-assessment";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { EVENT_PRICE_FREE } from "../../../../../shared/compute/event-score-input";
import { eventsCopy as c } from "../copy/events";
import { pickCopy } from "../copy/types";
import { Icon, RingChart } from "../ui";
import { eventWhen, ringColor, showsTime } from "./events-model";
import { RelevanceCard, relevanceRows, relevanceTitle } from "./Relevance";
import styles from "./events.module.css";

export type Translate = (key: keyof typeof c, values?: Record<string, string | number>) => string;

export function translator(language: OrbitLanguage): Translate {
  return (key, values) => {
    let text = pickCopy(c[key], language);
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
}

export function ScoreRing({ score, size, stroke, children, label }: { score: number; size: number; stroke: number; children: React.ReactNode; label: string }) {
  return (
    <div className={styles.ringWrap} style={{ height: size, width: size }}>
      <RingChart size={size} stroke={stroke} segments={[{ color: ringColor(score), value: Math.max(0, Math.min(1, score / 100)) }]} label={label} />
      <div className={styles.ringCenter}>{children}</div>
    </div>
  );
}

/** The facts read from the page, one line each (日時 / 場所 / 参加費 / 主催 / 登壇), only those present. */
export function factLines(item: EventAssessmentContract, language: OrbitLanguage, t: Translate): { key: string; label: string; value: string }[] {
  const facts = item.facts;
  const price = facts.price === EVENT_PRICE_FREE || facts.price === "Free" ? t("free") : facts.price;
  const end = facts.endsAt ? Date.parse(facts.endsAt) : NaN;
  const endClock = Number.isFinite(end) ? new Date(end + 9 * 3_600_000).toISOString().slice(11, 16) : null;
  const when = facts.startsAt ? `${eventWhen(facts.startsAt, language)}${endClock && showsTime(facts.startsAt) ? `–${endClock}` : ""}` : "";
  return [
    { key: "when", label: t("fieldWhen"), value: when },
    { key: "where", label: t("fieldWhere"), value: facts.venue ?? facts.area ?? "" },
    { key: "fee", label: t("fieldFee"), value: price ?? "" },
    { key: "organizer", label: t("fieldOrganizer"), value: facts.organizer ?? "" },
    { key: "speakers", label: t("fieldSpeakers"), value: facts.speakers?.length ? t("speakersN", { n: facts.speakers.length }) : "" },
  ].filter((line) => line.value);
}

const MISSING_LABEL: Partial<Record<keyof EventAssessmentFacts, keyof typeof c>> = {
  area: "fieldArea", endsAt: "fieldEndsAt", organizer: "fieldOrganizer", price: "fieldFee", speakers: "fieldSpeakers", startsAt: "fieldWhen", title: "fieldName", url: "fieldUrl", venue: "fieldWhere",
};

/** 「読み取れなかった項目：参加費・登壇」, or null when every field was read. */
export function missingLine(item: EventAssessmentContract, t: Translate): string | null {
  const labels = [...new Set((item.missingFields ?? []).map((field) => MISSING_LABEL[field] ?? "fieldOther"))].map((key) => t(key));
  return labels.length ? t("relMissing", { fields: labels.join(t("nameJoin")) }) : null;
}

function FactList({ item, language, t }: { item: EventAssessmentContract; language: OrbitLanguage; t: Translate }) {
  const lines = factLines(item, language, t);
  if (lines.length === 0) return null;
  return <dl className={styles.kv} data-events-facts="">{lines.map((line) => <div key={line.key} className={styles.kvRow}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>;
}

/** 元のページ when the page link is known; an Orbit event opens its own detail instead. */
function sourceLink(item: EventAssessmentContract, t: Translate): { href: string; label: string; external: boolean } | null {
  if (item.facts.url) return { external: true, href: item.facts.url, label: t("openSource") };
  if (item.eventId) return { external: false, href: `/app/events/${encodeURIComponent(item.eventId)}`, label: t("eventDetail") };
  return null;
}

/** 1440 rail (proposal ⑦): source chip, title, read facts, 「あなたに関係すること」, missing fields, 元のページ / 参加予定に追加. */
export function AssessmentRail({ item, language, onAdd, busy }: { item: EventAssessmentContract; language: OrbitLanguage; onAdd: () => void; busy?: boolean }) {
  const t = translator(language);
  const missing = missingLine(item, t);
  const link = sourceLink(item, t);
  return (
    <div className={styles.rail} data-events-rail="">
      <h4 className={styles.railH}><Icon name="sparkle" size={16} />{t("checkedResult")}</h4>
      <div className={`${styles.card} ${styles.factCard}`}>
        {item.sourceLabel ? <span className={`${styles.chip} ${styles.c_lav} ${styles.srcChip}`}><Icon name="link" size={16} />{item.sourceLabel}</span> : null}
        <b className={styles.heroName}>{item.facts.title ?? item.sourceLabel ?? item.facts.url}</b>
        <FactList item={item} language={language} t={t} />
      </div>
      {relevanceRows(item.relevance, language).length ? <div className={styles.railSub}>{relevanceTitle(language)}</div> : null}
      <RelevanceCard relevance={item.relevance} language={language} heading={false} />
      {missing ? <div className={styles.lbl} data-events-missing="">{missing}</div> : null}
      <div className={styles.railFill} />
      <div className={link ? styles.grid2 : styles.railOne}>
        {link ? <a className={`btn ${styles.btn}`} href={link.href} {...(link.external ? { rel: "noreferrer", target: "_blank" } : {})}>{link.label}</a> : null}
        <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onAdd} disabled={busy || item.userDecision === "added"}>{t("addToPlan")}</button>
      </div>
    </div>
  );
}

/** 1024 single page / drawer body and 390 full screen: the read facts, the relevance card, missing fields and the CTA bar. */
export function AssessmentPage({ item, language, onAdd, busy, phone = false }: { item: EventAssessmentContract; language: OrbitLanguage; onAdd: () => void; busy?: boolean; phone?: boolean }) {
  const t = translator(language);
  const missing = missingLine(item, t);
  const link = sourceLink(item, t);
  const span = (n: number) => (phone ? undefined : `span ${n}`);
  return (
    <div className={styles.wgrid} data-events-result="">
      <div className={`${styles.card} ${styles.factCard} ${phone ? styles.span12 : ""}`} style={{ gridColumn: span(5) }}>
        {item.sourceLabel ? <span className={`${styles.chip} ${styles.c_lav} ${styles.srcChip}`}><Icon name="link" size={16} />{item.sourceLabel}</span> : null}
        <b className={styles.title16}>{item.facts.title ?? item.sourceLabel ?? item.facts.url}</b>
        <FactList item={item} language={language} t={t} />
      </div>
      <RelevanceCard relevance={item.relevance} language={language} className={phone ? styles.span12 : styles.span7} />
      {missing ? <div className={`${styles.lbl} ${styles.span12}`} data-events-missing="">{missing}</div> : null}
      <div className={`${styles.card} ${styles.flat} ${styles.row} ${styles.span12}`} style={{ flexDirection: phone ? "column" : "row", gap: 12, padding: "14px 18px", alignItems: phone ? "stretch" : "center", justifyContent: "flex-end" }}>
        {link ? <a className={`btn ${styles.btn}`} href={link.href} {...(link.external ? { rel: "noreferrer", target: "_blank" } : {})}><Icon name="right" size={16} />{link.label}</a> : null}
        <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onAdd} disabled={busy || item.userDecision === "added"}><Icon name="plus" size={16} />{t("addToPlan")}</button>
      </div>
    </div>
  );
}
