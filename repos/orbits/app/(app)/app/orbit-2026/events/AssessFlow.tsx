"use client";

// R26 判定中 / 読み取れない時 (app.html #30, b12 #322 W-R26-32; b2 #4 login, b2 #1 not an event page, b2 #5 poster fill-in) and the
// 3-item / pasted-text inputs. Writes go through the contract-8 routes; the score is computed by rule after the facts arrive.
import { useState } from "react";

import { EVENT_AREA_ONLINE, EVENT_PRICE_FREE } from "../../../../../shared/compute/event-score-input";
import type { EventAssessmentContract, EventAssessmentFacts } from "../../../../../shared/contract/event-assessment";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Icon } from "../ui";
import { translator } from "./AssessmentDetail";
import { eventDate } from "./events-model";
import styles from "./events.module.css";

/** 判定中…: the three steps light up in order while the read runs. */
export function Assessing({ language, step, sourceLabel }: { language: OrbitLanguage; step: 0 | 1 | 2; sourceLabel?: string }) {
  const t = translator(language);
  const steps = [t("step1"), t("step2"), t("step3")];
  return (
    <div className={`${styles.card} ${styles.span12}`} data-events-assessing="">
      {sourceLabel ? <div className={styles.lbl}>{t("pastedUrl")} · {sourceLabel}</div> : null}
      <b className={styles.title16} style={{ marginTop: 8 }}>{t("assessingTitle")}</b>
      <div className={styles.lbl}>{t("assessingSub")}</div>
      <div className={styles.steps}>
        {steps.map((label, index) => (
          <div key={label} className={`${styles.step} ${index < step ? styles.stepDone : ""} ${index === step ? styles.stepOn : ""}`}>
            <span className={styles.stepDot}>{index < step ? <Icon name="check" size={16} /> : index + 1}</span>{label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ログインが必要なページ (b2 #4): three ways on, and Orbit never signs in for you. */
export function LoginRequired({ item, language, onPaste, onShot, onManual, onOther }: { item: EventAssessmentContract; language: OrbitLanguage; onPaste: () => void; onShot: () => void; onManual: () => void; onOther: () => void }) {
  const t = translator(language);
  return (
    <div className={`${styles.card} ${styles.span12}`} data-events-failure="login_required">
      <div className={styles.lbl}>{t("readFailed")}</div>
      <div className={styles.lbl} style={{ marginTop: 10 }}>{t("pastedUrl")}</div>
      <div className={styles.input} style={{ height: 40, marginTop: 4 }}>{item.facts.url ?? item.sourceLabel}</div>
      <div className={styles.row} style={{ marginTop: 14 }}><span className={`${styles.emo} ${styles.t_apricot}`}>🔒</span><div><b>{t("loginTitle")}</b><div className={styles.lbl}>{t("loginSub")}</div></div></div>
      <div className={styles.lbl} style={{ margin: "16px 0 4px" }}>{t("otherWays")}</div>
      <div className={styles.lbl} style={{ marginBottom: 8 }}>{t("noProxyLogin")}</div>
      <button type="button" className={`btn ${styles.wayRow}`} onClick={onPaste}><span className={`${styles.emo} ${styles.emoSm} ${styles.t_lav}`}>📋</span><div className={styles.grow}><b>{t("wayPaste")}</b><div className={styles.lbl}>{t("wayPasteSub")}</div></div><Icon name="right" size={16} /></button>
      <button type="button" className={`btn ${styles.wayRow}`} onClick={onShot}><span className={`${styles.emo} ${styles.emoSm} ${styles.t_blue}`}>🖼️</span><div className={styles.grow}><b>{t("wayShot")}</b><div className={styles.lbl}>{t("wayShotSub")}</div></div><Icon name="right" size={16} /></button>
      <button type="button" className={`btn ${styles.wayRow}`} onClick={onManual}><span className={`${styles.emo} ${styles.emoSm} ${styles.t_apricot}`}>✍️</span><div className={styles.grow}><b>{t("wayManual")}</b><div className={styles.lbl}>{t("wayManualSub")}</div></div><Icon name="right" size={16} /></button>
      <button type="button" className={`btn ${styles.btn} ${styles.full}`} style={{ marginTop: 14 }} onClick={onOther}>{t("tryOtherUrl")}</button>
    </div>
  );
}

/** イベントページではないようです (b2 #1): the events found on the page, each can be assessed; or enter it by hand. */
export function NotEventPage({ item, language, onAssess, onManual }: { item: EventAssessmentContract; language: OrbitLanguage; onAssess: (url: string | undefined, title: string) => void; onManual: () => void }) {
  const t = translator(language);
  const candidates = item.pageCandidates ?? [];
  return (
    <div className={`${styles.card} ${styles.span12}`} data-events-failure="not_event_page">
      <b>{t("notEventTitle")}</b>
      <div className={styles.lbl} style={{ marginTop: 10 }}>{t("pastedUrl")}</div>
      <div className={styles.input} style={{ height: 40, marginTop: 4 }}>{item.facts.url ?? item.sourceLabel}</div>
      <div className={styles.row} style={{ marginTop: 10 }}><span className={styles.chip}>{t("articlePage")}</span><span className={styles.lbl}>{t("notEventSub")}</span></div>
      <div className={styles.row} style={{ margin: "16px 0 8px" }}><span>🔎</span><b>{t("eventsOnPage")}</b><span className={styles.lbl}>{t("countItems", { n: candidates.length })}</span></div>
      {candidates.map((candidate) => (
        <div key={candidate.title} className={styles.wayRow}>
          <div className={styles.grow}><b>{candidate.title}</b><div className={styles.lbl}>{[candidate.venue, candidate.startsAt ? eventDate(candidate.startsAt, language, { time: true }) : null, candidate.note].filter(Boolean).join(" · ")}</div></div>
          <button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => onAssess(candidate.url, candidate.title)}>{t("assess")}</button>
        </div>
      ))}
      <div className={styles.wayRow} style={{ marginTop: 10 }}><span>✍️</span><div className={styles.grow}><b>{t("noneOfThese")}</b><div className={styles.lbl}>{t("noneOfTheseSub")}</div></div><button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={onManual}>{t("manual")}</button></div>
    </div>
  );
}

type FeeChoice = "free" | "paid" | "unknown" | null;

/** ポスターの一部だけ読み取れました / 3 items by hand (b2 #5): fill 日時・場所・参加費 (「不明」 allowed) → rule-only re-score. */
export function FillThree({ item, language, onSave, busy }: { item: EventAssessmentContract | null; language: OrbitLanguage; onSave: (facts: EventAssessmentFacts, unknown: ("startsAt" | "venue" | "price")[]) => void; busy?: boolean }) {
  const t = translator(language);
  const facts = item?.facts ?? {};
  const basis = item?.factBasis ?? {};
  const [when, setWhen] = useState(facts.startsAt ? facts.startsAt.slice(0, 16) : "");
  const [where, setWhere] = useState(facts.venue ?? "");
  const [online, setOnline] = useState(false);
  const [fee, setFee] = useState<FeeChoice>(facts.price === EVENT_PRICE_FREE ? "free" : facts.price ? "paid" : null);
  const [amount, setAmount] = useState(facts.price && facts.price !== EVENT_PRICE_FREE ? facts.price.replace(/[^\d]/g, "") : "");
  const [title, setTitle] = useState(facts.title ?? "");
  const known = [facts.startsAt, facts.venue && basis.venue !== "guessed" ? facts.venue : null, facts.price].filter(Boolean).length;
  const statusChip = (field: "startsAt" | "venue" | "price") => {
    if (basis[field] === "guessed") return <span className={`${styles.chip} ${styles.c_apricot}`}>{t("guessed")}</span>;
    if (!facts[field]) return <span className={`${styles.chip} ${styles.c_pink}`}>{t("unreadable")}</span>;
    return <span className={`${styles.chip} ${styles.c_teal}`}><Icon name="check" size={16} /></span>;
  };
  const submit = () => {
    const unknown: ("startsAt" | "venue" | "price")[] = [];
    const next: EventAssessmentFacts = {};
    if (title.trim() && !facts.title) next.title = title.trim();
    if (when) next.startsAt = `${when.slice(0, 16)}:00+09:00`; else unknown.push("startsAt");
    if (online) next.area = EVENT_AREA_ONLINE;
    else if (where.trim()) next.venue = where.trim(); else unknown.push("venue");
    if (fee === "free") next.price = EVENT_PRICE_FREE;
    else if (fee === "paid" && amount) next.price = `¥${Number(amount).toLocaleString("en-US")}`;
    else unknown.push("price");
    onSave(next, unknown);
  };
  return (
    <div className={`${styles.card} ${styles.span12}`} data-events-fill="">
      {item ? (
        <>
          <div className={styles.row}><b className={styles.grow}>{t("posterPartial")}</b>{item.readIssue === "blurry" ? <span className={`${styles.chip} ${styles.c_apricot}`}>{t("blurDetected")}</span> : null}</div>
          <div className={styles.fieldGrid} style={{ marginTop: 12 }}>
            <span className={styles.lbl}>{t("fieldName")}</span><span>{facts.title ?? "—"}</span><span />
            <span className={styles.lbl}>{t("fieldOrganizer")}</span><span>{facts.organizer ?? "—"}</span><span />
            <span className={styles.lbl}>{t("fieldWhen")}</span><span>{facts.startsAt ? eventDate(facts.startsAt, language, { time: true }) : "—"}</span>{statusChip("startsAt")}
            <span className={styles.lbl}>{t("fieldWhere")}</span><span>{facts.venue ? `${facts.venue}${basis.venue === "guessed" ? "?" : ""}` : "—"}</span>{statusChip("venue")}
            <span className={styles.lbl}>{t("fieldFee")}</span><span>{facts.price ?? "—"}</span>{statusChip("price")}
          </div>
        </>
      ) : (
        <div className={styles.row} style={{ gap: 8 }}><span className={styles.lbl}>{t("fieldName")}</span><div className={styles.input} style={{ height: 40 }}><input value={title} onChange={(event) => setTitle(event.target.value)} aria-label={t("fieldName")} /></div></div>
      )}
      <div className={styles.row} style={{ margin: "18px 0 4px" }}><b className={styles.grow}>{t("requiredThree")}</b><span className={styles.lbl}>{known} / 3</span></div>
      <div className={styles.lbl} style={{ marginBottom: 10 }}>{t("requiredHint")}</div>
      <div className={styles.lbl}>{t("fieldWhen")}</div>
      <div className={styles.input} style={{ height: 40, margin: "4px 0 10px" }}><input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} aria-label={t("fieldWhen")} /></div>
      <div className={styles.lbl}>{t("fieldWhere")}</div>
      <div className={styles.input} style={{ height: 40, margin: "4px 0 6px" }}><input value={where} placeholder={t("whereHint")} onChange={(event) => { setWhere(event.target.value); setOnline(false); }} aria-label={t("fieldWhere")} /></div>
      <div className={styles.optRow} style={{ marginBottom: 10 }}>
        {facts.venue && basis.venue === "guessed" ? <button type="button" className={`btn ${styles.opt} ${where === facts.venue ? styles.optOn : ""}`} onClick={() => { setWhere(facts.venue!); setOnline(false); }}>{t("useGuess", { value: facts.venue })}</button> : null}
        <button type="button" className={`btn ${styles.opt} ${online ? styles.optOn : ""}`} onClick={() => setOnline((value) => !value)}>{t("online")}</button>
      </div>
      <div className={styles.lbl}>{t("fieldFee")}</div>
      <div className={styles.optRow} style={{ margin: "4px 0 6px" }}>
        {(["free", "paid", "unknown"] as const).map((choice) => <button key={choice} type="button" className={`btn ${styles.opt} ${fee === choice ? styles.optOn : ""}`} onClick={() => setFee(choice)}>{choice === "free" ? t("free") : choice === "paid" ? t("paid") : t("unknown")}</button>)}
      </div>
      {fee === "paid" ? <div className={styles.input} style={{ height: 40, marginBottom: 10 }}>¥<input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))} aria-label={t("fieldFee")} /></div> : null}
      {fee !== "free" && fee !== "paid" ? <div className={styles.lbl} style={{ marginBottom: 10 }}>{t("feeUnknownRange")}</div> : null}
      <button type="button" className={`btn ${styles.btn} ${styles.primary} ${styles.full}`} onClick={submit} disabled={busy}>{t("judgeWithThis")}</button>
      <div className={styles.lbl} style={{ marginTop: 8, textAlign: "center" }}>{t("inputOnlyHere")}</div>
    </div>
  );
}

/** ページの本文を貼り付ける (b2 #0 / #4 way 1). */
export function PasteText({ language, onAssessText, busy }: { language: OrbitLanguage; onAssessText: (text: string) => void; busy?: boolean }) {
  const t = translator(language);
  const [text, setText] = useState("");
  return (
    <div className={`${styles.card} ${styles.span12}`} data-events-paste="">
      <b>{t("wayPaste")}</b>
      <div className={styles.lbl} style={{ margin: "4px 0 10px" }}>{t("wayPasteSub")}</div>
      <textarea className={styles.textArea} value={text} onChange={(event) => setText(event.target.value)} aria-label={t("wayPaste")} />
      <button type="button" className={`btn ${styles.btn} ${styles.primary}`} style={{ marginTop: 10 }} onClick={() => onAssessText(text)} disabled={busy || text.trim().length < 20}>{t("judge")}</button>
    </div>
  );
}
