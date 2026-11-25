"use client";

// R27 イベント詳細。2026-11-21 改单页（docs/designs/redesign-2026-10/event-detail-ia-proposal.html 方案 A，用户拍板 W1 / W2）：
// 去掉 紹介 / アジェンダ / 主催 / 参加者 四个 tab，一页从上往下读完：封面 → 紹介 → アジェンダ → 参加者（→ 主催，< 1280 / 手机）。
// ≥1280 右栏 = 参加卡（唯一主按钮）→ あなたに関係すること → 主催；768–1279 主按钮在页头；< 768 在底部固定条。
// 数据：GET /api/events/[id]/overview（主办统计、只公开资料的参加者、「あなたに関係すること」）。2026-11-15 起不显示分数。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import type { EventOverviewAttendee, EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventJoinCancelResultSchema, eventJoinTentativeResultSchema } from "../../../../../shared/api-schema/event-join";
import { ShellPage } from "../shell/slots";
import { FRESH } from "../../orbit-last-answer";
import { JourneyRailSkeleton, JourneySkeleton } from "./JourneySkeleton";
import { useJourneyAnswer } from "./use-journey-answer";
import { Icon, Orbit2026Scope, RetryCard, ToastProvider, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { feeText, journeyTranslator, type JourneyT } from "./DiscoverTab";
import { RelevanceRows, relevanceRows, relevanceTitle } from "./Relevance";
import { CancelDialog } from "./CancelDialog";
import { EventDescription } from "./EventDescription";
import { HostContactCard } from "./HostContact";
import { canSeeHostContact } from "../../../../../shared/compute/host-contact";
import { eventsApi, eventsCall, newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import { authRoutePath } from "../auth-public/auth-model";
import { currentReturnPath, useCurrentReturnPath } from "../auth-public/current-return-path";
import { useDetailTiming, useLiveClock } from "./detail-timing";
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
/** 「11/26（木）」（参加卡的締切）。 */
function monthDayWeek(iso: string | null | undefined, language: OrbitLanguage): string {
  const p = parts(iso);
  if (!p) return "";
  const wd = WEEK[language][p.wd];
  return language === "en" ? `${wd} ${p.month}/${p.day}` : `${p.month}/${p.day}（${wd}）`;
}

const AV_TONES = ["c1", "c3", "c4", "c2", "c3", "c5", "c2", "c3"] as const;
export function avTone(index: number): string { return x[AV_TONES[index % AV_TONES.length]!]!; }
/** 主办方没有公开名字（接口只给匿名占位 `unnamed`）时显示通用「主催者」，不把哈希串当名字。 */
export function hostName(data: Pick<EventOverviewResponse, "organizer">, t: JourneyT): string { return data.organizer.unnamed ? t("hostUnnamed") : data.organizer.name; }
/** 已登录但没有计划（接口 `hasPlan === false`）：「あなたに関係すること」换成「目標を設定する」引导；旧接口没有该字段时维持原样。 */
export const noPlan = (data: EventOverviewResponse): boolean => !data.signedOut && data.hasPlan === false;
/** 主催者の連絡先カード：サーバーが返したとき（申込済み）だけ。取り消し直後など手元の状態が変わったら隠す。 */
export const showHostContact = (data: EventOverviewResponse): boolean => !data.signedOut && data.hostContact !== undefined && canSeeHostContact(data.registration.status);
/** 参加者卡能不能点开详情 / 进全名单页：已登录、名单可见（非 rosterLocked）。 */
export const canOpenPeople = (data: EventOverviewResponse): boolean => !data.signedOut && !data.rosterLocked;
/** 主催区块只在主办方公开了名字时出（与 App 一致）；匿名占位不出整块。 */
const showHost = (data: EventOverviewResponse): boolean => !data.organizer.unnamed && Boolean(data.organizer.name?.trim());

const pad2 = (value: number) => String(value).padStart(2, "0");
/** 「10/25」（以往活动行）。 */
export const monthDayPadded = (iso: string | null | undefined) => { const p = parts(iso); return p ? `${pad2(p.month)}/${pad2(p.day)}` : ""; };

/** 把文案里的数字加粗（「参加予定 <b>128</b>名」）。 */
function boldN(text: string, n: number): ReactNode {
  const value = String(n);
  const at = text.indexOf(value);
  return at < 0 ? text : <>{text.slice(0, at)}<b>{value}</b>{text.slice(at + value.length)}</>;
}

/** 已报名、活动没结束：⋯ 菜单（カレンダーに追加 / 参加用プロフィールを編集 / 参加を取り消す）的动作。 */
export type DetailActions = { onCalendar: () => void; onCancel: () => void };

/** ⋯ 菜单（b12 #378 / #380）：≥1280 在右栏参加卡里，768–1279 在页头，手机在参加予定卡里。 */
function MoreMenu({ eventId, t, actions, variant }: { eventId: string; t: JourneyT; actions: DetailActions; variant: "head" | "card" | "phone" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target as HTMLElement | null)?.closest("[data-detail-menu],[data-detail-more]")) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const button = variant === "head" ? x.rbtn : variant === "card" ? x.dots : `${x.dots} ${x.dotsSm}`;
  return (
    <span className={x.moreWrap}>
      <button type="button" className={`btn ${button}`} aria-label={t("moreActions")} aria-haspopup="menu" aria-expanded={open} data-detail-more="" onClick={() => setOpen((value) => !value)}><Icon name="more" size={16} /></button>
      {open ? (
        <div className={x.dmenu} role="menu" data-detail-menu="">
          <button type="button" role="menuitem" className={`btn ${x.mi}`} onClick={() => { setOpen(false); actions.onCalendar(); }}><Icon name="calendar" size={16} /><span>{t("addToCalendar")}</span></button>
          <Link role="menuitem" className={`btn ${x.mi}`} href={`/app/events/${encodeURIComponent(eventId)}/register`}><Icon name="pen" size={16} /><span>{t("editJoinProfile")}</span></Link>
          <button type="button" role="menuitem" className={`btn ${x.mi} ${x.miDanger}`} onClick={() => { setOpen(false); actions.onCancel(); }}><Icon name="x" size={16} /><span>{t("cancelDo")}</span></button>
        </div>
      ) : null}
    </span>
  );
}

/** 活动阶段（只在封面出现一次）：終了 / 開催中 / 受付終了 / 締切間近；正常受付中 = null。不含「你的报名状态」（那在参加卡里说）。 */
type Stage = "ended" | "live" | "closed" | "soon";
function useStage(data: EventOverviewResponse): Stage | null {
  const { ended, canRegister } = useDetailTiming(data);
  const { live } = useLiveClock(data);
  return ended ? "ended" : live ? "live" : !canRegister ? "closed" : data.deadlineSoon ? "soon" : null;
}
function StageChip({ stage, t }: { stage: Stage; t: JourneyT }) {
  const label = stage === "ended" ? t("liveEnded") : stage === "live" ? t("stageLive") : stage === "closed" ? t("stageClosed") : t("stageSoon");
  return <span className={`${styles.chip} ${stage === "live" || stage === "soon" ? styles.c_warn : ""}`} data-detail-stage={stage}>{label}</span>;
}

/** 封面卡（Web）：图 / 渐变 + 阶段 chip + 日時 / 場所 / 参加費 / 定員。没填的格子不出（不放「—」），場所没填 =「未定」。 */
function CoverCard({ data, t, language }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage }) {
  const { ended } = useDetailTiming(data);
  const stage = useStage(data);
  const fee = feeText(data.priceYen, t);
  const capacity = data.capacity
    ? (!ended && typeof data.remaining === "number" && data.remaining < data.capacity && data.attendeeCounts.all > 0 ? t("capacityLeft", { left: data.remaining, n: data.capacity }) : t("peopleN", { n: data.capacity }))
    : null;
  const facts = [
    { key: "date", label: t("fDate"), value: eventRange(data.startsAt, data.endsAt, language) },
    { key: "place", label: t("fPlace"), value: data.venue?.trim() || t("venueTbd") },
    fee ? { key: "fee", label: t("fFee"), value: fee } : null,
    capacity ? { key: "capacity", label: t("fCapacity"), value: capacity } : null,
  ].filter((fact): fact is { key: string; label: string; value: string } => Boolean(fact));
  return (
    <div className={`${styles.card} ${styles.span12} ${x.coverCard}`} data-detail-cover="">
      {data.coverUrl
        // eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（Blob / 站内路径），服务端已裁成 2:1
        ? <img className={r.coverPhoto} src={data.coverUrl} alt="" data-detail-cover-photo="" />
        : <div className={x.cover}><span className={`${styles.emo} ${x.coverEmo}`}>{data.emoji}</span></div>}
      <div className={x.coverBody}>
        {stage ? <div className={x.stageRow}><StageChip stage={stage} t={t} /></div> : null}
        <div className={x.facts} style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }} data-detail-facts={facts.length}>
          {facts.map((fact) => <div key={fact.key}><div className={styles.lbl}>{fact.label}</div><b className={fact.key === "place" ? x.ell : undefined}>{fact.value}</b></div>)}
        </div>
      </div>
    </div>
  );
}

