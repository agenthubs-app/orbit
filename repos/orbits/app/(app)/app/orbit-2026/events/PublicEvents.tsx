"use client";

// R27（R26-08）未登录的イベント一覧 / 詳細（b12 #324 / #326 1440，#328 / #330 390）：b1 公开顶栏（lp-nav），没有分数 / コミュニティ /
// プランに効く；评估换成「ログインして行く価値を判定」。数据来自同一组接口的公开部分（/api/events/discover、/[id]/overview）。
import { useEffect, useMemo, useState } from "react";

import type { EventDiscoverResponse } from "../../../../../shared/contract/event-discover";
import type { EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Icon, Orbit2026Scope, ToastProvider } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { DEFAULT_DISCOVER_QUERY, discoverWhen, journeyTranslator, rowTone, type JourneyT } from "./DiscoverTab";
import { EventDetailBody, monthDaySlash } from "./EventDetail";
import { journeyApi } from "./journey-api";
import { useDetailTiming } from "./detail-timing";
import styles from "./events.module.css";
import x from "./detail.module.css";
import p from "./public.module.css";

const LOGIN = "/app/account/login";

export function PublicNav({ t }: { t: JourneyT }) {
  return (
    <nav className={p.lpNav} data-public-nav="">
      <a className={`${styles.row} ${p.brand}`} href="/" style={{ gap: 10 }}><span className={p.logo}>O</span><b>Orbit</b></a>
      <div className={`${styles.row} ${p.links}`}><a href="/#features">{t("navFeatures")}</a><a href="/#how">{t("navHowTo")}</a><a href="/app/events">{t("navEvents")}</a></div>
      <div className={styles.row} style={{ gap: 8 }}>
        <a className={`btn ${styles.btn} ${p.ghost}`} href={LOGIN}>{t("navLogin")}</a>
        <a className={`btn ${styles.btn} ${styles.primary}`} href="/app/account/signup">{t("navStart")}</a>
      </div>
    </nav>
  );
}

export function LoginAssessCard({ t, language, span }: { t: JourneyT; language: OrbitLanguage; span: "span12" | "span4" }) {
  const at = assessTranslator(language);
  return (
    <div className={`${styles.card} ${span === "span12" ? styles.span12 : styles.span4} ${p.loginCard}`} data-public-login="">
      <div className={styles.row} style={{ gap: 12 }}>
        <span className={`${styles.emo} ${styles.t_lav}`}>🔍</span>
        <div style={{ flex: 1 }}><b className={p.loginTitle}>{at("assessTitle")}</b><div className={styles.lbl}>{t("loginAssessSub")}</div></div>
        <a className={`btn ${styles.btn} ${styles.primary}`} href={LOGIN}>{t("loginAssessBtn")}</a>
      </div>
    </div>
  );
}

/** 公开活动页（未登录落地）：照旧「公開イベント · {month}月」= 今月 · 東京（DISCOVER-RULES 只改登录后的探す）。 */
const PUBLIC_LIST_QUERY = { ...DEFAULT_DISCOVER_QUERY, areas: ["tokyo"] as const, period: "this_month" as const };

