"use client";

// 2026-11-23 活动 › 发现：点卡片看简介（docs/designs/redesign-2026-10/event-side-panel-proposal.html）。
// 1440 = 右栏（替换「下一步」那一栏）；834 = 右侧浮层 380px；390 = 底部面板（最高 76%）。三处内容相同。
// 先用列表行（EventDiscoverRow）画出封面、标题、时间、地点、费用、和你有关；GET /api/events/[id]/summary 补齐
// 介绍、名额与截止、我的报名状态、参加者、会场记录、主办方下一场、是否关注。底部固定两个按钮：左「查看详情」，右按状态变。
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { EventDiscoverRow } from "../../../../../shared/contract/event-discover";
import type { EventSummaryResponse } from "../../../../../shared/contract/event-summary";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { Icon, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { journeyTranslator, feeText, monthDay, toneClass, type JourneyT } from "./DiscoverTab";
import { journeyApi } from "./journey-api";
import { relevanceRows, relevanceTitle } from "./Relevance";
import styles from "./events.module.css";
import d from "./discover.module.css";
import p from "./side-panel.module.css";

export type PanelTone = "teal" | "lav" | "blue";
/** 栏里先画的部分（列表行；「看下一场」换到列表外的一场时为 null，等摘要读回来再画）。 */
export type PanelSeed = Pick<EventDiscoverRow, "eventId" | "title" | "emoji" | "coverUrl" | "startsAt" | "endsAt" | "venue" | "area" | "priceYen" | "organizerName" | "relevance" | "registrationCount" | "href">;

const summaryKey = (eventId: string) => `events:summary:${eventId}`;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAYS: Record<OrbitLanguage, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };

function tokyoParts(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "numeric", timeZone: "Asia/Tokyo", weekday: "short" }).formatToParts(new Date(time)).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), hm: `${parts.hour}:${parts.minute}`, month: Number(parts.month), weekday: WEEKDAY_INDEX[parts.weekday ?? "Sun"] ?? 0 };
}

/** 「11月28日（六）14:00 – 17:30」；结束在另一天时只写开始。 */
export function panelWhen(startsAt: string, endsAt: string | null | undefined, language: OrbitLanguage, t: JourneyT): string {
  const start = tokyoParts(startsAt);
  if (!start) return "";
  const mon = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "Asia/Tokyo" }).format(new Date(startsAt));
  const date = t("spDate", { d: start.day, m: start.month, mon, w: WEEKDAYS[language][start.weekday]! });
  const end = endsAt ? tokyoParts(endsAt) : null;
  const sameDay = end && end.month === start.month && end.day === start.day;
  return `${date}${language === "en" ? " · " : " "}${start.hm}${sameDay ? ` – ${end.hm}` : ""}`;
}

export type PrimaryAction =
  | { kind: "join" | "myRegistration" | "waitlist" | "record"; href: string }
  | { kind: "full" | "closed" }
  | { kind: "next"; eventId: string }
  | { kind: "follow" | "following"; organizerId: string }
  | { kind: "none" };

const REGISTERED = new Set(["registered", "pending_review", "waitlisted", "attended"]);

/** 右边主按钮按状态（字段表 / S1–S6）。 */
export function primaryAction(summary: EventSummaryResponse, now: Date): PrimaryAction {
  const id = encodeURIComponent(summary.eventId);
  if (summary.ended) {
    const went = summary.status === "registered" || summary.status === "attended";
    if (went && summary.met?.hasRecord) return { href: `/app/events/${id}/live`, kind: "record" };
    if (!went && summary.next) return { eventId: summary.next.eventId, kind: "next" };
    if (summary.organizer.organizerId) return { kind: summary.organizer.following ? "following" : "follow", organizerId: summary.organizer.organizerId };
    return { kind: "none" };
  }
  if (REGISTERED.has(summary.status)) return { href: `/app/events/${id}/register`, kind: "myRegistration" };
  const closed = Boolean(summary.registrationClosesAt && Date.parse(summary.registrationClosesAt) <= now.getTime());
  const full = summary.remaining === 0;
  if (closed || full) return summary.waitlistEnabled ? { href: `/app/events/${id}/register`, kind: "waitlist" } : { kind: full ? "full" : "closed" };
  return { href: `/app/events/${id}/register`, kind: "join" };
}

/** 费用下面那一行：名额 + 截止（不限名额只写截止）。已结束 / 满员 / 截止不写。 */
export function seatsLine(summary: Pick<EventSummaryResponse, "ended" | "remaining" | "registrationClosesAt">, now: Date, t: JourneyT): string | null {
  if (summary.ended) return null;
  const closes = summary.registrationClosesAt && Date.parse(summary.registrationClosesAt) > now.getTime() ? monthDay(summary.registrationClosesAt) : null;
  if (summary.remaining === 0) return t("spFull");
  if (summary.registrationClosesAt && !closes) return t("spClosed");
  if (summary.remaining !== null && closes) return t("spSeatsUntil", { d: closes, n: summary.remaining });
  if (summary.remaining !== null) return t("spSeats", { n: summary.remaining });
  return closes ? t("spUntil", { d: closes }) : null;
}