/** 「あなたに関係すること」的引导去向：未登录 → 登录后回到这场；已登录没计划 → 设定目标。 */
function relevanceGuideCta(data: EventOverviewResponse, t: JourneyT, returnPath: string) {
  return data.signedOut
    ? { href: authRoutePath("login", returnPath), label: t("navLogin") }
    : { href: "/app/tasks?tab=plan", label: t("setGoal") };
}

/**
 * 「あなたに関係すること」：只放事实行（≤3，规则计算）。未登录 / 没计划 = 一句 + 一个按钮；一行都算不出 → 整卡不出。
 * 已结束不出（调用方判断）。≥1280 在右栏，< 1280 / 手机在封面下。
 */
export function DetailRelevance({ data, t, language, className, phone = false }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; className?: string; phone?: boolean }) {
  const returnPath = useCurrentReturnPath(`/app/events/${encodeURIComponent(data.eventId)}`);
  const guide = data.signedOut || noPlan(data);
  const rows = guide ? [] : relevanceRows(data.assessment?.relevance, language).slice(0, 3);
  if (!guide && rows.length === 0) return null;
  const cta = relevanceGuideCta(data, t, returnPath);
  return (
    <div className={`${styles.card} ${x.relCard} ${className ?? ""}`} data-detail-relevance="">
      {phone ? <div className={`${styles.lbl} ${x.pRelLbl}`}>{relevanceTitle(language)}</div> : <h4 className={x.cardH4}>{relevanceTitle(language)}</h4>}
      {guide ? (
        <div className={x.relGuide} data-detail-relevance-guide="">
          <div className={styles.sub}>{data.signedOut ? t("relLoginTitle") : t("noPlanScoreTitle")}</div>
          <a className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} href={cta.href}>{data.signedOut ? null : <Icon name="target" size={16} />}{cta.label}</a>
        </div>
      ) : <div className={x.relRows}><RelevanceRows rows={rows} /></div>}
    </div>
  );
}