function ListInner({ language, nowIso }: { language: OrbitLanguage; nowIso: string }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const [data, setData] = useState<EventDiscoverResponse | null>(null);
  useEffect(() => { void journeyApi.discover(PUBLIC_LIST_QUERY).then((result) => setData(result.ok ? result.data : null)); }, []);
  const month = new Date(Date.parse(nowIso) + 9 * 3_600_000).getUTCMonth() + 1;
  return (
    <div className={p.page}>
      <PublicNav t={t} />
      <div className={p.pubmain}>
        <div className={`${styles.cardH} ${p.head}`}><h3 className={p.headTitle}>{t("pubTitle")}</h3><span className={styles.lbl}>{t("pubSub", { month })}</span></div>
        <div className={styles.wgrid}>
          <LoginAssessCard t={t} language={language} span="span12" />
          {(data?.all ?? []).map((row, index) => (
            <a key={row.eventId} href={`/app${row.href}`} className={`${styles.evc} ${styles.span3} ${p.evc}`} data-public-card={row.eventId}>
              <div className={`${styles.row} ${styles.between}`}><span className={`${styles.emo} ${styles[`t_${rowTone({ verdict: "recommend" }, index).emo}`]}`}>{row.emoji}</span><span className={styles.chip}>{t("loginChip")}</span></div>
              <b className={p.evcTitle}>{row.title}</b>
              <div className={styles.lbl}>{[discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ")}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 参加コード卡（b12 #376）：码 · 发出方 · 期限 + 「ログインして参加登録」/「無料で登録して参加登録」，登录后回到 /register/〈コード〉再进报名。 */
function InviteCodeCard({ code, data, t }: { code: string; data: EventOverviewResponse; t: JourneyT }) {
  const { ended, canRegister } = useDetailTiming(data);
  const next = encodeURIComponent(`/app/register/${encodeURIComponent(code)}`);
  return (
    <div className={`${styles.card} ${styles.span4} ${p.codeCard}`} data-public-invite={code}>
      <div className={styles.lbl}>{t("inviteCodeLbl")}</div>
      <div className={p.code}>{code}</div>
      <div className={styles.lbl}>{t("inviteFrom", { date: monthDaySlash(data.registrationClosesAt), org: data.organizer.name })}</div>
      {canRegister ? <div className={p.codeActions}>
        <a className={`btn ${styles.btn} ${styles.primary}`} href={`${LOGIN}?next=${next}`}>{t("loginRegister")}</a>
        <a className={`btn ${styles.btn}`} href={`/app/account/signup?next=${next}`}>{t("signupRegister")}</a>
      </div> : <span className={styles.chip}>{t(ended ? "liveEnded" : "registrationClosed")}</span>}
      <div className={`${styles.lbl} ${p.codeNote}`}>{t("inviteNote")}</div>
    </div>
  );
}

function DetailInner({ eventId, language, inviteCode }: { eventId: string; language: OrbitLanguage; inviteCode?: string }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const [data, setData] = useState<EventOverviewResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const { ended, canRegister } = useDetailTiming(data);
  useEffect(() => { void journeyApi.overview(eventId).then((result) => { if (result.ok) setData({ ...result.data, signedOut: true }); else setMissing(true); }); }, [eventId]);
  return (
    <div className={p.page}>
      <PublicNav t={t} />
      <div className={p.pubmain}>
        <div className={p.mainhead}>
          <div className={p.l}><a className={`btn ${x.rbtn}`} href="/app/events" aria-label={t("back")}><Icon name="left" size={16} /></a></div>
          <div className={p.t}><b>{data?.title}</b><small>{data?.organizer.name}</small></div>
          <div className={p.r}>
            <button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void navigator.clipboard?.writeText(window.location.href).catch(() => undefined)}><Icon name="share" size={16} /></button>
            {canRegister ? <a className={`btn ${styles.btn} ${x.accent}`} href={`${LOGIN}?next=${encodeURIComponent(inviteCode ? `/app/register/${encodeURIComponent(inviteCode)}` : `/app/events/${eventId}/register`)}`}>{t("loginRegister")}</a> : data ? <span className={styles.chip}>{t(ended ? "liveEnded" : "registrationClosed")}</span> : null}
          </div>
        </div>
        {missing ? <div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div> : data ? <EventDetailBody data={data} language={language} t={t} onRegister={() => window.location.assign(`${LOGIN}?next=${encodeURIComponent(inviteCode ? `/app/register/${encodeURIComponent(inviteCode)}` : `/app/events/${eventId}/register`)}`)} signedOutAside={inviteCode ? <InviteCodeCard code={inviteCode} data={data} t={t} /> : undefined} /> : null}
      </div>
    </div>
  );
}

export function PublicEventList({ language, nowIso }: { language: OrbitLanguage; nowIso: string }) {
  return <Orbit2026Scope language={language} className={p.scope}><ToastProvider><ListInner language={language} nowIso={nowIso} /></ToastProvider></Orbit2026Scope>;
}

export function PublicEventDetail({ eventId, language, inviteCode }: { eventId: string; language: OrbitLanguage; inviteCode?: string }) {
  return <Orbit2026Scope language={language} className={p.scope}><ToastProvider><DetailInner eventId={eventId} language={language} inviteCode={inviteCode} /></ToastProvider></Orbit2026Scope>;
}

/** 参加コードが見つからない（/register/〈コード〉）：公开顶栏 + 一张说明卡 + 去活动列表。 */
export function PublicInviteInvalid({ language }: { language: OrbitLanguage }) {
  const t = journeyTranslator(language);
  return (
    <Orbit2026Scope language={language} className={p.scope}>
      <div className={p.page}>
        <PublicNav t={t} />
        <div className={p.pubmain}>
          <div className={`${styles.card} ${x.missing}`} data-public-invite-invalid="">
            <b>{t("inviteInvalid")}</b>
            <div style={{ marginTop: 12 }}><a className={`btn ${styles.btn}`} href="/app/events">{t("navEvents")}</a></div>
          </div>
        </div>
      </div>
    </Orbit2026Scope>
  );
}
