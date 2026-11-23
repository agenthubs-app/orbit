"use client";

// 2026-11-21 参加者全名单页 /app/events/[id]/people（event-detail-ia-proposal A6 / P6；对标 connpass「参加者一覧」、Meetup Attendees「See all」）。
// 详情页「全員を見る N名」与会場の記録（记录为空）「参加者一覧」进这里。筛选 プランに合う / 知り合い / すべて + 搜索（名前・会社），
// 一次显示 32 人、滚到底再多显示 32 人。点人 = 右栏「参加者の詳細」（< 1280 抽屉），与详情页同一组件。
// 数据：GET /api/events/[id]/overview?attendees=all（不新增接口）。名单锁着 / 未登录：只给一句，不出名单。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import type { EventOverviewAttendee } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { FRESH } from "../../orbit-last-answer";
import { Icon, Orbit2026Scope, RetryCard, ToastProvider } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { journeyTranslator, type JourneyT } from "./DiscoverTab";
import { avTone, canOpenPeople, usePhone, useWide } from "./EventDetail";
import { personRailOrDrawer, usePersonDetail } from "./AttendeeProfile";
import { JourneySkeleton } from "./JourneySkeleton";
import { journeyApi } from "./journey-api";
import { useJourneyAnswer } from "./use-journey-answer";
import styles from "./events.module.css";
import x from "./detail.module.css";
import r from "./record.module.css";

export type PeopleFilter = "planFit" | "known" | "all";
/** 一次多显示多少人（滚到底再加）。 */
export const PEOPLE_PAGE = 32;

/** 筛选 + 搜索（名前・会社・役職，忽略大小写与前后空白）。 */
export function filterPeople(people: readonly EventOverviewAttendee[], filter: PeopleFilter, query: string): EventOverviewAttendee[] {
  const q = query.trim().toLowerCase();
  return people.filter((person) => (filter === "planFit" ? person.planFit : filter === "known" ? person.known : true)
    && (!q || [person.name, person.org, person.role].some((value) => value?.toLowerCase().includes(q))));
}

function PeopleInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t: JourneyT = useMemo(() => journeyTranslator(language), [language]);
  const wide = useWide();
  const phone = usePhone();
  const router = useRouter();
  const answer = useJourneyAnswer(`events:people:${eventId}`, () => journeyApi.overview(eventId, true), FRESH.list);
  const data = answer.data;
  const [chosen, setChosen] = useState<PeopleFilter | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PEOPLE_PAGE);
  // 默认「プランに合う」；一个都没有时默认「すべて」（不让第一眼是空列表）。
  const filter: PeopleFilter = chosen ?? (data && data.attendeeCounts.planFit > 0 ? "planFit" : "all");
  const people = useMemo(() => (data ? filterPeople(data.attendees, filter, query) : []), [data, filter, query]);
  useEffect(() => { setShown(PEOPLE_PAGE); }, [filter, query]);
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= people.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setShown((value) => value + PEOPLE_PAGE); }, { rootMargin: "240px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, people.length]);
  const personDetail = usePersonDetail();
  const detailHref = `/app/events/${encodeURIComponent(eventId)}`;
  // 返回：从详情页进来就退回（浏览器恢复原滚动位置）；直接打开本页时去详情页。
  const back = (event: MouseEvent<HTMLAnchorElement>) => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) { event.preventDefault(); router.back(); }
  };
  const total = data?.attendeeCounts.all ?? 0;
  const openable = data ? canOpenPeople(data) : false;
  const person = personRailOrDrawer({ close: personDetail.close, eventId, fallbackRail: false, language, person: personDetail.person, t, wide: wide && !phone });
  const segs: readonly [PeopleFilter, string][] = data ? [["planFit", t("segPlanFit", { n: data.attendeeCounts.planFit })], ["known", t("segKnown", { n: data.attendeeCounts.known })], ["all", t("segAll", { n: total })]] : [];

  let body;
  if (answer.failure === "not_found") body = <div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div>;
  else if (!data && answer.failure) body = <RetryCard title={assessTranslator(language)("genericError")} onRetry={() => void answer.reload()} />;
  else if (!data) body = <JourneySkeleton kind="people" />;
  else if (!openable) body = <div className={`${styles.card} ${x.peopleGate}`} data-people-gate=""><div className={x.gateNote}><Icon name="users" size={16} />{t("railGateBody")}</div><Link className={`btn ${styles.btn} ${styles.sm} ${x.allBtn}`} href={detailHref}>{t("back")}</Link></div>;
  else {
    const visible = people.slice(0, shown);
    const row = (item: EventOverviewAttendee, index: number) => {
      const selected = personDetail.selectedId === item.attendeeId;
      const line = [item.org, item.role].filter(Boolean).join(" · ");
      const inner = <><div className={`${x.av} ${avTone(index)}`}>{item.initial}</div><div className={x.meta}><b>{item.name}</b>{line ? <span>{line}</span> : null}</div><span className={r.chev}><Icon name="right" size={16} /></span></>;
      return phone
        ? <button key={item.attendeeId} type="button" className={`btn ${x.li} ${r.pLiBtn}`} data-people-person={item.attendeeId} onClick={() => personDetail.open({ attendeeId: item.attendeeId, initial: item.initial, name: item.name, org: item.org ?? null, role: item.role ?? null })}>{inner}</button>
        : <button key={item.attendeeId} type="button" className={`btn ${x.pmini} ${r.pick} ${selected ? r.pickOn : ""}`} aria-pressed={selected} data-people-person={item.attendeeId} onClick={() => personDetail.open({ attendeeId: item.attendeeId, initial: item.initial, name: item.name, org: item.org ?? null, role: item.role ?? null })}>{inner}</button>;
    };
    body = (
      <div className={x.peoplePage} data-event-people={eventId}>
        <div className={x.peopleBar}>
          <div className={`${styles.seg} ${x.peopleSeg}`} role="tablist">
            {segs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={`btn ${styles.segBtn} ${filter === key ? styles.segOn : ""}`} data-people-filter={key} onClick={() => setChosen(key)}>{label}</button>)}
          </div>
          <label className={x.peopleSearch}><Icon name="search" size={16} /><input value={query} placeholder={t("peopleSearch")} aria-label={t("peopleSearch")} onChange={(event) => setQuery(event.target.value)} data-people-search="" /></label>
        </div>
        {people.length === 0 ? <div className={`${styles.card} ${x.wempty} ${x.peopleEmpty}`} data-people-empty="">{t("peopleNoMatch")}</div>
          : phone ? <div className={`${styles.card} ${x.pCard} ${x.list} ${x.peopleList}`} data-people-list={people.length}>{visible.map(row)}</div>
            : <div className={`${styles.card} ${x.peopleCard}`}><div className={`${x.pgrid} ${x.pgrid3}`} data-people-list={people.length}>{visible.map(row)}</div></div>}
        {shown < people.length ? <div ref={sentinel} className={x.peopleMore} aria-hidden="true" /> : null}
      </div>
    );
  }
  return (
    <>
      <ShellPage
        title={data ? t("peoplePageTitle", { n: total }) : ""}
        subtitle={data?.title ?? ""}
        left={<Link className={`btn ${x.rbtn}`} href={detailHref} aria-label={t("back")} onClick={back}><Icon name="left" size={phone ? 20 : 16} /></Link>}
        phoneBack={detailHref}
        rightRail={wide && !phone ? person.rail : false}
      />
      {body}
      {person.drawer}
    </>
  );
}

export function EventPeopleScreen({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <PeopleInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
