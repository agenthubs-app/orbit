"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../../orbit-language-context";
import { partyHrefForEvent } from "../../orbit-product-href";
import { agentHrefForContext } from "../../orbit-agent-context-href";
import { eventTemporalBounds } from "../../orbit-event-temporal";
import { productHref, PublicTopNav } from "../../orbit-public-shell";
import { Avatar, gradientFromString, Icon, StatusBadge } from "../../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import { ORBIT_Z } from "../../orbit-z";
import { EventCover } from "../orbit-event-cover";
import { OrbitEventMatchmaking, type EventMatchmakingSummary } from "./orbit-event-matchmaking";
import { OrbitEventQuickSignup } from "./orbit-event-quick-signup";
import { OrbitPostEventCenter } from "./orbit-post-event-center";

type Translate = (copy: { en: string; zh: string }) => string;

const tz = { timeZone: "Asia/Tokyo" };
const avatarGradients = ["g-indigo", "g-violet", "g-rose", "g-amber", "g-emerald", "g-sky", "g-slate"];

function dateLocale(language: OrbitLanguage) {
  return language === "en" ? "en-US" : "zh-CN";
}

function fmtMonth(date: Date, language: OrbitLanguage) {
  return new Intl.DateTimeFormat(dateLocale(language), { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date, language: OrbitLanguage) {
  return new Intl.DateTimeFormat(dateLocale(language), { day: "2-digit", ...tz }).format(date);
}

export function eventTime(event: OrbitLandingEventView, t: Translate, language: OrbitLanguage) {
  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  const start = bounds.start;

  if (start === null) {
    return { date: t({ en: "Time TBD", zh: "时间待定" }), day: "--", month: "--", time: t({ en: "Start time TBD", zh: "开始时间待定" }) };
  }

  const date = new Intl.DateTimeFormat(dateLocale(language), { weekday: "long", month: "short", day: "numeric", ...tz }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(dateLocale(language), { hour: "2-digit", minute: "2-digit", ...tz });
  return {
    date,
    day: fmtDay(start, language),
    month: fmtMonth(start, language),
    time: bounds.hasValidRange && bounds.end !== null
      ? `${timeFormatter.format(start)} - ${timeFormatter.format(bounds.end)}`
      : `${timeFormatter.format(start)} · ${t({ en: "End time TBD", zh: "结束时间待确认" })}`,
  };
}

export function canUseEventDetailHistoryBack(referrer: string, currentHref: string) {
  if (!referrer) return false;

  try {
    const current = new URL(currentHref);
    const previous = new URL(referrer);
    const isOrbitProductPath =
      previous.pathname === "/" || previous.pathname.startsWith("/app/");

    return (
      previous.origin === current.origin &&
      isOrbitProductPath &&
      `${previous.pathname}${previous.search}${previous.hash}` !==
        `${current.pathname}${current.search}${current.hash}`
    );
  } catch {
    return false;
  }
}

function BackButton({ mobile = false, style, t }: { mobile?: boolean; style: CSSProperties; t: Translate }) {
  const goBack = () => {
    if (
      window.history.length > 1 &&
      canUseEventDetailHistoryBack(document.referrer, window.location.href)
    ) {
      window.history.back();
      return;
    }

    window.location.assign(productHref("/events"));
  };

  return (
    <button aria-label={t({ en: "Back to previous page", zh: "返回上一页" })} className="hit-44" onClick={goBack} style={style} type="button">
      {mobile ? <Icon name="chevL" size={20} /> : <><Icon name="back" size={16} />{t({ en: "Back", zh: "返回" })}</>}
    </button>
  );
}

function ActionButton({
  children,
  className,
  disabled = false,
  href,
  onBeforeNavigate,
  style,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  href?: string;
  onBeforeNavigate?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      className={className}
      disabled={disabled}
      onClick={href && !disabled ? () => {
        onBeforeNavigate?.();
        window.location.href = href;
      } : undefined}
      style={style}
      type="button"
    >
      {children}
    </button>
  );
}

type RegistrationStatus = "cancelled" | "rsvped" | null;

function primaryAction(
  event: OrbitLandingEventView,
  t: Translate,
  registrationStatus: RegistrationStatus,
  flex = 1,
) {
  const registrationHref = `/app/events/${encodeURIComponent(event.id)}/register`;

  if (event.status === "ended") {
    return <ActionButton className="btn is-disabled" disabled style={{ flex }}>{t({ en: "Ended", zh: "已结束" })}</ActionButton>;
  }

  if (registrationStatus === "rsvped") {
    return (
      <ActionButton className="btn btn-soft" href={registrationHref} style={{ flex }}>
        <Icon name="check" size={17} />{t({ en: "Manage registration", zh: "管理报名" })}
      </ActionButton>
    );
  }

  if (registrationStatus === "cancelled") {
    return (
      <ActionButton className="btn btn-primary" href={registrationHref} style={{ background: event.brandColor || undefined, flex }}>
        {t({ en: "Register again", zh: "重新报名" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
      </ActionButton>
    );
  }

  return (
    <ActionButton className="btn btn-primary" href={registrationHref} style={{ background: event.brandColor || undefined, flex }}>
      {t({ en: "Register", zh: "报名参加" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
    </ActionButton>
  );
}

function enterAction(
  event: OrbitLandingEventView,
  t: Translate,
  youRsvped: boolean,
  workspaceAvailable: boolean,
  flex = 1,
) {
  const canEnter = youRsvped && workspaceAvailable;
  const label = event.status === "ended"
    ? t({ en: "Replay", zh: "回看" })
    : event.status === "upcoming" && youRsvped && workspaceAvailable
      ? t({ en: "View event preparation", zh: "查看活动准备" })
      : event.status === "upcoming" && youRsvped
        ? t({ en: "Not started", zh: "未开始" })
        : t({ en: "Enter event", zh: "进入活动" });

  if (!canEnter) {
    return <ActionButton className="btn is-disabled" disabled style={{ flex }}>{label}</ActionButton>;
  }

  return (
    <ActionButton
      className="btn btn-ghost"
      href={partyHrefForEvent(event.id)}
      onBeforeNavigate={() => {
        window.sessionStorage.setItem("orbit-party-return-url", window.location.href);
      }}
      style={{ flex }}
    >
      {label}{event.status !== "ended" ? <Icon name="arrowUR" size={16} /> : null}
    </ActionButton>
  );
}

function OrganizerRailCard({ event, mobile = false, t }: { event: OrbitLandingEventView; mobile?: boolean; t: Translate }) {
  const organizer = event.organizer.trim();
  const initial = organizer.slice(0, 1).toUpperCase() || "O";
  const slug = (event.code || "org").toLowerCase();

  if (!organizer) {
    return (
      <div className="card-flat" style={{ padding: mobile ? 14 : 16, marginTop: mobile ? 6 : 18 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{t({ en: "Organizer", zh: "主办方" })}</div>
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <Avatar letter={initial} g="g-indigo" size={mobile ? 40 : 42} />
          <div>
            <div style={{ color: "var(--ink)", fontSize: mobile ? 14.5 : 15, fontWeight: 600 }}>
              {t({ en: "Organizer pending", zh: "主办方待确认" })}
            </div>
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 1 }}>
              {t({ en: "The event source did not provide organizer information.", zh: "活动来源暂未提供主办方信息。" })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-flat" style={{ padding: mobile ? 14 : 16, marginTop: mobile ? 6 : 18 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{t({ en: "Organizer", zh: "主办方" })}</div>
      <a href={productHref(`/o/${slug}`)} style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
        <Avatar letter={initial} g="g-indigo" size={mobile ? 40 : 42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: mobile ? 14.5 : 15, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{organizer}</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 1 }}>{t({ en: `Multiple events hosted · ${event.host}`, zh: `已举办多场 · ${event.host}` })}</div>
        </div>
        <Icon name="chevR" size={18} color="var(--text-4)" />
      </a>
      {!mobile ? (
        <a href={productHref(`/o/${slug}`)} className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 14, textDecoration: "none" }}>
          <Icon name="calendar" size={15} />{t({ en: "View all their events", zh: "查看 TA 的全部活动" })}
        </a>
      ) : null}
    </div>
  );
}


type JourneyStage = "joined" | "post" | "pre";

// 活动进程条：不新增后端 —— 用主办方已发布的议程时间 + 活动起止时间在前端推算
// 当前进行到哪一步。日本无夏令时，所以"议程墙钟时间 − 开场墙钟时间"的分钟差
// 可以安全地加在 startsAt 的时间戳上（议程与开场同属一天）。
export function agendaProgress(
  event: Pick<OrbitLandingEventView, "agenda" | "endsAt" | "startsAt" | "status">,
  now: Date,
): { currentIndex: number; items: { label: string; time: string }[] } {
  const items = event.agenda.map((item) => ({ label: item.label, time: item.time }));
  if (!items.length) return { currentIndex: -1, items };
  if (event.status === "ended") return { currentIndex: items.length, items };

  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  if (bounds.start === null || now.getTime() < bounds.start.getTime()) {
    return { currentIndex: -1, items };
  }

  const wallMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})/u.exec(value.trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const startParts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, minute: "2-digit", ...tz })
    .format(bounds.start)
    .split(":");
  const startWallMinutes = Number(startParts[0]) * 60 + Number(startParts[1]);

  let currentIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    const minutes = wallMinutes(items[index].time);
    if (minutes === null) continue;
    const at = bounds.start.getTime() + (minutes - startWallMinutes) * 60_000;
    if (now.getTime() >= at) currentIndex = index;
  }
  // 已过开场但第一条议程还没到时间：停在第一条之前而不是消失。
  return { currentIndex: currentIndex === -1 ? 0 : currentIndex, items };
}

// grid-template-rows 0fr/1fr 折叠：内容保持挂载（卡 B 收起时 matchmaking 仍在
// 拉取 summary，供会后中心使用），只做视觉收合。
function JourneyCollapse({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <div className={`orbit-journey-collapse${open ? " is-open" : ""}`}>
      <div>{children}</div>
    </div>
  );
}

// 卡 B 暗色域 = 一次局部 token remap（同 orbit-theme.tsx 的主题手法），内嵌的
// matchmaking / 参会者列表等真实组件经由 token 自动换肤，无需逐个改造。
const JOURNEY_STYLES = `
[data-orbit-real-page="event-detail"] .orbit-journey-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s ease; }
[data-orbit-real-page="event-detail"] .orbit-journey-collapse.is-open { grid-template-rows: 1fr; }
[data-orbit-real-page="event-detail"] .orbit-journey-collapse > div { overflow: hidden; min-width: 0; }
[data-orbit-real-page="event-detail"] .orbit-journey-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); }
[data-orbit-real-page="event-detail"] .orbit-journey-nite {
  --surface: #182c2b;
  --surface-2: rgba(255,255,255,.05);
  --surface-3: rgba(255,255,255,.08);
  --bg: #14201e;
  --ink: #ffffff;
  --text: rgba(255,255,255,.92);
  --text-2: rgba(255,255,255,.68);
  --text-3: rgba(255,255,255,.52);
  --text-4: rgba(255,255,255,.4);
  --border: rgba(255,255,255,.14);
  --border-2: rgba(255,255,255,.22);
  --border-strong: rgba(255,255,255,.32);
  --accent: #7fd7cb;
  --accent-hover: #a3e5db;
  --accent-press: #5fc3b6;
  --accent-soft: rgba(255,255,255,.12);
  --accent-softer: rgba(255,255,255,.06);
  --accent-ring: rgba(127,215,203,.3);
  --on-accent: #0e2a2b;
  --glass-chip: rgba(20,40,43,.8);
  background:
    radial-gradient(56% 44% at 84% 2%, rgba(23,106,115,.55), transparent 62%),
    radial-gradient(42% 40% at 6% 98%, rgba(180,83,9,.16), transparent 64%),
    linear-gradient(164deg, #14201e, #14282b 52%, #123437);
  border-color: rgba(23,33,31,.5);
  color: var(--text);
}
[data-orbit-real-page="event-detail"] .orbit-journey-nite .card,
[data-orbit-real-page="event-detail"] .orbit-journey-nite .card-flat { background: var(--surface-2); border-color: var(--border); box-shadow: none; }
[data-orbit-real-page="event-detail"] .orbit-journey-glass { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); border-radius: var(--r-md); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); }
[data-orbit-real-page="event-detail"] .orbit-journey-glass-light { background: rgba(255,255,255,.66); border: 1px solid #dbe7e4; border-radius: var(--r-md); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); }
[data-orbit-real-page="event-detail"] .orbit-journey-tint { background: radial-gradient(80% 100% at 92% 0%, rgba(23,106,115,.13), transparent 58%), radial-gradient(60% 90% at 4% 100%, rgba(180,83,9,.09), transparent 58%), var(--accent-softer); border: 1px solid var(--border); border-radius: var(--r-md); padding: 4px; }
[data-orbit-real-page="event-detail"] .orbit-journey-progress { display: flex; overflow-x: auto; scrollbar-width: none; padding: 4px 2px 8px; }
[data-orbit-real-page="event-detail"] .orbit-journey-progress::-webkit-scrollbar { display: none; }
`;

const ATTENDEE_PREVIEW_COUNT = 12;

// 报名统计不足以展示行业分布时，速答卡退回主办方写的"适合人群"前两条，
// 让报名前的"这场都是什么人"永远有的可看。
function audienceHintFor(event: OrbitLandingEventView): string | null {
  const section = event.about?.find(
    (item) => item.label.includes("适合人群") || /who|audience/iu.test(item.label),
  );
  if (!section) return null;
  const bullets = section.body
    .split("\n")
    .map((line) => line.replace(/^[•\-–\s]+/u, "").trim())
    .filter(Boolean)
    .slice(0, 2);
  return bullets.length ? bullets.join("；") : null;
}

type JourneyMiniInfo = { day: string; month: string; name: string; timeDate: string; timeTime: string; venue: string };

function EventDetailPanel({ event, heading, language, mini, t, workspaceAvailable }: { event: OrbitLandingEventView; heading: ReactNode; language: OrbitLanguage; mini: JourneyMiniInfo; t: Translate; workspaceAvailable: boolean }) {
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus>(event.stats.youRsvped ? "rsvped" : null);
  const [aiSummary, setAiSummary] = useState<EventMatchmakingSummary | null>(null);
  const onWorkspaceSummary = useCallback((summary: EventMatchmakingSummary | null) => {
    setAiSummary(summary);
  }, []);
  const youRsvped = registrationStatus === "rsvped";
  const canSeeAttendees = youRsvped;
  const allAttendees = event.stats.attendees;
  const attendees = showAllAttendees ? allAttendees : allAttendees.slice(0, ATTENDEE_PREVIEW_COUNT);
  const hiddenAttendeeCount = allAttendees.length - attendees.length;

  useEffect(() => {
    if (!event.stats.authed) {
      setRegistrationStatus(null);
      return;
    }

    const controller = new AbortController();

    void fetch(
      `/api/events/${encodeURIComponent(event.id)}/registration?questions=false`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: {
            registration?: { status?: RegistrationStatus } | null;
          };
          success?: boolean;
        };

        if (response.ok && body.success === true) {
          setRegistrationStatus(body.data?.registration?.status ?? null);
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRegistrationStatus(null);
        }
      });

    return () => controller.abort();
  }, [event.id, event.stats.authed]);

  const ended = event.status === "ended";
  const stage: JourneyStage = ended && youRsvped ? "post" : youRsvped ? "joined" : "pre";
  // 折叠选择：null = 跟随 stage 默认（pre 展开、joined/post 收起）；用户点过就记住，
  // stage 变化（客户端报名状态校正）时重置回默认。
  const [aOpenChoice, setAOpenChoice] = useState<boolean | null>(null);
  const [bOpenChoice, setBOpenChoice] = useState<boolean | null>(null);
  useEffect(() => {
    setAOpenChoice(null);
    setBOpenChoice(null);
  }, [stage]);
  const aOpen = aOpenChoice ?? stage === "pre";
  const bOpen = bOpenChoice ?? false;
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (event.status !== "active") return undefined;
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [event.status]);
  const progress = agendaProgress(event, new Date(nowTick));
  const aiReady = aiSummary?.resultsState === "ready";
  const myTables = aiSummary
    ? [
        aiSummary.roundOneTable ? { label: t({ en: "Round 1", zh: "第一轮" }), placement: aiSummary.roundOneTable } : null,
        aiSummary.roundTwoTable ? { label: t({ en: "Round 2", zh: "第二轮" }), placement: aiSummary.roundTwoTable } : null,
      ].filter((entry): entry is { label: string; placement: NonNullable<EventMatchmakingSummary["roundOneTable"]> } => entry !== null)
    : [];

  const registrationSection = (
    <section className="card orbit-desktop-only" style={{ padding: 18, display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div><div style={{ fontSize: 13, color: "var(--text-3)" }}>{t({ en: "Registration", zh: "报名" })}</div><h3 className="h-section" style={{ color: "var(--ink)" }}>{event.feeLabel}</h3></div>
        <StatusBadge language={language} status={event.status} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>{primaryAction(event, t, registrationStatus)}{enterAction(event, t, youRsvped, workspaceAvailable)}</div>
      {!youRsvped && event.status !== "ended" ? <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 11, display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={13} />{t({ en: "Full attendee list visible after you register", zh: "确认参加后可见完整参会者名单" })}</div> : null}
    </section>
  );

  const aiSummaryStrip = !ended && youRsvped && aiReady && aiSummary ? (
    <section className="card" data-event-ai-summary style={{ borderLeft: "3px solid var(--accent)", display: "grid", gap: 8, padding: 16 }}>
      <span className="eyebrow">ORBIT MATCH</span>
      <strong style={{ color: "var(--ink)", fontSize: 15 }}>
        {aiSummary.recommendationCount > 0
          ? t({ en: `${aiSummary.recommendationCount} people worth meeting have been matched for you`, zh: `已为你匹配 ${aiSummary.recommendationCount} 位值得认识的人` })
          : t({ en: "Your matching result is published", zh: "你的匹配结果已发布" })}
      </strong>
      {myTables.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {myTables.map(({ label, placement }) => (
            <span className="chip" key={label} title={placement.theme}>
              {label} · {t({ en: `Table ${placement.tableNumber}`, zh: `${placement.tableNumber} 号桌` })}
              {placement.seat ? ` · ${t({ en: `Seat ${placement.seat}`, zh: `座位 ${placement.seat}` })}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      <span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: "Recommendations and table details are right below.", zh: "推荐与分桌详情就在下方。" })}</span>
    </section>
  ) : null;

  const aboutSection = event.about && event.about.length ? (
        <section>
          <h3 className="h-section" style={{ margin: "0 0 14px" }}>{t({ en: "About this event", zh: "关于活动" })}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {event.about.map((section) => (
              <div key={section.label} className="card-flat" style={{ padding: 16, borderLeft: "3px solid var(--accent)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span aria-hidden="true" style={{ fontSize: 17 }}>{section.icon}</span>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{section.label}</h4>
                </div>
                <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "var(--text-2)", margin: 0, whiteSpace: "pre-line" }}>{section.body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : event.descriptionZh ? (
        <section><h3 className="h-section" style={{ margin: "0 0 10px" }}>{t({ en: "About this event", zh: "关于活动" })}</h3><p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text-2)", margin: 0, whiteSpace: "pre-line" }}>{event.descriptionZh}</p></section>
      ) : null;

  const agendaSection = event.agenda.length ? (
        <section>
          <h3 className="h-section" style={{ margin: "0 0 14px" }}>{t({ en: "Agenda", zh: "活动议程" })}</h3>
          <div style={{ position: "relative", paddingLeft: 4 }}>
            {event.agenda.map((item, index) => (
              <div key={`${item.time}-${item.label}`} style={{ display: "flex", gap: 16, paddingBottom: index < event.agenda.length - 1 ? 18 : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 11, height: 11, borderRadius: "var(--r-pill)", background: index === 0 ? "var(--accent)" : "var(--surface)", border: `2px solid ${index === 0 ? "var(--accent)" : "var(--border-strong)"}` }} />
                  {index < event.agenda.length - 1 ? <span style={{ width: 2, flex: 1, background: "var(--border-2)", marginTop: 4 }} /> : null}
                </div>
                <div style={{ marginTop: -3, paddingBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span className="mono" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{item.time}</span><span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{item.label}</span></div>
                  {item.description ? <div style={{ fontSize: 14, color: "var(--text-3)", marginTop: 3 }}>{item.description}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null;

  const attendeesSection = (
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className="h-section" style={{ margin: 0 }}>{t({ en: "Attendees", zh: "参会者" })} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{event.stats.count}</span></h3>
          {!canSeeAttendees ? <span style={{ fontSize: 13, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={14} />{t({ en: "See full list after you register", zh: "确认参加后查看完整名单" })}</span> : null}
        </div>
        <div>
          {!canSeeAttendees ? (
            <div className="card-flat" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ fontSize: 14, color: "var(--text-2)" }}>{t({ en: "Full attendee list visible after you register", zh: "确认参加后可见完整参会者名单" })}</div>
              {event.stats.count && event.status !== "ended" ? <a href={`/app/events/${encodeURIComponent(event.id)}/register`} style={{ color: "var(--accent)", flexShrink: 0, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>{t({ en: "Register", zh: "去报名" })} →</a> : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              {attendees.map((person, index) => (
                <div key={`${person.name}-${index}`} className="card-flat" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12, minWidth: 0, overflow: "hidden" }}>
                  <Avatar letter={person.initial || person.name.slice(0, 1)} g={avatarGradients[index % avatarGradients.length]} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</div>
                    {person.role ? <div style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.role}</div> : null}
                  </div>
                </div>
              ))}
              {!showAllAttendees && hiddenAttendeeCount > 0 ? (
                <button type="button" onClick={() => setShowAllAttendees(true)} className="card-flat" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--accent)", fontWeight: 600, cursor: "pointer", border: "1px dashed var(--border-strong)", background: "transparent" }}>
                  +{hiddenAttendeeCount} · {t({ en: "Show all", zh: "展开全部" })}
                </button>
              ) : null}
            </div>
          )}
          {canSeeAttendees && showAllAttendees && allAttendees.length > ATTENDEE_PREVIEW_COUNT ? (
            <button type="button" onClick={() => setShowAllAttendees(false)} style={{ marginTop: 12, background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {t({ en: "Show less", zh: "收起" })}
            </button>
          ) : null}
        </div>
      </section>
  );

  const matchmakingSection = (
    <OrbitEventMatchmaking
      authenticated={event.stats.authed}
      contactRequestsOpen={event.status !== "upcoming"}
      eventId={event.id}
      onWorkspaceSummary={onWorkspaceSummary}
      registrationOpen={event.status !== "ended"}
    />
  );

  const postEventSection = ended && aiSummary ? (
    <OrbitPostEventCenter acceptedContacts={aiSummary.acceptedContacts} eventId={event.id} />
  ) : null;

  const registrationHref = `/app/events/${encodeURIComponent(event.id)}/register`;

  const progressStrip = progress.items.length ? (
    <div aria-label={t({ en: "Event progress", zh: "活动进程" })} className="orbit-journey-progress">
      {progress.items.map((item, index) => {
        const done = index < progress.currentIndex || progress.currentIndex >= progress.items.length;
        const current = index === progress.currentIndex && progress.currentIndex < progress.items.length;
        return (
          <div key={`${item.time}-${item.label}`} style={{ alignItems: "flex-start", display: "flex", flexShrink: 0 }}>
            <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 6, minWidth: 74 }}>
              <span style={{ alignItems: "center", background: current ? "#fff" : done ? "rgba(22,163,74,.16)" : "rgba(255,255,255,.04)", border: `1.5px solid ${current ? "#fff" : done ? "rgba(125,235,184,.46)" : "rgba(255,255,255,.24)"}`, borderRadius: "50%", color: current ? "#0e4b52" : done ? "#7DEBB8" : "var(--text-3)", display: "flex", fontSize: 12, fontWeight: 700, height: 28, justifyContent: "center", width: 28 }}>
                {done ? <Icon name="check" size={13} /> : index + 1}
              </span>
              <span style={{ color: current ? "#fff" : done ? "var(--text-2)" : "var(--text-3)", fontSize: 12, fontWeight: current ? 600 : 400, whiteSpace: "nowrap" }}>{item.label}</span>
              <span className="mono" style={{ color: "var(--text-3)", fontSize: 10.5 }}>{item.time}</span>
            </div>
            {index < progress.items.length - 1 ? <span style={{ background: done ? "rgba(125,235,184,.4)" : "rgba(255,255,255,.14)", height: 1.5, marginTop: 13, width: 32 }} /> : null}
          </div>
        );
      })}
    </div>
  ) : null;

  // 未报名钩子：所有活动共用的 AI 示例（产品决定），必须带「AI 示例」标识；
  // 唯一的行动入口是真实报名页。
  const mockHookPeople = [
    { name: t({ en: "Takuya Yamada", zh: "山田 拓也" }), role: t({ en: "Cross-border logistics · BD lead", zh: "跨境物流 · 商务负责人" }), why: t({ en: "Looking for overseas-warehouse partners — complements a channel-seeking goal.", zh: "他在为中小卖家找海外仓伙伴，与「找渠道」的目标互补。" }) },
    { name: t({ en: "Jing Chen", zh: "陈 静" }), role: t({ en: "DTC brand founder", zh: "DTC 品牌创始人" }), why: t({ en: "Preparing to enter the Kansai market and wants local channels.", zh: "正在筹备进入关西市场，想认识本地渠道。" }) },
    { name: t({ en: "Jiwon Kim", zh: "金 志源" }), role: t({ en: "Cross-border payments BD", zh: "跨境支付 BD" }), why: t({ en: "Solves the settlement-cost problem many attendees mention.", zh: "能解决很多参会者提到的结算成本问题。" }) },
  ];
  const mockHook = (
    <div style={{ padding: "6px 18px 20px" }}>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 14px", maxWidth: "48ch" }}>
        {t({ en: "After you register, this becomes your on-site workspace. Below is what it generates for attendees (sample):", zh: "报名后，这里会变成你的现场工作台。下面是它为参会者生成的内容（示例）：" })}
      </p>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="orbit-journey-glass" style={{ padding: 15 }}>
          <div className="eyebrow" style={{ color: "var(--text-3)", marginBottom: 10 }}>{t({ en: "People matched for you · sample", zh: "为你推荐的人 · 示例" })}</div>
          {mockHookPeople.map((person, index) => (
            <div key={person.name} style={{ borderTop: index ? "1px dashed rgba(255,255,255,.1)" : "none", display: "flex", gap: 11, padding: "8px 0" }}>
              <Avatar g={avatarGradients[index % avatarGradients.length]} letter={person.name.slice(0, 1)} size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{person.name}</div>
                <div style={{ color: "var(--text-3)", fontSize: 12 }}>{person.role}</div>
                <div style={{ color: "var(--text-2)", fontSize: 12.5, marginTop: 3 }}>{person.why}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="orbit-journey-glass" style={{ padding: 15 }}>
            <div className="eyebrow" style={{ color: "var(--text-3)", marginBottom: 10 }}>{t({ en: "Your seat · sample", zh: "你的座位 · 示例" })}</div>
            <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
              <span style={{ color: "var(--accent)", fontFamily: "var(--ff-display)", fontSize: 28, fontWeight: 600, lineHeight: 1 }}>{t({ en: "Table 5", zh: "5 桌" })}</span>
              <span style={{ color: "var(--text-2)", fontSize: 12.5 }}>{t({ en: "Round 2 · table of 6, grouped around a shared goal", zh: "第 2 轮 · 6 人桌，围绕共同目标组桌" })}</span>
            </div>
          </div>
          <div className="orbit-journey-glass" style={{ padding: 15 }}>
            <div className="eyebrow" style={{ color: "var(--text-3)", marginBottom: 10 }}>{t({ en: "Opener suggestion · sample", zh: "开场白建议 · 示例" })}</div>
            <p style={{ borderLeft: "2px solid var(--accent)", color: "var(--text)", fontSize: 13, margin: 0, padding: "2px 0 2px 12px" }}>
              {t({ en: "\u201cI hear you run overseas warehouses for Japanese sellers \u2014 we are choosing one right now. Any slots in Kansai?\u201d", zh: "「听说你们在帮日本卖家做海外仓，我们正好在选仓——你们在关西有点位吗？」" })}
            </p>
          </div>
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
        {!ended ? (
          <ActionButton className="btn" href={registrationHref} style={{ background: "#fff", color: "#171a1c" }}>
            <Icon name="lock" size={15} />{t({ en: "Register to unlock your real matches", zh: "报名后解锁你的真实匹配" })}
          </ActionButton>
        ) : null}
        <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{t({ en: "Sample content — real results come from your registration answers.", zh: "以上为示例效果，实际内容基于你的报名回答生成" })}</span>
      </div>
    </div>
  );

  const liveContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "6px 18px 18px" }}>
      {progressStrip}
      {aiSummaryStrip}
      {matchmakingSection}
      {attendeesSection}
    </div>
  );

  // 三卡片旅程：同一 URL，按 stage 变形（设计定稿 docs/designs/journey/event-journey-green.html）。
  return (
    <>
      <section aria-label={t({ en: "Event info", zh: "活动信息" })} className="orbit-journey-card">
        {stage !== "pre" ? (
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 14, padding: "15px 18px" }}>
            <div style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", flexShrink: 0, overflow: "hidden", textAlign: "center", width: 46 }}>
              <div style={{ color: "var(--text-2)", fontSize: 10, fontWeight: 600, padding: "2px 0 0" }}>{mini.month}</div>
              <div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 16, fontWeight: 600, padding: "0 0 3px" }}>{mini.day}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 9 }}>
                <strong style={{ color: "var(--ink)", fontSize: 15.5 }}>{mini.name}</strong>
                {stage === "post" ? (
                  <span className="badge" style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text-2)" }}>{t({ en: "Ended", zh: "已结束" })}</span>
                ) : (
                  <span className="badge" style={{ background: "var(--live-soft)", color: "var(--live)" }}>{t({ en: "Registered", zh: "已报名" })}</span>
                )}
              </div>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 3 }}>{mini.timeDate} · {mini.timeTime} · {mini.venue}</div>
            </div>
            <button aria-controls="orbit-journey-a-body" aria-expanded={aOpen} className="btn btn-ghost btn-sm" onClick={() => setAOpenChoice(!aOpen)} type="button">
              {t({ en: "Event details", zh: "活动详情" })}
              <span aria-hidden style={{ display: "inline-flex", transform: aOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><Icon name="chevD" size={15} /></span>
            </button>
          </div>
        ) : null}
        <JourneyCollapse open={aOpen}>
          <div id="orbit-journey-a-body" style={{ display: "flex", flexDirection: "column", gap: 24, padding: stage === "pre" ? 18 : "4px 18px 18px" }}>
            {heading}
            {registrationSection}
            {stage === "pre" && !ended ? (
              <OrbitEventQuickSignup audienceHint={audienceHintFor(event)} eventId={event.id} />
            ) : null}
            {aboutSection}
            {agendaSection}
            {stage !== "pre" ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setAOpenChoice(false)} style={{ alignSelf: "flex-start" }} type="button">
                {t({ en: "Collapse details", zh: "收起详情" })}
                <span aria-hidden style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="chevD" size={15} /></span>
              </button>
            ) : null}
          </div>
        </JourneyCollapse>
      </section>

      <section aria-label={t({ en: "On-site", zh: "活动现场" })} className="orbit-journey-card orbit-journey-nite">
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, padding: "18px 18px 8px" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="eyebrow" style={{ color: "var(--text-3)" }}>{t({ en: "On-site", zh: "现场" })}</div>
            <h3 className="h-section" style={{ color: "var(--ink)", margin: "2px 0 0" }}>{t({ en: "Event floor", zh: "活动现场" })}</h3>
          </div>
          {stage === "joined" && event.status === "active" ? (
            <span className="badge" style={{ background: "rgba(22,163,74,.2)", border: "1px solid rgba(125,235,184,.26)", color: "#7DEBB8" }}>
              LIVE · {t({ en: "In progress", zh: "进行中" })}
            </span>
          ) : null}
          {stage === "pre" ? (
            <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--ink)", gap: 5 }}>
              <Icon name="sparkle" size={11} />{t({ en: "AI sample", zh: "AI 示例" })}
            </span>
          ) : null}
          {stage === "post" ? (
            <button aria-controls="orbit-journey-b-body" aria-expanded={bOpen} className="btn btn-ghost btn-sm" onClick={() => setBOpenChoice(!bOpen)} type="button">
              {t({ en: "Review the event floor", zh: "回顾现场内容" })}
              <span aria-hidden style={{ display: "inline-flex", transform: bOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><Icon name="chevD" size={15} /></span>
            </button>
          ) : null}
        </div>
        {stage === "pre" ? mockHook : null}
        {stage === "joined" ? liveContent : null}
        {stage === "post" ? (
          <>
            <div style={{ color: "var(--text-2)", fontSize: 14, padding: "0 18px 16px" }}>
              {t({ en: "Event ended", zh: "活动已结束" })} · {t({ en: "Cards exchanged", zh: "交换名片" })}{" "}
              <strong style={{ color: "var(--ink)" }}>{aiSummary ? aiSummary.acceptedContacts : "—"}</strong>
            </div>
            <JourneyCollapse open={bOpen}>
              <div id="orbit-journey-b-body">{liveContent}</div>
            </JourneyCollapse>
          </>
        ) : null}
      </section>

      <section aria-label={t({ en: "Post-event center", zh: "会后中心" })} className="orbit-journey-card">
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, padding: "18px 18px 8px" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="eyebrow">Post-Event</div>
            <h3 className="h-section" style={{ margin: "2px 0 0" }}>{t({ en: "Post-event center", zh: "会后中心" })}</h3>
          </div>
          <span className="badge" style={{ background: "var(--accent-softer)", color: "var(--accent)", gap: 5 }}>
            <Icon name="sparkle" size={11} />
            {stage === "post" ? t({ en: "Generated by iOrbit", zh: "iOrbit 生成" }) : t({ en: "AI sample", zh: "AI 示例" })}
          </span>
        </div>
        {stage === "post" ? (
          <div style={{ padding: "0 18px 18px" }}>
            {postEventSection ?? (
              <div className="card-flat" style={{ color: "var(--text-2)", fontSize: 14, padding: 16 }}>
                {t({ en: "Pulling together your on-site connections\u2026", zh: "正在汇总你的现场连接…" })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "0 18px 18px" }}>
            <div className="orbit-journey-tint">
              <div className="orbit-journey-glass-light" style={{ padding: "16px 18px" }}>
                <strong style={{ color: "var(--ink)", fontSize: 14.5 }}>{t({ en: "After the event, a debrief like this lands here", zh: "活动结束后，你会在这里收到一份这样的复盘" })}</strong>
                <p style={{ color: "var(--text-2)", fontSize: 13.5, margin: "5px 0 0" }}>
                  {t({ en: "Who exchanged cards with you, what you talked about, what each person can bring, and who to follow up with next \u2014 organized into an actionable list.", zh: "谁和你交换了名片、聊了什么、这些人分别能给你带来什么、下一步该找谁聊什么——全部整理成可执行的跟进清单。" })}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9, margin: "13px 0 0" }}>
                  {[
                    { label: t({ en: "Cards exchanged", zh: "已交换名片" }), value: "4" },
                    { label: t({ en: "Follow-ups agreed", zh: "约定的跟进" }), value: "2" },
                    { label: t({ en: "Potential deals", zh: "潜在合作" }), value: "1" },
                  ].map((stat) => (
                    <div key={stat.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", minWidth: 96, padding: "9px 16px" }}>
                      <div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 20, fontWeight: 600 }}>{stat.value}</div>
                      <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                <p style={{ color: "var(--text-4)", fontSize: 12, margin: "10px 0 0" }}>
                  {stage === "joined"
                    ? t({ en: "Generated automatically after the event \u2014 numbers above are samples.", zh: "活动结束后自动生成 · 以上为示例数据" })
                    : t({ en: "Sample numbers \u2014 register and attend to get your real debrief.", zh: "示例数据 · 报名并参加活动后生成你的真实复盘" })}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="orbit-mobile-only orbit-sticky-cta" style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 18px calc(12px + env(safe-area-inset-bottom))", background: "var(--glass-chip)", backdropFilter: "blur(14px)", borderTop: "1px solid var(--border)", gap: 10, zIndex: ORBIT_Z.sticky }}>
        {primaryAction(event, t, registrationStatus, 1.2)}{enterAction(event, t, youRsvped, workspaceAvailable)}
      </div>
    </>
  );
}

export function OrbitRealEventDetail({ event, workspaceAvailable = false }: { event: OrbitLandingEventView; workspaceAvailable?: boolean }) {
  const { t, language } = useOrbitLanguage();
  const cover = gradientFromString(event.code || event.name || "orbit");
  const time = eventTime(event, t, language);
  const name = event.name || event.code || t({ en: "Event", zh: "活动" });
  const monogram = name.slice(0, 1);
  const codeUpper = String(event.code || "").toUpperCase();
  const sceneAsset = getDemoEventSceneAsset(event.id);
  const askAgentHref = agentHrefForContext({
    details: [
      event.status === "ended"
        ? t({ en: "Ended", zh: "已结束" })
        : event.status === "active"
          ? t({ en: "In progress", zh: "进行中" })
          : t({ en: "Upcoming", zh: "即将开始" }),
      event.venue,
      time.date,
    ]
      .filter(Boolean)
      .join(" · "),
    id: event.id,
    kind: "event",
    label: name,
    language: language === "zh" ? "zh" : "en",
  });

  const mini = {
    day: time.day,
    month: time.month,
    name,
    timeDate: time.date,
    timeTime: time.time,
    venue: event.venue || t({ en: "Venue TBD", zh: "地点待定" }),
  };
  // 卡片 A 的完整信息区：由 EventDetailPanel 放进可折叠容器（报名后收成迷你条）。
  const heading = (
    <>
            <div>
              <div className="orbit-desktop-only" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}><span className="chip" style={{ height: 26, fontSize: 12, background: "var(--accent-softer)", color: "var(--accent)" }}>{event.code}</span><StatusBadge language={language} status={event.status} /></div>
              <div style={{ alignItems: "flex-start", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                <h1 className="h-display" style={{ margin: 0 }}>{name}</h1>
                <a
                  className="btn btn-soft btn-sm"
                  data-agent-context="event"
                  href={askAgentHref}
                  style={{ flexShrink: 0, textDecoration: "none" }}
                >
                  <Icon name="sparkle" size={16} />
                  {t({ en: "Ask iOrbit about this event", zh: "问 iOrbit 这场活动" })}
                </a>
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--text-3)", letterSpacing: "0.06em", marginTop: 8 }}>{codeUpper}</div>
              {event.summaryZh ? <p style={{ fontSize: 16, color: "var(--text-2)", lineHeight: 1.5, marginTop: 14, marginBottom: 0 }}>{event.summaryZh}</p> : null}
            </div>
            <div className="orbit-info-grid">
              <div className="card-flat" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--border)", textAlign: "center", flexShrink: 0 }}>
                  <div style={{ background: event.brandColor || "var(--accent)", color: "var(--on-dark)", fontSize: 11, fontWeight: 600, padding: "2px 0" }}>{time.month}</div>
                  <div style={{ fontFamily: "var(--ff-display)", fontSize: 22, fontWeight: 600, padding: "4px 0", color: "var(--ink)" }}>{time.day}</div>
                </div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{time.date}</div><div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{time.time}</div></div>
              </div>
              <div className="card-flat" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, height: 50, borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-2)" }}><Icon name="pin" size={22} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{event.venue || t({ en: "Venue TBD", zh: "地点待定" })}</div><div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{event.address || t({ en: "Organizer has not set a detailed address yet", zh: "主办方尚未设置详细地址" })}</div></div>
              </div>
            </div>
            <div className="orbit-mobile-only" style={{ flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: "var(--accent-soft)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}><Icon name="calendar" size={19} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{time.date}</div><div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 1 }}>{time.time}</div></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", flexShrink: 0 }}><Icon name="pin" size={19} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{event.venue || t({ en: "Venue TBD", zh: "地点待定" })}</div><div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 1 }}>{event.address || t({ en: "Organizer has not set a detailed address yet", zh: "主办方尚未设置详细地址" })}</div></div>
              </div>
              <OrganizerRailCard event={event} mobile t={t} />
            </div>
    </>
  );

  return (
    <div className="orbit-shell" data-appscroll data-orbit-real-page="event-detail">
      <PublicTopNav active="events" />
      <style dangerouslySetInnerHTML={{ __html: JOURNEY_STYLES }} />
      <main>
        <div
          className="orbit-desktop-only"
          data-demo-visual-asset-id={sceneAsset?.assetId}
          data-demo-visual-source={sceneAsset?.sourceLabel}
          data-demo-visual-source-label={sceneAsset?.sourceLabel}
          style={{ position: "relative", height: 220, overflow: "hidden" }}
        >
          <EventCover g={cover} imageLoading="eager" imageSizes="(max-width: 720px) 100vw, 1280px" imageUrl={event.detailLogoUrl} imageAlt={name} style={{ position: "absolute", inset: 0 }} />
          <BackButton t={t} style={{ position: "absolute", top: 18, left: 40, border: "none", background: "var(--glass-chip)", height: 36, padding: "0 14px", borderRadius: "var(--r-pill)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--ink)", textDecoration: "none", boxShadow: "var(--sh-sm)" }} />
        </div>
        <div
          className="orbit-mobile-only"
          data-demo-visual-asset-id={sceneAsset?.assetId}
          data-demo-visual-source={sceneAsset?.sourceLabel}
          data-demo-visual-source-label={sceneAsset?.sourceLabel}
          style={{ position: "relative", height: 248, display: "block" }}
        >
          <EventCover g={cover} imageLoading="eager" imageSizes="100vw" imageUrl={event.detailLogoUrl} imageAlt={name} monogram={event.detailLogoUrl ? null : { text: monogram, size: 64 }} style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 52, display: "flex", alignItems: "center", padding: "0 16px", gap: 10 }}>
            <BackButton mobile t={t} style={{ border: "none", background: "rgba(0,0,0,0.3)", width: 36, height: 36, borderRadius: "var(--r-pill)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-dark)", textDecoration: "none" }} />
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 18, right: 18 }}>
            {/* Mobile audit P3: this used to sit right up against the code
                chip with only a 6px gap and no connector — at 390px the tiny
                gap read as a barely-legible "in". Two clearly separate chips
                plus an explicit middot make the boundary unambiguous. */}
            <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 8 }}>
              <StatusBadge language={language} status={event.status} />
              <span aria-hidden="true" style={{ color: "var(--on-dark)", fontSize: 12, opacity: 0.6 }}>·</span>
              <span style={{ background: "rgba(255,255,255,0.18)", color: "var(--on-dark)", borderRadius: "var(--r-pill)", padding: "4px 10px", fontSize: 12, fontWeight: 600, backdropFilter: "blur(6px)" }}>{event.code}</span>
            </div>
          </div>
        </div>
        <div className="orbit-detail-layout">
          <aside className="orbit-detail-rail orbit-desktop-only">
            <EventCover g={cover} imageLoading="lazy" imageSizes="280px" imageUrl={event.detailLogoUrl} imageAlt={name} monogram={event.detailLogoUrl ? null : { text: monogram, size: 76 }} style={{ aspectRatio: "1", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-lg)", border: "4px solid var(--bg)" }}>
              <div style={{ position: "absolute", bottom: 14, left: 14 }}><StatusBadge language={language} status={event.status} /></div>
            </EventCover>
            <OrganizerRailCard event={event} t={t} />
          </aside>
          <div className="orbit-detail-main">
            <EventDetailPanel event={event} heading={heading} language={language} mini={mini} t={t} workspaceAvailable={workspaceAvailable} />
          </div>
        </div>
      </main>
    </div>
  );
}