/** 手机的区块标题（sec-h）：卡片外面一行大字，右边可带一个小字。 */
function SecH({ title, right }: { title: string; right?: string }) {
  return <div className={x.secH}><h3>{title}</h3>{right ? <span className={styles.lbl}>{right}</span> : null}</div>;
}

/** 紹介：Markdown；超过 6 行渐隐折叠「続きを読む」原地展开。没有介绍整块不出。 */
function IntroCard({ data, t, className, phone = false }: { data: EventOverviewResponse; t: JourneyT; className?: string; phone?: boolean }) {
  if (!data.description?.trim()) return null;
  if (phone) {
    return (
      <>
        <SecH title={t("tabIntro")} />
        <div id="detail-intro" className={`${styles.card} ${x.pCard}`} data-detail-intro=""><EventDescription text={data.description} t={t} className={x.intro} toggle="link" /></div>
      </>
    );
  }
  return (
    <div id="detail-intro" className={`${styles.card} ${className ?? ""}`} data-detail-intro="">
      <div className={styles.cardH}><h3>{t("tabIntro")}</h3></div>
      <EventDescription text={data.description} t={t} className={x.intro} />
    </div>
  );
}

/** 议程超过这么多项就折叠「すべて見る」。 */
export const AGENDA_FOLD = 5;
/** 活动中当前那一项：最后一个「开始时刻 ≤ 现在（东京）」的项；还没到第一项 → -1。 */
export function currentAgendaIndex(agenda: readonly { at: string }[], now: number): number {
  const p = parts(new Date(now).toISOString());
  if (!p) return -1;
  const [h, m] = p.hm.split(":").map(Number);
  const nowMin = h! * 60 + m!;
  let current = -1;
  agenda.forEach((item, index) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(item.at.trim());
    if (match && Number(match[1]) * 60 + Number(match[2]) <= nowMin) current = index;
  });
  return current;
}

