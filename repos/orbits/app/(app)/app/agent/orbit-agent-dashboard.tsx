"use client";

/**
 * iOrbit 工作台的 dashboard 首屏（设计定稿 docs/designs/journey/home-console-green.html）。
 *
 * 替换 agent 页的旧欢迎屏：登录后 iOrbit 即落在这里，回答"我现在处在哪、
 * 现在能做什么"。所有数字与条目均来自真实数据——
 *   - 身份/统计/活动旅程：home route view model（服务端注入，与旧 /app/home 同源）
 *   - 今日最值得做：OrbitAgentTodayWorkspace（/api/ai/today）
 *   - 即将到来的约谈：GET /api/appointments（confirmed 且未过期的第一条）
 * 发问一律经 onAsk 走真实的 /api/ai/conversations 管线。
 */
import { useEffect, useMemo, useState } from "react";

import { eventTemporalBounds } from "../orbit-event-temporal";
import type { OrbitHomeViewModel } from "../orbit-home-route-view-model";
import type { OrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon, StatusBadge } from "../orbit-reference-primitives";
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

function fmtAppointmentTime(slot: ConfirmedSlot, language: OrbitLanguage): string | null {
  if (!slot.startAt) return null;
  const date = new Date(slot.startAt);
  if (Number.isNaN(date.getTime())) return null;
  const locale = language === "en" ? "en-US" : "zh-CN";
  const timeZone = slot.timezone || "Asia/Tokyo";
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", timeZone, weekday: "short" }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
  return `${day} ${time}`;
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
    new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "numeric", month: "long", weekday: "short" }).format(now),
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

  const stat = (value: number, label: string) => (
    <div key={label}>
      <div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
      <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <div data-orbit-agent-dashboard style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── 身份行 ── */}
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 16 }}>
        <Avatar g="g-indigo" letter={home.account.initial} size={56} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="eyebrow" style={{ marginBottom: 3 }}>{greeting(t, now)}</div>
          <h2 className="h-display" style={{ fontSize: 26, margin: 0 }}>{home.account.fullName}</h2>
          <div style={{ color: "var(--text-2)", fontSize: 13.5, marginTop: 4 }}>{subLine}</div>
        </div>
      </div>

      {/* ── 统计条 ── */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", flexWrap: "wrap", gap: 28, padding: "13px 18px" }}>
        {stat(home.stats.events, t({ en: "Events", zh: "活动" }))}
        {stat(home.stats.people, t({ en: "Contacts", zh: "人脉" }))}
        {stat(home.stats.inProgress, t({ en: "Following up", zh: "跟进中" }))}
        {stat(upcomingAppointment ? 1 : 0, t({ en: "Appointments", zh: "待赴约谈" }))}
      </div>

      {/* ── 今日最值得做（/api/ai/today 真实信号）── */}
      <OrbitAgentTodayWorkspace navigate={navigate} onAsk={onAsk} surface="desktop" />

      {/* ── 快捷发问（进入真实对话管线）── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {askChips.map((chip) => (
          <button className="chip" key={chip.label} onClick={() => onAsk(chip.query)} style={{ cursor: "pointer" }} type="button">
            <Icon name="sparkle" size={13} />{chip.label}
          </button>
        ))}
      </div>

      {/* ── 即将到来的约谈 ── */}
      {upcomingAppointment ? (
        <section>
          <div style={{ alignItems: "baseline", display: "flex", gap: 10, marginBottom: 10 }}>
            <h3 className="h-section" style={{ margin: 0 }}>{t({ en: "Upcoming appointment", zh: "即将到来的约谈" })}</h3>
            <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>{t({ en: "Confirmed by both sides", zh: "双方已确认" })}</span>
          </div>
          <div className="card" style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 16, padding: "15px 17px" }}>
            <div style={{ alignItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 2, minWidth: 96, padding: "10px 14px" }}>
              <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
                {upcomingAppointment.confirmed ? fmtAppointmentTime(upcomingAppointment.confirmed, language) ?? t({ en: "Time confirmed", zh: "时间已确认" }) : t({ en: "Time confirmed", zh: "时间已确认" })}
              </span>
              {upcomingAppointment.confirmed?.durationMinutes ? (
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>{upcomingAppointment.confirmed.durationMinutes} min</span>
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <strong style={{ color: "var(--ink)", fontSize: 15 }}>{t({ en: "Appointment", zh: "约谈" })}</strong>
                <span className="badge" style={{ background: "var(--live-soft)", color: "var(--live)" }}>confirmed</span>
              </div>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 3 }}>
                {upcomingAppointment.confirmed?.timezone || "Asia/Tokyo"}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {upcomingAppointment.contactId ? (
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/app/contacts/${encodeURIComponent(upcomingAppointment.contactId ?? "")}`)} type="button">
                  {t({ en: "Open contact card", zh: "查看名片与依据" })}
                </button>
              ) : null}
              {upcomingAppointment.eventId ? (
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/app/events/${encodeURIComponent(upcomingAppointment.eventId ?? "")}`)} type="button">
                  {t({ en: "Open event", zh: "打开活动" })}
                </button>
              ) : null}
              <button className="btn btn-soft btn-sm" onClick={() => onAsk(t({ en: "Help me prepare for my upcoming appointment", zh: "帮我准备即将到来的约谈" }))} type="button">
                <Icon name="sparkle" size={14} />{t({ en: "Let iOrbit prep me", zh: "让 iOrbit 帮我准备" })}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 现在可以做 ── */}
      <section>
        <div style={{ alignItems: "baseline", display: "flex", gap: 10, marginBottom: 10 }}>
          <h3 className="h-section" style={{ margin: 0 }}>{t({ en: "What you can do now", zh: "现在可以做" })}</h3>
          <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>{t({ en: "Ordered by your current state", zh: "按你的当前状态排序" })}</span>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
          {endedPending ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "15px 16px" }}>
              <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
                <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 9, color: "var(--accent)", display: "flex", height: 32, justifyContent: "center", width: 32 }}><Icon name="doc" size={16} /></span>
                <strong style={{ color: "var(--ink)", fontSize: 14.5 }}>{t({ en: "Post-event debrief", zh: "会后复盘" })}</strong>
              </div>
              <p style={{ color: "var(--text-2)", flex: 1, fontSize: 13, margin: 0 }}>
                {t({ en: `“${endedPending.name}” has ended — turn on-site connections into follow-ups.`, zh: `「${endedPending.name}」已结束——趁记忆还热，把现场连接变成跟进。` })}
              </p>
              <button className="btn btn-soft btn-sm" onClick={() => navigate(`/app/events/${encodeURIComponent(endedPending.id)}`)} style={{ alignSelf: "flex-start" }} type="button">
                {t({ en: "Open post-event center", zh: "进入会后中心" })}
              </button>
            </div>
          ) : null}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "15px 16px" }}>
            <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
              <span style={{ alignItems: "center", background: "var(--amber-soft)", borderRadius: 9, color: "var(--amber)", display: "flex", height: 32, justifyContent: "center", width: 32 }}><Icon name="search" size={16} /></span>
              <strong style={{ color: "var(--ink)", fontSize: 14.5 }}>{t({ en: "Find your next event", zh: "发现下一场活动" })}</strong>
            </div>
            <p style={{ color: "var(--text-2)", flex: 1, fontSize: 13, margin: 0 }}>
              {t({ en: "Browse open events and register with two questions.", zh: "浏览可报名的活动，回答两题即可完成报名。" })}
            </p>
            <button className="btn btn-soft btn-sm" onClick={() => navigate("/app/events")} style={{ alignSelf: "flex-start" }} type="button">
              {t({ en: "Browse events", zh: "去看看" })}
            </button>
          </div>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "15px 16px" }}>
            <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
              <span style={{ alignItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, color: "var(--text-2)", display: "flex", height: 32, justifyContent: "center", width: 32 }}><Icon name="users" size={16} /></span>
              <strong style={{ color: "var(--ink)", fontSize: 14.5 }}>{t({ en: "Contacts", zh: "人脉库" })}</strong>
            </div>
            <p style={{ color: "var(--text-2)", flex: 1, fontSize: 13, margin: 0 }}>
              {home.stats.people > 0
                ? t({ en: `${home.stats.people} contacts — people you met at events live here.`, zh: `${home.stats.people} 位联系人——活动里认识的人都沉淀在这里。` })
                : t({ en: "No contacts yet. People you meet at events land here; you can also add one manually.", zh: "还没有联系人。活动里认识的人会自动沉淀到这里，也可以手动添加第一位。" })}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(home.stats.people > 0 ? "/app/contacts" : "/app/contacts/new")} style={{ alignSelf: "flex-start" }} type="button">
              {home.stats.people > 0 ? t({ en: "Open contacts", zh: "打开人脉" }) : t({ en: "Add your first contact", zh: "添加第一位联系人" })}
            </button>
          </div>
        </div>
      </section>

      {/* ── 我的活动旅程 ── */}
      {journeys.length ? (
        <section>
          <div style={{ alignItems: "baseline", display: "flex", gap: 10, marginBottom: 10 }}>
            <h3 className="h-section" style={{ margin: 0 }}>{t({ en: "My event journeys", zh: "我的活动旅程" })}</h3>
            <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>{t({ en: "One page per event, registration to debrief", zh: "每场活动一个页面，从报名到复盘" })}</span>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {journeys.map((event, index) => {
              const badge = journeyStageBadge(event, t);
              const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
              return (
                <button
                  key={event.id}
                  onClick={() => navigate(`/app/events/${encodeURIComponent(event.id)}`)}
                  style={{ alignItems: "center", background: "none", border: 0, borderTop: index ? "1px solid var(--border)" : "none", cursor: "pointer", display: "flex", gap: 13, padding: "13px 16px", textAlign: "left", width: "100%" }}
                  type="button"
                >
                  <div style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", flexShrink: 0, minWidth: 42, overflow: "hidden", textAlign: "center" }}>
                    <div style={{ color: "var(--text-2)", fontSize: 10, fontWeight: 600, padding: "2px 4px 0" }}>
                      {bounds.start ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "short", timeZone: "Asia/Tokyo" }).format(bounds.start) : "--"}
                    </div>
                    <div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 15, fontWeight: 600, padding: "0 4px 3px" }}>
                      {bounds.start ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "Asia/Tokyo" }).format(bounds.start) : "--"}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.name || event.code}</div>
                    <div style={{ color: "var(--text-2)", fontSize: 12.5, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.venue || event.place}</div>
                  </div>
                  <span
                    className="badge"
                    style={badge.tone === "act"
                      ? { background: "var(--live-soft)", color: "var(--live)" }
                      : badge.tone === "wait"
                        ? { background: "var(--amber-soft)", color: "var(--amber)" }
                        : { background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text-2)" }}
                  >
                    {badge.label}
                  </span>
                  <Icon color="var(--text-4)" name="chevR" size={15} />
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section>
          <StatusBadge language={language === "ja" ? "en" : language} status="upcoming" />
          <div className="card-flat" style={{ color: "var(--text-2)", fontSize: 13.5, marginTop: 8, padding: 16 }}>
            {t({ en: "No event journeys yet — register for one and it appears here, from registration to debrief.", zh: "还没有活动旅程——报名一场活动后，从报名到复盘都会出现在这里。" })}
          </div>
        </section>
      )}
    </div>
  );
}
