"use client";

// R27 イベント詳細（Web 1440：b2 #17 参加者 0 / #18 少 / #19 多，深色 #47；1024 / 390：b12 #350 / #352）。
// 数据：GET /api/events/[id]/overview（主办统计、只公开资料的参加者、「あなたに関係すること」）。2026-11-15 起不显示分数。
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { EventOverviewAttendee, EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventJoinCancelResultSchema, eventJoinTentativeResultSchema } from "../../../../../shared/api-schema/event-join";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, ToastProvider, UnderlineTabs, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { feeText, journeyTranslator, type JourneyT } from "./DiscoverTab";
import { RelevanceCard, RelevanceRows, relevanceRows, relevanceTitle } from "./Relevance";
import { CancelDialog } from "./CancelDialog";
import { EventDescription } from "./EventDescription";
import { HostContactCard } from "./HostContact";
import { canSeeHostContact } from "../../../../../shared/compute/host-contact";
import { eventsApi, eventsCall, newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import { useDetailTiming } from "./detail-timing";
import { personRailOrDrawer, usePersonDetail, type AttendeeSeed } from "./AttendeeProfile";
import r from "./record.module.css";
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
/** 主办方没有公开名字（接口只给匿名占位 `unnamed`）时显示通用「主催者」，不把哈希串当名字。 */
export function hostName(data: Pick<EventOverviewResponse, "organizer">, t: JourneyT): string { return data.organizer.unnamed ? t("hostUnnamed") : data.organizer.name; }
/** 已登录但没有计划（接口 `hasPlan === false`）：评分卡 / 右栏位置换成「プランを作る」引导，不留空洞；旧接口没有该字段时维持原样。 */
export const noPlan = (data: EventOverviewResponse): boolean => !data.signedOut && data.hasPlan === false;
/** 主催者の連絡先カード：サーバーが返したとき（申込済み）だけ。取り消し直後など手元の状態が変わったら隠す。 */
export const showHostContact = (data: EventOverviewResponse): boolean => !data.signedOut && data.hostContact !== undefined && canSeeHostContact(data.registration.status);

/**
 * 已结束活动：主办方卡底部一行——下一场（有就直接点进去，没有就「还没公布」）→ 关注主办方 · 接下来的活动。
 * 用户 11-12：右上角改放示例评估卡，这几项本来就是关于主办方的，挪进主办方卡。
 */
export function HostNext({ data, t, language, hideFollow = false }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; /** 主办方卡那一行已有「关注」：这里不再放第二个。 */ hideFollow?: boolean }) {
  const toast = useToast();
  const [following, setFollowing] = useState(Boolean(data.organizer.following));
  const [busy, setBusy] = useState(false);
  const next = data.organizer.next ?? null;
  const organizerId = data.organizer.organizerId ?? null;
  const toggle = async () => {
    if (!organizerId || busy) return;
    setBusy(true);
    const result = await journeyApi.follow(organizerId, !following);
    setBusy(false);
    if (result.ok) setFollowing(!following); else toast.error(assessTranslator(language)("genericError"));
  };
  const here = `/app/events/${encodeURIComponent(data.eventId)}`;
  return (
    <div className={x.hostNext} data-detail-ended="">
      <div className={styles.lbl}>{t("endedNextLbl")}</div>
      {next ? (
        <a className={x.endedNext} href={`/app/events/${encodeURIComponent(next.eventId)}`} data-detail-ended-next={next.eventId}>
          <span className={`${styles.emo} ${styles.t_lav}`}>{data.organizer.emoji ?? data.emoji}</span>
          <span className={x.endedNextText}><b>{next.title}</b><span className={styles.lbl}>{eventRange(next.startsAt, null, language)}</span></span>
          <Icon name="right" size={16} />
        </a>
      ) : <b className={x.endedNone}>{t("endedNoNext")}</b>}
      <div className={x.hostNextActions}>
        {hideFollow ? null : data.signedOut ? (
          <a className={`btn ${styles.btn} ${styles.sm}`} href={`/app/account/login?next=${encodeURIComponent(here)}`}>{t("endedLoginFollow")}</a>
        ) : organizerId ? (
          <button type="button" className={`btn ${styles.btn} ${styles.sm}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()} data-detail-ended-follow="">{following ? t("following") : t("endedFollowHost")}</button>
        ) : null}
        <a className={x.endedFoot} href={data.signedOut ? "/app/events" : "/app/events?tab=discover"}>{t("endedSeeUpcoming")}<Icon name="right" size={16} /></a>
      </div>
    </div>
  );
}

/** 「あなたに関係すること」位置的引导去向：未登录 → 登录后回到这场；已登录没计划 → 设定目标。 */
function relevanceGuideCta(data: EventOverviewResponse, t: JourneyT) {
  return data.signedOut
    ? { href: `/app/account/login?next=${encodeURIComponent(`/app/events/${encodeURIComponent(data.eventId)}`)}`, label: t("mockAssessLogin") }
    : { href: "/app/tasks?tab=plan", label: t("setGoal") };
}

/**
 * 没有「あなたに関係すること」可算（未登录 / 没有计划）时右上角的引导卡：小标题 + 一句 + 一个按钮。
 * 2026-11-15 去分数：不再画马赛克分数。
 */
export function RelevanceGuideCard({ data, t, language, className }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; className?: string }) {
  const cta = relevanceGuideCta(data, t);
  return (
    <div className={`${styles.card} ${x.noPlan} ${className ?? ""}`} data-detail-relevance-guide="">
      <div className={styles.lbl}>{relevanceTitle(language)}</div>
      <b className={x.noPlanTitle}>{data.signedOut ? t("relLoginTitle") : t("noPlanScoreTitle")}</b>
      <a className={`btn ${styles.btn} ${styles.primary} ${x.noPlanBtn}`} href={cta.href}>{data.signedOut ? null : <Icon name="target" size={16} />}{cta.label}</a>
    </div>
  );
}

/** 手机：封面下同一个引导（一行：小标题 + 按钮）。 */
function RelevanceGuideBar({ data, t, language }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage }) {
  const cta = relevanceGuideCta(data, t);
  return (
    <div className={x.pScore} data-detail-relevance-guide="">
      <div className={x.pScoreRow}>
        <div className={x.pGrow}><div className={styles.lbl}>{relevanceTitle(language)}</div><b className={x.pGuideTitle}>{data.signedOut ? t("relLoginTitle") : t("noPlanScoreTitle")}</b></div>
        <a className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} href={cta.href}>{cta.label}</a>
      </div>
    </div>
  );
}

/**
 * 名单锁着（roster-policy A：报名确定前）——参照 Meetup 未登录时的 Attendees 行：第一张是主办方（本来就公开，带「主办」标签），
 * 后面是马赛克卡，最后一张是一叠模糊头像 +N。马赛克纯装饰：服务端不给任何参加者数据（与 Meetup 把真姓发到浏览器再 CSS 模糊不同），
 * 所以开发者工具里也读不到谁来了。卡里不放报名按钮：页头 / 手机底部已有（同屏不放两个同样的 CTA）。
 */
function RosterGate({ data, t, wide }: { data: EventOverviewResponse; t: JourneyT; wide?: boolean }) {
  const { ended } = useDetailTiming(data);
  const total = data.attendeeCounts.all;
  // 和报名后的名单同一套小卡（.pgrid / .pmini，头像 38）：桌面 2 行 × 4 = 8 张，手机 2 × 2 = 4 张。主办方 + 马赛克 + 「+N」。
  const slots = (wide ? 8 : 4) - 1;
  const masked = total <= slots ? total : slots - 1;
  const rest = total - masked;
  return (
    <>
      {/* 未登录：只给人数（不提知り合い）、按钮是「ログインして参加登録」（b12 #394）。 */}
      <div className={styles.cardH}><h3>{t("tabPeople")}</h3><span className={styles.lbl}>{ended ? t("pastRegistrationCount", { n: total }) : data.signedOut ? t("rosterCountsOnly", { n: total }) : t("rosterCounts", { k: data.attendeeCounts.known, n: total })}</span></div>
      <div className={`${x.pgrid} ${wide ? "" : x.pgrid2}`} data-roster-gate="">
        <div className={x.pmini} data-roster-host="">
          <div className={`${x.av} ${x.c1} ${x.avEmoji}`}>{data.organizer.emoji ?? data.emoji}</div>
          <div className={x.meta}><b>{hostName(data, t)}</b><span>{[t("hostTag"), data.organizer.editions ? t("hostEditions", { n: data.organizer.editions }) : null].filter(Boolean).join(" · ")}</span></div>
        </div>
        {Array.from({ length: masked }, (_, index) => (
          <div key={index} className={x.pmini} aria-hidden="true" data-roster-masked="">
            <div className={`${x.av} ${x.mosaic} ${x[`mosaic${index % 4}`]}`} />
            <div className={x.meta}><i className={`${x.mosaicBar} ${x.mosaicName}`} /><i className={`${x.mosaicBar} ${x.mosaicRole}`} /></div>
          </div>
        ))}
        {rest > 0 ? (
          <div className={x.pmini} data-roster-more="">
            <div className={x.mosaicStack} aria-hidden="true">{[1, 2, 3].map((tone) => <i key={tone} className={`${x.mosaic} ${x[`mosaic${tone}`]}`} />)}</div>
            <div className={x.meta}><b>+{rest}</b></div>
          </div>
        ) : null}
      </div>
    </>
  );
}

const pad2 = (value: number) => String(value).padStart(2, "0");
/** 「10/25」（以往活动行）。 */
export const monthDayPadded = (iso: string | null | undefined) => { const p = parts(iso); return p ? `${pad2(p.month)}/${pad2(p.day)}` : ""; };

/**
 * 议程卡（2026-11-15，event-detail-agenda-proposal ① ②）：封面下一整行，总是显示。一行 = 时间 + 标题，说明在标题下一行小字。
 * 以前建的 / 外部导入的活动可能没有议程：卡片照常放，里面一行灰字。
 */
export function AgendaCard({ data, t, className, cardRef }: { data: EventOverviewResponse; t: JourneyT; className?: string; cardRef?: React.Ref<HTMLDivElement> }) {
  const s = parts(data.startsAt);
  const e = parts(data.endsAt);
  const range = s ? `${s.hm}${e ? `–${e.hm}` : ""}` : "";
  return (
    <div ref={cardRef} className={`${styles.card} ${x.agCard} ${className ?? ""}`} data-detail-agenda={data.agenda.length}>
      <div className={styles.cardH}><h3>{t("tabAgenda")}</h3>{range ? <span className={styles.lbl}>{range}</span> : null}</div>
      {data.agenda.length ? (
        <div className={x.ag}>
          {data.agenda.map((item, index) => (
            <Fragment key={`${index}-${item.at}`}><time>{item.at}</time><div className={x.agTi}><span>{item.title}</span>{item.detail ? <small>{item.detail}</small> : null}</div></Fragment>
          ))}
        </div>
      ) : <div className={x.agEmpty} data-agenda-empty="">{t("agendaEmpty")}</div>}
    </div>
  );
}

/**
 * 右栏第一张卡（2026-11-15）：上面「和你有关」（事实行；未登录 / 没计划 = 一句 + 一个按钮），下面「可能见到的人」。
 * 没人报名时人这部分只一行「还没有人报名」。名单锁着（报名确定前）只给人数一句。
 */
export function MeetCard({ data, t, language, className }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; className?: string }) {
  const { ended } = useDetailTiming(data);
  const guide = data.signedOut || noPlan(data);
  const rows = guide ? [] : relevanceRows(data.assessment?.relevance, language);
  const cta = relevanceGuideCta(data, t);
  const total = data.attendeeCounts.all;
  const shown = data.attendees.slice(0, 4);
  const speakers = shown.length ? [] : data.speakerCandidates ?? [];
  return (
    <div className={`${styles.card} ${x.meetCard} ${className ?? ""}`} data-detail-meet="">
      <h4 className={x.railCardH}>{relevanceTitle(language)}</h4>
      {guide ? (
        <div className={x.meetGuide} data-detail-relevance-guide="">
          <span>{data.signedOut ? t("relLoginTitle") : t("noPlanScoreTitle")}</span>
          <a className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} href={cta.href}>{data.signedOut ? null : <Icon name="target" size={16} />}{cta.label}</a>
        </div>
      ) : rows.length ? <div className={x.meetRows}><RelevanceRows rows={rows} /></div> : null}
      <div className={x.railSub}><span>{t("meetTitle")}</span>{shown.length && total > shown.length ? <a href="#detail-people" data-detail-meet-all="">{t("meetAll", { n: total })}<span aria-hidden> ›</span></a> : null}</div>
      {total === 0 ? <div className={x.meetNone} data-detail-meet-none="">{t(ended ? "pastNoRoster" : "meetNone")}</div>
        : data.rosterLocked ? <div className={x.meetGate} data-rail-gate=""><b>{t("railGateTitle", { n: data.attendeeCounts.planFit })}</b><span>{t(ended ? "pastRosterGate" : "railGateBody")}</span></div>
          : (
            <div className={x.meetList} data-detail-meet-list={shown.length}>
              {shown.map((person, index) => (
                <div key={person.attendeeId} className={x.meetLi} data-detail-meet-person={person.wanted ? "wanted" : person.known ? "known" : ""}>
                  <div className={`${x.av} ${x.avSm} ${person.known ? x.c4 : avTone(index)}`}>{person.initial}</div>
                  <div className={x.meta}><b>{person.name}</b><span>{person.known ? t("personMyContact") : [person.org, person.role].filter(Boolean).join(" · ")}</span></div>
                  {person.wanted ? <span className={`${styles.chip} ${styles.c_lav}`}>{t("legendWanted")}</span> : person.known ? <span className={`${styles.chip} ${styles.c_teal}`}>{t("tagKnown")}</span> : null}
                </div>
              ))}
              {speakers.map((speaker, index) => (
                <div key={speaker.name} className={x.meetLi}>
                  <div className={`${x.av} ${x.avSm} ${avTone(SPEAKER_TONES[index % SPEAKER_TONES.length]!)}`}>{speaker.name.charAt(0)}</div>
                  <div className={x.meta}><b>{speaker.name}</b><span>{speaker.note}</span></div>
                </div>
              ))}
              {data.assessmentPeopleUnknown || !shown.length ? <div className={x.meetNone}>{t(ended ? "pastNoRoster" : "waitingPublic")}</div> : null}
            </div>
          )}
    </div>
  );
}

/**
 * 主办方卡（2026-11-15，原来中间的整行主办方卡挪到右栏）：emoji + 名字 + 一行「办过 N 场 · 平均 N 人参加 · 你去过 N 次」+ 关注；
 * 一句简介（有才显示）；「以往活动」最近两场（可点）+「主办方页面 ›」。已结束的活动下面再接「下一场」。
 */
export function HostCard({ data, t, language, className, heading = true }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; className?: string; heading?: boolean }) {
  const { ended } = useDetailTiming(data);
  const toast = useToast();
  const organizer = data.organizer;
  const [following, setFollowing] = useState(Boolean(organizer.following));
  const [busy, setBusy] = useState(false);
  const organizerId = organizer.organizerId ?? null;
  const toggle = async () => {
    if (!organizerId || busy) return;
    setBusy(true);
    const result = await journeyApi.follow(organizerId, !following);
    setBusy(false);
    if (result.ok) setFollowing(!following); else toast.error(assessTranslator(language)("genericError"));
  };
  const here = `/app/events/${encodeURIComponent(data.eventId)}`;
  // 「你去过 N 次」是个人数据：未登录（服务端不给）不写；0 次也不写。
  const stats = [
    organizer.editions ? t("hostRanN", { n: organizer.editions }) : null,
    typeof organizer.averageAttendance === "number" && organizer.averageAttendance > 0 ? t("hostAvgN", { n: organizer.averageAttendance }) : null,
    !data.signedOut && typeof organizer.myAttendance === "number" && organizer.myAttendance > 0 ? t("hostYouN", { n: organizer.myAttendance }) : null,
  ].filter(Boolean).join(" · ");
  const past = (organizer.past ?? []).slice(0, 2);
  const page = organizer.slug ? `/app/o/${encodeURIComponent(organizer.slug)}` : null;
  return (
    <div id="detail-host" className={`${styles.card} ${x.hostCard} ${className ?? ""}`} data-detail-host="">
      {heading ? <h4 className={x.railCardH}>{t("tabHost")}</h4> : null}
      <div className={x.orgRow}>
        <span className={`${styles.emo} ${styles.t_lav} ${x.orgEmo}`}>{organizer.emoji ?? data.emoji}</span>
        <div className={x.meta}><b>{hostName(data, t)}</b>{stats ? <span data-detail-host-stats="">{stats}</span> : null}</div>
        {data.signedOut ? <a className={`btn ${styles.btn} ${styles.sm} ${x.followBtn}`} href={`/app/account/login?next=${encodeURIComponent(here)}`}>{t("hostFollow")}</a>
          : organizerId ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.followBtn}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()} data-detail-follow="">{following ? t("following") : t("hostFollow")}</button> : null}
      </div>
      {organizer.bio ? <div className={x.orgBio} data-detail-host-bio="">{organizer.bio}</div> : null}
      {past.length || page ? <div className={x.railSub}><span>{past.length ? t("hostPast") : ""}</span>{page ? <a href={page} data-detail-host-page="">{t("hostPage")}<span aria-hidden> ›</span></a> : null}</div> : null}
      {past.map((event) => (
        <a key={event.eventId} className={x.pastRow} href={`/app/events/${encodeURIComponent(event.eventId)}`} data-detail-host-past={event.eventId}>
          <span className={x.pastDate}>{monthDayPadded(event.startsAt)}</span>
          <span className={x.pastTitle}>{event.title}</span>
          {event.attendance ? <span className={x.pastN}>{t("hostPastN", { n: event.attendance })}</span> : null}
        </a>
      ))}
      {ended ? <HostNext data={data} t={t} language={language} hideFollow /> : null}
    </div>
  );
}

/**
 * 右栏（2026-11-15 重排）：「和你有关 + 可能见到的人」→ 报名卡（紧跟，不再钉在底部）→（已报名）主催者の連絡先 → 主办方卡。
 */
export function DetailRail({ data, t, onRegister, language = "ja", toast }: { data: EventOverviewResponse; t: JourneyT; onRegister: () => void; language?: OrbitLanguage; toast?: ReturnType<typeof useToast> }) {
  const { ended, canRegister } = useDetailTiming(data);
  return (
    <div className={`${styles.rail} ${d.rail} ${x.detailRail}`} data-detail-rail="">
      <MeetCard data={data} t={t} language={language} />
      {ended ? <span className={styles.chip}>{t("liveEnded")}</span> : data.registration.status === "none" && canRegister ? (
        <div className={`${styles.card} ${x.cta}`} data-detail-register="">
          <b>{t("ctaTitle")}</b>
          <div className={`${styles.lbl} ${x.ctaSub}`}>{t("ctaSub")}</div>
          <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.block}`} onClick={onRegister}>{t("ctaStart")}</button>
        </div>
      ) : data.registration.status === "registered" || data.registration.status === "pending_review" ? (
        /* b12 #378：已报名时 = 参加予定状态卡（报名卡的位置）。 */
        <div className={`${styles.card} ${x.cta}`} data-detail-going="">
          <div className={`${styles.row} ${styles.between}`}><b>{t("goingCardTitle")}</b><span className={`${styles.chip} ${data.registration.status === "registered" ? styles.c_teal : styles.c_lav}`}>{data.registration.status === "registered" ? t("statusConfirmed") : t("statusReview")}</span></div>
          <div className={`${styles.lbl} ${x.goingLine}`}>{t("goingCardLine", { venue: (data.venue ?? "").split(/\s+/)[0] ?? "", when: eventRange(data.startsAt, null, language) })}</div>
        </div>
      ) : null}
      {showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} className={x.contactRail} toast={toast} /> : null}
      <HostCard data={data} t={t} language={language} />
    </div>
  );
}

