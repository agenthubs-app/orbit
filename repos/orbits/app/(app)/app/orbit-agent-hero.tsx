import type { OrbitLanguage } from "./orbit-language-core";
import type {
  OrbitLandingConnectionView,
  OrbitLandingEventView,
} from "./orbit-landing-route-view-model";
import { Avatar, Icon, Logo } from "./orbit-reference-primitives";

type LandingCopy = { en: string; zh: string };

function text(language: OrbitLanguage, copy: LandingCopy) {
  return copy[language];
}

function dateLocale(language: OrbitLanguage) {
  return language === "en" ? "en-US" : "zh-CN";
}

function eventDate(startsAt: string, language: OrbitLanguage) {
  const date = new Date(startsAt);

  if (!Number.isFinite(date.getTime())) {
    return text(language, { en: "Time TBD", zh: "时间待定" });
  }

  return new Intl.DateTimeFormat(dateLocale(language), {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function eventDetailHref(event: OrbitLandingEventView) {
  return `/app/events/${event.id}`;
}

function localizedEventSummary(event: OrbitLandingEventView, language: OrbitLanguage) {
  const preferredLabel = language === "en" ? "EN" : "ZH";
  const segments = Array.from(
    event.summaryZh.matchAll(/\b(JA|ZH|EN):\s*([\s\S]*?)(?=\s+\b(?:JA|ZH|EN):|$)/g),
    (match) => ({
      label: match[1],
      text: match[2].trim(),
    }),
  );

  if (segments.length === 0) {
    return event.summaryZh;
  }

  return (
    segments.find((segment) => segment.label === preferredLabel)?.text ??
    segments[0]?.text ??
    event.summaryZh
  );
}

function contactContextLabel(connection: OrbitLandingConnectionView, language: OrbitLanguage) {
  return text(language, {
    en: `View ${connection.displayName}'s relationship context`,
    zh: `查看${connection.displayName}的人脉上下文`,
  });
}

function statusText(status: OrbitLandingEventView["status"], language: OrbitLanguage) {
  if (status === "active") return text(language, { en: "Live now", zh: "正在发生" });
  if (status === "upcoming") return text(language, { en: "Coming up", zh: "即将开始" });
  return text(language, { en: "Past context", zh: "历史上下文" });
}

export function OrbitAgentHero({
  accountName,
  activeEventCount,
  connectionCount,
  eventCount,
  language,
  primaryConnection,
  primaryEvent,
}: {
  accountName: string;
  activeEventCount: number;
  connectionCount: number;
  eventCount: number;
  language: OrbitLanguage;
  primaryConnection?: OrbitLandingConnectionView;
  primaryEvent?: OrbitLandingEventView;
}) {
  const firstName = accountName.split(/\s+/)[0] || accountName;

  return (
    <section
      aria-labelledby="orbit-root-agent-title"
      className="orbit-root-agent-hero"
      data-orbit-agent-hero="root"
    >
      <div className="orbit-root-hero-copy">
        <div className="eyebrow">
          {text(language, { en: "Orbit Agent", zh: "Orbit Agent" })}
        </div>
        <h1 className="h-display orbit-root-title" id="orbit-root-agent-title">
          {text(language, {
            en: "Know the relationship before the next move.",
            zh: "先弄清关系，再决定下一步。",
          })}
        </h1>
        <p className="orbit-root-lede">
          {text(language, {
            en: "Orbit keeps events, contacts, and schedule notes in one relationship map. It shows the source first, then suggests a follow-up you can inspect.",
            zh: "Orbit 把活动、人脉和日程放在同一张关系图里。先看来源，再给出一条能检查的跟进建议。",
          })}
        </p>
        <div className="orbit-root-actions">
          <a className="btn btn-primary" href="/app/agent">
            <Icon name="sparkle" size={16} />
            {text(language, { en: "Ask iOrbit", zh: "问 iOrbit" })}
          </a>
          <a className="btn btn-ghost" href="/app/home">
            <Icon name="home" size={16} />
            {text(language, { en: "Open my home", zh: "打开个人主页" })}
          </a>
        </div>
        <p className="orbit-root-safety-note">
          <Icon name="lock" size={15} />
          {text(language, {
            en: "Render-only preview: no messages, calendar writes, notifications, or outside provider calls.",
            zh: "这里只读本地来源：不会发消息、写日历、推通知，也不会调用外部账号。",
          })}
        </p>
      </div>

      <aside className="orbit-agent-briefing" aria-label={text(language, { en: "Agent briefing", zh: "Agent 简报" })}>
        <div className="orbit-agent-briefing-head">
          <Logo size={24} />
          <span>{text(language, { en: "Today for", zh: "今天先看" })} {firstName}</span>
        </div>
        <div className="orbit-agent-stat-grid">
          <div>
            <strong>{connectionCount}</strong>
            <span>{text(language, { en: "contacts with source", zh: "条有来源的人脉" })}</span>
          </div>
          <div>
            <strong>{eventCount}</strong>
            <span>{text(language, { en: "events in context", zh: "场活动上下文" })}</span>
          </div>
          <div>
            <strong>{activeEventCount}</strong>
            <span>{text(language, { en: "live now", zh: "个正在发生" })}</span>
          </div>
        </div>
        <div className="orbit-agent-context-card">
          {primaryEvent ? (
            <>
              <div className="orbit-agent-context-meta">
                <span>{statusText(primaryEvent.status, language)}</span>
                <span>{eventDate(primaryEvent.startsAt, language)}</span>
              </div>
              <h2>{primaryEvent.name}</h2>
              <p>{localizedEventSummary(primaryEvent, language)}</p>
              <a href={eventDetailHref(primaryEvent)}>
                {text(language, { en: "Open event context", zh: "打开活动上下文" })}
                <Icon name="chevR" size={15} />
              </a>
            </>
          ) : (
            <>
              <h2>{text(language, { en: "No event context yet", zh: "还没有活动上下文" })}</h2>
              <p>{text(language, { en: "Add an event before asking Orbit for a follow-up.", zh: "先补一场活动，再让 Orbit 建议跟进。" })}</p>
            </>
          )}
        </div>
        {primaryConnection ? (
          <div className="orbit-agent-person-row">
            <Avatar letter={primaryConnection.initial} size={38} title={primaryConnection.displayName} />
            <span>
              <strong>{primaryConnection.displayName}</strong>
              <small>{text(language, { en: "Contact workflow is ready to review", zh: "人脉工作流可以继续看" })}</small>
            </span>
            <a aria-label={contactContextLabel(primaryConnection, language)} href="/app/contacts">
              <Icon name="chevR" size={17} />
            </a>
          </div>
        ) : null}
      </aside>
    </section>
  );
}
