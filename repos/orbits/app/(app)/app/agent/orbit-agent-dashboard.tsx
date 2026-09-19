"use client";

/**
 * iOrbit 工作台的 dashboard 首屏（设计定稿 docs/designs/journey/home-console-green.html，产品绿）。
 *
 * 登录后 iOrbit 即落在这里，回答"我现在处在哪、现在能做什么"。
 * 所有数字与条目均来自真实数据——
 *   - 身份/统计/活动旅程：home route view model（服务端注入，与旧 /app/home 同源）
 *   - iOrbit 简报（现在最值得做）：OrbitAgentTodayWorkspace（/api/agent/signals）
 *   - 即将到来的约谈：GET /api/appointments（confirmed 且未过期的第一条）
 * 发问一律经 onAsk 走真实的 /api/ai/conversations 管线。
 */
import { useEffect, useMemo, useState } from "react";

import { eventTemporalBounds } from "../orbit-event-temporal";
import type { OrbitHomeViewModel } from "../orbit-home-route-view-model";
import type { OrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import { AgentStar } from "./orbit-real-agent";
import { OrbitAgentTodayWorkspace } from "./orbit-agent-today-workspace";
import { eventRegistrationIsOpen, eventRegistrationLabel, type EventRegistrationAvailability } from "../orbit-event-registration-view-model";
import type { HomeDashboardSnapshot } from "./home-dashboard-route-service";
import type {
  HomeFactsAppointmentItem,
  HomeFactsFollowupItem,
  HomeFactsPersonalItem,
} from "./home-facts-route-service";
import type { HomeFactsViewItem } from "./home-facts-view-model";

const isPersonalFactItem = (item: HomeFactsViewItem): item is HomeFactsPersonalItem => "startsAt" in item;
const isAppointmentFactItem = (item: HomeFactsViewItem): item is HomeFactsAppointmentItem => "startsAtUtc" in item;
const isFollowupFactItem = (item: HomeFactsViewItem): item is HomeFactsFollowupItem & { href: string | null } => "contactName" in item;

type Translate = (copy: { en: string; zh: string }) => string;

/* ── 批次 4a：今日区块（消费已交付的 D25/home-facts 聚合）──────────────────
   数据全部走既有通道：facts 快照经 refreshHomeDashboardAction（use server，
   运行时动态 import，避免把 server 依赖链打进测试与 SSR 首载）；继续对话走
   既有 GET /api/ai/conversations/sessions。三态口径沿用 facts 的
   ready/empty/unavailable，不伪造设计稿 mock 数字。 */

interface AgentHistorySession {
  createdAt: string;
  id: string;
  title: string;
}

function parseHistorySessions(value: unknown): AgentHistorySession[] {
  if (typeof value !== "object" || value === null) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: AgentHistorySession[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.createdAt !== "string") continue;
    const organization = record.organization as { customTitle?: unknown } | undefined;
    const customTitle = typeof organization?.customTitle === "string" ? organization.customTitle.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    out.push({ createdAt: record.createdAt, id: record.id, title: customTitle || title });
  }
  return out;
}

const tokyoDayKey = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: APPOINTMENT_TZ, year: "numeric" }).format(date);

type TodayFactsState = "empty" | "pending" | "ready" | "unavailable";

interface ConfirmedSlot {
  durationMinutes?: number;
  startAt?: string;
  timezone?: string;
}

interface AppointmentView {
  appointmentId: string;
  contactId: string | null;
  confirmed: ConfirmedSlot | null;
  eventId: string | null;
  status: string;
}

function parseAppointments(value: unknown): AppointmentView[] {
  if (!Array.isArray(value)) return [];
  const out: AppointmentView[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.appointmentId !== "string" || typeof record.status !== "string") continue;
    const confirmed =
      typeof record.confirmed === "object" && record.confirmed !== null
        ? (record.confirmed as ConfirmedSlot)
        : null;
    out.push({
      appointmentId: record.appointmentId,
      confirmed,
      contactId: typeof record.contactId === "string" ? record.contactId : null,
      eventId: typeof record.eventId === "string" ? record.eventId : null,
      status: record.status,
    });
  }
  return out;
}

function greeting(t: Translate, now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return t({ en: "Working late", zh: "夜深了" });
  if (hour < 11) return t({ en: "Good morning", zh: "早上好" });
  if (hour < 14) return t({ en: "Good afternoon", zh: "中午好" });
  if (hour < 18) return t({ en: "Good afternoon", zh: "下午好" });
  return t({ en: "Good evening", zh: "晚上好" });
}

function journeyStageBadge(
  event: OrbitHomeViewModel["events"][number],
  registrationAvailability: EventRegistrationAvailability,
  t: Translate,
): { label: string; tone: "act" | "done" | "wait" } {
  if (event.status === "ended") return { label: t({ en: "Ended", zh: "已结束" }), tone: "done" };
  if (event.status === "active") return { label: t({ en: "Live now", zh: "进行中" }), tone: "act" };
  // Registration alone does not say whether the organizer has published matches.
  if (event.youRsvped || event.stats.youRsvped) return { label: t({ en: "Registered", zh: "已报名" }), tone: "done" };
  return { label: t(eventRegistrationLabel(registrationAvailability)), tone: eventRegistrationIsOpen(registrationAvailability) ? "act" : "wait" };
}