const seedOf = (person: EventOverviewAttendee): AttendeeSeed => ({ attendeeId: person.attendeeId, initial: person.initial, name: person.name, org: person.org ?? null, role: person.role ?? null });
/** 参加者卡能不能点开详情：已登录、名单可见（非 rosterLocked）。 */
export const canOpenPeople = (data: EventOverviewResponse): boolean => !data.signedOut && !data.rosterLocked;

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

/** `onOpenPerson`：参加者行可点开「参加者の詳細」（只在能看到名单的已登录详情页传；公开页不传）。 */
export function PhoneDetailBody({ data, language, t, onRegister, onOpenPerson }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; onRegister: () => void; onOpenPerson?: (seed: AttendeeSeed) => void }) {
  const { ended, canRegister } = useDetailTiming(data);
  const toast = useToast();
  // ★ 保存 = 记成 R26 的评估（出现在「評価」列表），同一活动重复保存由服务端按来源去重。
  const save = async () => {
    // 未登录（公开页）：保存要账号，先去登录再回到这场。
    if (data.signedOut) { window.location.assign(`/app/account/login?next=${encodeURIComponent(`/app/events/${encodeURIComponent(data.eventId)}`)}`); return; }
    const created = await eventsApi.create({ eventId: data.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) toast.success(t("savedToAssess")); else toast.error(assessTranslator(language)("genericError"));
  };
  const [tab, setTab] = useState<"intro" | "agenda" | "host" | "people">("intro");
  const [filter, setFilter] = useState<"planFit" | "known" | "all">("planFit");
  const people = data.attendees.filter((person) => (filter === "planFit" ? person.planFit : filter === "known" ? person.known : true));
  const facts = [
    { icon: "calendar" as const, text: eventRange(data.startsAt, data.endsAt, language) },
    { icon: "pin" as const, text: data.venue ?? "—" },
    { icon: "ticket" as const, text: [feeText(data.priceYen, t), data.capacity ? t("capacityN", { n: data.capacity }) : null, data.review ? t("reviewYes") : null].filter(Boolean).join(" · ") || "—" },
  ];
  const known = data.knownAttendees;
  return (
    <div className={x.phone} data-event-detail={data.eventId} data-detail-phone="">
      <div className={`${styles.card} ${x.pCover}`}>
        {data.coverUrl ? (
          <div className={r.pCoverPhotoWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（Blob / 站内路径），尺寸已在服务端裁成 2:1 */}
            <img className={r.coverPhoto} src={data.coverUrl} alt="" data-detail-cover-photo="" />
            {!ended && data.deadlineSoon && typeof data.remaining === "number" ? <span className={`${styles.chip} ${x.pDeadline} ${r.onImg}`}>{t("deadlineChip", { n: data.remaining })}</span> : null}
          </div>
        ) : (
          <div className={x.pCoverArt}>
            <span className={`${styles.emo} ${x.pCoverEmo}`}>{data.emoji}</span>
            {!ended && data.deadlineSoon && typeof data.remaining === "number" ? <span className={`${styles.chip} ${x.pDeadline}`}>{t("deadlineChip", { n: data.remaining })}</span> : null}
          </div>
        )}
        <div className={x.pCoverBody}>
          <div className={styles.lbl}>{hostName(data, t)}</div>
          {ended ? <span className={styles.chip}>{t("liveEnded")}</span> : null}
          <b className={x.pTitle}>{data.title}</b>
          <div className={x.pFacts}>{facts.map((fact) => <div key={fact.icon}><Icon name={fact.icon} size={16} />{fact.text}</div>)}</div>
        </div>
      </div>
      {ended && data.venueRecord ? (
        <a className={`${styles.card} ${r.pEntry}`} href={`/app/events/${encodeURIComponent(data.eventId)}/live`} data-detail-record-entry="">
          <span className={`${styles.emo} ${styles.t_lav}`}><Icon name="layers" size={20} /></span><b>{t("venueRecord")}</b><Icon name="right" size={16} />
        </a>
      ) : null}
      {data.signedOut || noPlan(data) ? <RelevanceGuideBar data={data} t={t} language={language} /> : <RelevanceCard relevance={data.assessment?.relevance} language={language} className={x.pRel} />}
      {showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} /> : null}
      <div className={x.pTabs} role="tablist">
        {(["intro", "agenda", "host", "people"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn ${x.pTab} ${tab === key ? x.pTabOn : ""}`} data-detail-tab={key} onClick={() => setTab(key)}>
            {t(key === "intro" ? "tabIntro" : key === "agenda" ? "tabAgenda" : key === "host" ? "tabHost" : "tabPeople")}{key === "people" ? <small>{data.attendeeCounts.all}</small> : null}
          </button>
        ))}
      </div>
      {tab === "intro" ? <div className={`${styles.card} ${styles.sub} ${x.pText}`}><EventDescription text={data.description} t={t} /></div> : null}
      {tab === "agenda" ? <AgendaCard data={data} t={t} /> : null}
      {tab === "host" ? <HostCard data={data} t={t} language={language} heading={false} /> : null}
      {tab === "people" && data.rosterLocked && data.attendeeCounts.all > 0 ? <div className={`${styles.card} ${x.pGateCard}`}><RosterGate data={data} t={t} /></div> : null}
      {tab === "people" && !(data.rosterLocked && data.attendeeCounts.all > 0) ? (
        <>
          <div className={`${styles.seg} ${x.pSeg}`} role="tablist">
            {([["planFit", t("segPlanFit", { n: data.attendeeCounts.planFit })], ["known", t("segKnown", { n: data.attendeeCounts.known })], ["all", t("segAll", { n: data.attendeeCounts.all })]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} className={`btn ${styles.segBtn} ${filter === key ? styles.segOn : ""}`} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          {people.length ? (
            <div className={`${styles.card} ${x.pPeople}`} data-detail-people="">
              {people.map((person, index) => {
                const inner = (
                  <>
                    <div className={`${x.av} ${avTone(index)}`}>{person.initial}</div>
                    <div className={x.pMeta}><b>{person.name}</b><span>{[person.org, person.role].filter(Boolean).join(" · ")}</span>{person.note ? <span className={x.pNote}>{person.note}</span> : null}</div>
                    {person.wanted ? <span className={`${styles.chip} ${styles.c_lav}`}>{t("legendWanted")}</span> : null}
                    {onOpenPerson ? <span className={r.chev}><Icon name="right" size={16} /></span> : null}
                  </>
                );
                return onOpenPerson ? (
                  <button key={person.attendeeId} type="button" className={`btn ${x.pLi} ${r.pLiBtn}`} data-detail-person={person.attendeeId} onClick={() => onOpenPerson(seedOf(person))}>{inner}</button>
                ) : <div key={person.attendeeId} className={x.pLi}>{inner}</div>;
              })}
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
      {!ended && data.registration.status === "none" && canRegister ? (
        <div className={x.ctabar} data-detail-cta="">
          <button type="button" className={`btn ${x.ctaSave}`} aria-label={t("saveEvent")} onClick={() => void save()}><Icon name="star" size={20} /></button>
          <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.ctaMain}`} onClick={onRegister}>{t("ctaRegisterAi")}</button>
        </div>
      ) : null}
    </div>
  );
}