/** アジェンダ：一行 = 时间 + 标题（说明在下一行小字）。超过 5 项折叠「すべて見る」；活动中高亮当前项。没有议程整块不出。 */
export function AgendaCard({ data, t, className, phone = false }: { data: EventOverviewResponse; t: JourneyT; className?: string; phone?: boolean }) {
  const [open, setOpen] = useState(false);
  const { live, now } = useLiveClock(data);
  if (!data.agenda.length) return null;
  const current = live ? currentAgendaIndex(data.agenda, now) : -1;
  const folded = data.agenda.length > AGENDA_FOLD && !open;
  const items = folded ? data.agenda.slice(0, AGENDA_FOLD) : data.agenda;
  const count = t("agendaCount", { n: data.agenda.length });
  if (phone) {
    return (
      <>
        <SecH title={t("tabAgenda")} right={count} />
        <div id="detail-agenda" className={`${styles.card} ${x.pCard}`} data-detail-agenda={data.agenda.length}>
          {items.map((item, index) => (
            <div key={`${index}-${item.at}`} className={`${x.tl} ${index === current ? x.now : ""}`} data-agenda-now={index === current ? "" : undefined}>
              <span className={x.tat}>{item.at}</span><div><b>{item.title}</b>{item.detail ? <span className={styles.lbl}>{item.detail}</span> : null}</div>
            </div>
          ))}
          {folded ? <button type="button" className={`btn ${x.moreLink}`} data-detail-agenda-all="" onClick={() => setOpen(true)}>{t("agendaAll")}<Icon name="down" size={16} /></button> : null}
        </div>
      </>
    );
  }
  return (
    <div id="detail-agenda" className={`${styles.card} ${x.agCard} ${className ?? ""}`} data-detail-agenda={data.agenda.length}>
      <div className={styles.cardH}><h3>{t("tabAgenda")}</h3><span className={styles.lbl}>{count}</span></div>
      <div className={x.ag}>
        {items.map((item, index) => (
          <Fragment key={`${index}-${item.at}`}><time className={index === current ? x.now : undefined}>{item.at}</time><div className={`${x.agTi} ${index === current ? x.now : ""}`} data-agenda-now={index === current ? "" : undefined}><b>{item.title}</b>{item.detail ? <small>{item.detail}</small> : null}</div></Fragment>
        ))}
      </div>
      {folded ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.agMore}`} data-detail-agenda-all="" onClick={() => setOpen(true)}>{t("agendaAll")}<Icon name="down" size={16} /></button> : null}
    </div>
  );
}

const seedOf = (person: EventOverviewAttendee): AttendeeSeed => ({ attendeeId: person.attendeeId, initial: person.initial, name: person.name, org: person.org ?? null, role: person.role ?? null });
const personLine = (person: Pick<EventOverviewAttendee, "org" | "role">) => [person.org, person.role].filter(Boolean).join(" · ");
export const peopleHref = (eventId: string) => `/app/events/${encodeURIComponent(eventId)}/people`;

/**
 * 参加者（详情页里的预览，与 App 同结构）：头像叠 + 一行「プランに合う N · 知り合い N」+ 最多 3 位符合计划的人（没有就取名单前 3 人）
 * + 知り合い 一行 +「全員を見る N名」→ 全名单页。名单锁着 = 马赛克头像叠 + 人数 + 一句（不放按钮，同屏已有）。0 人 = 一行字。
 */
function PeopleCard({ data, t, className, phone = false, onOpenPerson, selectedPersonId = null }: { data: EventOverviewResponse; t: JourneyT; className?: string; phone?: boolean; onOpenPerson?: (seed: AttendeeSeed) => void; selectedPersonId?: string | null }) {
  const { ended } = useDetailTiming(data);
  const total = data.attendeeCounts.all;
  const locked = Boolean(data.rosterLocked) && total > 0;
  let body: ReactNode;
  if (total === 0) {
    body = <div className={x.wempty} data-detail-people-none="">{t(ended ? "pastNoRoster" : "meetNone")}</div>;
  } else if (locked) {
    body = (
      <>
        <div className={x.pplTop}>
          <div className={x.avs} aria-hidden="true">{Array.from({ length: Math.min(5, total) }, (_, index) => <div key={index} className={`${x.av} ${x.avSm} ${x.mosaicAv}`} data-roster-masked="" />)}</div>
          <span className={x.counts}><span>{boldN(t(ended ? "pplRegistered" : "pplGoing", { n: total }), total)}</span>{!data.signedOut && data.attendeeCounts.known > 0 ? <span>{boldN(t("pplKnownN", { n: data.attendeeCounts.known }), data.attendeeCounts.known)}</span> : null}</span>
        </div>
        <div className={x.gateNote} data-roster-gate=""><Icon name="users" size={16} />{t(ended ? "pastRosterGate" : "railGateBody")}</div>
      </>
    );
  } else {
    const fit = data.attendees.filter((person) => person.planFit);
    const picks = (fit.length ? fit : data.attendees).slice(0, 3);
    const known = data.knownAttendees;
    const indexOf = (person: EventOverviewAttendee) => Math.max(0, data.attendees.indexOf(person));
    const tile = (person: EventOverviewAttendee) => {
      const tone = avTone(indexOf(person));
      const selected = selectedPersonId === person.attendeeId;
      if (phone) {
        const inner = <><div className={`${x.av} ${tone}`}>{person.initial}</div><div className={x.meta}><b>{person.name}</b><span>{personLine(person)}</span></div>{onOpenPerson ? <span className={r.chev}><Icon name="right" size={16} /></span> : null}</>;
        return onOpenPerson
          ? <button key={person.attendeeId} type="button" className={`btn ${x.li} ${r.pLiBtn}`} data-detail-person={person.attendeeId} onClick={() => onOpenPerson(seedOf(person))}>{inner}</button>
          : <div key={person.attendeeId} className={x.li} data-detail-person-row={person.attendeeId}>{inner}</div>;
      }
      const inner = <><div className={`${x.av} ${tone}`}>{person.initial}</div><div className={x.meta}><b>{person.name}</b><span>{personLine(person)}</span></div>{onOpenPerson ? <span className={r.chev}><Icon name="right" size={16} /></span> : null}</>;
      return onOpenPerson
        ? <button key={person.attendeeId} type="button" className={`btn ${x.pmini} ${r.pick} ${selected ? r.pickOn : ""}`} aria-pressed={selected} data-detail-person={person.attendeeId} onClick={() => onOpenPerson(seedOf(person))}>{inner}</button>
        : <div key={person.attendeeId} className={x.pmini} data-detail-person-row={person.attendeeId}>{inner}</div>;
    };
    const counts = [
      !data.signedOut ? boldN(t("pplPlanFit", { n: data.attendeeCounts.planFit }), data.attendeeCounts.planFit) : null,
      !data.signedOut ? boldN(t("pplKnown", { n: data.attendeeCounts.known }), data.attendeeCounts.known) : null,
    ].filter(Boolean);
    body = (
      <>
        <div className={x.pplTop}>
          <div className={x.avs}>{data.attendees.slice(0, 5).map((person, index) => <div key={person.attendeeId} className={`${x.av} ${x.avSm} ${avTone(index)}`}>{person.initial}</div>)}</div>
          <span className={x.counts} data-detail-people-counts="">{counts.length ? counts.map((item, index) => <span key={index}>{item}</span>) : <span>{boldN(t(ended ? "pplRegistered" : "pplGoing", { n: total }), total)}</span>}</span>
        </div>
        {picks.length ? (
          <>
            {fit.length ? <div className={`${styles.lbl} ${x.wantLbl}`}>{t("wantedPeople")}</div> : <div className={x.wantGap} />}
            {phone ? <div className={x.list} data-detail-picks={picks.length}>{picks.map(tile)}</div> : <div className={`${x.pgrid} ${x.pgrid3}`} data-detail-picks={picks.length}>{picks.map(tile)}</div>}
          </>
        ) : null}
        {known.length ? (
          <div className={x.knownRow} data-detail-known={known.length}>
            <div className={x.avs}>{known.slice(0, 3).map((person, index) => <div key={`${index}-${person.name}`} className={`${x.av} ${x.avSm} ${x[(["c2", "c4", "c3"] as const)[index % 3]!]}`}>{person.initial}</div>)}</div>
            <div className={x.knownText}><b>{t("knownAlsoN", { n: known.length })}</b><span className={styles.lbl}>{known.map((person) => `${t("honorific", { name: person.name.split(/\s+/)[0] ?? person.name })}${person.speaker ? t("speakerTag") : ""}`).join(" · ")}</span></div>
          </div>
        ) : null}
        {canOpenPeople(data) ? (
          <Link className={`btn ${styles.btn} ${phone ? x.allBlock : `${styles.sm} ${x.allBtn}`}`} href={peopleHref(data.eventId)} data-detail-people-all="">{t("seeEveryone", { n: total })}{phone ? null : <Icon name="right" size={16} />}</Link>
        ) : null}
      </>
    );
  }
  if (phone) {
    return (
      <>
        <SecH title={t("tabPeople")} />
        <div id="detail-people" className={`${styles.card} ${x.pCard}`} data-detail-people="">{body}</div>
      </>
    );
  }
  return (
    <div id="detail-people" className={`${styles.card} ${className ?? ""}`} data-detail-people="">
      <div className={styles.cardH}><h3>{t("tabPeople")}</h3></div>
      {body}
    </div>
  );
}

/**
 * 主催卡：emoji + 名字 + 一行「開催 N回 · 平均 N人参加 · あなたは N回」+ フォロー；一句简介；「過去のイベント」最近两场（可点）+「主催者ページ ›」。
 * 已结束的活动下面接「次回」一行。`compact`（手机）：不放简介、以往只放一场。
 */
export function HostCard({ data, t, language, className, heading = true, compact = false }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; className?: string; heading?: boolean; compact?: boolean }) {
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
  const here = useCurrentReturnPath(`/app/events/${encodeURIComponent(data.eventId)}`);
  // 「你去过 N 次」是个人数据：未登录（服务端不给）不写；0 次也不写。
  const stats = [
    organizer.editions ? t("hostRanN", { n: organizer.editions }) : null,
    typeof organizer.averageAttendance === "number" && organizer.averageAttendance > 0 ? t("hostAvgN", { n: organizer.averageAttendance }) : null,
    !data.signedOut && typeof organizer.myAttendance === "number" && organizer.myAttendance > 0 ? t("hostYouN", { n: organizer.myAttendance }) : null,
  ].filter(Boolean).join(" · ");
  const past = (organizer.past ?? []).slice(0, compact ? 1 : 2);
  const page = organizer.slug ? `/app/o/${encodeURIComponent(organizer.slug)}` : null;
  const next = organizer.next ?? null;
  return (
    <div id="detail-host" className={`${styles.card} ${x.hostCard} ${className ?? ""}`} data-detail-host="">
      {heading ? <h4 className={x.cardH4}>{t("tabHost")}</h4> : null}
      <div className={x.orgRow}>
        <span className={`${styles.emo} ${styles.t_lav}`}>{organizer.emoji ?? data.emoji}</span>
        <div className={x.meta}><b>{hostName(data, t)}</b>{stats ? <span data-detail-host-stats="">{stats}</span> : null}</div>
        {data.signedOut ? <a className={`btn ${styles.btn} ${styles.sm} ${x.followBtn}`} href={authRoutePath("login", here)}>{t("hostFollow")}</a>
          : organizerId ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${x.followBtn}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()} data-detail-follow="">{following ? t("following") : t("hostFollow")}</button> : null}
      </div>
      {!compact && organizer.bio ? <div className={`${styles.sub} ${x.orgBio}`} data-detail-host-bio="">{organizer.bio}</div> : null}
      {past.length || page ? <div className={x.railSub}><span>{past.length ? t("hostPast") : ""}</span>{page ? <Link href={page} data-detail-host-page="">{t("hostPage")}<span aria-hidden> ›</span></Link> : null}</div> : null}
      {past.map((event) => (
        <Link key={event.eventId} className={x.pastRow} href={`/app/events/${encodeURIComponent(event.eventId)}`} data-detail-host-past={event.eventId}>
          <span className={x.pastDate}>{monthDayPadded(event.startsAt)}</span>
          <span className={x.pastTitle}>{event.title}</span>
          {event.attendance ? <span className={x.pastN}>{t("hostPastN", { n: event.attendance })}</span> : null}
        </Link>
      ))}
      {ended ? (
        <>
          <div className={`${x.railSub} ${x.nextSub}`} data-detail-ended=""><span>{t("endedNextLbl")}</span></div>
          {next ? (
            <Link className={x.pastRow} href={`/app/events/${encodeURIComponent(next.eventId)}`} data-detail-ended-next={next.eventId}>
              <span className={x.pastDate}>{monthDayPadded(next.startsAt)}</span><b className={x.pastTitle}>{next.title}</b><span className={x.pastN}><Icon name="right" size={16} /></span>
            </Link>
          ) : <div className={x.pastRow} data-detail-ended-none=""><span className={x.pastDate} /><span className={`${x.pastTitle} ${x.pastNone}`}>{t("endedNoNext")}</span></div>}
        </>
      ) : null}
    </div>
  );
}

/**
 * 右栏第一张「参加」卡（≥1280，唯一主按钮）：
 * 报名前 = 締切 / 審査 +「参加登録」；已报名 = 状态 chip +「会う準備へ」+ ⋯；活动中 =「会場モード」；
 * 已结束 =「参加しました」+「会場の記録」（没有记录、参加过 →「ふりかえり」；没报名 → 整卡不出）。截止且没报名 → 不出（封面 chip「受付終了」）。
 */
function JoinCard({ data, t, language, onRegister, actions }: { data: EventOverviewResponse; t: JourneyT; language: OrbitLanguage; onRegister: () => void; actions?: DetailActions }) {
  const { ended, canRegister } = useDetailTiming(data);
  const { live } = useLiveClock(data);
  const status = data.registration.status;
  const id = encodeURIComponent(data.eventId);
  if (ended) {
    const go = data.venueRecord ? { href: `/app/events/${id}/live`, icon: true, label: t("venueRecord") } : status === "attended" ? { href: `/app/events/${id}/after`, icon: false, label: t("goAfter") } : null;
    if (!go) return null;
    return (
      <div className={`${styles.card} ${x.joinCard}`} data-detail-join="ended">
        <div className={`${styles.row} ${styles.between}`}><b className={x.joinTtl}>{t("joinedTitle")}</b><span className={styles.lbl}>{monthDaySlash(data.startsAt)}</span></div>
        <Link className={`btn ${styles.btn} ${styles.primary} ${x.joinBtn}`} href={go.href} data-detail-record={data.venueRecord ? "" : undefined}>{go.icon ? <Icon name="layers" size={16} /> : null}{go.label}</Link>
      </div>
    );
  }
  if (status === "none") {
    if (!canRegister) return null;
    const deadline = monthDayWeek(data.registrationClosesAt, language);
    return (
      <div className={`${styles.card} ${x.joinCard}`} data-detail-register="">
        <b className={x.joinTtl}>{t("joinTitle")}</b>
        {deadline || data.review ? (
          <div className={x.kvs}>
            {deadline ? <div className={x.kv}><span>{t("kvDeadline")}</span><b>{deadline}</b></div> : null}
            {data.review ? <div className={x.kv}><span>{t("kvReview")}</span><b>{t("kvReviewYes")}</b></div> : null}
          </div>
        ) : null}
        <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.joinBtn}`} onClick={onRegister}>{t("register")}</button>
      </div>
    );
  }
  if (status === "registered" || status === "pending_review" || status === "waitlisted" || status === "attended") {
    const chip = status === "registered" ? <span className={`${styles.chip} ${styles.c_teal}`}>{t("stRegistered")}</span>
      : status === "pending_review" ? <span className={`${styles.chip} ${styles.c_lav}`}>{t("stPending")}</span>
        : status === "attended" ? <span className={`${styles.chip} ${styles.c_teal}`}>{t("stAttended")}</span>
          : <span className={styles.chip}>{t("stWaitlisted")}</span>;
    const main = live && (status === "registered" || status === "attended") ? <Link className={`btn ${styles.btn} ${styles.primary} ${x.joinMain}`} href={`/app/events/${id}/live`}>{t("goVenue")}</Link>
      : status === "registered" || status === "pending_review" ? <Link className={`btn ${styles.btn} ${styles.primary} ${x.joinMain}`} href={`/app/events/${id}/prep`}>{t("goPrep")}</Link> : null;
    const menu = actions && status !== "attended" && !live ? <MoreMenu eventId={data.eventId} t={t} actions={actions} variant="card" /> : null;
    return (
      <div className={`${styles.card} ${x.joinCard}`} data-detail-going="">
        <div className={`${styles.row} ${styles.between}`}><b className={x.joinTtl}>{t("goingCardTitle")}</b>{chip}</div>
        {main || menu ? <div className={x.joinRow}>{main}{menu}</div> : null}
      </div>
    );
  }
  // 取り消し済み / 今回は見送り：状态只在这里说一次。
  return (
    <div className={`${styles.card} ${x.joinCard}`} data-detail-join={status}>
      <div className={`${styles.row} ${styles.between}`}><b className={x.joinTtl}>{t("joinTitle")}</b><span className={styles.chip}>{t(status === "cancelled" ? "stCancelled" : "stRejected")}</span></div>
    </div>
  );
}