const APPOINTMENT_TZ = "Asia/Tokyo";

function appointmentDate(slot: ConfirmedSlot | null): Date | null {
  if (!slot?.startAt) return null;
  const date = new Date(slot.startAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function OrbitAgentDashboard({
  home,
  initialBriefText = "",
  language,
  navigate,
  onAsk,
  onBriefAsk,
  registrationAvailabilityByEventId,
  t,
}: {
  home: OrbitHomeViewModel;
  initialBriefText?: string;
  language: OrbitLanguage;
  navigate: (href: string) => void;
  onAsk: (query: string) => void;
  onBriefAsk?: (query: string) => void;
  registrationAvailabilityByEventId: Readonly<Record<string, EventRegistrationAvailability>>;
  t: Translate;
}) {
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [briefText, setBriefText] = useState(initialBriefText);
  const [showEmptyAccountDemo, setShowEmptyAccountDemo] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/appointments", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
        if (response.ok) setAppointments(parseAppointments(body?.data));
      })
      .catch(() => {
        /* 约谈卡缺席即可，不阻塞 dashboard */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (initialBriefText) setBriefText((current) => current || initialBriefText);
  }, [initialBriefText]);

  // 批次 4a：D25 聚合（今日日程/月历/联系人机会）。window 守卫让 SSR 与
  // node 测试环境零副作用；动态 import 避免 server action 依赖链进入首载。
  const [homeSnapshot, setHomeSnapshot] = useState<HomeDashboardSnapshot | "pending" | "unavailable">("pending");
  const [historySessions, setHistorySessions] = useState<readonly AgentHistorySession[] | "pending" | "unavailable">("pending");
  useEffect(() => {
    if (typeof window === "undefined") return;
    let live = true;
    void import("./home-dashboard-actions")
      .then((mod) => mod.refreshHomeDashboardAction())
      .then((result) => {
        if (live) setHomeSnapshot(result.state === "snapshot" ? result.snapshot : "unavailable");
      })
      .catch(() => {
        if (live) setHomeSnapshot("unavailable");
      });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    void fetch("/api/ai/conversations/sessions?limit=3", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
        if (response.ok && body?.data) setHistorySessions(parseHistorySessions(body.data));
        else setHistorySessions("unavailable");
      })
      .catch(() => setHistorySessions("unavailable"));
    return () => controller.abort();
  }, []);

  const now = new Date();
  const locale = language === "en" ? "en-US" : "zh-CN";
  const upcomingAppointment = useMemo(() => {
    return appointments
      .filter((item) => item.status === "confirmed" && item.confirmed?.startAt)
      .map((item) => ({ at: new Date(item.confirmed?.startAt ?? 0).getTime(), item }))
      .filter(({ at }) => Number.isFinite(at) && at > Date.now())
      .sort((a, b) => a.at - b.at)[0]?.item ?? null;
  }, [appointments]);

  const journeys = home.events.slice(0, 5);
  const nextEvent = journeys.find((event) => event.status !== "ended") ?? null;
  const endedPending = journeys.find((event) => event.status === "ended") ?? null;
  const nextEventRegistrationAvailability = nextEvent
    ? registrationAvailabilityByEventId[nextEvent.id] ?? "unavailable"
    : "unavailable";
  const nextEventRegistered = Boolean(
    nextEvent && (nextEvent.youRsvped || nextEvent.stats.youRsvped),
  );
  const openUnregisteredEvent = journeys.find(
    (event) =>
      event.status === "upcoming" &&
      !event.youRsvped &&
      !event.stats.youRsvped &&
      eventRegistrationIsOpen(registrationAvailabilityByEventId[event.id] ?? "unavailable"),
  );

  const nextEventDate = nextEvent ? eventTemporalBounds(nextEvent.startsAt, nextEvent.endsAt).start : null;
  const daysToNext = nextEventDate ? Math.max(0, Math.ceil((nextEventDate.getTime() - now.getTime()) / 86_400_000)) : null;

  const subLine = [
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", weekday: "short" }).format(now),
    daysToNext !== null && daysToNext > 0
      ? t({ en: `next event in ${daysToNext} days`, zh: `距下一场活动还有 ${daysToNext} 天` })
      : null,
    upcomingAppointment ? t({ en: "1 appointment coming up", zh: "1 个约谈待赴约" }) : null,
  ].filter(Boolean).join(" · ");

  const askChips = [
    nextEvent
      ? { label: t({ en: `Help me prepare for ${nextEvent.name}`, zh: `帮我准备「${nextEvent.name}」` }), query: t({ en: `Help me prepare for the event ${nextEvent.name}`, zh: `帮我准备活动「${nextEvent.name}」` }) }
      : { label: t({ en: "Which events are worth attending?", zh: "有哪些值得去的活动？" }), query: t({ en: "Which upcoming events are worth attending for my goals?", zh: "按我的目标看看有哪些值得去的活动" }) },
    { label: t({ en: "Who is worth following up?", zh: "谁值得跟进一下？" }), query: t({ en: "Who in my contacts is worth following up right now?", zh: "我的人脉里现在谁值得跟进？" }) },
    endedPending
      ? { label: t({ en: "Debrief my last event", zh: "复盘上一场活动" }), query: t({ en: `Debrief the ended event ${endedPending.name}`, zh: `复盘已结束的活动「${endedPending.name}」` }) }
      : { label: t({ en: "Organize my follow-ups", zh: "整理我的跟进" }), query: t({ en: "Organize my pending follow-ups", zh: "整理我的待办跟进" }) },
  ];

  const sendBrief = () => {
    const value = briefText.trim();
    if (!value) return;
    setBriefText("");
    (onBriefAsk ?? onAsk)(value);
  };

  const appointmentStart = appointmentDate(upcomingAppointment?.confirmed ?? null);
  const appointmentDayCount = appointmentStart
    ? Math.max(0, Math.ceil((appointmentStart.getTime() - now.getTime()) / 86_400_000))
    : null;
  const appointmentTz = upcomingAppointment?.confirmed?.timezone || APPOINTMENT_TZ;

  // ── 批次 4a 派生：今日日程 / 月历微件 / 联系人机会（全部来自 D25 facts）──
  const facts = homeSnapshot !== "pending" && homeSnapshot !== "unavailable" ? homeSnapshot.facts : null;
  const factsStateOf = (state: "empty" | "ready" | "unavailable" | undefined): TodayFactsState =>
    homeSnapshot === "pending" ? "pending" : homeSnapshot === "unavailable" ? "unavailable" : state ?? "unavailable";
  const personalItems = (facts?.personal.items ?? []).filter(isPersonalFactItem);
  const factAppointmentItems = (facts?.appointments.items ?? []).filter(isAppointmentFactItem);
  const todayKey = tokyoDayKey(now);
  const fmtTime = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? "--:--"
      : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: APPOINTMENT_TZ }).format(date);
  };
  const todayRows = [
    ...personalItems
      .filter((item) => (item.occurrenceDate ?? item.startsAt.slice(0, 10)) === todayKey)
      .map((item) => ({
        id: item.key,
        time: item.allDay ? t({ en: "All day", zh: "全天" }) : fmtTime(item.startsAt),
        title: item.title,
      })),
    ...factAppointmentItems
      .filter((item) => tokyoDayKey(new Date(item.startsAtUtc)) === todayKey)
      .map((item) => ({
        id: item.key,
        time: fmtTime(item.startsAtUtc),
        title: t({ en: "Confirmed appointment", zh: "已确认约谈" }),
      })),
  ];
  const todayState: TodayFactsState = (() => {
    const personal = factsStateOf(facts?.personal.state);
    const appointments = factsStateOf(facts?.appointments.state);
    if (personal === "pending" || appointments === "pending") return "pending";
    if (todayRows.length > 0) return "ready";
    if (personal === "unavailable" && appointments === "unavailable") return "unavailable";
    return "empty";
  })();
  const opportunityState = factsStateOf(facts?.followups.state);
  const opportunityItems = (facts?.followups.current.items ?? []).filter(isFollowupFactItem).slice(0, 3);
  const [tokyoYear, tokyoMonth, tokyoDay] = todayKey.split("-").map(Number);
  const monthPrefix = `${tokyoYear}-${String(tokyoMonth).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(tokyoYear, tokyoMonth, 0)).getUTCDate();
  const firstWeekOffset = (new Date(Date.UTC(tokyoYear, tokyoMonth - 1, 1)).getUTCDay() + 6) % 7;
  const markedDays = new Set<number>();
  for (const item of personalItems) {
    const key = item.occurrenceDate ?? item.startsAt.slice(0, 10);
    if (key.startsWith(monthPrefix)) markedDays.add(Number(key.slice(8, 10)));
  }
  for (const item of factAppointmentItems) {
    const key = tokyoDayKey(new Date(item.startsAtUtc));
    if (key.startsWith(monthPrefix)) markedDays.add(Number(key.slice(8, 10)));
  }
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: firstWeekOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const calendarState: TodayFactsState = (() => {
    const personal = factsStateOf(facts?.personal.state);
    return personal === "pending" ? "pending" : personal;
  })();
  const weekdayLabels = language === "en"
    ? ["M", "T", "W", "T", "F", "S", "S"]
    : ["一", "二", "三", "四", "五", "六", "日"];
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", timeZone: APPOINTMENT_TZ, year: "numeric" }).format(now);
  const renderAgState = (state: TodayFactsState, emptyCopy: { en: string; zh: string }) =>
    state === "pending"
      ? <p className="ag-state">{t({ en: "Loading…", zh: "读取中…" })}</p>
      : state === "unavailable"
        ? <p className="ag-state">{t({ en: "This source is unavailable right now.", zh: "来源暂不可用。" })}</p>
        : state === "empty"
          ? <p className="ag-state">{t(emptyCopy)}</p>
          : null;

  const eventDateLabel = (starts: Date | null): { d: string; m: string } => ({
    d: starts ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: APPOINTMENT_TZ }).format(starts) : "--",
    m: starts
      ? language === "en"
        ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: APPOINTMENT_TZ }).format(starts)
        : new Intl.DateTimeFormat("zh-CN", { month: "numeric", timeZone: APPOINTMENT_TZ }).format(starts)
      : "--",
  });

  return (
    <div data-orbit-agent-dashboard>
      <style>{`
        /* Orbit_0918 批次 4a：dashboard 首屏换肤 + 今日四卡（ag-*）。
           作用域 token 重映射到 0918 靛蓝体系；布局/逻辑/数据钩子零改动。 */
        [data-orbit-agent-dashboard]{
          color-scheme:light;
          --ink:#0E1225;--text:#0E1225;--text-2:#3B3F7A;--text-3:#6B6F99;--text-4:#9FA3C4;
          --bg:#FBFBFE;--bg-soft:#F7F7FD;--bg-sunken:#F1F1FA;
          --surface:#FFFFFF;--surface-2:#F7F7FD;--surface-3:#ECEEFB;
          --border:#E8E9F6;--border-2:#DDDEFA;--border-strong:#B9BCEB;--hairline:#F1F1FA;
          --accent:#4B4FC7;--accent-hover:#2E3270;--accent-soft:#ECEEFB;--accent-ring:#B9BCEB;
          --on-accent:#FFFFFF;--on-dark:#FFFFFF;
          background:#FBFBFE;color:#0E1225;
        }
        [data-orbit-agent-dashboard] .sec-title h2{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;letter-spacing:-0.02em;color:#0E1225}
        [data-orbit-agent-dashboard] .hub-head h1{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;letter-spacing:-0.02em}
        [data-orbit-agent-dashboard] .btn-primary{background:#0E1225;border-color:#0E1225;box-shadow:none;color:#FFFFFF}
        [data-orbit-agent-dashboard] .btn-primary:hover:not(:disabled){background:#2E3270;border-color:#2E3270}
        [data-orbit-agent-dashboard] .btn-ghost{background:#FFFFFF;border-color:#DDDEFA;color:#3B3F7A;box-shadow:none}
        [data-orbit-agent-dashboard] .btn-ghost:hover:not(:disabled){border-color:#B9BCEB;color:#2E3270}
        [data-orbit-agent-dashboard] .btn-soft{background:#ECEEFB;border-color:#ECEEFB;color:#2E3270;box-shadow:none}
        [data-orbit-agent-dashboard] .chip{border-color:#DDDEFA;color:#3B3F7A;background:#FFFFFF}
        [data-orbit-agent-dashboard] .card{background:#FFFFFF;border:1px solid #E8E9F6;border-radius:18px;box-shadow:none}
        [data-orbit-agent-dashboard] .ag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}
        [data-orbit-agent-dashboard] .ag-card{background:#FFFFFF;border:1px solid #E8E9F6;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:12px;min-width:0}
        [data-orbit-agent-dashboard] .ag-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
        [data-orbit-agent-dashboard] .ag-card-head b{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;font-size:17px;letter-spacing:-0.02em;color:#0E1225}
        [data-orbit-agent-dashboard] .ag-card-head a{font-size:12px;color:#4B4FC7;text-decoration:none;white-space:nowrap}
        [data-orbit-agent-dashboard] .ag-card-head a:hover{color:#2E3270;text-decoration:underline}
        [data-orbit-agent-dashboard] .ag-rows{display:flex;flex-direction:column;gap:8px}
        [data-orbit-agent-dashboard] .ag-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;height:auto;text-align:left;background:#F7F7FD;border:1px solid #E8E9F6;border-radius:12px;padding:10px 12px;box-shadow:none;white-space:normal;line-height:1.45}
        [data-orbit-agent-dashboard] .ag-row:hover:not(:disabled){border-color:#B9BCEB;background:#F1F1FA}
        [data-orbit-agent-dashboard] .ag-row-static{display:flex;align-items:baseline;gap:10px;background:#F7F7FD;border:1px solid #E8E9F6;border-radius:12px;padding:10px 12px}
        [data-orbit-agent-dashboard] .ag-time{font-size:12px;color:#4B4FC7;font-weight:700;flex:none;min-width:44px}
        [data-orbit-agent-dashboard] .ag-row-title{font-size:14px;font-weight:600;color:#0E1225;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
        [data-orbit-agent-dashboard] .ag-row-sub{font-size:12px;color:#6B6F99;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
        [data-orbit-agent-dashboard] .ag-state{font-size:13px;color:#9FA3C4;margin:0}
        [data-orbit-agent-dashboard] .ag-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
        [data-orbit-agent-dashboard] .ag-cal-wd{font-size:11px;color:#9FA3C4;padding:4px 0}
        [data-orbit-agent-dashboard] .ag-cal-d{position:relative;font-size:12px;color:#3B3F7A;padding:5px 0;border-radius:8px}
        [data-orbit-agent-dashboard] .ag-cal-d.today{background:#0E1225;color:#FFFFFF;font-weight:700}
        [data-orbit-agent-dashboard] .ag-cal-d.marked::after{content:"";position:absolute;left:50%;bottom:2px;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#4B4FC7}
        [data-orbit-agent-dashboard] .ag-cal-d.today.marked::after{background:#FFFFFF}
      `}</style>
      {/* ── 身份行 ── */}
      <div className="hub-head">
        <Avatar g="g-sand" letter={home.account.initial} size={64} />
        <div className="who">
          <div className="eyebrow" style={{ marginBottom: 4 }}>{greeting(t, now)}</div>
          <h1 className="h-display">{home.account.fullName}</h1>
          <div className="sub">{subLine}</div>
        </div>
      </div>

      {/* ── 统计条 ── */}
      <div className="hub-stats">
        {[
          [home.stats.events, t({ en: "Events", zh: "活动" })],
          [home.stats.people, t({ en: "Contacts", zh: "人脉" })],
          [home.stats.inProgress, t({ en: "Following up", zh: "跟进中" })],
          [upcomingAppointment ? 1 : 0, t({ en: "Appointments", zh: "待赴约谈" })],
        ].map(([value, label]) => (
          <div key={String(label)}>
            <div className="v">{value}</div>
            <div className="k">{label}</div>
          </div>
        ))}
      </div>

      {/* ── iOrbit 简报 ── */}
      <section className="brief">
        <div className="brief-head">
          <span className="brief-mark"><AgentStar size={15} /></span>
          <b>iOrbit</b>
          <span className="st">{t({ en: "Based on your real state · external actions always need your confirmation", zh: "基于你的真实状态 · 涉及对外动作会先经你确认" })}</span>
        </div>

        {/* 真实信号：/api/agent/signals（lede + 现在最值得做）*/}
        <div className="orbit-desktop-only">
          <OrbitAgentTodayWorkspace navigate={navigate} onAsk={onAsk} surface="desktop" />
        </div>
        <div className="orbit-mobile-only">
          <OrbitAgentTodayWorkspace navigate={navigate} onAsk={onAsk} surface="mobile" />
        </div>

        {/* 简报内的玻璃输入（真实对话管线）*/}
        <form
          className="glass brief-input"
          onSubmit={(event) => {
            event.preventDefault();
            sendBrief();
          }}
        >
          <Icon color="var(--text-4)" name="message" size={16} />
          <input
            aria-label={t({ en: "Ask iOrbit", zh: "向 iOrbit 提问" })}
            onChange={(event) => setBriefText(event.target.value)}
            placeholder={t({ en: "Ask iOrbit: what do you want to get done?", zh: "问 iOrbit：你想促成什么？" })}
            type="text"
            value={briefText}
          />
          <button aria-label={t({ en: "Send", zh: "发送" })} className="brief-send hit-44" data-orbit-agent-submit="true" type="submit">
            <Icon name="arrow" size={15} style={{ transform: "rotate(-45deg)" }} />
          </button>
        </form>
        <div className="brief-chips">
          {askChips.map((chip) => (
            <button className="chip" key={chip.label} onClick={() => onAsk(chip.query)} type="button">{chip.label}</button>
          ))}
        </div>
        <p className="brief-note" data-orbit-agent-privacy-boundary>
          {t({
            en: "iOrbit only answers from the events and contacts you authorized; external actions always need your confirmation.",
            zh: "iOrbit 只根据你已授权的活动与人脉数据回答；涉及对外动作会先经你确认。",
          })}
        </p>

        {home.stats.people === 0 ? (
          <section
            data-orbit-agent-empty-account-demo
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              display: "grid",
              gap: 12,
              marginTop: 16,
              padding: 16,
            }}
          >
            <div>
              <b>{t({ en: "Try the decision flow before importing", zh: "还没导入联系人，也可以先体验决策流程" })}</b>
              <p style={{ color: "var(--text-2)", fontSize: 13, margin: "5px 0 0" }}>
                {t({
                  en: "This uses three clearly labeled archetypes, not real people or account data.",
                  zh: "这里使用 3 个明确标注的角色示例，不会冒充真实联系人或账号数据。",
                })}
              </p>
            </div>
            <button
              aria-expanded={showEmptyAccountDemo}
              className="btn btn-secondary btn-sm"
              onClick={() => setShowEmptyAccountDemo((value) => !value)}
              type="button"
            >
              {showEmptyAccountDemo
                ? t({ en: "Hide example", zh: "收起示例结果" })
                : t({ en: "Preview a top-3 result", zh: "预览“最值得联系的 3 位”" })}
            </button>
            {showEmptyAccountDemo ? (
              <div data-orbit-agent-demo-result style={{ display: "grid", gap: 8 }}>
                {[
                  t({ en: "1 · Potential customer — validate a current need", zh: "1 · 潜在客户角色——先验证当前需求" }),
                  t({ en: "2 · Trusted peer — ask for a focused introduction", zh: "2 · 熟悉的同行角色——提出一次明确引荐" }),
                  t({ en: "3 · Channel partner — test a small joint next step", zh: "3 · 渠道伙伴角色——验证一个小型合作下一步" }),
                ].map((item) => (
                  <div key={item} style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", color: "var(--text)", fontSize: 13, padding: "10px 12px" }}>
                    {item}
                  </div>
                ))}
                <p style={{ color: "var(--text-2)", fontSize: 12, margin: 0 }}>
                  {t({
                    en: "After you import contacts, iOrbit replaces these archetypes with your authorized records, evidence, and editable drafts.",
                    zh: "导入联系人后，iOrbit 会用你已授权的真实记录、依据和可编辑草稿替换这些角色示例。",
                  })}
                </p>
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/app/contacts/new")} type="button">
                  {t({ en: "Import contacts when ready", zh: "准备好后导入联系人" })}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>

      {/* ── 今日（D25 聚合：今日日程 / 月历微件 / 联系人机会 / 继续对话）── */}
      <div className="sec-title"><h2>{t({ en: "Today", zh: "今日" })}</h2><span>{t({ en: "Schedule, opportunities and recent conversations from your real data", zh: "来自你真实数据的日程、机会与最近对话" })}</span></div>
      <section className="ag-grid" data-orbit-agent-today-facts>
        <div className="ag-card" data-orbit-agent-today-schedule={todayState}>
          <div className="ag-card-head">
            <b>{t({ en: "Today's schedule", zh: "今日日程" })}</b>
            <a href="/app/schedule">{t({ en: "Open schedule", zh: "进入日程页" })}</a>
          </div>
          {todayState === "ready" ? (
            <div className="ag-rows">
              {todayRows.map((row) => (
                <div className="ag-row-static" key={row.id}>
                  <span className="ag-time">{row.time}</span>
                  <span className="ag-row-title">{row.title}</span>
                </div>
              ))}
            </div>
          ) : renderAgState(todayState, { en: "Nothing scheduled for today.", zh: "今天没有日程安排。" })}
        </div>

        <div className="ag-card" data-orbit-agent-month-calendar={calendarState}>
          <div className="ag-card-head">
            <b>{monthTitle}</b>
            <a href="/app/schedule">{t({ en: "Open schedule", zh: "进入日程页" })}</a>
          </div>
          {calendarState === "pending" || calendarState === "unavailable" ? (
            renderAgState(calendarState, { en: "", zh: "" })
          ) : (
            <div className="ag-cal">
              {weekdayLabels.map((label, index) => <span className="ag-cal-wd" key={`${label}-${index}`}>{label}</span>)}
              {calendarCells.map((day, index) => (
                <span
                  className={`ag-cal-d${day === tokyoDay ? " today" : ""}${day !== null && markedDays.has(day) ? " marked" : ""}`}
                  key={index}
                >
                  {day ?? ""}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ag-card" data-orbit-agent-opportunities={opportunityState}>
          <div className="ag-card-head">
            <b>{t({ en: "Contact opportunities", zh: "联系人机会" })}</b>
            <a href="/app/followups">{t({ en: "All follow-ups", zh: "全部跟进" })}</a>
          </div>
          {opportunityState === "ready" && opportunityItems.length > 0 ? (
            <div className="ag-rows">
              {opportunityItems.map((item) => (
                <button
                  className="btn ag-row"
                  key={item.key}
                  onClick={() => navigate(item.href ?? (item.contactId ? `/app/contacts/${encodeURIComponent(item.contactId)}` : "/app/followups"))}
                  type="button"
                >
                  <span className="ag-row-title">{item.contactName}</span>
                  <span className="ag-row-sub">{item.title}</span>
                </button>
              ))}
            </div>
          ) : opportunityState === "ready" ? (
            <p className="ag-state">{t({ en: "No pending follow-ups right now.", zh: "当前没有待推进的跟进。" })}</p>
          ) : renderAgState(opportunityState, { en: "No pending follow-ups right now.", zh: "当前没有待推进的跟进。" })}
        </div>

        <div className="ag-card" data-orbit-agent-resume-chat>
          <div className="ag-card-head">
            <b>{t({ en: "Continue a conversation", zh: "继续对话" })}</b>
          </div>
          {historySessions === "pending" ? (
            <p className="ag-state">{t({ en: "Loading…", zh: "读取中…" })}</p>
          ) : historySessions === "unavailable" ? (
            <p className="ag-state">{t({ en: "This source is unavailable right now.", zh: "来源暂不可用。" })}</p>
          ) : historySessions.length === 0 ? (
            <p className="ag-state">{t({ en: "No conversations yet.", zh: "暂无历史对话。" })}</p>
          ) : (
            <div className="ag-rows">
              {historySessions.map((session) => (
                <button
                  className="btn ag-row"
                  key={session.id}
                  onClick={() => navigate(`/app/agent?session=${encodeURIComponent(session.id)}`)}
                  type="button"
                >
                  <span className="ag-row-title">{session.title || t({ en: "Untitled conversation", zh: "未命名对话" })}</span>
                  <span className="ag-row-sub">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: APPOINTMENT_TZ }).format(new Date(session.createdAt))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 即将到来的约谈 ── */}
      {upcomingAppointment ? (
        <>
          <div className="sec-title"><h2>{t({ en: "Upcoming appointment", zh: "即将到来的约谈" })}</h2><span>{t({ en: "From your contacts · confirmed by both sides", zh: "来自你的人脉 · 双方已确认" })}</span></div>
          <section aria-label={t({ en: "Appointment", zh: "约谈提醒" })} className="card appt">
            <div className="appt-when">
              <span className="d">
                {appointmentStart
                  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: appointmentTz }).format(appointmentStart).split("/").reverse().join("/")
                  : "--"}
              </span>
              <span className="t">
                {appointmentStart
                  ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: appointmentTz, weekday: "short" }).format(appointmentStart)
                  : t({ en: "Time confirmed", zh: "时间已确认" })}
              </span>
              {upcomingAppointment.confirmed?.durationMinutes ? (
                <span className="len">{upcomingAppointment.confirmed.durationMinutes} min</span>
              ) : null}
              {appointmentDayCount !== null && appointmentDayCount > 0 ? (
                <span className="in">{t({ en: `in ${appointmentDayCount} days`, zh: `还有 ${appointmentDayCount} 天` })}</span>
              ) : null}
            </div>
            <div className="appt-main">
              <div className="appt-title-row">
                <b>{t({ en: "Online appointment", zh: "线上约谈" })}</b>
                <span className="badge badge-ok">{t({ en: "Confirmed by both", zh: "双方已确认" })}</span>
              </div>
              <div className="appt-who">
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>{appointmentTz}</span>
              </div>
              <div className="appt-actions">
                {upcomingAppointment.contactId ? (
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/app/contacts/${encodeURIComponent(upcomingAppointment.contactId ?? "")}`)} type="button">
                    {t({ en: "Open card & evidence", zh: "查看名片与依据" })}
                  </button>
                ) : null}
                {upcomingAppointment.eventId ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/app/events/${encodeURIComponent(upcomingAppointment.eventId ?? "")}`)} type="button">
                    {t({ en: "Open event", zh: "打开活动" })}
                  </button>
                ) : null}
                <button className="btn btn-ghost btn-sm" onClick={() => onAsk(t({ en: "Help me prepare for my upcoming appointment", zh: "帮我准备即将到来的约谈" }))} type="button">
                  {t({ en: "Let iOrbit prep me", zh: "让 iOrbit 帮我准备" })}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* ── 现在可以做 ── */}
      <div className="sec-title"><h2>{t({ en: "What you can do now", zh: "现在可以做" })}</h2><span>{t({ en: "Ordered by your current state", zh: "按你的当前状态排序" })}</span></div>
      <section className="grid">
        {nextEvent ? (
          <article className="card act span2">
            <div className="act-top">
              <span className="act-ic ic-teal"><Icon name="calendar" size={17} /></span>
              <b>{nextEvent.name || nextEvent.code}</b>
            </div>
            <div className="stage-row">
              <span className={`stage${nextEventRegistered ? " done" : eventRegistrationIsOpen(nextEventRegistrationAvailability) ? " now" : ""}`}>
                <span className="s-dot">
                  {nextEventRegistered ? <Icon name="check" size={11} /> : null}
                  {nextEventRegistered
                    ? t({ en: "Registration complete", zh: "已完成报名" })
                    : eventRegistrationIsOpen(nextEventRegistrationAvailability)
                      ? t({ en: "Register + answer 2 questions", zh: "报名与回答 2 题" })
                      : journeyStageBadge(nextEvent, nextEventRegistrationAvailability, t).label}
                </span>
              </span>
              <span className="stage"><span className="s-link" /></span>
              <span className={`stage${nextEventRegistered ? " now" : ""}`}>
                <span className="s-dot">{t({ en: "Event profile", zh: "完成活动画像" })}</span>
              </span>
              <span className="stage"><span className="s-link" /></span>
              <span className="stage"><span className="s-dot">{t({ en: "Check match status", zh: "查看匹配进度" })}</span></span>
              <span className="stage"><span className="s-link" /></span>
              <span className="stage"><span className="s-dot">{t({ en: "Event day", zh: "活动当天" })}</span></span>
            </div>
            <p>
              {[
                nextEventDate
                  ? new Intl.DateTimeFormat(locale, { day: "numeric", hour: "2-digit", minute: "2-digit", month: "long", timeZone: APPOINTMENT_TZ, weekday: "short" }).format(nextEventDate)
                  : null,
                nextEvent.venue || nextEvent.place,
              ].filter(Boolean).join(" · ")}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/app/events/${encodeURIComponent(nextEvent.id)}`)} type="button">
              {t({ en: "Open event journey", zh: "进入活动旅程" })}
              <Icon name="arrow" size={14} />
            </button>
          </article>
        ) : null}

        {endedPending ? (
          <article className="card act ai">
            <div className="act-top">
              <span className="act-ic ic-teal"><Icon name="doc" size={17} /></span>
              <b>{t({ en: "Debrief pending", zh: "会后复盘待生成" })}</b>
              <span className="ai-chip"><AgentStar size={10} />iOrbit</span>
            </div>
            <p>{t({ en: `“${endedPending.name}” has ended — the debrief is not generated yet. Do it while it is fresh.`, zh: `「${endedPending.name}」已结束，复盘报告还没生成——趁记忆还热。` })}</p>
            <button className="btn btn-soft btn-sm" onClick={() => navigate(`/app/events/${encodeURIComponent(endedPending.id)}`)} type="button">
              {t({ en: "Generate debrief", zh: "生成复盘" })}
            </button>
          </article>
        ) : null}

        <article className="card act">
          <div className="act-top">
            <span className="act-ic ic-amber"><Icon name="search" size={17} /></span>
            <b>{t({ en: "Find your next event", zh: "发现下一场活动" })}</b>
          </div>
          <p>
            {openUnregisteredEvent
              ? t({ en: "There are events accepting registration now. Review their requirements to register.", zh: "目前有活动正在开放报名，可查看要求后提交报名。" })
              : t({ en: "Review upcoming events and their current registration status.", zh: "查看近期活动及各自的真实报名状态。" })}
          </p>
          <button className="btn btn-soft btn-sm" onClick={() => navigate("/app/events")} type="button">
            {openUnregisteredEvent
              ? t({ en: "Browse open events", zh: "查看开放报名活动" })
              : t({ en: "View event status", zh: "查看活动状态" })}
          </button>
        </article>

        <article className="card act">
          <div className="act-top">
            <span className="act-ic ic-gray"><Icon name="users" size={17} /></span>
            <b>{t({ en: "Contacts", zh: "人脉库" })}</b>
          </div>
          <p>
            {home.stats.people > 0
              ? t({ en: `${home.stats.people} contacts — people you met at events live here.`, zh: `${home.stats.people} 位联系人——活动里认识的人都沉淀在这里。` })
              : t({ en: "No contacts yet. People you meet at events land here; you can also add one manually.", zh: "还没有联系人。从活动里认识的人会自动沉淀到这里，也可以手动添加第一位。" })}
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(home.stats.people > 0 ? "/app/contacts" : "/app/contacts/new")} type="button">
            {home.stats.people > 0 ? t({ en: "Open contacts", zh: "打开人脉" }) : t({ en: "Add your first contact", zh: "添加第一位联系人" })}
          </button>
        </article>
      </section>

      {/* ── 我的活动旅程 ── */}
      <div className="sec-title"><h2>{t({ en: "My event journeys", zh: "我的活动旅程" })}</h2><span>{t({ en: "One page per event, registration to debrief", zh: "每场活动一个页面，从报名到复盘" })}</span></div>
      {journeys.length ? (
        <section className="card journeys">
          {journeys.map((event) => {
            const badge = journeyStageBadge(
              event,
              registrationAvailabilityByEventId[event.id] ?? "unavailable",
              t,
            );
            const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
            const date = eventDateLabel(bounds.start);
            const timeLabel = bounds.start
              ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: APPOINTMENT_TZ, weekday: "short" }).format(bounds.start)
              : null;
            return (
              <button className="j-row" key={event.id} onClick={() => navigate(`/app/events/${encodeURIComponent(event.id)}`)} type="button">
                <span className="j-date"><span className="m">{date.m}</span><span className="d">{date.d}</span></span>
                <span className="j-main">
                  <b>{event.name || event.code}</b>
                  <span>{[timeLabel, event.venue || event.place].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={`badge ${badge.tone === "act" ? "badge-ok" : badge.tone === "wait" ? "badge-wait" : "badge-muted"}`}>{badge.label}</span>
                <Icon color="var(--text-4)" name="chevR" size={16} style={{ flex: "0 0 auto" }} />
              </button>
            );
          })}
        </section>
      ) : (
        <section className="card journeys">
          <div style={{ color: "var(--text-2)", fontSize: 14, padding: "16px 18px" }}>
            {t({ en: "No event journeys yet — register for one and it appears here, from registration to debrief.", zh: "还没有活动旅程——报名一场活动后，从报名到复盘都会出现在这里。" })}
          </div>
        </section>
      )}
    </div>
  );
}
