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

type Translate = (copy: { en: string; zh: string }) => string;

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
  t: Translate,
): { label: string; tone: "act" | "done" | "wait" } {
  if (event.status === "ended") return { label: t({ en: "Ended", zh: "已结束" }), tone: "done" };
  if (event.status === "active") return { label: t({ en: "Live now", zh: "进行中" }), tone: "act" };
  if (event.youRsvped || event.stats.youRsvped) return { label: t({ en: "Waiting for matches", zh: "等待匹配发布" }), tone: "wait" };
  return { label: t({ en: "Upcoming", zh: "即将开始" }), tone: "wait" };
}

const APPOINTMENT_TZ = "Asia/Tokyo";

function appointmentDate(slot: ConfirmedSlot | null): Date | null {
  if (!slot?.startAt) return null;
  const date = new Date(slot.startAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function OrbitAgentDashboard({
  home,
  language,
  navigate,
  onAsk,
  t,
}: {
  home: OrbitHomeViewModel;
  language: OrbitLanguage;
  navigate: (href: string) => void;
  onAsk: (query: string) => void;
  t: Translate;
}) {
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [briefText, setBriefText] = useState("");

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
    onAsk(value);
  };

  const appointmentStart = appointmentDate(upcomingAppointment?.confirmed ?? null);
  const appointmentDayCount = appointmentStart
    ? Math.max(0, Math.ceil((appointmentStart.getTime() - now.getTime()) / 86_400_000))
    : null;
  const appointmentTz = upcomingAppointment?.confirmed?.timezone || APPOINTMENT_TZ;

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
        <OrbitAgentTodayWorkspace navigate={navigate} onAsk={onAsk} surface="desktop" />

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
                <span className="badge badge-ok">confirmed</span>
              </div>
              <div className="appt-who">
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 12.5 }}>{appointmentTz}</span>
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
              <span className={`stage${nextEvent.youRsvped || nextEvent.stats.youRsvped ? " done" : " now"}`}>
                <span className="s-dot">
                  {nextEvent.youRsvped || nextEvent.stats.youRsvped ? <Icon name="check" size={11} /> : null}
                  {t({ en: "Register + answer 2 questions", zh: "报名与回答 2 题" })}
                </span>
              </span>
              <span className="stage"><span className="s-link" /></span>
              <span className={`stage${nextEvent.youRsvped || nextEvent.stats.youRsvped ? " now" : ""}`}>
                <span className="s-dot">{t({ en: "Event profile", zh: "完成活动画像" })}</span>
              </span>
              <span className="stage"><span className="s-link" /></span>
              <span className="stage"><span className="s-dot">{t({ en: "Waiting for matches", zh: "等待匹配发布" })}</span></span>
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
          <p>{t({ en: "Browse open events and register by answering two questions.", zh: "浏览可报名的活动，回答两题即可完成报名。" })}</p>
          <button className="btn btn-soft btn-sm" onClick={() => navigate("/app/events")} type="button">
            {t({ en: "Browse", zh: "去看看" })}
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
            const badge = journeyStageBadge(event, t);
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
          <div style={{ color: "var(--text-2)", fontSize: 13.5, padding: "16px 18px" }}>
            {t({ en: "No event journeys yet — register for one and it appears here, from registration to debrief.", zh: "还没有活动旅程——报名一场活动后，从报名到复盘都会出现在这里。" })}
          </div>
        </section>
      )}
    </div>
  );
}