/** 右栏（≥1280）：参加卡 →（已报名）主催者の連絡先 → あなたに関係すること（结束后不出）→ 主催。 */
export function DetailRail({ data, t, onRegister, language = "ja", toast, actions }: { data: EventOverviewResponse; t: JourneyT; onRegister: () => void; language?: OrbitLanguage; toast?: ReturnType<typeof useToast>; actions?: DetailActions }) {
  const { ended } = useDetailTiming(data);
  return (
    <div className={`${styles.rail} ${d.rail} ${x.detailRail}`} data-detail-rail="">
      <JoinCard data={data} t={t} language={language} onRegister={onRegister} actions={actions} />
      {showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} toast={toast} /> : null}
      {ended ? null : <DetailRelevance data={data} t={t} language={language} />}
      {showHost(data) ? <HostCard data={data} t={t} language={language} /> : null}
    </div>
  );
}

/** < 768。 */
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

/**
 * < 768（P1–P7）：封面卡 →（状态卡）→ あなたに関係すること → 紹介 → アジェンダ → 参加者 → 主催；底部固定条一个主按钮。
 * `onOpenPerson`：参加者行可点开「参加者の詳細」（只在能看到名单的已登录详情页传；公开页不传）。
 */
export function PhoneDetailBody({ data, language, t, onRegister, onOpenPerson, actions }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; onRegister: () => void; onOpenPerson?: (seed: AttendeeSeed) => void; actions?: DetailActions }) {
  const { ended, canRegister } = useDetailTiming(data);
  const { live } = useLiveClock(data);
  const stage = useStage(data);
  const toast = useToast();
  // ★ 保存 = 记成 R26 的评估（出现在「評価」列表），同一活动重复保存由服务端按来源去重。
  const save = async () => {
    // 未登录（公开页）：保存要账号，先去登录再回到这场。
    if (data.signedOut) { window.location.assign(authRoutePath("login", currentReturnPath(`/app/events/${encodeURIComponent(data.eventId)}`))); return; }
    const created = await eventsApi.create({ eventId: data.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) toast.success(t("savedToAssess")); else toast.error(assessTranslator(language)("genericError"));
  };
  const status = data.registration.status;
  const id = encodeURIComponent(data.eventId);
  const facts = [
    { icon: "calendar" as const, text: eventRange(data.startsAt, data.endsAt, language) },
    { icon: "pin" as const, text: data.venue?.trim() || t("venueTbd") },
    { icon: "ticket" as const, text: [feeText(data.priceYen, t), data.capacity ? t("capacityN", { n: data.capacity }) : null, data.review ? t("reviewYes") : null].filter(Boolean).join(" · ") },
  ].filter((fact) => fact.text);
  const going = !ended && !live && (status === "registered" || status === "pending_review" || status === "waitlisted");
  const bar: { label: string; href?: string; onClick?: () => void; star?: boolean } | null = ended ? null
    : status === "none" ? (canRegister ? { label: data.signedOut ? t("signupRegister") : t("register"), onClick: onRegister, star: true } : null)
      : live && (status === "registered" || status === "attended") ? { href: `/app/events/${id}/live`, label: t("goVenue") }
        : status === "registered" || status === "pending_review" ? { href: `/app/events/${id}/prep`, label: t("goPrep") } : null;
  return (
    <div className={`${x.phone} ${bar ? x.phoneBar : ""}`} data-event-detail={data.eventId} data-detail-phone="">
      <div className={`${styles.card} ${x.pCover}`} data-detail-cover="">
        {data.coverUrl ? (
          <div className={r.pCoverPhotoWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（Blob / 站内路径），尺寸已在服务端裁成 2:1 */}
            <img className={r.coverPhoto} src={data.coverUrl} alt="" data-detail-cover-photo="" />
          </div>
        ) : (
          <div className={x.pCoverArt}><span className={`${styles.emo} ${x.pCoverEmo}`}>{data.emoji}</span></div>
        )}
        <div className={x.pCoverBody}>
          <div className={styles.lbl}>{hostName(data, t)}</div>
          <b className={x.pTitle}>{data.title}</b>
          {stage ? <div className={x.pStage}><StageChip stage={stage} t={t} /></div> : null}
          <div className={x.pFacts}>{facts.map((fact) => <div key={fact.icon}><Icon name={fact.icon} size={16} />{fact.text}</div>)}</div>
        </div>
      </div>
      {ended && data.venueRecord ? (
        <Link className={`${styles.card} ${r.pEntry}`} href={`/app/events/${id}/live`} data-detail-record-entry="">
          <span className={`${styles.emo} ${styles.t_lav}`}><Icon name="layers" size={20} /></span><b>{t("venueRecord")}</b><Icon name="right" size={16} />
        </Link>
      ) : null}
      {going ? (
        <div className={`${styles.card} ${x.pCard}`} data-detail-going="">
          <div className={`${styles.row} ${styles.between}`}>
            <b>{t("goingCardTitle")}</b>
            <span className={`${styles.row} ${x.pStatRight}`}>
              <span className={`${styles.chip} ${status === "registered" ? styles.c_teal : status === "pending_review" ? styles.c_lav : ""}`}>{t(status === "registered" ? "stRegistered" : status === "pending_review" ? "stPending" : "stWaitlisted")}</span>
              {actions ? <MoreMenu eventId={data.eventId} t={t} actions={actions} variant="phone" /> : null}
            </span>
          </div>
        </div>
      ) : null}
      {ended ? null : <DetailRelevance data={data} t={t} language={language} phone className={x.pCard} />}
      {showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} /> : null}
      <IntroCard data={data} t={t} phone />
      <AgendaCard data={data} t={t} phone />
      <PeopleCard data={data} t={t} phone onOpenPerson={onOpenPerson} />
      {showHost(data) ? <><SecH title={t("tabHost")} /><HostCard data={data} t={t} language={language} heading={false} compact className={x.pCard} /></> : null}
      {bar ? (
        <div className={x.ctabar} data-detail-cta="">
          {bar.star ? <button type="button" className={`btn ${x.ctaSave}`} aria-label={t("saveEvent")} onClick={() => void save()}><Icon name="star" size={20} /></button> : null}
          {bar.href ? <Link className={`btn ${styles.btn} ${styles.primary} ${x.ctaMain}`} href={bar.href}>{bar.label}</Link>
            : <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.ctaMain}`} onClick={bar.onClick}>{bar.label}</button>}
        </div>
      ) : null}
    </div>
  );
}

/**
 * ≥768 的主栏：封面 →（无右栏时）あなたに関係すること → 紹介 → アジェンダ → 参加者 →（无右栏时）主催。
 * `signedOutAside`：未登录且未结束时放在「あなたに関係すること」的位置（/register/〈コード〉着地页的参加コード卡）。
 * `contactInBody`：右栏没有显示（< 1280）时，主催者の連絡先卡片放在正文里。
 * `railShown`：右栏（DetailRail）在显示——关联与主办方卡都在右栏。
 * `onOpenPerson` / `selectedPersonId`：参加者卡可点开「参加者の詳細」（名单可见时；公开页不传）。
 */
export function EventDetailBody({ data, language, t, signedOutAside, contactInBody = false, railShown = false, onOpenPerson, selectedPersonId = null }: { data: EventOverviewResponse; language: OrbitLanguage; t: JourneyT; signedOutAside?: ReactNode; onRegister?: () => void; contactInBody?: boolean; railShown?: boolean; onOpenPerson?: (seed: AttendeeSeed) => void; selectedPersonId?: string | null }) {
  const { ended } = useDetailTiming(data);
  return (
    <div className={`${styles.wgrid} ${x.detailGrid}`} data-event-detail={data.eventId}>
      <CoverCard data={data} t={t} language={language} />
      {railShown || ended ? null : data.signedOut && signedOutAside ? <div className={styles.span12}>{signedOutAside}</div> : <DetailRelevance data={data} t={t} language={language} className={styles.span12} />}
      {contactInBody && showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} className={styles.span12} /> : null}
      <IntroCard data={data} t={t} className={styles.span12} />
      <AgendaCard data={data} t={t} className={styles.span12} />
      <PeopleCard data={data} t={t} className={styles.span12} onOpenPerson={onOpenPerson} selectedPersonId={selectedPersonId} />
      {railShown || !showHost(data) ? null : <HostCard data={data} t={t} language={language} className={styles.span12} />}
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

/** 旧链接兼容：?tab=intro / agenda / people / host 进来时滚到对应区块（tab 已经去掉）。 */
const TAB_TARGET: Record<string, string> = { agenda: "detail-agenda", host: "detail-host", intro: "detail-intro", people: "detail-people" };
function useLegacyTabScroll(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const target = TAB_TARGET[new URLSearchParams(window.location.search).get("tab") ?? ""];
    if (!target) return;
    // 紹介的折叠在渲染后才量高度，上面的区块还会变高：先滚一次，布局稳定后（350ms）再对一次；
    // 期间用户自己滚过就不再动。
    const go = () => document.getElementById(target)?.scrollIntoView({ block: "start" });
    let landed = -1;
    const frame = window.requestAnimationFrame(() => { go(); landed = window.scrollY; });
    const settle = window.setTimeout(() => { if (landed < 0 || Math.abs(window.scrollY - landed) < 2) go(); }, 350);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(settle); };
  }, [ready]);
}

function DetailInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const toast = useToast();
  const wide = useWide();
  const phone = usePhone();
  // 2026-11-21：上次的结果先画 + 新鲜期 + 请求共享（useJourneyAnswer）；没读到前画骨架。
  const answer = useJourneyAnswer(`events:detail:${eventId}`, () => journeyApi.overview(eventId), FRESH.list);
  const data = answer.data;
  const setData = answer.update;
  const missing = answer.failure === "not_found";
  const router = useRouter();
  const register = () => router.push(`/app/events/${encodeURIComponent(eventId)}/register`);
  useLegacyTabScroll(Boolean(data));
  // 参加の取り消し（b12 #374）：`?cancel=1` 打开确认框，只在已有报名时。
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const { ended, canRegister } = useDetailTiming(data);
  const { live } = useLiveClock(data);
  const holding = !ended && (data?.registration.status === "registered" || data?.registration.status === "pending_review" || data?.registration.status === "waitlisted");
  useEffect(() => {
    if (holding && new URLSearchParams(window.location.search).get("cancel") === "1") setCancelOpen(true);
  }, [holding]);
  const addCalendar = async () => {
    const res = await eventsCall(`/api/events/${encodeURIComponent(eventId)}/join/tentative`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }), method: "POST" }, eventJoinTentativeResultSchema);
    if (res.ok) toast.success(t("calendarAdded")); else toast.error(assessTranslator(language)("genericError"));
  };
  const actions: DetailActions | undefined = holding ? { onCalendar: () => void addCalendar(), onCancel: () => setCancelOpen(true) } : undefined;
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
  const id = encodeURIComponent(eventId);
  const shareButton = <button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void share()}><Icon name="share" size={phone ? 20 : 16} /></button>;
  // W2：≥1280 主按钮只在右栏参加卡（页头只留分享）；768–1279 没有右栏，主按钮在页头；< 768 在底部固定条。状态只说一次（不在页头放「終了」）。
  const headMain = ended ? (data?.venueRecord ? <Link className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${id}/live`} data-detail-record=""><Icon name="layers" size={16} />{t("venueRecord")}</Link> : status === "attended" ? <Link className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${id}/after`}>{t("goAfter")}</Link> : null)
    : status === "none" ? (canRegister ? <button type="button" className={`btn ${styles.btn} ${x.accent}`} onClick={register} data-detail-head-register="">{t("register")}</button> : null)
      : live && (status === "registered" || status === "attended") ? <Link className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${id}/live`}>{t("goVenue")}</Link>
        : status === "registered" || status === "pending_review" ? <Link className={`btn ${styles.btn} ${x.accent}`} href={`/app/events/${id}/prep`}>{t("goPrep")}</Link>
          : status === "waitlisted" ? <span className={styles.chip}>{t("stWaitlisted")}</span>
            : status === "cancelled" ? <span className={styles.chip}>{t("stCancelled")}</span>
              : status === "rejected" ? <span className={styles.chip}>{t("stRejected")}</span> : null;
  const right = phone || wide ? shareButton : (
    <div className={x.headRight}>
      {shareButton}
      {actions && !live ? <MoreMenu eventId={eventId} t={t} actions={actions} variant="head" /> : null}
      {headMain}
    </div>
  );
  const person = data ? personRailOrDrawer({ close: personDetail.close, eventId, fallbackRail: wide ? <DetailRail data={data} t={t} onRegister={register} language={language} toast={toast} actions={actions} /> : false, language, person: personDetail.person, t, wide: wide && !phone }) : { drawer: null, rail: false as const };
  return (
    <>
      <ShellPage
        title={phone ? "" : data?.title ?? ""}
        subtitle={phone ? undefined : data ? hostName(data, t) : ""}
        left={<Link className={`btn ${x.rbtn}`} href="/app/events?tab=discover" aria-label={t("back")}><Icon name="left" size={16} /></Link>}
        right={right}
        phoneBack="/app/events?tab=discover"
        phoneActions={[{ icon: "share", key: "share", label: t("share"), onClick: () => void share() }]}
        rightRail={wide ? (data ? person.rail : missing || answer.failure ? false : <JourneyRailSkeleton kind="detail" />) : false}
        phoneBare={phone}
      />
      {missing ? <div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div> : !data && answer.failure ? <RetryCard title={assessTranslator(language)("genericError")} onRetry={() => void answer.reload()} /> : !data ? <JourneySkeleton kind="detail" /> : data ? (phone ? <PhoneDetailBody data={data} language={language} t={t} onRegister={register} onOpenPerson={openPerson} actions={actions} /> : <EventDetailBody data={data} language={language} t={t} contactInBody={!wide} railShown={wide} onOpenPerson={openPerson} selectedPersonId={personDetail.selectedId} />) : null}
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
