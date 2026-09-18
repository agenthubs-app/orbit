"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../../orbit-language-context";
import { partyHrefForEvent } from "../../orbit-product-href";
import { agentHrefForContext } from "../../orbit-agent-context-href";
import { eventTemporalBounds } from "../../orbit-event-temporal";
import { productHref, PublicTopNav } from "../../orbit-public-shell";
import { gradientFromString, Icon } from "../../orbit-reference-primitives";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../../orbit-0918-tokens";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import { EventCover } from "../orbit-event-cover";
import { OrbitEventMatchmaking, type EventMatchmakingSummary } from "./orbit-event-matchmaking";
import { OrbitPostEventCenter } from "./orbit-post-event-center";

import { eventRegistrationIsOpen, eventRegistrationLabel, type EventRegistrationAvailability } from "../../orbit-event-registration-view-model";
import { registrationBlockingReasonCopy } from "../../../../../features/events/registration/blocking-reason-copy";
import type { EventRegistrationBlockingReason } from "../../../../../features/events/registration/contract";

type Translate = (copy: { en: string; zh: string }) => string;
type RegistrationStatus = "cancelled" | "rsvped" | null;
type JourneyStage = "joined" | "post" | "pre";
type DetailTab = "agenda" | "host" | "intro" | "people" | "recap";

const TOKYO_TIME_ZONE = { timeZone: "Asia/Tokyo" } as const;

const EVENT_TAG_COPY: Record<string, { en: string; zh: string }> = {
  calendar_sync: { en: "Calendar synced", zh: "日历已同步" },
  confirmed: { en: "Confirmed", zh: "已确认" },
  "event import": { en: "Event import", zh: "活动导入" },
  invite_only: { en: "Invite only", zh: "仅限邀请" },
  live: { en: "In person", zh: "线下活动" },
  online: { en: "Online", zh: "线上活动" },
  partners: { en: "Partners", zh: "合作伙伴" },
  "relationship building": { en: "Relationship building", zh: "关系建立" },
};

function eventTagLabel(tag: string, t: Translate): string {
  const copy = EVENT_TAG_COPY[tag.trim().toLowerCase()];
  return copy ? t(copy) : tag;
}

function dateLocale(language: OrbitLanguage): string {
  return language === "en" ? "en-US" : "zh-CN";
}

function fmtMonth(date: Date, language: OrbitLanguage): string {
  return new Intl.DateTimeFormat(dateLocale(language), { month: "short", ...TOKYO_TIME_ZONE }).format(date);
}

function fmtDay(date: Date, language: OrbitLanguage): string {
  return new Intl.DateTimeFormat(dateLocale(language), { day: "2-digit", ...TOKYO_TIME_ZONE }).format(date);
}

export function eventTime(event: OrbitLandingEventView, t: Translate, language: OrbitLanguage) {
  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  if (bounds.start === null) {
    return {
      date: t({ en: "Time TBD", zh: "时间待定" }),
      day: "--",
      month: "--",
      time: t({ en: "Start time TBD", zh: "开始时间待定" }),
    };
  }

  const date = new Intl.DateTimeFormat(dateLocale(language), {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...TOKYO_TIME_ZONE,
  }).format(bounds.start);
  const formatter = new Intl.DateTimeFormat(dateLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
    ...TOKYO_TIME_ZONE,
  });

  return {
    date,
    day: fmtDay(bounds.start, language),
    month: fmtMonth(bounds.start, language),
    time: bounds.hasValidRange && bounds.end !== null
      ? `${formatter.format(bounds.start)}–${formatter.format(bounds.end)}`
      : `${formatter.format(bounds.start)} · ${t({ en: "End time TBD", zh: "结束时间待确认" })}`,
  };
}

export function canUseEventDetailHistoryBack(referrer: string, currentHref: string): boolean {
  if (!referrer) return false;
  try {
    const current = new URL(currentHref);
    const previous = new URL(referrer);
    const isOrbitProductPath = previous.pathname === "/" || previous.pathname.startsWith("/app/");
    return previous.origin === current.origin
      && isOrbitProductPath
      && `${previous.pathname}${previous.search}${previous.hash}` !== `${current.pathname}${current.search}${current.hash}`;
  } catch {
    return false;
  }
}

