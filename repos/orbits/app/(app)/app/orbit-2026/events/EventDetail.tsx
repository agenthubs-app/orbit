"use client";

// R27 イベント詳細（Web 1440：b2 #17 参加者 0 / #18 少 / #19 多，深色 #47；1024 / 390：b12 #350 / #352）。
// 数据：GET /api/events/[id]/overview（规则评估、主办统计、只公开资料的参加者）。评估吸顶的分数与计划页同一套。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { EventOverviewAttendee, EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventJoinCancelResultSchema, eventJoinTentativeResultSchema } from "../../../../../shared/api-schema/event-join";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { ScoreRing, translator as assessTranslator } from "./AssessmentDetail";
import { feeText, journeyTranslator, rowTone, toneClass, type JourneyT } from "./DiscoverTab";
import { CancelDialog } from "./CancelDialog";
import { eventsApi, eventsCall, newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import { LoginAssessCard } from "./PublicEvents";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";

export const WEEK: Record<OrbitLanguage, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };
export function parts(iso: string | null | undefined) {
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

/** 名单锁着（roster-policy A：报名确定前）：人数 · 知り合い人数 + 「参加登録すると…」（b12 #382–#389）。 */
function RosterGate({ data, t, onRegister, wide }: { data: EventOverviewResponse; t: JourneyT; onRegister?: () => void; wide?: boolean }) {
  return (
    <>
      {/* 未登录：只给人数（不提知り合い）、按钮是「ログインして参加登録」（b12 #394）。 */}
      <div className={styles.cardH}><h3>{t("tabPeople")}</h3><span className={styles.lbl}>{data.signedOut ? t("rosterCountsOnly", { n: data.attendeeCounts.all }) : t("rosterCounts", { k: data.attendeeCounts.known, n: data.attendeeCounts.all })}</span></div>
      <div className={`${x.gate} ${wide ? x.gateWide : ""}`} data-roster-gate="">
        <div className={x.gateEmoji}>👥</div>
        <b className={x.gateTitle}>{t("rosterGateBody")}</b>
        <div className={`${styles.lbl} ${x.gateNote}`}>{t("rosterGateNote")}</div>
        {onRegister ? <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onRegister}>{t(data.signedOut ? "loginRegister" : "rosterGateCta")}</button> : null}
      </div>
    </>
  );
}

