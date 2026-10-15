"use client";

// R27 イベント詳細（Web 1440：b2 #17 参加者 0 / #18 少 / #19 多，深色 #47；1024 / 390：b12 #350 / #352）。
// 数据：GET /api/events/[id]/overview（规则评估、主办统计、只公开资料的参加者）。评估吸顶的分数与计划页同一套。
import { useEffect, useMemo, useRef, useState } from "react";

import type { EventOverviewAttendee, EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { ScoreRing, translator as assessTranslator } from "./AssessmentDetail";
import { feeText, journeyTranslator, rowTone, toneClass, type JourneyT } from "./DiscoverTab";
import { eventsApi, newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import { LoginAssessCard } from "./PublicEvents";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";

const WEEK: Record<OrbitLanguage, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };
function parts(iso: string | null | undefined) {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return null;
  const t = new Date(time + 9 * 3_600_000);
  return { day: t.getUTCDate(), hm: `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`, month: t.getUTCMonth() + 1, wd: t.getUTCDay(), year: t.getUTCFullYear() };
}
/** 「10/7（水）19:00–21:30」 */
export function eventRange(startsAt: string, endsAt: string | null | undefined, language: OrbitLanguage): string {
  const s = parts(startsAt);
  if (!s) return "";
  const e = parts(endsAt);
  const wd = WEEK[language][s.wd];
  const date = language === "en" ? `${wd} ${s.month}/${s.day}` : `${s.month}/${s.day}（${wd}）`;
  return `${date}${s.hm}${e ? `–${e.hm}` : ""}`;
}
export const monthDaySlash = (iso: string | null | undefined) => { const p = parts(iso); return p ? `${p.month}/${p.day}` : ""; };

const AV_TONES = ["c1", "c3", "c4", "c2", "c3", "c5", "c2", "c3"] as const;
/** 登壇者（参加者未公开时）的头像色：teal、blue 轮换（b2 #17）。 */
const SPEAKER_TONES = [2, 1] as const;
export function avTone(index: number): string { return x[AV_TONES[index % AV_TONES.length]!]!; }

function Crit({ label, value, rose, unknown }: { label: string; value: number; rose?: boolean; unknown?: boolean }) {
  return (
    <div className={x.crit}>
      <span className={styles.muted}>{label}</span>
      <div className={`${x.bar} ${rose ? x.barRose : ""}`}>{unknown ? null : <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}</div>
      <b className={`${styles.score} ${x.critScore}`}>{unknown ? "—" : value}</b>
    </div>
  );
}

function Person({ person, index, note }: { person: EventOverviewAttendee | { name: string; initial: string; org?: string | null }; index: number; note?: string | null }) {
  return (
    <div className={x.li}>
      <div className={`${x.av} ${x.avSm} ${avTone(index)}`}>{person.initial}</div>
      <div className={x.meta}><b>{person.name}</b><span>{note ?? person.org ?? ""}</span></div>
    </div>
  );
}

export function DetailRail({ data, t, onRegister }: { data: EventOverviewResponse; t: JourneyT; onRegister: () => void }) {
  const fit = data.attendees.filter((item) => item.planFit && !item.known).slice(0, 5);
  return (
    <div className={`${styles.rail} ${d.rail} ${x.detailRail}`} data-detail-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="sparkle" size={16} />{t("meetTitle")}</h4>
      <div className={`${styles.card} ${x.railList}`}>
        <div className={x.list}>
          {fit.length ? fit.map((person, index) => <Person key={person.attendeeId} person={person} index={index} note={person.note} />)
            : (data.speakerCandidates ?? []).map((speaker, index) => <Person key={speaker.name} person={{ initial: speaker.name.charAt(0), name: speaker.name }} index={SPEAKER_TONES[index % SPEAKER_TONES.length]!} note={speaker.note} />)}
        </div>
        {data.assessmentPeopleUnknown ? <div className={x.ghostRow}><i />{t("waitingPublic")}</div> : null}
      </div>
      {data.knownAttendees.length > 1 ? (
        <div className={`${styles.card} ${x.flat} ${x.knownCard}`}>
          <div className={styles.row} style={{ gap: 10 }}>
            <div className={x.avs}>{data.knownAttendees.map((known, index) => <div key={known.name} className={`${x.av} ${x.avSm} ${avTone([3, 1, 4][index % 3]!)}`}>{known.initial}</div>)}</div>
            <span className={styles.sub}>{t("knownAlso", { n: data.knownAttendees.length })}</span>
          </div>
        </div>
      ) : null}
      <div className={x.spacer} />
      {data.registration.status === "none" ? (
        <div className={`${styles.card} ${x.cta}`}>
          <b>{t("ctaTitle")}</b>
          <div className={`${styles.lbl} ${x.ctaSub}`}>{t("ctaSub")}</div>
          <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.block}`} onClick={onRegister}>{t("ctaStart")}</button>
        </div>
      ) : null}
    </div>
  );
}

export function EventDetailBody({ data, language, t }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT }) {
  const at = assessTranslator(language);
  const toast = useToast();
  const [tab, setTab] = useState<"intro" | "agenda" | "host" | "people">("intro");
  const agendaRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const peopleRef = useRef<HTMLDivElement | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const choose = (next: typeof tab) => {
    setTab(next);
    const ref = next === "agenda" ? agendaRef : next === "host" ? hostRef : next === "people" ? peopleRef : null;
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const capacity = data.capacity ? (data.remaining !== null && data.remaining !== undefined && data.remaining < data.capacity && data.attendeeCounts.all > 0 ? t("capacityLeft", { left: data.remaining, n: data.capacity }) : data.review ? t("capacityReview", { n: data.capacity }) : String(data.capacity)) : "—";
  const tone = data.assessment ? rowTone({ verdict: data.assessment.verdict }, 0) : null;
  const since = parts(data.organizer.since);
  const notify = async () => {
    const created = await eventsApi.create({ eventId: data.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) toast.success(t("notifyOn")); else toast.error(at("genericError"));
  };
  return (
    <div className={styles.wgrid} data-event-detail={data.eventId}>
      <div className={`${styles.card} ${x.span8} ${x.coverCard}`}>
        <div className={x.cover}><span className={`${styles.emo} ${x.coverEmo}`}>{data.emoji}</span></div>
        <div className={x.coverBody}>
          <div className={x.facts}>
            <div><div className={styles.lbl}>{t("fDate")}</div><b>{eventRange(data.startsAt, data.endsAt, language)}</b></div>
            <div><div className={styles.lbl}>{t("fPlace")}</div><b>{data.venue ?? "—"}</b></div>
            <div><div className={styles.lbl}>{t("fFee")}</div><b>{feeText(data.priceYen, t) ?? "—"}</b></div>
            <div><div className={styles.lbl}>{t("fCapacity")}</div><b>{capacity}</b></div>
          </div>
          <div className={x.utabs} role="tablist">
            {(["intro", "agenda", "host", "people"] as const).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn ${x.tab} ${tab === key ? x.on : ""}`} onClick={() => choose(key)}>
                {t(key === "intro" ? "tabIntro" : key === "agenda" ? "tabAgenda" : key === "host" ? "tabHost" : "tabPeople")}{key === "people" ? <small>{data.attendeeCounts.all}</small> : null}
              </button>
            ))}
          </div>
          <div className={`${styles.sub} ${x.intro}`}>{data.description}</div>
        </div>
      </div>
      {data.signedOut ? <LoginAssessCard t={t} language={language} span="span4" /> : data.assessment ? (
        <div className={`${styles.card} ${styles.span4} ${x.scoreCard}`} data-why-box="">
          <div className={styles.lbl}>{t("yourAssessment")}</div>
          <div className={x.scoreRing}>
            <ScoreRing score={data.assessment.score} size={120} stroke={12} label={String(data.assessment.score)}>
              <div className={`${styles.big} ${x.big36}`}>{data.assessment.score}</div>
              <div className={styles.lbl}>{t("outOf")}</div>
            </ScoreRing>
          </div>
          <div className={styles.row} style={{ gap: 6, justifyContent: "center" }}>
            <span className={`${styles.chip} ${tone?.chip ? toneClass(tone.chip) : ""} ${styles.verdictBig}`}>{data.assessment.verdict === "recommend" ? at("verdictRecommend") : data.assessment.verdict === "conditional" ? at("verdictConditional") : at("verdictSkip")}</span>
            <button type="button" className={`btn ${d.why}`} aria-expanded={whyOpen} aria-label={t("why")} onClick={() => setWhyOpen((value) => !value)}>?</button>
          </div>
          {whyOpen ? <div className={d.whyBody}>{data.assessment.basis}</div> : null}
          <div className={x.crits}>
            <Crit label={at("dimGoal")} value={data.assessment.display.goalFit} />
            <Crit label={at("dimPeople")} value={data.assessment.display.people} unknown={Boolean(data.assessmentPeopleUnknown)} />
            <Crit label={at("dimTime")} value={data.assessment.display.timeCost} rose />
          </div>
        </div>
      ) : null}
      <div ref={agendaRef} className={`${styles.card} ${x.span7}`}>
        <div className={styles.cardH}><h3>{t("tabAgenda")}</h3></div>
        {data.agenda.map((item) => (
          <div key={`${item.at}-${item.title}`} className={x.tline}><time>{item.at}</time><span className={x.dot} /><div><b>{item.title}</b>{item.detail ? <span className={styles.lbl}>{item.detail}</span> : null}</div></div>
        ))}
      </div>
      <div ref={hostRef} className={`${styles.card} ${x.span5}`}>
        <div className={styles.cardH}><h3>{t("tabHost")}</h3></div>
        <div className={styles.row} style={{ gap: 12 }}>
          <span className={`${styles.emo} ${styles.t_lav}`}>{data.organizer.emoji ?? data.emoji}</span>
          <div><b>{data.organizer.name}</b><div className={styles.lbl}>{since && data.organizer.monthly ? t("hostMonthlySince", { n: data.organizer.editions ?? 0, y: since.year }) : t("hostEditions", { n: data.organizer.editions ?? 0 })}</div></div>
        </div>
        <div className={x.mini3}>
          <div><span className={styles.lbl}>{t("avgAttend")}</span><b>{data.organizer.averageAttendance ?? "—"}</b></div>
          {data.organizer.typeShare ? <div><span className={styles.lbl}>{t("typeShare", { label: data.organizer.typeShare.label })}</span><b>{data.organizer.typeShare.percent}<small>{t("percentUnit")}</small></b></div> : null}
          <div><span className={styles.lbl}>{t("youAttended")}</span><b>{data.organizer.myAttendance ?? 0}<small>{t("timesUnit")}</small></b></div>
        </div>
      </div>
      <div ref={peopleRef} className={`${styles.card} ${styles.span12}`} data-detail-people="">
        <div className={styles.cardH}><h3>{t("peopleTitle", { n: data.attendeeCounts.all })}</h3><span className={styles.lbl}>{data.attendeeCounts.all === 0 && data.attendeesPublicAt ? t("publicFrom", { date: monthDaySlash(data.attendeesPublicAt) }) : t("publicOnly")}</span></div>
        {data.attendeeCounts.all === 0 ? (
          <>
            <div className={`${x.ghostRow} ${x.tall}`}><i />{t("ghostPeople")}</div>
            <div className={`${x.ghostRow} ${x.tall}`}><i />{t("ghostKnown")}</div>
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.moreBtn}`} onClick={() => void notify()}><Icon name="bell" size={16} />{t("notifyWhenPublic")}</button>
          </>
        ) : (
          <>
            <div className={x.pgrid}>
              {data.attendees.map((person, index) => (
                <div key={person.attendeeId} className={x.pmini}><div className={`${x.av} ${avTone(index)}`}>{person.initial}</div><div className={x.meta}><b>{person.name}</b><span>{person.org}</span></div></div>
              ))}
            </div>
            {data.attendeeCounts.all > data.attendees.length ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.moreBtn}`}>{t("seeAllPeople", { n: data.attendeeCounts.all })}</button> : null}
          </>
        )}
      </div>
    </div>
  );
}

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const update = () => setWide(window.matchMedia("(min-width: 1280px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return wide;
}

function DetailInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const toast = useToast();
  const wide = useWide();
  const [data, setData] = useState<EventOverviewResponse | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void journeyApi.overview(eventId).then((result) => { if (result.ok) setData(result.data); else setMissing(true); });
  }, [eventId]);
  const register = () => window.location.assign(`/app/events/${encodeURIComponent(eventId)}/register`);
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(t("shareCopied")); } catch { /* clipboard blocked: nothing to do */ }
  };
  const status = data?.registration.status ?? "none";
  const statusLabel = status === "registered" ? t("stRegistered") : status === "pending_review" ? t("stPending") : status === "waitlisted" ? t("stWaitlisted") : status === "rejected" ? t("stRejected") : status === "cancelled" ? t("stCancelled") : status === "attended" ? t("stAttended") : null;
  const right = (
    <div className={x.headRight}>
      <button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void share()}><Icon name="share" size={16} /></button>
      {status === "none" ? <button type="button" className={`btn ${styles.btn} ${x.accent}`} onClick={register}>{t("register")}</button>
        : status === "registered" || status === "pending_review" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/prep`}>{t("goPrep")}</a>
          : status === "attended" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/after`}>{t("goAfter")}</a>
            : <span className={styles.chip}>{statusLabel}</span>}
    </div>
  );
  return (
    <>
      <ShellPage
        title={data?.title ?? ""}
        subtitle={data?.organizer.name ?? ""}
        left={<a className={`btn ${x.rbtn}`} href="/app/events?tab=discover" aria-label={t("back")}><Icon name="left" size={16} /></a>}
        right={right}
        rightRail={wide && data ? <DetailRail data={data} t={t} onRegister={register} /> : false}
      />
      {missing ? <div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div> : data ? <EventDetailBody data={data} language={language} t={t} /> : null}
    </>
  );
}

export function EventDetailScreen({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <DetailInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