export function EventSidePanel({ eventId, seed, tone, language, now, mode, onClose, onSelect }: {
  eventId: string;
  seed: PanelSeed | null;
  tone: PanelTone;
  language: OrbitLanguage;
  now: Date;
  mode: "rail" | "drawer" | "sheet";
  onClose: () => void;
  /** 「看下一场」：栏换成那一场。 */
  onSelect: (eventId: string) => void;
}) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const [summary, setSummary] = useState<EventSummaryResponse | null>(() => lastAnswer<EventSummaryResponse>(summaryKey(eventId)) ?? null);
  const [following, setFollowing] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    setSummary(lastAnswer<EventSummaryResponse>(summaryKey(eventId)) ?? null);
    setFollowing(null);
    if (answerFresh(summaryKey(eventId), FRESH.list)) return;
    void journeyApi.summary(eventId).then((result) => {
      if (!result.ok) return;
      rememberAnswer(summaryKey(eventId), result.data);
      if (live) setSummary(result.data);
    });
    return () => { live = false; };
  }, [eventId]);

  const s = summary?.eventId === eventId ? summary : null;
  const title = seed?.title ?? s?.title ?? "";
  const cover = seed ? seed.coverUrl : s?.coverUrl;
  const emoji = seed?.emoji ?? s?.emoji ?? "";
  const startsAt = seed?.startsAt ?? s?.startsAt ?? "";
  const endsAt = seed?.endsAt ?? s?.endsAt ?? null;
  const venue = seed ? seed.venue : s?.venue;
  const online = seed?.area === "online";
  const ended = s?.ended ?? (startsAt ? now.getTime() >= Date.parse(endsAt || startsAt) : false);
  const fee = feeText(seed ? seed.priceYen : s?.priceYen, t);
  const organizer = s?.organizer.unnamed ? null : (seed?.organizerName ?? s?.organizer.name ?? null);
  const went = ended && (s?.status === "registered" || s?.status === "attended");
  const states = [
    ended ? <span key="ended" className={styles.chip}>{t("endedChip")}</span> : null,
    went ? <span key="went" className={`${styles.chip} ${styles.c_teal}`}><Icon name="check" size={16} />{t("spStWent")}</span> : null,
    !ended && s && (s.status === "registered" || s.status === "attended") ? <span key="reg" className={`${styles.chip} ${styles.c_teal}`}><Icon name="check" size={16} />{t("spStRegistered")}</span> : null,
    !ended && s?.status === "pending_review" ? <span key="pending" className={styles.chip}>{t("stPending")}</span> : null,
    !ended && s?.status === "waitlisted" ? <span key="wait" className={styles.chip}>{t("spStWaitlisted")}</span> : null,
  ].filter(Boolean).slice(0, 2);
  const seats = s ? seatsLine(s, now, t) : null;
  const rel = ended ? [] : relevanceRows(seed?.relevance, language).slice(0, 3);
  const count = s?.registrationCount ?? seed?.registrationCount ?? null;
  const action = s ? primaryAction({ ...s, organizer: { ...s.organizer, following: following ?? s.organizer.following } }, now) : null;
  const detailHref = `/app/events/${encodeURIComponent(eventId)}`;

  const follow = async (organizerId: string, next: boolean) => {
    setFollowing(next);
    const result = await journeyApi.follow(organizerId, next);
    if (!result.ok) { setFollowing(!next); toast.error(at("genericError")); }
  };

  const primary = !action ? <span className={`${styles.pendBone} ${p.pendBtn}`} aria-hidden />
    : action.kind === "join" || action.kind === "myRegistration" || action.kind === "waitlist" || action.kind === "record"
      ? <Link className={`btn ${styles.btn} ${styles.primary}`} href={action.href} data-panel-primary={action.kind}>{t(action.kind === "join" ? "spJoin" : action.kind === "myRegistration" ? "spMyRegistration" : action.kind === "waitlist" ? "spWaitlist" : "spRecord")}</Link>
      : action.kind === "full" || action.kind === "closed"
        ? <button type="button" className={`btn ${styles.btn} ${p.off}`} disabled data-panel-primary={action.kind}>{t(action.kind === "full" ? "spFull" : "spClosed")}</button>
        : action.kind === "next"
          ? <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={() => onSelect(action.eventId)} data-panel-primary="next">{t("spSeeNext")}</button>
          : action.kind === "follow" || action.kind === "following"
            ? <button type="button" className={`btn ${styles.btn} ${action.kind === "follow" ? styles.primary : ""}`} aria-pressed={action.kind === "following"} onClick={() => void follow(action.organizerId, action.kind === "follow")} data-panel-primary={action.kind}>{t(action.kind === "follow" ? "spFollow" : "spFollowing")}</button>
            : null;

  return (
    <div className={`${p.ep} ${p[`mode_${mode}`]}`} data-event-panel={eventId}>
      <div className={p.scroll}>
        {mode === "sheet" ? null : <div className={p.top}><button type="button" className={`btn ${p.close}`} aria-label={t("spClose")} onClick={onClose}><Icon name="x" size={20} /></button></div>}
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（服务端已裁成 2:1）
          <div className={p.cover}><img src={cover} alt="" /></div>
        ) : emoji ? <div className={`${p.cover} ${p.band} ${d[`tile_${tone}`]} ${p[`band_${tone}`]}`}><span className={`${styles.emo} ${p.bandEmo}`}>{emoji}</span></div> : <div className={`${p.cover} ${p.coverPending}`} aria-hidden />}
        {title ? <h3 className={p.title}>{title}</h3> : <div className={p.title}><i className={styles.pendBone} style={{ width: "70%", height: 18 }} aria-hidden /></div>}
        {organizer ? <div className={p.org}><span className={p.orgAv}>{organizer.trim().charAt(0)}</span>{organizer}</div> : null}
        {states.length ? <div className={`${styles.chips} ${p.state}`}>{states}</div> : null}
        <div className={p.facts}>
          {startsAt ? <div><Icon name="calendar" size={16} /><span>{panelWhen(startsAt, endsAt, language, t)}</span></div> : null}
          {online ? <div><Icon name="pin" size={16} /><span>{t("spOnline")}</span></div> : venue ? <div><Icon name="pin" size={16} /><span>{venue}</span></div> : null}
          {!ended && (fee || seats) ? <div data-panel-fee=""><Icon name="ticket" size={16} /><span>{fee ?? seats}{fee && seats ? <small>{seats}</small> : null}</span></div> : null}
        </div>
        {s?.description ? <section className={p.sec}><h5>{t("spIntro")}</h5><p className={p.clamp4}>{s.description}</p></section> : null}
        {rel.length ? (
          <section className={p.sec} data-panel-related="">
            <h5>{relevanceTitle(language)}</h5>
            <div className={p.rel}>{rel.map((row) => <div key={row.key}><span className={`${styles.chip} ${row.tone === "warn" ? styles.c_warn : toneClass(row.tone)}`}>{row.main}</span>{row.basis ? <span>{row.basis}</span> : null}</div>)}</div>
          </section>
        ) : null}
        {went && s?.met ? (
          <section className={p.sec} data-panel-met="">
            <h5>{t("spMetTitle")}</h5>
            {s.met.hasRecord
              ? <div className={p.ppl}>{s.met.initials.length ? <Avatars initials={s.met.initials} /> : null}<span>{s.met.notInContacts ? t("spMetNotAdded", { k: s.met.notInContacts, n: s.met.count }) : t("spMetN", { n: s.met.count })}</span></div>
              : <p>{t("spMetNone")}</p>}
          </section>
        ) : s && !went && (s.attendeeInitials.length || (count !== null && count >= 10)) ? (
          <section className={p.sec} data-panel-people="">
            <h5>{t("spPeople")}</h5>
            <div className={p.ppl}>{s.attendeeInitials.length ? <Avatars initials={s.attendeeInitials} /> : null}{count !== null && count >= 10 ? <span>{t(ended ? "spAttendedN" : "spRegisteredN", { n: count })}</span> : null}</div>
          </section>
        ) : null}
        {ended && !went && s?.next ? (
          <section className={p.sec} data-panel-next="">
            <h5>{t("spNextTitle")}</h5>
            <button type="button" className={`btn ${p.next}`} onClick={() => onSelect(s.next!.eventId)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图 */}
              {s.next.coverUrl ? <span className={p.nextTh}><img src={s.next.coverUrl} alt="" /></span> : <span className={`${p.nextTh} ${d.tile_teal}`}>{s.next.emoji}</span>}
              <span className={p.nextText}><b>{s.next.title}</b><small>{[monthDay(s.next.startsAt), s.next.venue, t("spNextOpen")].filter(Boolean).join(" · ")}</small></span>
            </button>
          </section>
        ) : null}
      </div>
      <div className={p.foot}>
        <Link className={`btn ${styles.btn}`} href={detailHref} data-panel-detail="">{t("seeDetail")}</Link>
        {primary}
      </div>
    </div>
  );
}

const AVATAR_TONES = ["c1", "c3", "c5", "c1"] as const;
function Avatars({ initials }: { initials: readonly string[] }) {
  return <span className={p.avs}>{initials.slice(0, 4).map((letter, index) => <span key={`${letter}-${index}`} className={`${p.av} ${p[AVATAR_TONES[index % AVATAR_TONES.length]!]}`}>{letter}</span>)}</span>;
}

/** Tests: the summary key the panel caches under. */
export { summaryKey as eventSummaryAnswerKey };
