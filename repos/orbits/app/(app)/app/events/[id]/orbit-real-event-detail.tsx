"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

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
import { OrbitPostEventFollowupCapture } from "./orbit-post-event-followup-capture";
import { OrbitEventMatchmaking } from "./orbit-event-matchmaking";

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

const ATTENDEE_PREVIEW_COUNT = 12;

function EventDetailPanel({ event, language, t, workspaceAvailable }: { event: OrbitLandingEventView; language: OrbitLanguage; t: Translate; workspaceAvailable: boolean }) {
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus>(event.stats.youRsvped ? "rsvped" : null);
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

  return (
    <>
      <section className="card orbit-desktop-only" style={{ padding: 18, display: "block" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div><div style={{ fontSize: 13, color: "var(--text-3)" }}>{t({ en: "Registration", zh: "报名" })}</div><h3 className="h-section" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>{event.feeLabel}</h3></div>
          <StatusBadge language={language} status={event.status} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>{primaryAction(event, t, registrationStatus)}{enterAction(event, t, youRsvped, workspaceAvailable)}</div>
        {!youRsvped && event.status !== "ended" ? <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 11, display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={13} />{t({ en: "Full attendee list visible after you register", zh: "确认参加后可见完整参会者名单" })}</div> : null}
      </section>

      {event.status === "ended" && canSeeAttendees ? (
        <OrbitPostEventFollowupCapture
          attendeeNames={event.stats.attendees.map(
            (attendee) => attendee.name,
          )}
          eventId={event.id}
          eventTitle={event.name}
        />
      ) : null}

      <OrbitEventMatchmaking
        authenticated={event.stats.authed}
        eventId={event.id}
        registrationOpen={event.status !== "ended"}
      />

      {event.about && event.about.length ? (
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
      ) : null}

      {event.agenda.length ? (
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
      ) : null}

      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className="h-section" style={{ margin: 0 }}>{t({ en: "Attendees", zh: "参会者" })} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{event.stats.count}</span></h3>
          {!canSeeAttendees ? <span style={{ fontSize: 13, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={14} />{t({ en: "See full list after you register", zh: "确认参加后查看完整名单" })}</span> : null}
        </div>
        <div>
          {!canSeeAttendees ? (
            <div className="card-flat" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ fontSize: 14, color: "var(--text-2)" }}>{t({ en: "Full attendee list visible after you register", zh: "确认参加后可见完整参会者名单" })}</div>
              {event.stats.count && event.status !== "ended" ? <a className="btn btn-dark btn-sm" href={`/app/events/${encodeURIComponent(event.id)}/register`} style={{ textDecoration: "none" }}><Icon name="lock" size={15} />{t({ en: "Register", zh: "报名参加" })}</a> : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {attendees.map((person, index) => (
                <div key={`${person.name}-${index}`} className="card-flat" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
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

  return (
    <div className="orbit-shell" data-appscroll data-orbit-real-page="event-detail">
      <PublicTopNav active="events" />
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
            <EventDetailPanel event={event} language={language} t={t} workspaceAvailable={workspaceAvailable} />
          </div>
        </div>
      </main>
    </div>
  );
}
