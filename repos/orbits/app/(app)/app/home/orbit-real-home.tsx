"use client";

import { useState } from "react";

import { AccountBottomTab, AccountTopNav, orbitNavigate, StatusBar } from "../orbit-account-shell";
import type { OrbitHomeViewModel } from "../orbit-home-route-view-model";
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { Cover, gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";

type HomeFilter = "active" | "all" | "ended" | "upcoming";
type HomeMode = "events" | "hub";

const tz = { timeZone: "Asia/Tokyo" };
const homeFilters: Array<[HomeFilter, string]> = [["all", "全部"], ["active", "进行中"], ["upcoming", "即将"], ["ended", "历史"]];
const hubEntryCards = [
  { g: "g-emerald", href: "/home/profile", icon: "user", mobileSub: "复用", mobileTitle: "画像", sub: "报名各场自动复用", title: "通用画像" },
  { g: "g-rose", href: "/home/cards", icon: "wallet", mobileSub: "CRM", mobileTitle: "名片夹", sub: "会后人脉 CRM", title: "名片夹" },
  { g: "g-sky", href: "/home/schedule", icon: "clock", mobileSub: "约见", mobileTitle: "日程", sub: "约见与交往记录", title: "日程安排" },
];

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", ...tz }).format(date);
}

function homeDate(startsAt: string) {
  const date = parseDate(startsAt);
  if (!date) return { day: "", month: "待定", time: "时间待定" };

  return {
    day: fmtDay(date),
    month: fmtMonth(date),
    time: new Intl.DateTimeFormat("zh-CN", { day: "numeric", hour: "2-digit", minute: "2-digit", month: "long", ...tz }).format(date),
  };
}

function statusCounts(events: OrbitLandingEventView[]) {
  return {
    active: events.filter((event) => event.status === "active").length,
    all: events.length,
    ended: events.filter((event) => event.status === "ended").length,
    upcoming: events.filter((event) => event.status === "upcoming").length,
  };
}

function enterEvent() {
  orbitNavigate("/party");
}

function eventPlace(event: OrbitLandingEventView) {
  return event.place || event.venue || "地点待定";
}

function HomeEventRow({ event }: { event: OrbitLandingEventView }) {
  const date = homeDate(event.startsAt);
  const place = eventPlace(event);
  const canEnter = event.status === "active";
  const name = event.name;
  const content = (
    <>
      <Cover g={gradientFromString(event.code || name)} monogram={{ size: 22, text: name.slice(0, 1) }} style={{ borderRadius: 12, flexShrink: 0, height: 52, opacity: event.status === "ended" ? 0.72 : 1, width: 52 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="h-section" style={{ color: "var(--ink)", display: "block", fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ alignItems: "center", color: "var(--text-3)", display: "flex", flexWrap: "wrap", fontSize: 12.5, gap: 8, marginTop: 3 }}>
          <span style={{ alignItems: "center", display: "flex", gap: 4 }}><Icon color="var(--text-3)" name="clock" size={13} />{date.time}</span>
          {place ? <span style={{ alignItems: "center", display: "flex", gap: 4 }}><Icon color="var(--text-3)" name="pin" size={13} />{place}</span> : null}
        </span>
      </span>
      <span style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 10 }}>
        {canEnter ? <span className="btn btn-soft btn-sm" style={{ height: 32, pointerEvents: "none" }}>进入活动<Icon name="arrowUR" size={14} /></span> : <StatusBadge status={event.status} />}
        <Icon color="var(--text-4)" name="chevR" size={17} />
      </span>
    </>
  );
  const rowStyle = { alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, cursor: "pointer", display: "flex", gap: 14, padding: "12px 14px", textAlign: "left" as const, textDecoration: "none", width: "100%" };

  if (!canEnter) {
    return <a className="card-hover" href={`/app/events/${event.code}`} onClick={(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }} style={rowStyle}>{content}</a>;
  }

  return <button className="card-hover" onClick={enterEvent} style={rowStyle} type="button">{content}</button>;
}