/** `onSeeAll`：「すべて見る」去取全部公开参加者（取过就不再显示按钮；其余人没有公开资料）。 */
/** `contactInBody`：右栏没有显示（< 1280）时，主催者の連絡先卡片放在正文里。 */
/** `railShown`：右栏（DetailRail）在显示——「和你有关 + 可能见到的人」与主办方卡都在右栏；否则（公开页 / < 1280）放在议程下面。 */
/** `onOpenPerson` / `selectedPersonId`：参加者卡可点开「参加者の詳細」（名单可见时；公开页不传）。 */
export function EventDetailBody({ data, language, t, signedOutAside, onSeeAll, onRegister, contactInBody = false, railShown = false, onOpenPerson, selectedPersonId = null }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; signedOutAside?: ReactNode; onSeeAll?: () => void; onRegister?: () => void; contactInBody?: boolean; railShown?: boolean; onOpenPerson?: (seed: AttendeeSeed) => void; selectedPersonId?: string | null }) {
  const { ended } = useDetailTiming(data);
  const at = assessTranslator(language);
  const toast = useToast();
  const [tab, setTab] = useState<"intro" | "agenda" | "host" | "people">("intro");
  const agendaRef = useRef<HTMLDivElement | null>(null);
  const peopleRef = useRef<HTMLDivElement | null>(null);
  const choose = (next: typeof tab) => {
    setTab(next);
    // 主办方卡在右栏（或议程下面），按 id 找。
    if (next === "host") { document.getElementById("detail-host")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const ref = next === "agenda" ? agendaRef : next === "people" ? peopleRef : null;
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const capacity = data.capacity ? (data.remaining !== null && data.remaining !== undefined && data.remaining < data.capacity && data.attendeeCounts.all > 0 ? t("capacityLeft", { left: data.remaining, n: data.capacity }) : data.review ? t("capacityReview", { n: data.capacity }) : String(data.capacity)) : "—";
  const notify = async () => {
    const created = await eventsApi.create({ eventId: data.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) toast.success(t("notifyOn")); else toast.error(at("genericError"));
  };
  // 2026-11-15：封面 + 介绍占满中间整行（右边那一格去掉）；下面固定是议程卡。
  return (
    <div className={styles.wgrid} data-event-detail={data.eventId}>
      <div className={`${styles.card} ${styles.span12} ${x.coverCard}`}>
        {data.coverUrl
          // eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（Blob / 站内路径），服务端已裁成 2:1
          ? <img className={r.coverPhoto} src={data.coverUrl} alt="" data-detail-cover-photo="" />
          : <div className={x.cover}><span className={`${styles.emo} ${x.coverEmo}`}>{data.emoji}</span></div>}
        <div className={x.coverBody}>
          {ended ? <span className={styles.chip}>{t("liveEnded")}</span> : null}
          <div className={x.facts}>
            <div><div className={styles.lbl}>{t("fDate")}</div><b>{eventRange(data.startsAt, data.endsAt, language)}</b></div>
            <div><div className={styles.lbl}>{t("fPlace")}</div><b>{data.venue ?? "—"}</b></div>
            <div><div className={styles.lbl}>{t("fFee")}</div><b>{feeText(data.priceYen, t) ?? "—"}</b></div>
            <div><div className={styles.lbl}>{t("fCapacity")}</div><b>{capacity}</b></div>
          </div>
          <UnderlineTabs className={x.utabs} value={tab} onChange={choose}
            tabs={(["intro", "agenda", "host", "people"] as const).map((key) => ({ key, label: t(key === "intro" ? "tabIntro" : key === "agenda" ? "tabAgenda" : key === "host" ? "tabHost" : "tabPeople"), count: key === "people" ? data.attendeeCounts.all : undefined }))} />
          <EventDescription text={data.description} t={t} className={`${styles.sub} ${x.intro}`} />
        </div>
      </div>
      {contactInBody && showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} className={styles.span12} /> : null}
      <AgendaCard data={data} t={t} className={styles.span12} cardRef={agendaRef} />
      {railShown ? null : (
        <>
          {data.signedOut && !ended && signedOutAside ? <div className={x.span6}>{signedOutAside}</div> : <MeetCard data={data} t={t} language={language} className={x.span6} />}
          <HostCard data={data} t={t} language={language} className={x.span6} />
        </>
      )}
      {data.rosterLocked && data.attendeeCounts.all > 0 ? (
        <div ref={peopleRef} id="detail-people" className={`${styles.card} ${styles.span12}`} data-detail-people="">
          <RosterGate data={data} t={t} wide />
        </div>
      ) : (
      <div ref={peopleRef} id="detail-people" className={`${styles.card} ${styles.span12}`} data-detail-people="">
        <div className={styles.cardH}><h3>{t("peopleTitle", { n: data.attendeeCounts.all })}</h3><span className={styles.lbl}>{data.attendeeCounts.all === 0 && data.attendeesPublicAt ? t("publicFrom", { date: monthDaySlash(data.attendeesPublicAt) }) : t("publicOnly")}</span></div>
        {data.attendeeCounts.all === 0 && ended ? <div className={`${x.ghostRow} ${x.tall}`} data-past-no-roster=""><i />{t("pastNoRoster")}</div> : data.attendeeCounts.all === 0 ? (
          <>
            <div className={`${x.ghostRow} ${x.tall}`}><i />{t("ghostPeople")}</div>
            <div className={`${x.ghostRow} ${x.tall}`}><i />{t("ghostKnown")}</div>
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.moreBtn}`} onClick={() => void notify()}><Icon name="bell" size={16} />{t("notifyWhenPublic")}</button>
          </>
        ) : (
          <>
            <div className={x.pgrid}>
              {data.attendees.map((person, index) => (onOpenPerson ? (
                <button key={person.attendeeId} type="button" className={`btn ${x.pmini} ${r.pick} ${selectedPersonId === person.attendeeId ? r.pickOn : ""}`} aria-pressed={selectedPersonId === person.attendeeId} data-detail-person={person.attendeeId} onClick={() => onOpenPerson(seedOf(person))}>
                  <div className={`${x.av} ${avTone(index)}`}>{person.initial}</div><div className={x.meta}><b>{person.name}</b><span>{person.org}</span></div><span className={r.chev}><Icon name="right" size={16} /></span>
                </button>
              ) : (
                <div key={person.attendeeId} className={x.pmini}><div className={`${x.av} ${avTone(index)}`}>{person.initial}</div><div className={x.meta}><b>{person.name}</b><span>{person.org}</span></div></div>
              )))}
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
  const { ended, canRegister } = useDetailTiming(data);
  const holding = !ended && (data?.registration.status === "registered" || data?.registration.status === "pending_review" || data?.registration.status === "waitlisted");
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
  // 2026-11-20 参加者の詳細：≥1280 换掉右栏（✕ 回到原右栏），< 1280 用抽屉。
  const personDetail = usePersonDetail();
  const openPerson = data && canOpenPeople(data) ? personDetail.open : undefined;
  const recordHref = `/app/events/${encodeURIComponent(eventId)}/live`;
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
      {ended ? (data?.venueRecord ? <a className={`btn ${styles.btn} ${x.accent}`} href={recordHref} data-detail-record=""><Icon name="layers" size={16} />{t("venueRecord")}</a> : status === "attended" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/after`}>{t("goAfter")}</a> : <span className={styles.chip}>{t("liveEnded")}</span>) : status === "none" && canRegister ? <button type="button" className={`btn ${styles.btn} ${x.accent}`} onClick={register}>{t("register")}</button>
        : status === "registered" || status === "pending_review" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/prep`}>{t("goPrep")}</a>
          : status === "attended" ? <a className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${encodeURIComponent(eventId)}/after`}>{t("goAfter")}</a>
            : <span className={styles.chip}>{statusLabel}</span>}
    </div>
  );
  const person = data ? personRailOrDrawer({ close: personDetail.close, eventId, fallbackRail: wide ? <DetailRail data={data} t={t} onRegister={register} language={language} toast={toast} /> : false, language, person: personDetail.person, t, wide: wide && !phone }) : { drawer: null, rail: false as const };
  return (
    <>
      <ShellPage
        title={phone ? "" : data?.title ?? ""}
        subtitle={phone ? undefined : data ? hostName(data, t) : ""}
        left={<a className={`btn ${x.rbtn}`} href="/app/events?tab=discover" aria-label={t("back")}><Icon name="left" size={16} /></a>}
        right={phone ? <button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void share()}><Icon name="share" size={20} /></button> : right}
        rightRail={wide && data ? person.rail : false}
        phoneBare={phone}
      />
      {missing ? <div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div> : data ? (phone ? <PhoneDetailBody data={data} language={language} t={t} onRegister={register} onOpenPerson={openPerson} /> : <EventDetailBody data={data} language={language} t={t} onRegister={register} contactInBody={!wide} railShown={wide} onOpenPerson={openPerson} selectedPersonId={personDetail.selectedId} {...(allLoaded ? {} : { onSeeAll: () => void seeAll() })} />) : null}
      {person.drawer}
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