export function agendaProgress(
  event: Pick<OrbitLandingEventView, "agenda" | "endsAt" | "startsAt" | "status">,
  now: Date,
): { currentIndex: number; items: { label: string; time: string }[] } {
  const items = event.agenda.map((item) => ({ label: item.label, time: item.time }));
  if (!items.length) return { currentIndex: -1, items };
  if (event.status === "ended") return { currentIndex: items.length, items };

  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  if (bounds.start === null || now.getTime() < bounds.start.getTime()) return { currentIndex: -1, items };

  const wallMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})/u.exec(value.trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    ...TOKYO_TIME_ZONE,
  }).format(bounds.start).split(":").map(Number);
  const startWallMinutes = hour * 60 + minute;
  let currentIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    const minutes = wallMinutes(items[index].time);
    if (minutes === null) continue;
    const at = bounds.start.getTime() + (minutes - startWallMinutes) * 60_000;
    if (now.getTime() >= at) currentIndex = index;
  }
  return { currentIndex: currentIndex === -1 ? 0 : currentIndex, items };
}

function BackButton({ t }: { t: Translate }) {
  const goBack = () => {
    if (window.history.length > 1 && canUseEventDetailHistoryBack(document.referrer, window.location.href)) {
      window.history.back();
      return;
    }
    window.location.assign(productHref("/events"));
  };

  return (
    <button aria-label={t({ en: "Back to previous page", zh: "返回上一页" })} className="ed-back hit-44" onClick={goBack} type="button">
      <Icon name="back" size={15} />{t({ en: "Back to events", zh: "返回活动列表" })}
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

function primaryAction(
  event: OrbitLandingEventView,
  t: Translate,
  registrationStatus: RegistrationStatus,
  registrationAvailability: EventRegistrationAvailability,
) {
  const registrationHref = `/app/events/${encodeURIComponent(event.code || event.id)}/register`;
  if (registrationStatus === "rsvped") {
    if (event.status !== "upcoming") {
      return <ActionButton className="btn is-disabled" disabled><Icon name="check" size={17} />{t({ en: "Registered", zh: "已报名" })}</ActionButton>;
    }
    return (
      <ActionButton className="btn btn-soft" href={registrationHref}>
        <Icon name="check" size={17} />{t({ en: "Manage registration", zh: "管理报名" })}
      </ActionButton>
    );
  }
  if (event.status !== "upcoming") {
    return <ActionButton className="btn is-disabled" disabled>{t({ en: "Registration closed", zh: "报名已结束" })}</ActionButton>;
  }
  if (!eventRegistrationIsOpen(registrationAvailability)) {
    return <ActionButton className="btn is-disabled" disabled>{t(eventRegistrationLabel(registrationAvailability))}</ActionButton>;
  }
  if (registrationStatus === "cancelled") {
    return (
      <ActionButton className="btn btn-primary" href={registrationHref}>
        {t({ en: "Register again", zh: "重新报名" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
      </ActionButton>
    );
  }
  return (
    <ActionButton className="btn btn-primary" href={registrationHref}>
      {t({ en: "Register", zh: "报名" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
    </ActionButton>
  );
}

function enterAction(event: OrbitLandingEventView, t: Translate, workspaceAvailable: boolean) {
  if (!workspaceAvailable) return null;
  const label = event.status === "ended"
    ? t({ en: "Replay event workspace", zh: "回看活动工作台" })
    : event.status === "upcoming"
      ? t({ en: "View event preparation", zh: "查看活动准备" })
      : t({ en: "Enter event", zh: "进入活动" });
  return (
    <ActionButton
      className="btn btn-ghost"
      href={partyHrefForEvent(event.id)}
      onBeforeNavigate={() => window.sessionStorage.setItem("orbit-party-return-url", window.location.href)}
    >
      {label}<Icon name="arrowUR" size={16} />
    </ActionButton>
  );
}

function registeredCountText(event: OrbitLandingEventView, t: Translate): string {
  if (typeof event.stats.count === "number" && Number.isFinite(event.stats.count)) {
    const cap = typeof event.cap === "number" && Number.isFinite(event.cap) ? ` / ${event.cap}` : "";
    return `${t({ en: "Registered", zh: "已报名" })} ${event.stats.count}${cap} ${t({ en: "people", zh: "人" })}`;
  }
  return t({ en: "Registration count unavailable", zh: "报名人数暂不可用" });
}

/**
 * 标题旁的报名状态徽章。封面 pill 已承载 eventRegistrationLabel（报名开放 /
 * 报名资料已锁定 / 已结束…），这里只在有增量信息时渲染：报名中的剩余席位、
 * 已报名与已结束的参与态。未知人数不等于 0，不推导剩席。
 */
function heroStatusBadge(
  event: OrbitLandingEventView,
  stage: JourneyStage,
  registrationAvailability: EventRegistrationAvailability,
  t: Translate,
): { label: string; tone: "muted" | "success" } | null {
  if (stage === "post") return { label: t({ en: "Ended", zh: "已结束" }), tone: "muted" };
  if (stage === "joined") return { label: t({ en: "Registered", zh: "已报名" }), tone: "success" };
  if (event.status === "upcoming" && eventRegistrationIsOpen(registrationAvailability)) {
    const remainingSeats =
      typeof event.cap === "number" &&
      Number.isFinite(event.cap) &&
      typeof event.stats.count === "number" &&
      Number.isFinite(event.stats.count)
        ? Math.max(0, event.cap - event.stats.count)
        : null;
    return {
      label: remainingSeats === null
        ? t({ en: "Registration open", zh: "报名中" })
        : t({ en: `Registration open · ${remainingSeats} seats left`, zh: `报名中 · 剩 ${remainingSeats} 席` }),
      tone: "success",
    };
  }
  return null;
}

function InfoRow({ icon, sub, title }: { icon: string; sub?: string | null; title: string }) {
  return (
    <span className="ed-info-row">
      <span className="ed-info-icon"><Icon name={icon} size={16} /></span>
      <span className="ed-info-copy">
        {title}
        {sub ? <span className="ed-info-sub" title={sub}>{sub}</span> : null}
      </span>
    </span>
  );
}

function IntroPanel({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const agendaPreview = event.agenda.slice(0, 5);
  const hasIntro = Boolean(event.summaryZh || event.descriptionZh || event.about?.length);
  return (
    <div className="ed-intro-grid">
      <div className="ed-panel-card">
        <h2 className="ed-panel-title">{t({ en: "About this event", zh: "活动介绍" })}</h2>
        {event.summaryZh ? <p className="ed-body">{event.summaryZh}</p> : null}
        {event.descriptionZh && event.descriptionZh !== event.summaryZh ? <p className="ed-body">{event.descriptionZh}</p> : null}
        {event.about?.length ? (
          <div className="ed-highlight-grid">
            {event.about.map((item) => (
              <div className="ed-highlight" key={item.label}>
                <span className="ed-highlight-icon"><Icon name="sparkle" size={16} /></span>
                <span className="ed-highlight-copy">
                  <strong>{item.label}</strong>
                  <span>{item.body}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {!hasIntro ? <p className="ed-body ed-muted">{t({ en: "The organizer has not published an introduction yet.", zh: "主办方暂未发布活动介绍。" })}</p> : null}
      </div>
      <div className="ed-panel-card">
        <h2 className="ed-panel-title">{t({ en: "Agenda", zh: "活动议程" })}</h2>
        {agendaPreview.length ? (
          <div className="ed-agenda-list">
            {agendaPreview.map((item) => (
              <div className="ed-agenda-row" key={`${item.time}-${item.label}`}>
                <span className="ed-agenda-time">{item.time}</span>
                <span className="ed-agenda-copy">
                  <strong>{item.label}</strong>
                  {item.description ? <span>{item.description}</span> : null}
                </span>
              </div>
            ))}
            {event.agenda.length > agendaPreview.length ? (
              <span className="ed-agenda-more">{t({ en: `${event.agenda.length} items in total — see the Agenda tab`, zh: `共 ${event.agenda.length} 项 · 完整内容见「议程」页签` })}</span>
            ) : null}
          </div>
        ) : (
          <p className="ed-body ed-muted">{t({ en: "The agenda will be announced by the organizer.", zh: "议程待主办方公布。" })}</p>
        )}
      </div>
    </div>
  );
}

function AgendaPanel({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (event.status !== "active") return undefined;
    if (typeof window === "undefined" || typeof window.setInterval !== "function") return undefined;
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [event.status]);
  const progress = agendaProgress(event, new Date(nowTick));

  if (!event.agenda.length) {
    return (
      <div className="ed-panel-card">
        <h2 className="ed-panel-title">{t({ en: "Agenda", zh: "活动议程" })}</h2>
        <p className="ed-body ed-muted">{t({ en: "The agenda will be announced by the organizer.", zh: "议程待主办方公布。" })}</p>
      </div>
    );
  }

  return (
    <div className="ed-panel-card">
      <div className="ed-panel-head">
        <h2 className="ed-panel-title">{t({ en: "Agenda", zh: "活动议程" })}</h2>
        {event.status === "active" ? <span className="ed-live-pill"><span className="ed-live-dot" />LIVE · {t({ en: "In progress", zh: "进行中" })}</span> : null}
      </div>
      <div className="ed-agenda-list">
        {event.agenda.map((item, index) => {
          const done = index < progress.currentIndex || progress.currentIndex >= progress.items.length;
          const current = index === progress.currentIndex && progress.currentIndex < progress.items.length;
          return (
            <div className="ed-agenda-row" data-state={done ? "done" : current ? "now" : undefined} key={`${item.time}-${item.label}`}>
              <span className="ed-agenda-time">{item.time}</span>
              <span className="ed-agenda-copy">
                <strong>{item.label}</strong>
                {item.description ? <span>{item.description}</span> : null}
              </span>
              {done ? <span className="ed-agenda-check"><Icon name="check" size={13} /></span> : null}
              {current ? <span className="ed-agenda-now">{t({ en: "Now", zh: "进行中" })}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeoplePanel({
  event,
  onSummary,
  registrationAvailability,
  registrationStatus,
  t,
  youRsvped,
}: {
  event: OrbitLandingEventView;
  onSummary: (summary: EventMatchmakingSummary | null) => void;
  registrationAvailability: EventRegistrationAvailability;
  registrationStatus: RegistrationStatus;
  t: Translate;
  youRsvped: boolean;
}) {
  if (!youRsvped) {
    return (
      <div className="ed-panel-card ed-people-teaser">
        <h2 className="ed-panel-title">{t({ en: "Attendees", zh: "参会者" })}</h2>
        <p className="ed-body">
          {t({
            en: "The attendee list and your matches appear here after you register. Names are never shown before registration — including for ended events.",
            zh: "报名后，这里会展示参会者名单与你的人脉匹配。报名前（含已结束的活动）不公开任何姓名。",
          })}
        </p>
        <div className="ed-cta-row">{primaryAction(event, t, registrationStatus, registrationAvailability)}</div>
      </div>
    );
  }
  // 参会者名单是唯一的参会者目录（data-event-participant-directory），
  // 不再额外渲染重复的「全部参会者」入口。
  return (
    <div className="ed-people-real">
      <OrbitEventMatchmaking
        authenticated={event.stats.authed}
        contactRequestsOpen={event.status !== "upcoming"}
        eventId={event.id}
        onWorkspaceSummary={onSummary}
        registrationOpen={event.status === "upcoming" && eventRegistrationIsOpen(registrationAvailability)}
      />
    </div>
  );
}

function HostPanel({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const organizer = event.organizer.trim();
  if (!organizer) {
    return (
      <div className="ed-panel-card">
        <h2 className="ed-panel-title">{t({ en: "Organizer", zh: "主办方" })}</h2>
        <p className="ed-body ed-muted">{t({ en: "Organizer information is not yet available.", zh: "活动来源暂未提供主办方信息。" })}</p>
      </div>
    );
  }
  const initial = organizer.slice(0, 1).toUpperCase();
  const slug = (event.code || "org").toLowerCase();
  return (
    <div className="ed-panel-card ed-host-card">
      <span className="ed-host-logo">{initial}</span>
      <span className="ed-host-copy">
        <strong>{organizer}</strong>
        <span>{t({ en: `Multiple events hosted · ${event.host}`, zh: `已举办多场 · ${event.host}` })}</span>
      </span>
      <a className="ed-host-link" href={productHref(`/o/${slug}`)}>
        {t({ en: "Organizer page", zh: "主办方主页" })}<Icon name="arrowUR" size={15} />
      </a>
    </div>
  );
}

function RecapPanel({ event, summary, t, youRsvped }: { event: OrbitLandingEventView; summary: EventMatchmakingSummary | null; t: Translate; youRsvped: boolean }) {
  if (!youRsvped) {
    return (
      <div className="ed-panel-card">
        <h2 className="ed-panel-title">{t({ en: "Post-event recap", zh: "会后回顾" })}</h2>
        <p className="ed-body ed-muted">
          {t({
            en: "This event has ended. Private participant records are only available to confirmed attendees.",
            zh: "活动已结束；私人现场记录仅向已确认参会者开放。",
          })}
        </p>
      </div>
    );
  }
  return (
    <div className="ed-panel-card">
      <h2 className="ed-panel-title">{t({ en: "Post-event recap", zh: "会后回顾" })}</h2>
      <OrbitPostEventCenter acceptedContacts={summary?.acceptedContacts ?? 0} eventId={event.id} />
    </div>
  );
}

/**
 * 作用域样式。注意：React 静态渲染会把 <style> 内容里的双引号转义成
 * &quot;，带引号的属性选择器会失效——这里一律用无引号属性选择器。
 */
const DETAIL_CSS = `
[data-orbit-real-page=event-detail] .ed-main { max-width: 1120px; margin: 0 auto; padding: 20px 24px 120px; display: flex; flex-direction: column; gap: 22px; }
[data-orbit-real-page=event-detail] .ed-back { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer; }
[data-orbit-real-page=event-detail] .ed-back:hover { background: #ECEEFB; }
[data-orbit-real-page=event-detail] .ed-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 32px; align-items: center; }
[data-orbit-real-page=event-detail] .ed-cover { position: relative; height: 300px; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 50px rgba(59, 63, 122, 0.15); }
[data-orbit-real-page=event-detail] .ed-cover .ed-cover-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14, 18, 37, 0) 45%, rgba(14, 18, 37, 0.55) 100%); pointer-events: none; }
[data-orbit-real-page=event-detail] .ed-cover .ed-cover-meta { position: absolute; left: 20px; right: 20px; bottom: 18px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
[data-orbit-real-page=event-detail] .ed-cover .ed-cover-code { padding: 5px 12px; border-radius: 999px; background: rgba(14, 18, 37, 0.62); color: #FFFFFF; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
[data-orbit-real-page=event-detail] .ed-cover .ed-cover-status { padding: 5px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.92); color: #2E3270; font-size: 12px; font-weight: 600; }
[data-orbit-real-page=event-detail] .ed-hero-copy { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
[data-orbit-real-page=event-detail] .ed-title { margin: 0; color: #0E1225; font-size: 38px; font-weight: 900; line-height: 1.15; letter-spacing: -0.03em; }
[data-orbit-real-page=event-detail] .ed-lede { margin: 0; font-size: 15px; color: #3B3F7A; line-height: 1.7; }
[data-orbit-real-page=event-detail] .ed-hero-badge { align-self: flex-start; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
[data-orbit-real-page=event-detail] .ed-hero-badge[data-tone=success] { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page=event-detail] .ed-hero-badge[data-tone=muted] { background: #ECEEFB; color: #6B6F99; }
[data-orbit-real-page=event-detail] .ed-tags { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page=event-detail] .ed-tag { padding: 6px 12px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 13px; }
[data-orbit-real-page=event-detail] .ed-info { display: flex; flex-direction: column; gap: 10px; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page=event-detail] .ed-info-row { display: flex; gap: 12px; align-items: flex-start; }
[data-orbit-real-page=event-detail] .ed-info-icon { color: #4B4FC7; display: inline-flex; padding-top: 2px; flex-shrink: 0; }
[data-orbit-real-page=event-detail] .ed-info-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page=event-detail] .ed-info-sub { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-detail] .ed-cta-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
[data-orbit-real-page=event-detail] .ed-cta-row .btn { border-radius: 12px; font-size: 15px; font-weight: 500; padding: 14px 24px; }
[data-orbit-real-page=event-detail] .ed-cta-row .btn-primary, [data-orbit-real-page=event-detail] .ed-cta-row .btn-ghost { background: #0E1225; border: 1px solid #0E1225; color: #FFFFFF; }
[data-orbit-real-page=event-detail] .ed-cta-row .btn-primary:hover, [data-orbit-real-page=event-detail] .ed-cta-row .btn-ghost:hover { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page=event-detail] .ed-cta-row .btn-soft { background: #FFFFFF; border: 1px solid #B9BCEB; color: #2E3270; }
[data-orbit-real-page=event-detail] .ed-cta-row .btn-soft:hover { background: #ECEEFB; }
[data-orbit-real-page=event-detail] .ed-cta-row .btn.is-disabled { background: #ECEEFB; border: 1px solid #E8E9F6; color: #9FA3C4; }
[data-orbit-real-page=event-detail] .ed-tabs { display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #E8E9F6; font-size: 15px; }
[data-orbit-real-page=event-detail] .ed-tab { padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: #6B6F99; font-size: 15px; cursor: pointer; }
[data-orbit-real-page=event-detail] .ed-tab[data-active=true] { border-bottom-color: #4B4FC7; color: #0E1225; font-weight: 600; }
[data-orbit-real-page=event-detail] .ed-tab:focus-visible, [data-orbit-real-page=event-detail] .ed-back:focus-visible, [data-orbit-real-page=event-detail] .ed-host-link:focus-visible { outline: 2px solid #4B4FC7; outline-offset: 2px; }
[data-orbit-real-page=event-detail] .ed-panel[hidden] { display: none; }
[data-orbit-real-page=event-detail] .ed-intro-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 20px; align-items: start; }
[data-orbit-real-page=event-detail] .ed-panel-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 28px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page=event-detail] .ed-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=event-detail] .ed-panel-title { margin: 0; color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
[data-orbit-real-page=event-detail] .ed-body { margin: 0; font-size: 15px; line-height: 1.8; color: #3B3F7A; }
[data-orbit-real-page=event-detail] .ed-muted { color: #6B6F99; }
[data-orbit-real-page=event-detail] .ed-highlight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 18px; border-radius: 14px; background: #F7F7FD; }
[data-orbit-real-page=event-detail] .ed-highlight { display: flex; gap: 12px; align-items: center; min-width: 0; }
[data-orbit-real-page=event-detail] .ed-highlight-icon { width: 40px; height: 40px; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
[data-orbit-real-page=event-detail] .ed-highlight-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page=event-detail] .ed-highlight-copy strong { font-size: 14px; color: #0E1225; }
[data-orbit-real-page=event-detail] .ed-highlight-copy span { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=event-detail] .ed-agenda-list { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page=event-detail] .ed-agenda-row { display: grid; grid-template-columns: 110px 1fr auto; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; background: #F7F7FD; }
[data-orbit-real-page=event-detail] .ed-agenda-row[data-state=now] { background: #ECEEFB; box-shadow: inset 0 0 0 1px #B9BCEB; }
[data-orbit-real-page=event-detail] .ed-agenda-row[data-state=done] { opacity: 0.62; }
[data-orbit-real-page=event-detail] .ed-agenda-time { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-detail] .ed-agenda-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page=event-detail] .ed-agenda-copy strong { font-size: 14px; color: #0E1225; }
[data-orbit-real-page=event-detail] .ed-agenda-copy span { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=event-detail] .ed-agenda-check { color: #2F6B4F; display: inline-flex; }
[data-orbit-real-page=event-detail] .ed-agenda-now { font-size: 12px; font-weight: 600; color: #4B4FC7; }
[data-orbit-real-page=event-detail] .ed-agenda-more { font-size: 13px; color: #6B6F99; padding: 0 4px; }
[data-orbit-real-page=event-detail] .ed-live-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; background: #E6F1EC; color: #2F6B4F; font-size: 12px; font-weight: 600; }
[data-orbit-real-page=event-detail] .ed-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #2F6B4F; }
[data-orbit-real-page=event-detail] .ed-people-teaser .ed-cta-row { padding-top: 4px; }
[data-orbit-real-page=event-detail] .ed-host-card { flex-direction: row; align-items: center; gap: 20px; }
[data-orbit-real-page=event-detail] .ed-host-logo { width: 72px; height: 72px; border-radius: 18px; background: #0E1225; color: #FFFFFF; display: inline-flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 26px; font-weight: 900; flex-shrink: 0; }
[data-orbit-real-page=event-detail] .ed-host-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page=event-detail] .ed-host-copy strong { font-size: 18px; color: #0E1225; }
[data-orbit-real-page=event-detail] .ed-host-copy span { font-size: 14px; color: #3B3F7A; line-height: 1.7; }
[data-orbit-real-page=event-detail] .ed-host-link { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border: 1px solid #B9BCEB; border-radius: 10px; background: #FFFFFF; color: #2E3270; font-size: 14px; font-weight: 500; text-decoration: none; white-space: nowrap; }
[data-orbit-real-page=event-detail] .ed-host-link:hover { background: #ECEEFB; }
[data-orbit-real-page=event-detail] .orb-dock { position: fixed; z-index: 80; right: 24px; bottom: 24px; }
[data-orbit-real-page=event-detail] .orb-ball { position: relative; display: grid; width: 54px; height: 54px; place-items: center; border-radius: 50%; background: #4B4FC7; box-shadow: 0 8px 26px rgba(59, 63, 122, 0.28), 0 2px 6px rgba(59, 63, 122, 0.16); color: #FFFFFF; transition: transform 0.16s ease, background 0.15s; }
[data-orbit-real-page=event-detail] .orb-ball:hover { background: #2E3270; transform: translateY(-2px); }
[data-orbit-real-page=event-detail] .orb-ball .pip { position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border: 2px solid #FBFBFE; border-radius: 999px; background: #E8B34B; }
@media (max-width: 760px) {
  [data-orbit-real-page=event-detail] .ed-main { padding: 14px 16px 110px; }
  [data-orbit-real-page=event-detail] .ed-cover { height: 220px; }
  [data-orbit-real-page=event-detail] .ed-title { font-size: 30px; }
  [data-orbit-real-page=event-detail] .ed-host-card { flex-direction: column; align-items: flex-start; }
  [data-orbit-real-page=event-detail] .orb-dock { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page=event-detail] .orb-ball { transition: none; }
}
`;

export function OrbitRealEventDetail({ event, workspaceAvailable = false, registrationAvailability = "unavailable", registrationBlockingReason }: { event: OrbitLandingEventView; workspaceAvailable?: boolean; registrationAvailability?: EventRegistrationAvailability; registrationBlockingReason?: EventRegistrationBlockingReason }) {
  const { t, language } = useOrbitLanguage();
  // The approved journey uses one stable product-green fallback. Real event
  // artwork still wins when supplied; source-less events no longer receive a
  // random purple/red cover from their id hash.
  const cover = event.detailLogoUrl ? gradientFromString(event.code || event.name || "orbit") : "g-emerald";
  const time = eventTime(event, t, language);
  const name = event.name || event.code || t({ en: "Event", zh: "活动" });
  const sceneAsset = getDemoEventSceneAsset(event.id);
  const registrationStatus: RegistrationStatus = event.stats.youRsvped ? "rsvped" : null;
  const youRsvped = registrationStatus === "rsvped";
  const stage: JourneyStage = event.status === "ended" ? "post" : youRsvped ? "joined" : "pre";
  const [tab, setTab] = useState<DetailTab>("intro");
  const [summary, setSummary] = useState<EventMatchmakingSummary | null>(null);
  const onSummary = useCallback((value: EventMatchmakingSummary | null) => setSummary(value), []);
  const askAgentHref = agentHrefForContext({
    details: [event.status === "ended" ? t({ en: "Ended", zh: "已结束" }) : event.status === "active" ? t({ en: "In progress", zh: "进行中" }) : t({ en: "Upcoming", zh: "即将开始" }), event.venue, time.date].filter(Boolean).join(" · "),
    id: event.id,
    kind: "event",
    label: name,
    language: language === "zh" ? "zh" : "en",
  });

  const badge = heroStatusBadge(event, stage, registrationAvailability, t);
  const coverStatus = stage === "post"
    ? t({ en: "Ended", zh: "已结束" })
    : stage === "joined"
      ? t({ en: "Registered", zh: "已报名" })
      : event.status === "upcoming"
        ? t(eventRegistrationLabel(registrationAvailability))
        : t({ en: "Registration closed", zh: "报名已结束" });
  const tabs: { id: DetailTab; label: string }[] = [
    { id: "intro", label: t({ en: "About", zh: "介绍" }) },
    { id: "agenda", label: t({ en: "Agenda", zh: "议程" }) },
    { id: "people", label: t({ en: "Attendees", zh: "参会者" }) },
    { id: "host", label: t({ en: "Organizer", zh: "主办方" }) },
    ...(stage === "post" ? [{ id: "recap" as DetailTab, label: t({ en: "Recap", zh: "会后回顾" }) }] : []),
  ];
  const activeTab: DetailTab = tabs.some((item) => item.id === tab) ? tab : "intro";
  const lede = event.summaryZh || event.descriptionZh || "";

  return (
    <div className="orbit-shell" data-event-journey-state={stage} data-orbit-real-page="event-detail" style={{ background: C.pageBg, minHeight: "100dvh" }}>
      <style>{DETAIL_CSS}</style>
      <PublicTopNav active="events" />
      <main className="ed-main">
        <BackButton t={t} />

        <section className="ed-hero">
          <div
            className="detail-cover ed-cover"
            data-demo-visual-asset-id={sceneAsset?.assetId}
            data-demo-visual-source={sceneAsset?.sourceLabel}
            data-demo-visual-source-label={sceneAsset?.sourceLabel}
          >
            <EventCover g={cover} imageAlt={name} imageLoading="eager" imageSizes="(min-width: 900px) 480px, 100vw" imageUrl={event.detailLogoUrl} style={{ position: "absolute", inset: 0 }}>
              <span className="ed-cover-scrim" />
              <span className="ed-cover-meta">
                <span className="ed-cover-code">{String(event.code || event.id).toUpperCase()}</span>
                <span className="ed-cover-status">{coverStatus}</span>
              </span>
            </EventCover>
          </div>

          <div className="ed-hero-copy">
            {badge ? <span className="ed-hero-badge" data-tone={badge.tone}>{badge.label}</span> : null}
            <h1 className="ed-title" style={{ fontFamily: ORBIT_0918_FONTS.serif }}>{name}</h1>
            {lede ? <p className="ed-lede">{lede}</p> : null}
            <div className="ed-tags">
              {event.tags.map((tag) => <span className="ed-tag" key={tag}>{eventTagLabel(tag, t)}</span>)}
              {event.cap === null ? <span className="ed-tag">{t({ en: "No capacity limit", zh: "不设人数上限" })}</span> : null}
              {typeof event.cap === "number" && Number.isFinite(event.cap) ? <span className="ed-tag">{t({ en: `Capacity ${event.cap}`, zh: `限 ${event.cap} 人` })}</span> : null}
            </div>
            <div className="ed-info">
              <InfoRow icon="calendar" sub={event.agenda[0] ? `${event.agenda[0].time} ${event.agenda[0].label}` : null} title={`${time.date} · ${time.time}`} />
              <InfoRow icon="pin" sub={event.address || t({ en: "Address to be announced", zh: "详细地址待主办方公布" })} title={event.venue || t({ en: "Venue TBD", zh: "地点待定" })} />
              <InfoRow icon="building" sub={null} title={event.organizer.trim() || t({ en: "Organizer pending", zh: "主办方待确认" })} />
              <InfoRow icon="users" sub={event.industry || event.theme || null} title={registeredCountText(event, t)} />
              <InfoRow icon="ticket" sub={event.theme || t({ en: "Matched and seated by Orbit", zh: "由 Orbit 匹配与分桌" })} title={event.feeLabel} />
            </div>
            {registrationAvailability === "unavailable" ? <p role="status" className="orbit-alert">{registrationBlockingReasonCopy(registrationBlockingReason, language === "zh" ? "zh" : "en")}</p> : null}
            <div className="ed-cta-row">
              {youRsvped ? enterAction(event, t, workspaceAvailable) : null}
              {primaryAction(event, t, registrationStatus, registrationAvailability)}
            </div>
          </div>
        </section>

        <nav aria-label={t({ en: "Event sections", zh: "活动栏目" })} className="ed-tabs">
          {tabs.map((item) => (
            <button
              className="ed-tab"
              data-active={activeTab === item.id ? "true" : undefined}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ed-panel" hidden={activeTab !== "intro"}>
          <IntroPanel event={event} t={t} />
        </div>
        <div className="ed-panel" hidden={activeTab !== "agenda"}>
          <AgendaPanel event={event} t={t} />
        </div>
        <div className="ed-panel" hidden={activeTab !== "people"}>
          <PeoplePanel event={event} onSummary={onSummary} registrationAvailability={registrationAvailability} registrationStatus={registrationStatus} t={t} youRsvped={youRsvped} />
        </div>
        <div className="ed-panel" hidden={activeTab !== "host"}>
          <HostPanel event={event} t={t} />
        </div>
        {stage === "post" ? (
          <div className="ed-panel" hidden={activeTab !== "recap"}>
            <RecapPanel event={event} summary={summary} t={t} youRsvped={youRsvped} />
          </div>
        ) : null}
      </main>

      <div className="orb-dock">
        <a aria-label={t({ en: "Ask iOrbit about this event", zh: "向 iOrbit 询问这场活动" })} className="orb-ball" data-agent-context="event" href={askAgentHref} title={t({ en: "Ask iOrbit", zh: "问 iOrbit" })}>
          <Icon name="sparkle" size={24} /><span className="pip" />
        </a>
      </div>
    </div>
  );
}
