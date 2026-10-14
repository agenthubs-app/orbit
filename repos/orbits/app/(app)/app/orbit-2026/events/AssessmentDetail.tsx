"use client";

// R26 評価の詳細: the result in the 1440 rail (web.html #12 right), the 1024 single page / drawer (b8 #4 / #2) and the
// 390 full screen (b8 #5). Every number comes from the server (scores by rule, three dimensions from the five criteria).
import { useState } from "react";

import type { EventAssessmentCaution, EventAssessmentContract, EventAssessmentDisplayValue } from "../../../../../shared/contract/event-assessment";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventsCopy as c } from "../copy/events";
import { pickCopy } from "../copy/types";
import { Icon, RingChart } from "../ui";
import { cardLine, eventMonthDay, ringColor, verdictTone } from "./events-model";
import styles from "./events.module.css";

export type Translate = (key: keyof typeof c, values?: Record<string, string | number>) => string;

export function translator(language: OrbitLanguage): Translate {
  return (key, values) => {
    let text = pickCopy(c[key], language);
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
}

export function verdictLabel(item: Pick<EventAssessmentContract, "verdict">, t: Translate, long = false): string {
  return item.verdict === "recommend" ? t("verdictRecommend") : item.verdict === "conditional" ? (long ? t("verdictConditionalLong") : t("verdictConditional")) : t("verdictSkip");
}

export function ScoreRing({ score, size, stroke, children, label }: { score: number; size: number; stroke: number; children: React.ReactNode; label: string }) {
  return (
    <div className={styles.ringWrap} style={{ height: size, width: size }}>
      <RingChart size={size} stroke={stroke} segments={[{ color: ringColor(score), value: Math.max(0, Math.min(1, score / 100)) }]} label={label} />
      <div className={styles.ringCenter}>{children}</div>
    </div>
  );
}

function valueText(value: EventAssessmentDisplayValue): string {
  return value.min !== undefined && value.max !== undefined && value.min !== value.max ? `${value.min}–${value.max}` : String(value.value);
}

function Crit({ label, value, rose, reason }: { label: string; value: EventAssessmentDisplayValue; rose?: boolean; reason?: boolean }) {
  return (
    <>
      <div className={styles.crit}>
        <span className={styles.muted}>{label}</span>
        <div className={`${styles.bar} ${rose ? styles.barRose : ""} ${value.min !== undefined ? styles.barRange : ""}`}><i style={{ width: `${Math.max(0, Math.min(100, value.max ?? value.value))}%` }} /></div>
        <b className={`${styles.score} ${styles.critScore}`}>{valueText(value)}</b>
      </div>
      {reason && value.reason ? <div className={styles.lbl} style={{ lineHeight: "var(--lh-body-relaxed)", margin: "2px 0 10px 94px" }}>{value.reason}</div> : null}
    </>
  );
}

/** 会えそうな人 in the Web wording (web.html #12 / b8 #4: 「VC パートナー 3名（登壇）」「製造業 DX 責任者（展示 12社）」「高橋さん・加藤さんも参加予定」). */
export function meetLine(meet: NonNullable<EventAssessmentContract["meetCandidates"]>[number], t: Translate): string {
  const n = meet.count ?? 0;
  if (meet.source === "speakers") return t("meetSpeakers", { label: meet.label, n });
  if (meet.source === "exhibitors") return t("meetExhibitors", { label: meet.label, n });
  if (meet.source === "registrants") return t("meetRegistrants", { label: meet.label, n });
  if (meet.source === "known" && meet.names?.length) return t("meetKnown", { names: meet.names.slice(0, 2).map((name) => t("honorific", { name })).join(t("nameJoin")) });
  return meet.emoji === "👋" ? meet.basis : `${meet.label} ${meet.basis}`;
}

const CAUTION_EMOJI: Record<EventAssessmentCaution["kind"], { emoji: string; tone: string }> = {
  calendar: { emoji: "📅", tone: styles.t_blue! },
  fee: { emoji: "💴", tone: styles.t_apricot! },
  off_target_session: { emoji: "🧑‍💼", tone: styles.t_pink! },
  other: { emoji: "⚠️", tone: styles.t_apricot! },
  travel: { emoji: "🚃", tone: styles.t_blue! },
};
const MEET_TONES = [styles.t_lav, styles.t_blue, styles.t_teal, styles.t_apricot];

/** 1440 rail (web.html #12): hero ring, three bars, 会えそうな人, one caution line, 見送る / 参加予定に追加. */
export function AssessmentRail({ item, language, onSkip, onAdd, busy }: { item: EventAssessmentContract; language: OrbitLanguage; onSkip: () => void; onAdd: () => void; busy?: boolean }) {
  const t = translator(language);
  const display = item.display;
  const cautionLine = (item.cautions ?? []).filter((caution) => caution.kind !== "calendar").map((caution) => caution.text).join(" · ");
  return (
    <div className={styles.rail} data-events-rail="">
      <h4 className={styles.railH}><Icon name="sparkle" size={16} />{t("detailTitle")}</h4>
      <div className={`${styles.card} ${styles.heroCard}`}>
        {item.sourceLabel ? <span className={`${styles.chip} ${styles.c_lav}`}><Icon name="link" size={16} />{item.sourceLabel}</span> : null}
        <b className={styles.heroName}>{item.facts.title}</b>
        <div className={styles.lbl}>{cardLine(item, language, t("free"), { venue: false })}</div>
        <div className={styles.heroRing}>
          <ScoreRing score={item.total} size={130} stroke={12} label={`${item.total}`}>
            <div className={styles.big}>{item.scoreRange ? `${item.scoreRange.min}–${item.scoreRange.max}` : item.total}</div>
            <div className={styles.lbl}>{t("outOf100")}</div>
          </ScoreRing>
        </div>
        <span className={`${styles.chip} ${styles[`c_${verdictTone(item.verdict)}`]} ${styles.verdictBig}`}>{verdictLabel(item, t)}</span>
      </div>
      {display ? (
        <div className={styles.card}>
          <Crit label={t("dimGoal")} value={display.goalFit} />
          <Crit label={t("dimPeople")} value={display.people} />
          <Crit label={t("dimTime")} value={display.timeCost} rose />
        </div>
      ) : null}
      {item.meetCandidates?.length ? (
        <div className={styles.card}>
          <div className={styles.lbl}>{t("meetTitle")}</div>
          {item.meetCandidates.map((meet, index) => (
            <div key={`${meet.label}-${index}`} className={styles.meetRow}><span className={`${styles.emo} ${styles.emoSm} ${MEET_TONES[index % 4]}`}>{meet.emoji}</span>{meetLine(meet, t)}</div>
          ))}
        </div>
      ) : null}
      {cautionLine ? <div className={`${styles.mac} ${styles.macApricot} ${styles.caution}`}><Icon name="alert" size={16} /> {cautionLine}</div> : null}
      <div className={styles.grid2}>
        <button type="button" className={styles.btn} onClick={onSkip} disabled={busy}>{t("skip")}</button>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={onAdd} disabled={busy || item.userDecision === "added"}>{t("addToPlan")}</button>
      </div>
    </div>
  );
}

/** 1024 single page / drawer body (b8 #4 / #2) and 390 full screen (b8 #5): five cards and the CTA bar. */
export function AssessmentPage({ item, language, onSkip, onAdd, busy, phone = false }: { item: EventAssessmentContract; language: OrbitLanguage; onSkip: () => void; onAdd: () => void; busy?: boolean; phone?: boolean }) {
  const t = translator(language);
  const [why, setWhy] = useState(false);
  const display = item.display;
  const known = item.knownAttendees ?? [];
  const cautions = (item.cautions ?? []).filter((caution) => caution.kind !== "calendar" || caution.detail);
  const detailHref = item.eventId ? `/app/events/${encodeURIComponent(item.eventId)}` : item.facts.url ?? null;
  return (
    <div className={styles.wgrid} data-events-result="">
      <div className={`${styles.card} ${phone ? styles.span12 : ""}`} style={{ gridColumn: phone ? undefined : "span 5", textAlign: "center", alignItems: "center" }}>
        <b className={styles.title16}>{item.facts.title}</b>
        <div className={styles.lbl}>{cardLine(item, language, t("free"))}</div>
        <div style={{ margin: "16px auto 10px", width: 150 }}>
          <ScoreRing score={item.total} size={150} stroke={14} label={`${item.total}`}>
            <div className={styles.big} style={{ fontSize: "var(--fs-display-md)" }}>{item.scoreRange ? `${item.scoreRange.min}–${item.scoreRange.max}` : item.total}</div>
            <div className={styles.lbl}>{t("outOf100")}</div>
          </ScoreRing>
        </div>
        <div className={styles.row} style={{ gap: 6, justifyContent: "center" }}>
          <span className={`${styles.chip} ${styles[`c_${verdictTone(item.verdict)}`]} ${styles.verdictBig}`}>{verdictLabel(item, t)}</span>
          {item.basisLines?.length ? <button type="button" className={styles.chip} onClick={() => setWhy((open) => !open)} aria-expanded={why} aria-label={t("why")}>?</button> : null}
        </div>
        {why && item.basisLines?.length ? <div className={styles.basisText}>{t("basisPrefix")}{item.basisLines.join(" · ")}</div> : null}
      </div>
      {display ? (
        <div className={styles.card} style={{ gridColumn: phone ? undefined : "span 7" }}>
          <div className={styles.cardH}><h3>{t("breakdown")}</h3><span className={styles.lbl}>{t("breakdownSub")}</span></div>
          <Crit label={t("dimGoal")} value={display.goalFit} reason />
          <Crit label={t("dimPeople")} value={display.people} reason />
          <Crit label={t("dimTime")} value={display.timeCost} rose reason />
          {item.partialAttendanceHint ? <div className={`${styles.mac} ${styles.caution}`} style={{ background: "var(--mac-lav)", marginTop: 4 }}>{t("partialHint", { from: display.timeCost.value, to: item.partialAttendanceHint.timeCostAfter, window: item.partialAttendanceHint.window })}</div> : null}
        </div>
      ) : null}
      {item.meetCandidates?.length ? (
        <div className={styles.card} style={{ gridColumn: phone ? undefined : "span 6" }}>
          <div className={styles.cardH}><h3>{t("meetTitle")}</h3></div>
          {item.meetCandidates.map((meet, index) => (
            <div key={`${meet.label}-${index}`} className={styles.meetRow}><span className={`${styles.emo} ${styles.emoSm} ${MEET_TONES[index % 4]}`}>{meet.emoji}</span>{meetLine(meet, t)}</div>
          ))}
          {known.length ? (
            <div className={styles.row} style={{ borderTop: "1px solid var(--line)", gap: 10, marginTop: 14, paddingTop: 12 }}>
              <div className={styles.avs}>{known.slice(0, 4).map((person, index) => <div key={person.contactId} className={`${styles.av} ${styles[`av_${index % 4}`]}`}>{person.name.trim().charAt(0)}</div>)}</div>
              <span className={styles.lbl}>{t("knownGoing", { n: known.length })}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {cautions.length ? (
        <div className={styles.card} style={{ gridColumn: phone ? undefined : "span 6" }}>
          <div className={styles.cardH}><h3>{t("cautionsTitle")}</h3></div>
          {cautions.map((caution, index) => (
            <div key={`${caution.kind}-${index}`} className={styles.row} style={{ marginTop: 10 }}>
              <span className={`${styles.emo} ${styles.emoSm} ${CAUTION_EMOJI[caution.kind].tone}`}>{CAUTION_EMOJI[caution.kind].emoji}</span>
              <div style={{ minWidth: 0 }}><b style={{ fontSize: "var(--fs-body-sm)" }}>{caution.text}</b>{caution.detail ? <div className={styles.lbl}>{caution.detail}</div> : null}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className={`${styles.card} ${styles.flat} ${styles.row}`} style={{ flexDirection: phone ? "column" : "row", gap: 12, gridColumn: phone ? undefined : "span 12", padding: "14px 18px", alignItems: phone ? "stretch" : "center" }}>
        {item.recomputeOnAttendeeList && item.assessedAt ? <span className={styles.lbl} style={{ flex: 1 }}>{t("recompute", { date: eventMonthDay(item.assessedAt, language) })}</span> : <span className={styles.lbl} style={{ flex: 1 }}>{item.goalLabel ? t("judgedFor", { goal: item.goalLabel }) : ""}</span>}
        <button type="button" className={styles.btn} onClick={onSkip} disabled={busy}>{t("skip")}</button>
        {detailHref ? <a className={styles.btn} href={detailHref} {...(item.eventId ? {} : { rel: "noreferrer", target: "_blank" })}><Icon name="right" size={16} />{t("eventDetail")}</a> : null}
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={onAdd} disabled={busy || item.userDecision === "added"}><Icon name="plus" size={16} />{t("addToPlan")}</button>
      </div>
    </div>
  );
}