function MyEventsBlock({ events }: { events: OrbitLandingEventView[] }) {
  const [tab, setTab] = useState<HomeFilter>("all");
  const counts = statusCounts(events);
  const list = tab === "all" ? events : events.filter((event) => event.status === tab);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {homeFilters.map(([key, label]) => (
          <button className={`chip${tab === key ? " is-active" : ""}`} key={key} onClick={() => setTab(key)} type="button">
            {label}<span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{counts[key]}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((event) => <HomeEventRow event={event} key={event.id} />)}
        {!list.length ? <div className="card-flat" style={{ color: "var(--text-3)", fontSize: 13.5, padding: 20, textAlign: "center" }}>当前没有这个状态的活动。</div> : null}
      </div>
    </div>
  );
}

function AccountEventCard({ event }: { event: OrbitLandingEventView }) {
  const date = homeDate(event.startsAt);
  const canEnter = event.status === "active";
  const name = event.name;
  const place = eventPlace(event);
  const content = (
    <>
      <Cover className="orbit-account-event-cover" g={gradientFromString(event.code || name)} monogram={{ size: 46, text: name.slice(0, 1) }} style={{ opacity: event.status === "ended" ? 0.72 : 1 }}>
        <span className="orbit-account-event-status"><StatusBadge status={event.status} /></span>
        <span className="orbit-card-date"><span style={{ color: "var(--rose)", fontSize: 10, fontWeight: 700 }}>{date.month}</span>{date.day ? <b style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 20, lineHeight: 1 }}>{date.day}</b> : null}</span>
      </Cover>
      <span className="orbit-account-event-body">
        <span><span className="h-section orbit-account-event-name">{name}</span>{event.code ? <span className="orbit-account-event-sub">{event.code}</span> : null}</span>
        <span className="orbit-account-event-meta"><Icon color="var(--text-3)" name="clock" size={15} />{date.time}</span>
        {place ? <span className="orbit-account-event-meta"><Icon color="var(--text-3)" name="pin" size={15} />{place}</span> : null}
        <span className="orbit-account-event-foot">
          <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{event.status === "ended" ? "个人历史活动" : "个人报名活动"}</span>
          <span className={canEnter ? "btn btn-soft btn-sm" : "orbit-account-event-link"}>{canEnter ? "进入活动" : "查看活动"}{canEnter ? <Icon name="arrowUR" size={14} /> : <Icon name="chevR" size={14} />}</span>
        </span>
      </span>
    </>
  );

  if (!canEnter) {
    return <a className="card card-hover orbit-account-event-card" href={`/app/events/${event.code}`} onClick={(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }} style={{ textDecoration: "none" }}>{content}</a>;
  }

  return <button className="card card-hover orbit-account-event-card" onClick={enterEvent} type="button">{content}</button>;
}

function AccountEventsBlock({ events }: { events: OrbitLandingEventView[] }) {
  const [tab, setTab] = useState<HomeFilter>("all");
  const counts = statusCounts(events);
  const list = tab === "all" ? events : events.filter((event) => event.status === tab);

  return (
    <section>
      <div className="orbit-filter-row">
        {homeFilters.map(([key, label]) => (
          <button className={`chip${tab === key ? " is-active" : ""}`} key={key} onClick={() => setTab(key)} type="button">
            {label}<span className="mono" style={{ fontSize: 11, marginLeft: 2, opacity: 0.62 }}>{counts[key]}</span>
          </button>
        ))}
      </div>
      <div className="orbit-account-events-grid">
        {list.map((event) => <AccountEventCard event={event} key={event.id} />)}
        {!list.length ? <div className="card-flat orbit-empty">当前没有这个状态的活动。</div> : null}
      </div>
    </section>
  );
}

