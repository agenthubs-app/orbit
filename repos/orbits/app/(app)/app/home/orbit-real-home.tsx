"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

import { AccountTopNav, orbitNavigate } from "../orbit-account-shell";
import { EventCover } from "../events/orbit-event-cover";
import type { OrbitHomeAccountView, OrbitHomeViewModel } from "../orbit-home-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../orbit-language-context";
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { partyHrefForEvent } from "../orbit-product-href";
import { gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../shared/demo-visual-assets";
import { toReminderAlerts, type InboxReminderAlert } from "../inbox/inbox-panel-view-model";
import {
  localizeHomeHeadline,
  localizeHomeList,
  localizeHomeValue,
} from "./home-demo-localization";

type HomeFilter = "active" | "all" | "ended" | "upcoming";
type HomeMode = "events" | "hub";
type Translate = (copy: { en: string; zh: string }) => string;

const tz = { timeZone: "Asia/Tokyo" };

function homeFilters(t: Translate): Array<[HomeFilter, string]> {
  return [
    ["all", t({ en: "All", zh: "全部" })],
    ["active", t({ en: "Active", zh: "进行中" })],
    ["upcoming", t({ en: "Upcoming", zh: "即将" })],
    ["ended", t({ en: "Past", zh: "历史" })],
  ];
}

function hubEntryCards(t: Translate) {
  return [
    { g: "g-emerald", href: "/app/profile", icon: "user", sub: t({ en: "Auto-reused for every event", zh: "报名各场自动复用" }), title: t({ en: "Universal profile", zh: "通用画像" }) },
    { g: "g-rose", href: "/app/contacts", icon: "wallet", sub: t({ en: "Post-event contact CRM", zh: "会后人脉 CRM" }), title: t({ en: "Contacts", zh: "名片夹" }) },
    { g: "g-sky", href: "/app/today", icon: "clock", sub: t({ en: "Meetings and interaction log", zh: "约见与交往记录" }), title: t({ en: "Schedule", zh: "日程安排" }) },
  ];
}

function subtitleFor(account: OrbitHomeAccountView, language: OrbitLanguage): string {
  // 副标题用 role · organization（本地化）。中文页面下若 organization 仍是英文
  // （多为生成占位），则只显示 role，避免中英混排；两者都缺时退回 headline。
  const role = account.role ? localizeHomeValue(account.role, language) : "";
  const orgRaw = account.organization
    ? localizeHomeValue(account.organization, language)
    : "";
  const keepOrg =
    orgRaw && (language === "en" || /[一-鿿]/.test(orgRaw));
  const composed = [role, keepOrg ? orgRaw : ""].filter(Boolean).join(" · ");
  return composed || localizeHomeHeadline(account.headline, account.role, language);
}

// 个人资料摘要卡：surface 更完整的档案（行业、主场、关系目标、可提供/寻求/话题、简介）。
function ProfileSummary({
  account,
  language,
  t,
}: {
  account: OrbitHomeAccountView;
  language: OrbitLanguage;
  t: Translate;
}) {
  const industry = account.industry ? localizeHomeValue(account.industry, language) : "";
  const homeMarket = account.homeMarket ? localizeHomeValue(account.homeMarket, language) : "";
  const goal = account.relationshipGoal
    ? localizeHomeValue(account.relationshipGoal, language)
    : "";
  const bio = account.bio ? localizeHomeValue(account.bio, language) : "";
  const offering = localizeHomeList(account.offering, language).filter(Boolean);
  const seeking = localizeHomeList(account.seeking, language).filter(Boolean);
  const topics = localizeHomeList(account.topics, language).filter(Boolean);
  const targets = localizeHomeList(account.targetRelationshipTypes, language).filter(Boolean);
  const channels = localizeHomeList(account.preferredIntroChannels, language).filter(Boolean);
  const followUpWindow = account.preferredFollowUpWindow
    ? localizeHomeValue(account.preferredFollowUpWindow, language)
    : "";

  const facts: Array<{ icon: string; label: string; value: string }> = [];
  if (industry) facts.push({ icon: "value", label: t({ en: "Industry", zh: "行业" }), value: industry });
  if (homeMarket) facts.push({ icon: "pin", label: t({ en: "Home market", zh: "主场市场" }), value: homeMarket });
  if (followUpWindow) facts.push({ icon: "clock", label: t({ en: "Follow-up cadence", zh: "跟进节奏" }), value: followUpWindow });

  const chipGroups: Array<{ icon: string; label: string; items: readonly string[]; tone: string }> = [];
  if (offering.length) chipGroups.push({ icon: "sparkle", label: t({ en: "I can offer", zh: "我能提供" }), items: offering, tone: "nc-tag-value" });
  if (seeking.length) chipGroups.push({ icon: "search", label: t({ en: "I'm looking for", zh: "我在寻找" }), items: seeking, tone: "" });
  if (targets.length) chipGroups.push({ icon: "network", label: t({ en: "I want to meet", zh: "想认识的人" }), items: targets, tone: "" });
  if (topics.length) chipGroups.push({ icon: "tag", label: t({ en: "Topics", zh: "关注话题" }), items: topics, tone: "" });
  if (channels.length) chipGroups.push({ icon: "share", label: t({ en: "Intro channels", zh: "引荐渠道" }), items: channels, tone: "" });

  if (!facts.length && !goal && !bio && !chipGroups.length) {
    return null;
  }

  return (
    <div className="card orbit-hub-profile" style={{ marginTop: 18 }}>
      <div className="orbit-hub-profile-title">
        <Icon name="user" size={16} />
        <h2 className="h-section" style={{ margin: 0 }}>{t({ en: "About me", zh: "个人资料" })}</h2>
      </div>
      {bio ? <p className="orbit-hub-bio">{bio}</p> : null}
      {facts.length ? (
        <div className="orbit-hub-facts">
          {facts.map((fact) => (
            <div className="orbit-hub-fact" key={fact.label}>
              <span className="orbit-hub-fact-icon"><Icon name={fact.icon} size={14} /></span>
              <span className="orbit-hub-fact-body">
                <span className="orbit-hub-fact-k">{fact.label}</span>
                <span className="orbit-hub-fact-v">{fact.value}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {goal ? (
        <div className="orbit-hub-goal">
          <span className="orbit-hub-goal-icon"><Icon name="target" size={15} /></span>
          <span className="orbit-hub-goal-main">
            <span className="orbit-hub-group-k">{t({ en: "Relationship goal", zh: "关系目标" })}</span>
            <p className="orbit-hub-goal-body">{goal}</p>
          </span>
        </div>
      ) : null}
      {chipGroups.length ? (
        <div className="orbit-hub-grid">
          {chipGroups.map((group) => (
            <div className="orbit-hub-group" key={group.label}>
              <span className="orbit-hub-group-head">
                <Icon name={group.icon} size={13} />
                <span className="orbit-hub-group-k">{group.label}</span>
              </span>
              <div className="orbit-hub-chip-row">
                {group.items.map((item) => (
                  <span className={`nc-tag ${group.tone}`} key={item}>{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateLocale(language: OrbitLanguage) {
  return language === "en" ? "en-US" : "zh-CN";
}

function fmtMonth(date: Date, language: OrbitLanguage) {
  return new Intl.DateTimeFormat(dateLocale(language), { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date, language: OrbitLanguage) {
  return new Intl.DateTimeFormat(dateLocale(language), { day: "2-digit", ...tz }).format(date);
}

function homeDate(startsAt: string, language: OrbitLanguage, t: Translate) {
  const date = parseDate(startsAt);
  if (!date) return { day: "", month: t({ en: "TBD", zh: "待定" }), time: t({ en: "Time TBD", zh: "时间待定" }) };

  return {
    day: fmtDay(date, language),
    month: fmtMonth(date, language),
    time: new Intl.DateTimeFormat(dateLocale(language), { day: "numeric", hour: "2-digit", minute: "2-digit", month: "long", ...tz }).format(date),
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

function enterEvent(eventId: string) {
  orbitNavigate(partyHrefForEvent(eventId));
}

function eventPlace(event: OrbitLandingEventView, t: Translate) {
  return event.place || event.venue || t({ en: "Venue TBD", zh: "地点待定" });
}

function eventImageAsset(event: OrbitLandingEventView) {
  return getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
}

function eventImageUrl(event: OrbitLandingEventView) {
  return event.detailLogoUrl || event.logoUrl || eventImageAsset(event)?.src || "";
}

function HomeEventRow({ event, language, t }: { event: OrbitLandingEventView; language: OrbitLanguage; t: Translate }) {
  const date = homeDate(event.startsAt, language, t);
  const place = eventPlace(event, t);
  const canEnter = event.status === "active" || event.status === "ended";
  const enterLabel = event.status === "ended" ? t({ en: "Replay", zh: "回看" }) : t({ en: "Enter event", zh: "进入活动" });
  const name = event.name;
  const content = (
    <>
      <EventCover g={gradientFromString(event.code || name)} imageAlt={name} imageSizes="52px" imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 22, text: name.slice(0, 1) }} style={{ borderRadius: 12, flexShrink: 0, height: 52, opacity: event.status === "ended" ? 0.72 : 1, width: 52 }} />
      <span className="orbit-home-event-row-copy" style={{ flex: 1, minWidth: 0 }}>
        <h3 className="h-section orbit-home-event-row-title" style={{ color: "var(--ink)", display: "block", margin: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</h3>
        <span style={{ alignItems: "center", color: "var(--text-3)", display: "flex", flexWrap: "wrap", fontSize: 13, gap: 8, marginTop: 3 }}>
          <span style={{ alignItems: "center", display: "flex", gap: 4 }}><Icon color="var(--text-3)" name="clock" size={13} />{date.time}</span>
          {place ? <span style={{ alignItems: "center", display: "flex", gap: 4 }}><Icon color="var(--text-3)" name="pin" size={13} />{place}</span> : null}
        </span>
      </span>
      <span className="orbit-home-event-row-action" style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 10 }}>
        {canEnter ? <span className="btn btn-soft btn-sm" style={{ height: 32, pointerEvents: "none" }}>{enterLabel}<Icon name="arrowUR" size={14} /></span> : <StatusBadge language={language} status={event.status} />}
        <Icon color="var(--text-4)" name="chevR" size={17} />
      </span>
    </>
  );
  const rowStyle = { alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", display: "flex", gap: 14, padding: "12px 14px", textAlign: "left" as const, textDecoration: "none", width: "100%" };

  if (!canEnter) {
    return <a className="card-hover orbit-home-event-row" href={`/app/events/${event.code}`} onClick={(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }} style={rowStyle}>{content}</a>;
  }

  return <button className="card-hover orbit-home-event-row" onClick={() => enterEvent(event.id)} style={rowStyle} type="button">{content}</button>;
}

function MyEventsBlock({ events, language, t }: { events: OrbitLandingEventView[]; language: OrbitLanguage; t: Translate }) {
  const [tab, setTab] = useState<HomeFilter>("all");
  const counts = statusCounts(events);
  const list = tab === "all" ? events : events.filter((event) => event.status === tab);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {homeFilters(t).map(([key, label]) => (
          <button className={`chip${tab === key ? " is-active" : ""}`} key={key} onClick={() => setTab(key)} type="button">
            {label}<span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{counts[key]}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((event) => <HomeEventRow event={event} key={event.id} language={language} t={t} />)}
        {!list.length ? <div className="card-flat" style={{ color: "var(--text-3)", fontSize: 14, padding: 20, textAlign: "center" }}>{t({ en: "No events in this state.", zh: "当前没有这个状态的活动。" })}</div> : null}
      </div>
    </div>
  );
}

function AccountEventCard({ event, language, t }: { event: OrbitLandingEventView; language: OrbitLanguage; t: Translate }) {
  const date = homeDate(event.startsAt, language, t);
  const canEnter = event.status === "active" || event.status === "ended";
  const enterLabel = event.status === "ended" ? t({ en: "Replay", zh: "回看" }) : t({ en: "Enter event", zh: "进入活动" });
  const name = event.name;
  const place = eventPlace(event, t);
  const imageAsset = eventImageAsset(event);
  const seenTopics = new Set<string>();
  const topics = [event.industry, event.theme, ...event.tags]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seenTopics.has(key)) return false;
      seenTopics.add(key);
      return true;
    })
    .slice(0, 3);
  const content = (
    <>
      <EventCover className="orbit-account-event-module-cover" g={gradientFromString(event.code || name)} imageAlt={name} imageSizes="(max-width: 720px) calc(100vw - 36px), (max-width: 1100px) 50vw, 360px" imageUrl={eventImageUrl(event)} monogram={null} style={{ opacity: event.status === "ended" ? 0.78 : 1 }}>
        <span className="orbit-account-event-module-cover-top">
          <StatusBadge language={language} status={event.status} />
          <span className="orbit-card-date"><span style={{ color: "var(--rose-text)", fontSize: 11, fontWeight: 600 }}>{date.month}</span>{date.day ? <b style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 20, lineHeight: 1 }}>{date.day}</b> : null}</span>
        </span>
      </EventCover>
      <span className="orbit-account-event-module-body">
        <span className="orbit-account-event-module-copy">
          <span>{event.theme || event.industry || event.host}</span>
          <strong>{name}</strong>
        </span>
        {topics.length ? (
          <span className="orbit-account-event-module-topic-row">
            {topics.map((topicItem) => <span key={topicItem}>{topicItem}</span>)}
          </span>
        ) : null}
        <span className="orbit-account-event-module-meta">
          <span><Icon color="var(--text-3)" name="clock" size={15} />{date.time}</span>
          {place ? <span><Icon color="var(--text-3)" name="pin" size={15} />{place}</span> : null}
          <span><Icon color="var(--text-3)" name="users" size={15} />{event.participantCount} 人已报名</span>
        </span>
        <span className="orbit-account-event-module-foot">
          <span>{event.status === "ended" ? t({ en: "Tap to revisit details", zh: "点击回看活动详情" }) : t({ en: "Tap to view details", zh: "点击查看活动详情" })}</span>
          <strong>{canEnter ? enterLabel : t({ en: "View event", zh: "查看活动" })}{canEnter ? <Icon name="arrowUR" size={14} /> : <Icon name="chevR" size={14} />}</strong>
        </span>
      </span>
    </>
  );
  const dataProps = {
    "data-demo-visual-asset-id": imageAsset?.assetId,
    "data-demo-visual-source": imageAsset?.sourceLabel,
    "data-demo-visual-source-label": imageAsset?.sourceLabel,
  };

  if (!canEnter) {
    return <a {...dataProps} className="card card-hover orbit-account-event-module-card" href={`/app/events/${event.code}`} onClick={(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }} style={{ textDecoration: "none" }}>{content}</a>;
  }

  return <button {...dataProps} className="card card-hover orbit-account-event-module-card" onClick={() => enterEvent(event.id)} type="button">{content}</button>;
}

function AccountEventsBlock({ events, language, t }: { events: OrbitLandingEventView[]; language: OrbitLanguage; t: Translate }) {
  const [tab, setTab] = useState<HomeFilter>("all");
  const counts = statusCounts(events);
  const list = tab === "all" ? events : events.filter((event) => event.status === tab);

  return (
    <section>
      <div className="orbit-account-event-module-list">
        {list.map((event) => <AccountEventCard event={event} key={event.id} language={language} t={t} />)}
        {!list.length ? <div className="card-flat orbit-empty">{t({ en: "No events in this state.", zh: "当前没有这个状态的活动。" })}</div> : null}
      </div>
      <div className="orbit-filter-row orbit-account-event-filter-row">
        {homeFilters(t).map(([key, label]) => (
          <button className={`chip${tab === key ? " is-active" : ""}`} key={key} onClick={() => setTab(key)} type="button">
            {label}<span className="mono" style={{ fontSize: 11, marginLeft: 2, opacity: 0.62 }}>{counts[key]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ————— 控制台增强：今日活动 hero、提醒面板、iOrbit 悬浮输入条 —————

interface TodayOpsSummary {
  checkedIn: boolean;
  pendingRequests: number;
  recCount: number;
  seat: string | null;
  tableNumber: number | null;
  theme: string | null;
  topRec: { hint: string; name: string; role: string; score: number } | null;
}

/** Best-effort enrichment for the live event hero; every failure degrades to
 *  the plain hero (the console never blocks on operations data). */
function useTodayOpsSummary(eventId: string | null): TodayOpsSummary | null {
  const [summary, setSummary] = useState<TodayOpsSummary | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/operations`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          data?: {
            checkIn?: unknown;
            contactRequests?: readonly { status: string; targetParticipantId: string }[];
            directory?: readonly { company: string | null; displayName: string; participantId: string; role: string | null }[];
            me?: { participantId: string };
            recommendations?: { recommendations: readonly { memberHint: string; score: number; targetParticipantId: string }[] } | null;
            roundOneTable?: { members: readonly { participantId: string; seat: string }[]; tableNumber: number; theme: string } | null;
          };
        } | null;
        const data = body?.data;
        if (!data?.me || !active) return;
        const meId = data.me.participantId;
        const byId = new Map((data.directory ?? []).map((person) => [person.participantId, person]));
        const recs = data.recommendations?.recommendations ?? [];
        const top = recs[0] ?? null;
        const topPerson = top ? byId.get(top.targetParticipantId) : null;
        setSummary({
          checkedIn: Boolean(data.checkIn),
          pendingRequests: (data.contactRequests ?? []).filter(
            (request) => request.status === "awaiting_target_consent" && request.targetParticipantId === meId,
          ).length,
          recCount: recs.length,
          seat: data.roundOneTable?.members.find((member) => member.participantId === meId)?.seat ?? null,
          tableNumber: data.roundOneTable?.tableNumber ?? null,
          theme: data.roundOneTable?.theme ?? null,
          topRec: top && topPerson
            ? {
                hint: top.memberHint,
                name: topPerson.displayName,
                role: [topPerson.role, topPerson.company].filter(Boolean).join(" · "),
                score: top.score,
              }
            : null,
        });
      } catch {
        // Plain hero remains.
      }
    })();
    return () => { active = false; };
  }, [eventId]);
  return summary;
}

function TodayEventHero({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const ops = useTodayOpsSummary(event.id);
  return (
    <div data-console-today style={{ background: "linear-gradient(120deg, #1a7d9b, var(--accent) 42%, #c8a24a 135%)", borderRadius: 20, boxShadow: "0 14px 40px -8px rgba(21,94,117,.30)", padding: 2 }}>
      <div style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))", borderRadius: 18, display: "grid", gap: "6px 26px", gridTemplateColumns: ops?.topRec ? "1.2fr 1fr" : "1fr", overflow: "hidden", padding: "18px 22px", position: "relative" }}>
        <div style={{ alignItems: "center", display: "flex", gap: 10, gridColumn: "1 / -1" }}>
          <span className="badge badge-live"><span style={{ animation: "orbit-console-pulse 1.6s infinite", background: "currentcolor", borderRadius: "var(--r-pill)", display: "inline-block", height: 6, width: 6 }} />{t({ en: "Happening now", zh: "正在进行" })}</span>
          <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>{homeDateTimeRange(event, t)}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 21, fontWeight: 600, lineHeight: 1.3, margin: 0 }}>{event.name}</h3>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3 }}>
            {eventPlace(event, t)}{ops?.checkedIn ? ` · ${t({ en: "Checked in", zh: "已签到" })} ✓` : ""}
          </div>
          {ops?.tableNumber ? (
            <div style={{ alignItems: "center", display: "flex", gap: 14, marginTop: 12 }}>
              <div style={{ color: "var(--accent)", fontFamily: "var(--ff-display)", fontSize: 46, fontWeight: 600, lineHeight: 0.95 }}>
                {ops.tableNumber}<span style={{ color: "var(--text-2)", fontSize: 15, marginLeft: 2 }}>{t({ en: " table", zh: "号桌" })}</span>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {ops.seat ? <span className="chip" style={{ width: "max-content" }}>{t({ en: `Seat ${ops.seat}`, zh: `座位 ${ops.seat}` })}</span> : null}
                {ops.theme ? <span style={{ color: "var(--text-3)", fontSize: 12, maxWidth: 260 }}>{ops.theme}</span> : null}
              </div>
            </div>
          ) : null}
          <div style={{ alignItems: "center", display: "flex", gap: 12, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => enterEvent(event.id)} type="button">{t({ en: "Enter live event", zh: "进入现场" })}<Icon color="var(--on-dark)" name="arrowUR" size={15} /></button>
            {ops ? (
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                {ops.recCount > 0 ? t({ en: `${ops.recCount} matches`, zh: `${ops.recCount} 位推荐` }) : null}
                {ops.recCount > 0 && ops.pendingRequests > 0 ? " · " : ""}
                {ops.pendingRequests > 0 ? t({ en: `${ops.pendingRequests} pending`, zh: `${ops.pendingRequests} 条待处理` }) : null}
              </span>
            ) : null}
          </div>
        </div>
        {ops?.topRec ? (
          <div style={{ borderLeft: "1px dashed var(--border-2)", display: "grid", gap: 8, paddingLeft: 22 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>{t({ en: "TOP MATCH TONIGHT", zh: "今晚最值得见" })}</span>
            <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
              <span className="avatar g-emerald" style={{ fontSize: 15, height: 40, width: 40 }}>{ops.topRec.name.slice(0, 1)}</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: 14.5 }}>{ops.topRec.name}</strong>
                <span style={{ color: "var(--text-3)", display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ops.topRec.role}</span>
              </div>
              <span style={{ background: "var(--accent-soft)", borderRadius: "var(--r-pill)", color: "var(--accent)", flexShrink: 0, fontSize: 11, fontWeight: 800, marginLeft: "auto", padding: "3px 9px" }}>{t({ en: `Match ${ops.topRec.score}`, zh: `匹配 ${ops.topRec.score}` })}</span>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>{ops.topRec.hint}</p>
          </div>
        ) : null}
      </div>
      <style>{`@keyframes orbit-console-pulse { 50% { opacity: .35; } }`}</style>
    </div>
  );
}

function homeDateTimeRange(event: OrbitLandingEventView, t: Translate): string {
  const starts = new Date(event.startsAt);
  const ends = new Date(event.endsAt);
  if (!Number.isFinite(starts.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", ...tz });
  return `${t({ en: "Today", zh: "今天" })} ${fmt.format(starts)}${Number.isFinite(ends.getTime()) ? ` – ${fmt.format(ends)}` : ""}`;
}

/** 日程/人脉提醒：与收件箱同源（/api/notifications），按约谈类拆分到日程栏。 */
function useConsoleReminders(language: OrbitLanguage) {
  const [reminders, setReminders] = useState<readonly InboxReminderAlert[] | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/notifications", { headers: { accept: "application/json" } });
        const envelope = (await response.json().catch(() => null)) as { data?: unknown; success?: boolean } | null;
        if (!response.ok || envelope?.success !== true || !envelope.data) {
          if (active) setReminders([]);
          return;
        }
        if (active) setReminders(toReminderAlerts(envelope.data as Parameters<typeof toReminderAlerts>[0], language));
      } catch {
        if (active) setReminders([]);
      }
    })();
    return () => { active = false; };
  }, [language]);
  return reminders;
}

function ReminderRow({ alert, t }: { alert: InboxReminderAlert; t: Translate }) {
  return (
    <a href={alert.href} style={{ alignItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 13, display: "flex", gap: 12, padding: "11px 13px", textDecoration: "none" }}>
      <span className="avatar g-sky" style={{ flexShrink: 0, fontSize: 14, height: 38, width: 38 }}>{(alert.contactName || alert.title).slice(0, 1)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ color: "var(--ink)", display: "block", fontSize: 13.5 }}>{alert.title}</strong>
        <span style={{ color: "var(--text-3)", display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[alert.contactName, alert.organization].filter(Boolean).join(" · ") || alert.dueLabel}
        </span>
      </span>
      <span style={{ color: "var(--accent)", flexShrink: 0, fontSize: 12.5, fontWeight: 700 }}>{t({ en: "Open", zh: "处理" })}</span>
    </a>
  );
}

function ConsoleReminderPanels({ language, t }: { language: OrbitLanguage; t: Translate }) {
  const reminders = useConsoleReminders(language);
  const isAppointment = (alert: InboxReminderAlert) => /约谈|appointment/iu.test(alert.title);
  const schedule = (reminders ?? []).filter(isAppointment).slice(0, 2);
  const people = (reminders ?? []).filter((alert) => !isAppointment(alert)).slice(0, 2);
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
      <section className="card" data-console-section="schedule" style={{ display: "grid", gap: 11, padding: "16px 18px" }}>
        <span className="eyebrow">{t({ en: "SCHEDULE · PENDING", zh: "日程 · 待你处理" })}</span>
        {reminders === null ? <span style={{ color: "var(--text-4)", fontSize: 13 }}>{t({ en: "Loading…", zh: "正在读取…" })}</span> : null}
        {schedule.map((alert) => <ReminderRow alert={alert} key={alert.id} t={t} />)}
        {reminders !== null && schedule.length === 0 ? (
          <span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: "No appointment needs you right now.", zh: "暂无需要处理的约谈。" })} <a href="/app/today" onClick={(clickEvent) => { clickEvent.preventDefault(); orbitNavigate("/today"); }} style={{ color: "var(--accent)", fontWeight: 700 }}>{t({ en: "Open schedule", zh: "打开日程" })}</a></span>
        ) : null}
      </section>
      <section className="card" data-console-section="contacts" style={{ display: "grid", gap: 11, padding: "16px 18px" }}>
        <span className="eyebrow">{t({ en: "WORTH FOLLOWING UP", zh: "值得联系" })}</span>
        {reminders === null ? <span style={{ color: "var(--text-4)", fontSize: 13 }}>{t({ en: "Loading…", zh: "正在读取…" })}</span> : null}
        {people.map((alert) => <ReminderRow alert={alert} key={alert.id} t={t} />)}
        {reminders !== null && people.length === 0 ? (
          <span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: "Nothing waiting — contacts appear here after events.", zh: "暂无待跟进——活动之后的关系提醒会出现在这里。" })} <a href="/app/contacts" onClick={(clickEvent) => { clickEvent.preventDefault(); orbitNavigate("/contacts"); }} style={{ color: "var(--accent)", fontWeight: 700 }}>{t({ en: "Open contacts", zh: "打开人脉" })}</a></span>
        ) : null}
      </section>
    </div>
  );
}

const AGENT_DOCK_SUGGESTIONS: Record<string, readonly { en: string; zh: string }[]> = {
  contacts: [
    { en: "Who is worth following up this week?", zh: "本周谁值得我优先跟进？" },
    { en: "Draft a follow-up note for my newest contact", zh: "帮我给最新的联系人起草一段跟进话术" },
  ],
  contactsEmpty: [
    { en: "How do I meet the right people fast?", zh: "怎么快速认识第一批对的人？" },
    { en: "Find an event worth attending", zh: "帮我找一场值得去的活动" },
  ],
  eventsLive: [
    { en: "Who should I prioritize meeting tonight?", zh: "今晚我该优先见谁？" },
    { en: "Why am I seated at my table?", zh: "我为什么被分到这一桌？" },
    { en: "Prepare my opener for the top match", zh: "帮我准备和头号推荐对象的开场" },
  ],
  eventsNone: [
    { en: "Find an event worth attending", zh: "帮我找一场值得去的活动" },
    { en: "What kind of events suit my goals?", zh: "什么样的活动适合我的目标？" },
  ],
  eventsUpcoming: [
    { en: "What should I prepare before my next event?", zh: "下一场活动我该提前准备什么？" },
    { en: "Who is worth meeting at my next event?", zh: "下一场活动有谁值得认识？" },
  ],
  schedule: [
    { en: "Summarize my upcoming appointments", zh: "帮我梳理接下来的约谈安排" },
    { en: "What should I confirm before tomorrow's meeting?", zh: "明天的约谈之前我该确认什么？" },
  ],
};

interface AgentDockState {
  hasContacts: boolean;
  hasLiveEvent: boolean;
  hasUpcomingEvent: boolean;
}

// 建议问题必须与用户真实状态相符：没有进行中的活动就不出"我为什么被分到
// 这一桌"这类必然扑空的问题，首次点击 AI 就要能得到有意义的回答。
function agentDockSuggestions(context: string, state: AgentDockState) {
  if (context === "contacts") {
    return state.hasContacts
      ? AGENT_DOCK_SUGGESTIONS.contacts
      : AGENT_DOCK_SUGGESTIONS.contactsEmpty;
  }
  if (context === "schedule") return AGENT_DOCK_SUGGESTIONS.schedule;
  if (state.hasLiveEvent) return AGENT_DOCK_SUGGESTIONS.eventsLive;
  if (state.hasUpcomingEvent) return AGENT_DOCK_SUGGESTIONS.eventsUpcoming;
  return AGENT_DOCK_SUGGESTIONS.eventsNone;
}

function AgentDock({ state, t }: { state: AgentDockState; t: Translate }) {
  const [context, setContext] = useState("events");
  const [rotation, setRotation] = useState(0);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll("[data-console-section]"));
    if (!sections.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const next = visible?.target.getAttribute("data-console-section");
      if (next) setContext(next);
    }, { threshold: [0.35] });
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setRotation((value) => value + 1), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const suggestions = agentDockSuggestions(context, state);
  const hint = t(suggestions[rotation % suggestions.length]);
  const ask = () => {
    orbitNavigate(`/agent?q=${encodeURIComponent(draft.trim() || hint)}`);
  };
  return (
    <div style={{ bottom: "calc(18px + env(safe-area-inset-bottom))", left: "50%", position: "fixed", transform: "translateX(-50%)", width: "min(680px, calc(100vw - 32px))", zIndex: 60 }}>
      <form
        onSubmit={(submitEvent) => { submitEvent.preventDefault(); ask(); }}
        style={{ alignItems: "center", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", background: "color-mix(in srgb, var(--surface) 62%, transparent)", border: "1px solid color-mix(in srgb, var(--surface) 80%, transparent)", borderRadius: "var(--r-pill)", boxShadow: "0 12px 40px rgba(23,33,31,.16)", display: "flex", gap: 10, outline: "1px solid var(--border)", padding: "8px 8px 8px 18px" }}
      >
        <span aria-hidden style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: "var(--r-pill)", color: "var(--accent)", display: "grid", flexShrink: 0, fontSize: 14, height: 30, placeItems: "center", width: 30 }}>✦</span>
        <input
          aria-label={t({ en: "Ask iOrbit", zh: "问 iOrbit" })}
          onInput={(inputEvent) => setDraft(inputEvent.currentTarget.value)}
          placeholder={t({ en: `Ask iOrbit: "${hint}"`, zh: `问问 iOrbit：「${hint}」` })}
          style={{ background: "transparent", border: 0, color: "var(--ink)", flex: 1, fontSize: 14, minWidth: 0, outline: "none" }}
          value={draft}
        />
        <button aria-label={t({ en: "Send", zh: "发送" })} className="btn btn-primary" style={{ borderRadius: "var(--r-pill)", height: 40, padding: 0, width: 40 }} type="submit">
          <Icon color="var(--on-dark)" name="chevR" size={17} />
        </button>
      </form>
    </div>
  );
}

function HubDesktop({ language, t, viewModel }: { language: OrbitLanguage; t: Translate; viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-desktop-only" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <AccountTopNav active="me" accountInitial={viewModel.account.initial} />
      <div style={{ margin: "0 auto", maxWidth: 1080, padding: "40px 40px 80px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: 20 }}>
          <span className={`avatar g-indigo`} style={{ fontSize: 30, height: 72, width: 72 }}>{viewModel.account.initial}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{t({ en: "Good evening", zh: "晚上好" })}</div>
            <h1 className="h-display" style={{ margin: 0 }}>{viewModel.account.fullName}</h1>
            <div style={{ color: "var(--text-2)", fontSize: 15, marginTop: 4 }}>{subtitleFor(viewModel.account, language)}</div>
          </div>
          <div style={{ display: "flex", flexShrink: 0, gap: 10 }}>
            <a className="btn btn-ghost" href="/app/profile" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/profile"); }}><Icon name="edit" size={16} />{t({ en: "Edit universal profile", zh: "编辑通用画像" })}</a>
            <button className="btn btn-soft" onClick={() => { void signOut({ callbackUrl: "/app" }); }} type="button"><Icon name="logout" size={16} />{t({ en: "Sign out", zh: "退出登录" })}</button>
          </div>
        </div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", gap: 30, marginTop: 22, padding: "16px 22px" }}>
          {viewModel.stats.events + viewModel.stats.people + viewModel.stats.inProgress === 0 ? (
            <span style={{ color: "var(--text-2)", fontSize: 14 }}>{t({ en: "Register for an event and your contacts and follow-ups will build up here.", zh: "报名一场活动后，这里会开始积累你的名片夹和跟进中的关系。" })}</span>
          ) : (
            ([[t({ en: "Events", zh: "活动" }), viewModel.stats.events], [t({ en: "Contacts", zh: "名片夹" }), viewModel.stats.people], [t({ en: "Following up", zh: "跟进中" }), viewModel.stats.inProgress]] as const).map(([label, value]) => (
              <div key={label}><div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 26, fontWeight: 600 }}>{value}</div><div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 1 }}>{label}</div></div>
            ))
          )}
        </div>
        {liveConsoleEvent(viewModel.events) ? (
          <div style={{ marginTop: 22 }}>
            <TodayEventHero event={liveConsoleEvent(viewModel.events)!} t={t} />
          </div>
        ) : null}
        <div data-console-section="events" style={{ alignItems: "start", display: "grid", gap: 30, gridTemplateColumns: "1fr 320px", marginTop: 26 }}>
          <div>
            <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between", marginBottom: 16 }}>
              <h2 className="h-section" style={{ margin: 0 }}>{t({ en: "My events", zh: "我的活动" })}</h2>
              <a className="btn btn-ghost btn-sm" href="/app/home/events" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/events"); }}>{t({ en: "All", zh: "全部" })}<Icon name="chevR" size={15} /></a>
            </div>
            <MyEventsBlock events={viewModel.events} language={language} t={t} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {hubEntryCards(t).map((item) => (
              <a className="card card-hover" href={item.href} key={item.href} onClick={(event) => { event.preventDefault(); orbitNavigate(item.href); }} style={{ alignItems: "center", display: "flex", gap: 14, padding: 18, textDecoration: "none" }}>
                <span className={`avatar ${item.g}`} style={{ borderRadius: 13, fontSize: 0, height: 46, width: 46 }}><Icon color="var(--on-dark)" name={item.icon} size={22} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><h3 className="h-section" style={{ color: "var(--ink)", display: "block", margin: 0 }}>{item.title}</h3><span style={{ color: "var(--text-3)", display: "block", fontSize: 13, marginTop: 2 }}>{item.sub}</span></span>
                <Icon color="var(--text-4)" name="chevR" size={18} />
              </a>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 26 }}>
          <ConsoleReminderPanels language={language} t={t} />
        </div>
        <details data-console-section="profile" style={{ marginTop: 26 }}>
          <summary className="h-section" style={{ cursor: "pointer" }}>{t({ en: "My universal profile", zh: "我的通用画像" })}</summary>
          <ProfileSummary account={viewModel.account} language={language} t={t} />
        </details>
        <div style={{ height: 84 }} />
      </div>
      <AgentDock state={{ hasContacts: viewModel.stats.people > 0, hasLiveEvent: liveConsoleEvent(viewModel.events) !== null, hasUpcomingEvent: viewModel.events.some((event) => event.status === "upcoming") }} t={t} />
    </div>
  );
}

function liveConsoleEvent(events: OrbitLandingEventView[]): OrbitLandingEventView | null {
  return events.find((event) => event.status === "active" && event.stats.youRsvped) ?? null;
}

function HubMobile({ language, t, viewModel }: { language: OrbitLanguage; t: Translate; viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
      <AccountTopNav active="me" accountInitial={viewModel.account.initial} />
      <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 18px 36px" }}>
        <div style={{ alignItems: "center", display: "flex", gap: 14, padding: "8px 0 4px" }}>
          <span className="avatar g-indigo" style={{ fontSize: 21.84, height: 52, width: 52 }}>{viewModel.account.initial}</span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: "var(--text-3)", fontSize: 12 }}>{t({ en: "Good evening", zh: "晚上好" })}</div><h1 className="h-title" style={{ color: "var(--ink)", margin: 0 }}>{viewModel.account.fullName}</h1><div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitleFor(viewModel.account, language)}</div></div>
          <a aria-label={t({ en: "Edit", zh: "编辑" })} className="hit-44" href="/app/profile" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/profile"); }} style={{ alignItems: "center", background: "var(--surface-2)", borderRadius: "var(--r-pill)", color: "var(--text-2)", display: "flex", flexShrink: 0, height: 38, justifyContent: "center", width: 38 }}><Icon name="settings" size={19} /></a>
          <button aria-label={t({ en: "Sign out", zh: "退出" })} className="hit-44" onClick={() => { void signOut({ callbackUrl: "/app" }); }} style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: "var(--r-pill)", color: "var(--text-2)", cursor: "pointer", display: "flex", flexShrink: 0, height: 38, justifyContent: "center", width: 38 }} type="button"><Icon name="logout" size={18} /></button>
        </div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", justifyContent: "space-between", marginTop: 16, padding: "14px 16px" }}>
          {viewModel.stats.events + viewModel.stats.people + viewModel.stats.inProgress === 0 ? (
            <span style={{ color: "var(--text-2)", fontSize: 13 }}>{t({ en: "Register for an event and your contacts and follow-ups will build up here.", zh: "报名一场活动后，这里会开始积累你的名片夹和跟进中的关系。" })}</span>
          ) : (
            ([[t({ en: "Events", zh: "活动" }), viewModel.stats.events], [t({ en: "Cards", zh: "名片" }), viewModel.stats.people], [t({ en: "Following up", zh: "跟进中" }), viewModel.stats.inProgress]] as const).map(([label, value]) => (
              <div key={label} style={{ textAlign: "center" }}><div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 22, fontWeight: 600 }}>{value}</div><div style={{ color: "var(--text-3)", fontSize: 12 }}>{label}</div></div>
            ))
          )}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {hubEntryCards(t).map((item) => (
            <a className="card card-hover" href={item.href} key={item.href} onClick={(event) => { event.preventDefault(); orbitNavigate(item.href); }} style={{ flex: 1, padding: 14, textDecoration: "none" }}>
              <span className={`avatar ${item.g}`} style={{ borderRadius: 11, fontSize: 0, height: 38, width: 38 }}><Icon color="var(--on-dark)" name={item.icon} size={19} /></span>
              <h3 className="h-section" style={{ color: "var(--ink)", display: "block", margin: "10px 0 0" }}>{item.title}</h3>
              <span style={{ color: "var(--text-3)", display: "block", fontSize: 12, marginTop: 1 }}>{item.sub}</span>
            </a>
          ))}
        </div>
        {liveConsoleEvent(viewModel.events) ? (
          <div style={{ marginTop: 18 }}>
            <TodayEventHero event={liveConsoleEvent(viewModel.events)!} t={t} />
          </div>
        ) : null}
        <div data-console-section="events">
          <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", margin: "24px 0 12px" }}>
            <h2 className="h-section" style={{ margin: 0 }}>{t({ en: "My events", zh: "我的活动" })}</h2>
            <a aria-label={t({ en: "View all events", zh: "查看全部活动" })} href="/app/home/events" onClick={(event) => { event.preventDefault(); orbitNavigate("/home/events"); }} style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 2, textDecoration: "none" }}>{t({ en: "All", zh: "全部" })}<Icon name="chevR" size={14} /></a>
          </div>
          <MyEventsBlock events={viewModel.events} language={language} t={t} />
        </div>
        <div style={{ marginTop: 22 }}>
          <ConsoleReminderPanels language={language} t={t} />
        </div>
        <details data-console-section="profile" style={{ marginTop: 22 }}>
          <summary className="h-section" style={{ cursor: "pointer" }}>{t({ en: "My universal profile", zh: "我的通用画像" })}</summary>
          <ProfileSummary account={viewModel.account} language={language} t={t} />
        </details>
        <div style={{ height: 92 }} />
      </div>
      <AgentDock state={{ hasContacts: viewModel.stats.people > 0, hasLiveEvent: liveConsoleEvent(viewModel.events) !== null, hasUpcomingEvent: viewModel.events.some((event) => event.status === "upcoming") }} t={t} />
    </div>
  );
}

function EventsDesktop({ language, t, viewModel }: { language: OrbitLanguage; t: Translate; viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-desktop-only">
      <AccountTopNav active="me" accountInitial={viewModel.account.initial} />
      <div className="scroll" style={{ margin: "0 auto", maxWidth: 1180, padding: "40px 40px 90px" }}>
        <div style={{ marginBottom: 22 }}><div className="eyebrow">MY EVENTS</div><h1 className="h-display" style={{ margin: "2px 0 0" }}>{t({ en: "My events", zh: "我的活动" })}</h1></div>
        <AccountEventsBlock events={viewModel.events} language={language} t={t} />
      </div>
    </div>
  );
}

function EventsMobile({ language, t, viewModel }: { language: OrbitLanguage; t: Translate; viewModel: OrbitHomeViewModel }) {
  return (
    <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
      <AccountTopNav active="me" accountInitial={viewModel.account.initial} />
      <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 36px" }}>
        <h1 className="h-display" style={{ margin: "6px 0 18px" }}>{t({ en: "My events", zh: "我的活动" })}</h1>
        <AccountEventsBlock events={viewModel.events} language={language} t={t} />
      </div>
    </div>
  );
}

export function OrbitRealHome({ mode, viewModel }: { mode: HomeMode; viewModel: OrbitHomeViewModel }) {
  const { language, t } = useOrbitLanguage();

  if (mode === "events") {
    return (
      <main className="orbit-personal-page" data-orbit-real-page="home-events">
        <EventsDesktop language={language} t={t} viewModel={viewModel} />
        <EventsMobile language={language} t={t} viewModel={viewModel} />
      </main>
    );
  }

  return (
    <main data-orbit-real-page="home">
      <HubDesktop language={language} t={t} viewModel={viewModel} />
      <HubMobile language={language} t={t} viewModel={viewModel} />
      <style dangerouslySetInnerHTML={{ __html: `
[data-orbit-real-page="home"] .orbit-hub-profile { display:flex; flex-direction:column; gap:18px; padding:22px 22px 24px; }
[data-orbit-real-page="home"] .orbit-hub-profile-title { display:flex; align-items:center; gap:8px; }
[data-orbit-real-page="home"] .orbit-hub-profile-title svg { color:var(--accent); }
[data-orbit-real-page="home"] .orbit-hub-bio { margin:0; font-size:14.5px; line-height:1.72; color:var(--text-2); padding-left:13px; border-left:2px solid var(--border-2); }
/* facts as bordered stat cards */
[data-orbit-real-page="home"] .orbit-hub-facts { display:flex; flex-wrap:wrap; gap:10px; }
[data-orbit-real-page="home"] .orbit-hub-fact { display:flex; align-items:center; gap:10px; flex:1 1 150px; min-width:150px; padding:11px 14px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); }
[data-orbit-real-page="home"] .orbit-hub-fact-icon { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:9px; background:var(--accent-soft); color:var(--accent); flex-shrink:0; }
[data-orbit-real-page="home"] .orbit-hub-fact-body { display:flex; flex-direction:column; gap:2px; min-width:0; }
[data-orbit-real-page="home"] .orbit-hub-fact-k { font-size:11.5px; font-weight:600; letter-spacing:.01em; color:var(--text-3); }
[data-orbit-real-page="home"] .orbit-hub-fact-v { font-size:14px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
/* goal callout */
[data-orbit-real-page="home"] .orbit-hub-goal { display:flex; align-items:flex-start; gap:11px; padding:13px 15px; border-radius:var(--r-md); background:var(--accent-soft); border:1px solid color-mix(in srgb, var(--accent) 22%, transparent); }
[data-orbit-real-page="home"] .orbit-hub-goal-icon { display:inline-flex; color:var(--accent); margin-top:1px; flex-shrink:0; }
[data-orbit-real-page="home"] .orbit-hub-goal-main { display:flex; flex-direction:column; gap:3px; }
[data-orbit-real-page="home"] .orbit-hub-goal-body { margin:0; font-size:13.5px; line-height:1.55; color:var(--text); }
/* chip groups in a responsive 2-col grid */
[data-orbit-real-page="home"] .orbit-hub-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
[data-orbit-real-page="home"] .orbit-hub-group { display:flex; flex-direction:column; gap:9px; padding:13px 14px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); }
[data-orbit-real-page="home"] .orbit-hub-group-head { display:flex; align-items:center; gap:6px; }
[data-orbit-real-page="home"] .orbit-hub-group-head svg { color:var(--accent); }
[data-orbit-real-page="home"] .orbit-hub-group-k { font-size:12px; font-weight:600; color:var(--text-3); }
[data-orbit-real-page="home"] .orbit-hub-chip-row { display:flex; flex-wrap:wrap; gap:6px; }
[data-orbit-real-page="home"] .orbit-home-event-row-title { white-space:nowrap; }
@media (max-width:640px) {
  [data-orbit-real-page="home"] .orbit-home-event-row { align-items:flex-start !important; flex-wrap:wrap; }
  [data-orbit-real-page="home"] .orbit-home-event-row-copy { flex-basis:calc(100% - 70px) !important; }
  [data-orbit-real-page="home"] .orbit-home-event-row-title { display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-height:1.35; white-space:normal; }
  [data-orbit-real-page="home"] .orbit-home-event-row-action { flex-basis:100%; justify-content:flex-end; }
}
@media (max-width:720px) { [data-orbit-real-page="home"] .orbit-hub-grid { grid-template-columns:1fr; } }
` }} />
    </main>
  );
}