export function DetailRail({ data, t, onRegister, language = "ja" }: { data: EventOverviewResponse; t: JourneyT; onRegister: () => void; language?: OrbitLanguage }) {
  const fit = data.attendees.filter((item) => item.planFit && !item.known).slice(0, 5);
  return (
    <div className={`${styles.rail} ${d.rail} ${x.detailRail}`} data-detail-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="sparkle" size={16} />{t("meetTitle")}</h4>
      {data.rosterLocked && data.attendeeCounts.all > 0 ? (
        <div className={`${styles.card} ${x.railGate}`} data-rail-gate=""><b>{t("railGateTitle", { n: data.attendeeCounts.planFit })}</b><div className={styles.lbl}>{t("railGateBody")}</div></div>
      ) : <>
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
      </>}
      <div className={x.spacer} />
      {data.registration.status === "none" ? (
        <div className={`${styles.card} ${x.cta}`}>
          <b>{t("ctaTitle")}</b>
          <div className={`${styles.lbl} ${x.ctaSub}`}>{t("ctaSub")}</div>
          <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.block}`} onClick={onRegister}>{t("ctaStart")}</button>
        </div>
      ) : data.registration.status === "registered" || data.registration.status === "pending_review" ? (
        /* b12 #378：已报名时右栏底部 = 参加予定状态卡（CTA 的位置）。 */
        <div className={`${styles.card} ${x.cta}`} data-detail-going="">
          <div className={`${styles.row} ${styles.between}`}><b>{t("goingCardTitle")}</b><span className={`${styles.chip} ${data.registration.status === "registered" ? styles.c_teal : styles.c_lav}`}>{data.registration.status === "registered" ? t("statusConfirmed") : t("statusReview")}</span></div>
          <div className={`${styles.lbl} ${x.goingLine}`}>{t("goingCardLine", { venue: (data.venue ?? "").split(/\s+/)[0] ?? "", when: eventRange(data.startsAt, null, language) })}</div>
        </div>
      ) : null}
    </div>
  );
}

/** `signedOutAside`：未登录时右上卡片（默认「ログインして行く価値を判定」；/register/〈コード〉着地页换成参加コード卡）。 */
/** < 768（b12 #352）：App 式詳細——封面卡（facts）· 评分条 · 下划线 tab · 参加者（プランに合う / 知り合い / 全員）· 底部 CTA。 */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

export function PhoneDetailBody({ data, language, t, onRegister }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; onRegister: () => void }) {
  const toast = useToast();
  // ★ 保存 = 记成 R26 的评估（出现在「評価」列表），同一活动重复保存由服务端按来源去重。
  const save = async () => {
    const created = await eventsApi.create({ eventId: data.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) toast.success(t("savedToAssess")); else toast.error(assessTranslator(language)("genericError"));
  };
  const at = assessTranslator(language);
  const [tab, setTab] = useState<"intro" | "agenda" | "host" | "people">("intro");
  const [filter, setFilter] = useState<"planFit" | "known" | "all">("planFit");
  const [whyOpen, setWhyOpen] = useState(false);
  const tone = data.assessment ? rowTone({ verdict: data.assessment.verdict }, 0) : null;
  const people = data.attendees.filter((person) => (filter === "planFit" ? person.planFit : filter === "known" ? person.known : true));
  const facts = [
    { icon: "calendar" as const, text: eventRange(data.startsAt, data.endsAt, language) },
    { icon: "pin" as const, text: data.venue ?? "—" },
    { icon: "ticket" as const, text: [feeText(data.priceYen, t), data.capacity ? t("capacityN", { n: data.capacity }) : null, data.review ? t("reviewYes") : null].filter(Boolean).join(" · ") },
  ];
  const known = data.knownAttendees;
  return (
    <div className={x.phone} data-event-detail={data.eventId} data-detail-phone="">
      <div className={`${styles.card} ${x.pCover}`}>
        <div className={x.pCoverArt}>
          <span className={`${styles.emo} ${x.pCoverEmo}`}>{data.emoji}</span>
          {data.deadlineSoon && typeof data.remaining === "number" ? <span className={`${styles.chip} ${x.pDeadline}`}>{t("deadlineChip", { n: data.remaining })}</span> : null}
        </div>
        <div className={x.pCoverBody}>
          <div className={styles.lbl}>{data.organizer.name}</div>
          <b className={x.pTitle}>{data.title}</b>
          <div className={x.pFacts}>{facts.map((fact) => <div key={fact.icon}><Icon name={fact.icon} size={16} />{fact.text}</div>)}</div>
        </div>
      </div>
      {data.assessment && !data.signedOut ? (
        <div className={x.pScore} data-why-box="">
          <div className={x.pScoreRow}>
            <ScoreRing score={data.assessment.score} size={50} stroke={5} label={String(data.assessment.score)}><span className={styles.score} style={{ fontSize: "var(--fs-emph)" }}>{data.assessment.score}</span></ScoreRing>
            <div className={x.pGrow}>
              <div className={styles.row} style={{ gap: 6 }}>
                <span className={`${styles.chip} ${tone?.chip ? toneClass(tone.chip) : ""}`}>{data.assessment.verdict === "recommend" ? at("verdictRecommend") : data.assessment.verdict === "conditional" ? at("verdictConditional") : at("verdictSkip")}</span>
                <button type="button" className={`btn ${d.why}`} aria-expanded={whyOpen} aria-label={t("why")} onClick={() => setWhyOpen((value) => !value)}>?</button>
              </div>
              <div className={`${styles.lbl} ${d.ell} ${x.pCrit}`}>{t("critLine", { g: data.assessment.display.goalFit, p: data.assessment.display.people, t: data.assessment.display.timeCost })}</div>
            </div>
            <Icon name="right" size={16} />
          </div>
          {whyOpen ? <div className={d.whyBody}>{data.assessment.basis}</div> : null}
        </div>
      ) : null}
      <div className={x.pTabs} role="tablist">
        {(["intro", "agenda", "host", "people"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn ${x.pTab} ${tab === key ? x.pTabOn : ""}`} data-detail-tab={key} onClick={() => setTab(key)}>
            {t(key === "intro" ? "tabIntro" : key === "agenda" ? "tabAgenda" : key === "host" ? "tabHost" : "tabPeople")}{key === "people" ? <small>{data.attendeeCounts.all}</small> : null}
          </button>
        ))}
      </div>
      {tab === "intro" ? <div className={`${styles.card} ${styles.sub} ${x.pText}`}>{data.description}</div> : null}
      {tab === "agenda" ? (
        <div className={styles.card}>{data.agenda.map((item) => <div key={`${item.at}-${item.title}`} className={x.tline}><time>{item.at}</time><span className={x.dot} /><div><b>{item.title}</b>{item.detail ? <span className={styles.lbl}>{item.detail}</span> : null}</div></div>)}</div>
      ) : null}
      {tab === "host" ? (
        <div className={styles.card}><div className={styles.row} style={{ gap: 12 }}><span className={`${styles.emo} ${styles.t_lav}`}>{data.organizer.emoji ?? data.emoji}</span><div><b>{data.organizer.name}</b><div className={styles.lbl}>{t("hostEditions", { n: data.organizer.editions ?? 0 })}</div></div></div></div>
      ) : null}
      {tab === "people" && data.rosterLocked && data.attendeeCounts.all > 0 ? <div className={`${styles.card} ${x.pGateCard}`}><RosterGate data={data} t={t} onRegister={onRegister} /></div> : null}
      {tab === "people" && !(data.rosterLocked && data.attendeeCounts.all > 0) ? (
        <>
          <div className={`${styles.seg} ${x.pSeg}`} role="tablist">
            {([["planFit", t("segPlanFit", { n: data.attendeeCounts.planFit })], ["known", t("segKnown", { n: data.attendeeCounts.known })], ["all", t("segAll", { n: data.attendeeCounts.all })]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} className={`btn ${styles.segBtn} ${filter === key ? styles.segOn : ""}`} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          {people.length ? (
            <div className={`${styles.card} ${x.pPeople}`} data-detail-people="">
              {people.map((person, index) => (
                <div key={person.attendeeId} className={x.pLi}>
                  <div className={`${x.av} ${avTone(index)}`}>{person.initial}</div>
                  <div className={x.pMeta}><b>{person.name}</b><span>{[person.org, person.role].filter(Boolean).join(" · ")}</span>{person.note ? <span className={x.pNote}>{person.note}</span> : null}</div>
                  {person.wanted ? <span className={`${styles.chip} ${styles.c_lav}`}>{t("legendWanted")}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {known.length ? (
            <div className={`${styles.card} ${styles.flat} ${x.pKnown}`}>
              <div className={styles.row} style={{ gap: 10 }}>
                <div className={x.avs}>{known.slice(0, 3).map((person, index) => <div key={person.name} className={`${x.av} ${x.avSm} ${x[(["c2", "c4", "c3"] as const)[index % 3]!]}`}>{person.initial}</div>)}</div>
                <div className={x.pGrow}><b className={x.pKnownTitle}>{t("knownAlsoN", { n: known.length })}</b><div className={styles.lbl}>{known.map((person) => `${t("honorific", { name: person.name.split(/\s+/)[0] ?? person.name })}${person.speaker ? t("speakerTag") : ""}`).reduce((line, item) => (line ? `${line}${/[）)]$/.test(line) ? "· " : " · "}${item}` : item), "")}</div></div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {data.registration.status === "none" ? (
        <div className={x.ctabar} data-detail-cta="">
          <button type="button" className={`btn ${x.ctaSave}`} aria-label={t("saveEvent")} onClick={() => void save()}><Icon name="star" size={20} /></button>
          <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.ctaMain}`} onClick={onRegister}>{t("ctaRegisterAi")}</button>
        </div>
      ) : null}
    </div>
  );
}

/** `onSeeAll`：「すべて見る」去取全部公开参加者（取过就不再显示按钮；其余人没有公开资料）。 */
export function EventDetailBody({ data, language, t, signedOutAside, onSeeAll, onRegister }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; signedOutAside?: ReactNode; onSeeAll?: () => void; onRegister?: () => void }) {
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
      {data.signedOut ? (signedOutAside ?? <LoginAssessCard t={t} language={language} span="span4" />) : data.assessment ? (
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
        {/* 未登录只剩主办方公开的两格（§36），排两列。 */}
        <div className={`${x.mini3} ${data.signedOut ? x.mini2 : ""}`}>
          <div><span className={styles.lbl}>{t("avgAttend")}</span><b>{data.organizer.averageAttendance ?? "—"}</b></div>
          {data.organizer.typeShare ? <div><span className={styles.lbl}>{t("typeShare", { label: data.organizer.typeShare.label })}</span><b>{data.organizer.typeShare.percent}<small>{t("percentUnit")}</small></b></div> : null}
          {/* 「あなた N回」是个人数据：未登录（服务端不给）时不显示（主会话 10-16 / §36）。 */}
          {!data.signedOut && typeof data.organizer.myAttendance === "number" ? <div><span className={styles.lbl}>{t("youAttended")}</span><b>{data.organizer.myAttendance}<small>{t("timesUnit")}</small></b></div> : null}
        </div>
      </div>
      {data.rosterLocked && data.attendeeCounts.all > 0 ? (
        <div ref={peopleRef} className={`${styles.card} ${styles.span12}`} data-detail-people="">
          <RosterGate data={data} t={t} onRegister={onRegister} wide />
        </div>
      ) : (
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
            {onSeeAll && data.attendeeCounts.all > data.attendees.length ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.moreBtn}`} onClick={onSeeAll}>{t("seeAllPeople", { n: data.attendeeCounts.all })}</button> : null}
          </>
        )}
      </div>
      )}
    </div>
  );
}

export function useWide(): boolean {
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
  const phone = usePhone();
  const [data, setData] = useState<EventOverviewResponse | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void journeyApi.overview(eventId).then((result) => { if (result.ok) setData(result.data); else setMissing(true); });
  }, [eventId]);
  const register = () => window.location.assign(`/app/events/${encodeURIComponent(eventId)}/register`);
  const [allLoaded, setAllLoaded] = useState(false);
  const seeAll = async () => {
    const res = await journeyApi.overview(eventId, true);
    if (res.ok) { setData(res.data); setAllLoaded(true); } else toast.error(assessTranslator(language)("genericError"));
  };
  // 参加の取り消し（b12 #374）：`?cancel=1` 打开确认框，只在已有报名时。
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const holding = data?.registration.status === "registered" || data?.registration.status === "pending_review" || data?.registration.status === "waitlisted";
  useEffect(() => {
    if (holding && new URLSearchParams(window.location.search).get("cancel") === "1") setCancelOpen(true);
  }, [holding]);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target as HTMLElement | null)?.closest("[data-detail-menu],[data-detail-more]")) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menuOpen]);
  const addCalendar = async () => {
    const res = await eventsCall(`/api/events/${encodeURIComponent(eventId)}/join/tentative`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }), method: "POST" }, eventJoinTentativeResultSchema);
    if (res.ok) toast.success(t("calendarAdded")); else toast.error(assessTranslator(language)("genericError"));
  };
  const closeCancel = () => {
    setCancelOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("cancel");
    window.history.replaceState(null, "", url);
  };
  const confirmCancel = async () => {
    setCancelBusy(true);
    const res = await eventsCall(`/api/events/${encodeURIComponent(eventId)}/join/cancel`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }), method: "POST" }, eventJoinCancelResultSchema);
    setCancelBusy(false);
    if (!res.ok) { toast.error(t("cancelFailed")); return; }
    setData((current) => (current ? { ...current, registration: { ...current.registration, status: "cancelled" } } : current));
    closeCancel();
    toast.success(t("cancelled"));
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(t("shareCopied")); } catch { /* clipboard blocked: nothing to do */ }
  };
  const status = data?.registration.status ?? "none";
  const statusLabel = status === "registered" ? t("stRegistered") : status === "pending_review" ? t("stPending") : status === "waitlisted" ? t("stWaitlisted") : status === "rejected" ? t("stRejected") : status === "cancelled" ? t("stCancelled") : status === "attended" ? t("stAttended") : null;
  const right = (
    <div className={x.headRight}>
      <button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void share()}><Icon name="share" size={holding ? 20 : 16} /></button>
      {holding ? (
        /* b12 #378 / #380（§31）：已报名时「会う準備へ」左边的 ⋯，菜单 = カレンダーに追加 / 参加用プロフィールを編集 / 参加を取り消す。 */
        <span className={x.moreWrap}>
          <button type="button" className={`btn ${x.rbtn}`} aria-label={t("moreActions")} aria-haspopup="menu" aria-expanded={menuOpen} data-detail-more="" onClick={() => setMenuOpen((value) => !value)}><Icon name="more" size={16} /></button>
          {menuOpen ? (
            <div className={x.dmenu} role="menu" data-detail-menu="">
              <button type="button" role="menuitem" className={`btn ${x.mi}`} onClick={() => { setMenuOpen(false); void addCalendar(); }}><Icon name="calendar" size={16} /><span>{t("addToCalendar")}</span></button>
              <a role="menuitem" className={`btn ${x.mi}`} href={`/app/events/${encodeURIComponent(eventId)}/register`}><Icon name="pen" size={16} /><span>{t("editJoinProfile")}</span></a>
              <button type="button" role="menuitem" className={`btn ${x.mi} ${x.miDanger}`} onClick={() => { setMenuOpen(false); setCancelOpen(true); }}><Icon name="x" size={16} /><span>{t("cancelDo")}</span></button>
            </div>
          ) : null}
        </span>
      ) : null}
      {status === "none" ? <button type="button" className={`btn ${styles.btn} ${x.accent}`} onClick={register}>{t("register")}</button>
        : status === "registered" || status === "pending_review" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/prep`}>{t("goPrep")}</a>
          : status === "attended" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/after`}>{t("goAfter")}</a>
            : <span className={styles.chip}>{statusLabel}</span>}
    </div>
  );
  return (
    <>
      <ShellPage
        title={phone ? "" : data?.title ?? ""}
        subtitle={phone ? undefined : data?.organizer.name ?? ""}
        left={<a className={`btn ${x.rbtn}`} href="/app/events?tab=discover" aria-label={t("back")}><Icon name="left" size={16} /></a>}
        right={phone ? <button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void share()}><Icon name="share" size={20} /></button> : right}
        rightRail={wide && data ? <DetailRail data={data} t={t} onRegister={register} language={language} /> : false}
        phoneBare={phone}
      />
      {missing ? <div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div> : data ? (phone ? <PhoneDetailBody data={data} language={language} t={t} onRegister={register} /> : <EventDetailBody data={data} language={language} t={t} onRegister={register} {...(allLoaded ? {} : { onSeeAll: () => void seeAll() })} />) : null}
      {data ? <CancelDialog open={cancelOpen} event={data} language={language} t={t} busy={cancelBusy} onKeep={closeCancel} onCancel={() => void confirmCancel()} /> : null}
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