function HubDesktop({ viewModel }: { viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-desktop-only" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <AccountTopNav active="me" accountInitial={viewModel.account.initial} />
      <div style={{ margin: "0 auto", maxWidth: 1080, padding: "40px 40px 80px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: 20 }}>
          <span className={`avatar g-indigo`} style={{ fontSize: 30.24, height: 72, width: 72 }}>{viewModel.account.initial}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>晚上好</div>
            <h1 className="h-display" style={{ fontSize: 34, margin: 0 }}>{viewModel.account.fullName}</h1>
            <div style={{ color: "var(--text-2)", fontSize: 14.5, marginTop: 4 }}>{viewModel.account.headline}</div>
          </div>
          <div style={{ display: "flex", flexShrink: 0, gap: 10 }}>
            <a className="btn btn-ghost" href="/app/profile" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/profile"); }}><Icon name="edit" size={16} />编辑通用画像</a>
            <button className="btn btn-soft" onClick={() => orbitNavigate("/")} type="button"><Icon name="logout" size={16} />退出登录</button>
          </div>
        </div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", gap: 30, marginTop: 22, padding: "16px 22px" }}>
          {([["报名活动", viewModel.stats.events], ["名片夹", viewModel.stats.people], ["在推进", viewModel.stats.inProgress]] as const).map(([label, value]) => (
            <div key={label}><div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 26, fontWeight: 700 }}>{value}</div><div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 1 }}>{label}</div></div>
          ))}
        </div>
        <div style={{ alignItems: "start", display: "grid", gap: 30, gridTemplateColumns: "1fr 320px", marginTop: 34 }}>
          <div>
            <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between", marginBottom: 16 }}>
              <h2 className="h-section" style={{ fontSize: 20, margin: 0 }}>我的活动</h2>
              <a className="btn btn-ghost btn-sm" href="/app/home/events" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/events"); }}>全部<Icon name="chevR" size={15} /></a>
            </div>
            <MyEventsBlock events={viewModel.events} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {hubEntryCards.map((item) => (
              <a className="card card-hover" href={item.href} key={item.href} onClick={(event) => { event.preventDefault(); orbitNavigate(item.href); }} style={{ alignItems: "center", display: "flex", gap: 14, padding: 18, textDecoration: "none" }}>
                <span className={`avatar ${item.g}`} style={{ borderRadius: 13, fontSize: 0, height: 46, width: 46 }}><Icon color="#fff" name={item.icon} size={22} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><span className="h-section" style={{ color: "var(--ink)", display: "block", fontSize: 16 }}>{item.title}</span><span style={{ color: "var(--text-3)", display: "block", fontSize: 12.5, marginTop: 2 }}>{item.sub}</span></span>
                <Icon color="var(--text-4)" name="chevR" size={18} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HubMobile({ viewModel }: { viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
      <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 18px 100px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: 14, padding: "8px 0 4px" }}>
          <span className="avatar g-indigo" style={{ fontSize: 21.84, height: 52, width: 52 }}>{viewModel.account.initial}</span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: "var(--text-3)", fontSize: 12 }}>晚上好</div><div className="h-title" style={{ color: "var(--ink)", fontSize: 21 }}>{viewModel.account.fullName}</div></div>
          <a aria-label="编辑" href="/app/profile" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/profile"); }} style={{ alignItems: "center", background: "var(--surface-2)", borderRadius: 999, color: "var(--text-2)", display: "flex", flexShrink: 0, height: 38, justifyContent: "center", width: 38 }}><Icon name="settings" size={19} /></a>
          <button aria-label="退出" onClick={() => orbitNavigate("/")} style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", flexShrink: 0, height: 38, justifyContent: "center", width: 38 }} type="button"><Icon name="logout" size={18} /></button>
        </div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", justifyContent: "space-between", marginTop: 16, padding: "14px 16px" }}>
          {([["报名", viewModel.stats.events], ["名片", viewModel.stats.people], ["在推进", viewModel.stats.inProgress]] as const).map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}><div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 22, fontWeight: 700 }}>{value}</div><div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{label}</div></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {hubEntryCards.map((item) => (
            <a className="card card-hover" href={item.href} key={item.href} onClick={(event) => { event.preventDefault(); orbitNavigate(item.href); }} style={{ flex: 1, padding: 14, textDecoration: "none" }}>
              <span className={`avatar ${item.g}`} style={{ borderRadius: 11, fontSize: 0, height: 38, width: 38 }}><Icon color="#fff" name={item.icon} size={19} /></span>
              <span className="h-section" style={{ color: "var(--ink)", display: "block", fontSize: 14, marginTop: 10 }}>{item.mobileTitle}</span>
              <span style={{ color: "var(--text-3)", display: "block", fontSize: 11.5, marginTop: 1 }}>{item.mobileSub}</span>
            </a>
          ))}
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", margin: "24px 0 12px" }}>
          <h2 className="h-section" style={{ fontSize: 18, margin: 0 }}>我的活动</h2>
          <a href="/app/home/events" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/events"); }} style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 2, textDecoration: "none" }}>全部<Icon name="chevR" size={14} /></a>
        </div>
        <MyEventsBlock events={viewModel.events} />
      </div>
      <AccountBottomTab active="me" />
    </div>
  );
}

function EventsDesktop({ viewModel }: { viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-desktop-only">
      <AccountTopNav active="me" accountInitial={viewModel.account.initial} />
      <div className="scroll" style={{ margin: "0 auto", maxWidth: 1180, padding: "40px 40px 90px" }}>
        <div style={{ marginBottom: 22 }}><div className="eyebrow">MY EVENTS</div><h1 className="h-display" style={{ fontSize: 34, margin: "2px 0 0" }}>我的活动</h1></div>
        <AccountEventsBlock events={viewModel.events} />
      </div>
    </div>
  );
}

function EventsMobile({ viewModel }: { viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
      <StatusBar />
      <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 100px" }}>
        <h1 className="h-display" style={{ fontSize: 26, margin: "6px 0 18px" }}>我的活动</h1>
        <AccountEventsBlock events={viewModel.events} />
      </div>
      <AccountBottomTab active="me" />
    </div>
  );
}

export function OrbitRealHome({ mode, viewModel }: { mode: HomeMode; viewModel: OrbitHomeViewModel }) {
  if (mode === "events") {
    return (
      <main className="orbit-personal-page" data-orbit-real-page="home-events">
        <EventsDesktop viewModel={viewModel} />
        <EventsMobile viewModel={viewModel} />
      </main>
    );
  }

  return (
    <main data-orbit-real-page="home">
      <HubDesktop viewModel={viewModel} />
      <HubMobile viewModel={viewModel} />
    </main>
  );
}
