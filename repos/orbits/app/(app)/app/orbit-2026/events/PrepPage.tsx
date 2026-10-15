"use client";

// R27 会う準備（Web 1440：b2 #25；1024 / 390：b12 #358 / #360）。数据：GET /api/events/[id]/prep（规则：会いたい人、話しかけ方、清单）。
// - 倒计时从服务端给的 now 起算（首帧不读客户端时钟，避免水合差异），之后每分钟本地递减。
// - 名刺の残り只存这台设备（localStorage），从不发给服务端（DESIGN §2.5 / IMPLEMENTATION-PLAN §1.5）。
// - 准备清单两端同步（PATCH prep/checklist）；「明日のフォロー」确认后才写日历（POST /api/schedule-items）。
import { useEffect, useMemo, useState } from "react";

import type { EventPrepChecklistItem, EventPrepResponse } from "../../../../../shared/contract/event-prep";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { ScoreRing, translator as assessTranslator } from "./AssessmentDetail";
import { journeyTranslator, type JourneyT } from "./DiscoverTab";
import { avTone, eventRange } from "./EventDetail";
import { newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import q from "./prep.module.css";

const CARDS_KEY = (eventId: string) => `orbit.events.cardsLeft.${eventId}`;
function readCards(eventId: string): number | null {
  try { const value = window.localStorage.getItem(CARDS_KEY(eventId)); return value === null ? null : Number(value); } catch { return null; }
}
function writeCards(eventId: string, value: number): void {
  try { window.localStorage.setItem(CARDS_KEY(eventId), String(value)); } catch { /* private mode: keep it in memory only */ }
}

function hm(iso: string): string {
  const t = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}
function tokyoDay(iso: string): number { return Math.floor((Date.parse(iso) + 9 * 3_600_000) / 86_400_000); }

export function prepWhen(startsAt: string, now: string, t: JourneyT): string {
  const diff = tokyoDay(startsAt) - tokyoDay(now);
  const time = hm(startsAt);
  if (diff === 0) return Number(time.slice(0, 2)) >= 17 ? t("tonightAt", { time }) : t("todayAt", { time });
  if (diff === 1) return t("tomorrowAt", { time });
  const s = new Date(Date.parse(startsAt) + 9 * 3_600_000);
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()} ${time}`;
}

/** 「3:12」（时:分），开始后 0:00。 */
export function countdown(startsAt: string, nowMs: number): { text: string; hours: boolean } {
  const left = Math.max(0, Date.parse(startsAt) - nowMs);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? { hours: true, text: `${h}:${String(m).padStart(2, "0")}` } : { hours: false, text: String(m) };
}

const CHECK_LABEL: Record<EventPrepChecklistItem["key"], "clCards" | "clIntro" | "clMaterials" | "clQr" | "clReturn"> = { cards: "clCards", intro: "clIntro", materials: "clMaterials", qr: "clQr", return: "clReturn" };

function PrepInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const [data, setData] = useState<EventPrepResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [cards, setCards] = useState<number | null>(null);
  const [editingCards, setEditingCards] = useState(false);
  const [followDone, setFollowDone] = useState<"added" | "skipped" | null>(null);

  useEffect(() => {
    void journeyApi.prep(eventId).then((result) => {
      if (!result.ok) { setMissing(true); return; }
      setData(result.data);
      setNowMs(Date.parse(result.data.now));
    });
    setCards(readCards(eventId));
  }, [eventId]);
  useEffect(() => {
    if (nowMs === null) return;
    const timer = setInterval(() => setNowMs((value) => (value === null ? value : value + 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [nowMs === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (item: EventPrepChecklistItem) => {
    if (!data) return;
    const next = data.checklist.map((entry) => (entry.key === item.key ? { ...entry, done: !entry.done } : entry));
    setData({ ...data, checklist: next });
    const saved = await journeyApi.checklist(eventId, [{ ...item, done: !item.done }]);
    if (saved.ok) setData(saved.data); else toast.error(at("genericError"));
  };
  const copyOpener = async (text: string) => {
    try { await navigator.clipboard.writeText(text.replace(/^「|」$/g, "")); toast.success(t("copied")); } catch { toast.error(at("genericError")); }
  };
  const addFollowup = async () => {
    if (!data?.followupSuggestion) return;
    const response = await fetch("/api/schedule-items", { body: JSON.stringify({ endsAt: data.followupSuggestion.endsAt, idempotencyKey: newIdempotencyKey(), startsAt: data.followupSuggestion.startsAt, timeZone: "Asia/Tokyo", title: data.followupSuggestion.title }), headers: { "content-type": "application/json" }, method: "POST" }).catch(() => null);
    if (response?.ok) { setFollowDone("added"); toast.success(t("followAdded")); } else toast.error(at("genericError"));
  };

  if (missing) return <><ShellPage title={t("prepTitle")} rightRail={false} /><div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div></>;
  if (!data || nowMs === null) return <ShellPage title={t("prepTitle")} rightRail={false} />;

  const until = countdown(data.startsAt, nowMs);
  const recommended = data.cardsRecommended;
  const done = data.checklist.filter((item) => item.done).length;
  const low = cards !== null && cards < recommended;
  const rail = (
    <div className={`${styles.rail} ${d.rail}`} data-prep-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="clock" size={16} />{t("flowTitle")}</h4>
      <div className={`${styles.card} ${q.flowCard}`}>
        {(data.agenda ?? []).map((item) => <div key={`${item.at}-${item.title}`} className={x.tline}><time>{item.at}</time><span className={x.dot} /><div><b>{item.title}</b>{item.detail ? <span className={styles.lbl}>{item.detail}</span> : null}</div></div>)}
      </div>
      {data.seatHint ? <div className={`${styles.mac} ${q.lav} ${q.hint}`}>💡 {data.seatHint}</div> : null}
    </div>
  );
  return (
    <>
      <ShellPage
        title={t("prepTitle")}
        subtitle={t("prepSubtitle", { title: data.title, when: prepWhen(data.startsAt, data.now, t) })}
        left={<a className={`btn ${x.rbtn}`} href={`/app/events/${encodeURIComponent(eventId)}`} aria-label={t("back")}><Icon name="left" size={16} /></a>}
        right={<a className={`btn ${styles.btn}`} href={`/app/events/${encodeURIComponent(eventId)}/live`}><Icon name="ticket" size={16} />{t("checkIn")}</a>}
        rightRail={rail}
      />
      <div className={styles.wgrid} data-prep={eventId}>
        <div className={`${styles.card} ${styles.span4}`} data-prep-when="">
          <div className={styles.lbl}>{t("untilStart")}</div>
          <div className={styles.big}>{until.text}<small className={q.unit}>{until.hours ? t("hoursUnit") : t("minutesUnit")}</small></div>
          <div className={`${styles.sub} ${q.whenSub}`}>{eventRange(data.startsAt, data.endsAt, language)}<br />{data.venue}</div>
        </div>
        <div className={`${styles.card} ${styles.span4} ${q.mapCard}`}>
          <svg width="100%" height="140" viewBox="0 0 120 90" className={q.map} aria-hidden>
            <rect width="120" height="90" rx="14" className={q.mapBg} />
            <path d="M0 58 L120 38 M30 0 L48 90 M82 0 L96 90" className={q.mapRoad} />
            <path d="M0 76 Q60 70 120 18" className={q.mapRail} />
            <circle cx="66" cy="44" r="12" className={q.mapHalo} />
            <circle cx="66" cy="44" r="5" className={q.mapPin} />
            {data.access ? <text x="10" y="84" className={q.mapText}>{data.access.split(" ")[0]?.replace(/出口.*$/, "")}</text> : null}
          </svg>
          {data.mapUrl ? <a className={`btn ${styles.btn} ${styles.sm} ${q.mapBtn}`} href={data.mapUrl} target="_blank" rel="noreferrer"><Icon name="pin" size={16} />{t("mapOpen")}</a> : null}
        </div>
        <div className={`${styles.card} ${styles.span4}`} data-prep-cards="">
          <button type="button" className={`btn ${q.cardsRow}`} onClick={() => setEditingCards(true)} aria-label={t("cardsInputLabel")}>
            <ScoreRing score={cards === null ? 0 : Math.min(100, Math.round((cards / Math.max(1, recommended)) * 100))} size={84} stroke={8} label={`${cards ?? 0}`}>
              <div className={styles.score} style={{ fontSize: "var(--fs-title-sm)" }}>{cards ?? "—"}</div>
              <div className={styles.lbl} style={{ fontSize: "var(--fs-micro)" }}>{t("cardsOf", { total: recommended })}</div>
            </ScoreRing>
            <div className={q.cardsText}><b>{cards === null ? t("cardsUnknown") : low ? t("cardsLow") : t("cardsOk")}</b><div className={styles.lbl}>{t("cardsAdvice", { n: data.people.length, total: recommended })}</div></div>
          </button>
          {editingCards ? (
            <label className={q.cardsInput}>
              <span className={styles.lbl}>{t("cardsInputLabel")}</span>
              <input type="number" min={0} max={500} autoFocus data-prep-cards-input="" defaultValue={cards ?? ""} onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const value = Math.max(0, Math.min(500, Number((event.target as HTMLInputElement).value) || 0));
                writeCards(eventId, value); setCards(value); setEditingCards(false);
              }} />
            </label>
          ) : null}
        </div>
        <div className={`${styles.card} ${x.span8}`} data-prep-people="">
          <div className={styles.cardH}><h3>{t("meetListTitle", { n: data.people.length })}</h3><span className={styles.lbl}>{t("meetListHint")}</span></div>
          <table className={d.table}>
            <thead><tr><th>{t("colPerson")}</th><th>{t("colWhy")}</th><th>{t("colOpener")}</th><th>{t("colHistory")}</th></tr></thead>
            <tbody>
              {data.people.map((person, index) => (
                <tr key={person.attendeeId} onClick={() => void copyOpener(person.opener)} title={t("copy")}>
                  <td><div className={styles.row} style={{ gap: 8 }}><div className={`${x.av} ${x.avSm} ${avTone([0, 2, 2, 3][index % 4]!)}`}>{person.initial}</div><div><b className={q.name}>{person.name}</b><div className={styles.lbl}>{person.org}</div></div></div></td>
                  <td className={q.why}>{person.why}</td>
                  <td><div className={q.quote}>{person.opener}</div></td>
                  <td><span className={`${styles.chip} ${person.relation === "working" ? styles.c_teal : styles.c_lav}`}>{person.relation === "working" ? t("relWorking") : person.relation === "met" ? t("relMet") : t("relNone")}</span><div className={`${styles.lbl} ${q.history}`}>{person.history}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`${styles.card} ${styles.span4}`} data-prep-checklist="">
          <div className={styles.cardH}><h3>{t("checklistTitle")}</h3><span className={styles.lbl}>{t("countOf", { done, total: data.checklist.length })}</span></div>
          {data.checklist.map((item) => {
            const title = item.key === "cards" ? t("clCards", { n: recommended }) : item.key === "materials" ? item.label || t("clMaterials") : t(CHECK_LABEL[item.key]);
            const sub = item.key === "cards" && cards !== null ? t("clCardsLeft", { n: cards }) : item.key === "intro" ? (data.selfIntro?.source === "registration_draft" ? t("clIntroAi") : data.selfIntro ? null : t("clIntroWrite")) : null;
            return (
              <button key={item.key} type="button" role="checkbox" aria-checked={item.done} className={`btn ${q.chk} ${item.done ? q.done : ""}`} onClick={() => void toggle(item)} data-prep-check={item.key}>
                <span className={q.box}>{item.done ? <Icon name="check" size={16} /> : null}</span>
                <div><b>{title}</b>{sub ? <span>{sub}</span> : null}</div>
              </button>
            );
          })}
          {data.followupSuggestion && !followDone ? (
            <div className={`${styles.card} ${q.confirm}`} data-prep-follow="">
              <b className={q.confirmTitle}>{t("followAskWeb", { time: hm(data.followupSuggestion.startsAt).replace(/^0/, "") })}</b>
              <div className={styles.row} style={{ gap: 8, marginTop: 10 }}>
                <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} onClick={() => void addFollowup()}>{t("addIt")}</button>
                <button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => setFollowDone("skipped")}>{t("notNow")}</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function PrepPage({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <PrepInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
