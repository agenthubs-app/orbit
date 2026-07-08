"use client";

import type { CSSProperties, ReactNode } from "react";

import type { OrbitEventDetailRelationshipContextView } from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../../orbit-language-context";
import { productHref, PublicTopNav } from "../../orbit-public-shell";
import { Avatar, Cover, gradientFromString, Icon, StatusBadge } from "../../orbit-reference-primitives";
import { getDemoEventSceneAsset, getDemoPersonAvatarAsset } from "../../../../../shared/demo-visual-assets";

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

function eventTime(event: OrbitLandingEventView, t: Translate, language: OrbitLanguage) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  if (!Number.isFinite(start.getTime())) {
    return { date: t({ en: "Time TBD", zh: "时间待定" }), day: "--", month: "--", time: t({ en: "Start time TBD", zh: "开始时间待定" }) };
  }

  const date = new Intl.DateTimeFormat(dateLocale(language), { weekday: "long", month: "short", day: "numeric", ...tz }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(dateLocale(language), { hour: "2-digit", minute: "2-digit", ...tz });
  return {
    date,
    day: fmtDay(start, language),
    month: fmtMonth(start, language),
    time: Number.isFinite(end.getTime()) ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` : timeFormatter.format(start),
  };
}

function BackButton({ mobile = false, style, t }: { mobile?: boolean; style: CSSProperties; t: Translate }) {
  const goBack = () => {
    window.location.href = productHref("/events");
  };

  return (
    <button aria-label={t({ en: "Back to previous page", zh: "返回上一页" })} className="hit-44" onClick={goBack} style={style} type="button">
      {mobile ? <Icon name="chevL" size={20} /> : <><Icon name="back" size={16} />{t({ en: "Back", zh: "返回" })}</>}
    </button>
  );
}

function DemoPersonAvatar({
  displayName,
  fallbackGradient = "g-violet",
  size,
}: {
  displayName: string;
  fallbackGradient?: string;
  size: number;
}) {
  const asset = getDemoPersonAvatarAsset({ displayName });

  if (!asset) {
    return <Avatar letter={displayName.slice(0, 1)} g={fallbackGradient} size={size} />;
  }

  return (
    <span
      className="avatar"
      data-demo-visual-asset-id={asset.assetId}
      data-demo-visual-source={asset.sourceLabel}
      data-demo-visual-source-label={asset.sourceLabel}
      style={{ height: size, overflow: "hidden", width: size }}
      title={displayName}
    >
      <img
        alt={asset.alt}
        decoding="async"
        loading="lazy"
        src={asset.src}
        style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
      />
    </span>
  );
}

function EventDetailViewportGuards() {
  return (
    <style>{`
      [data-orbit-real-page="event-detail"] {
        max-width: 100vw;
        overflow-x: clip;
      }

      [data-orbit-real-page="event-detail"] main,
      [data-orbit-real-page="event-detail"] .orbit-detail-layout,
      [data-orbit-real-page="event-detail"] .orbit-detail-main,
      [data-orbit-real-page="event-detail"] .orbit-info-grid,
      [data-orbit-real-page="event-detail"] .card,
      [data-orbit-real-page="event-detail"] .card-flat {
        box-sizing: border-box;
        min-width: 0;
        max-width: 100%;
      }

      [data-orbit-real-page="event-detail"] .orbit-detail-layout {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
        margin: -64px auto 0;
        max-width: 1120px;
        padding: 0 24px 96px;
        width: 100%;
      }

      [data-orbit-real-page="event-detail"] .orbit-detail-main {
        display: grid;
        gap: 22px;
      }

      [data-orbit-real-page="event-detail"] .orbit-detail-rail {
        min-width: 0;
        position: relative;
        z-index: 2;
      }

      [data-orbit-real-page="event-detail"] .orbit-info-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      [data-orbit-real-page="event-detail"] .h-display,
      [data-orbit-real-page="event-detail"] .h-section,
      [data-orbit-real-page="event-detail"] p,
      [data-orbit-real-page="event-detail"] span,
      [data-orbit-real-page="event-detail"] strong {
        overflow-wrap: anywhere;
      }

      @media (max-width: 640px) {
        [data-orbit-real-page="event-detail"] {
          overflow-x: clip;
        }

        [data-orbit-real-page="event-detail"] .orbit-detail-layout {
          display: block;
          margin: 0;
          max-width: 100vw;
          overflow-x: clip;
          padding: 0 16px 104px;
        }

        [data-orbit-real-page="event-detail"] .orbit-detail-main {
          gap: 18px;
          width: 100%;
        }

        [data-orbit-real-page="event-detail"] .orbit-info-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        [data-orbit-real-page="event-detail"] .orbit-detail-mobile-cta {
          box-sizing: border-box;
          display: flex;
          max-width: 100vw;
          width: 100%;
        }

        [data-orbit-real-page="event-detail"] .orbit-detail-mobile-cta .btn {
          flex: 1 1 0;
          min-width: 0;
          padding-left: 12px;
          padding-right: 12px;
          white-space: normal;
        }
      }
    `}</style>
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
  if (href && !disabled) {
    return (
      <a
        className={className}
        href={href}
        onClick={() => {
          onBeforeNavigate?.();
        }}
        style={{ ...style, textDecoration: "none" }}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={className}
      disabled={disabled}
      style={style}
      type="button"
    >
      {children}
    </button>
  );
}

function primaryAction(event: OrbitLandingEventView, t: Translate, flex = 1) {
  const youRsvped = Boolean(event.stats.youRsvped);

  if (event.status === "ended") {
    return <ActionButton className="btn is-disabled" disabled style={{ flex }}>{t({ en: "Ended", zh: "已结束" })}</ActionButton>;
  }

  if (youRsvped) {
    return (
      <ActionButton className="btn btn-soft" disabled style={{ flex }}>
        <Icon name="check" size={17} />{t({ en: "Registered", zh: "已报名" })}
      </ActionButton>
    );
  }

  return (
    <ActionButton className="btn btn-primary" href={productHref(`/register?code=${event.code}`)} style={{ background: event.brandColor || undefined, flex }}>
      {t({ en: "Register", zh: "报名参加" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
    </ActionButton>
  );
}

function enterAction(event: OrbitLandingEventView, t: Translate, flex = 1) {
  const youRsvped = Boolean(event.stats.youRsvped);
  const canEnter = youRsvped && (event.status === "active" || event.status === "ended");
  const label = event.status === "ended" ? t({ en: "Replay", zh: "回看" }) : event.status === "upcoming" && youRsvped ? t({ en: "Not started", zh: "未开始" }) : t({ en: "Enter event", zh: "进入活动" });

  if (!canEnter) {
    return <ActionButton className="btn is-disabled" disabled style={{ flex }}>{label}</ActionButton>;
  }

  return (
    <ActionButton
      className="btn btn-ghost"
      href={productHref("/party")}
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
  const initial = (event.organizer || "O").slice(0, 1).toUpperCase();
  const slug = (event.code || "org").toLowerCase();

  return (
    <div className="card-flat" style={{ padding: mobile ? 14 : 16, marginTop: mobile ? 6 : 18 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{t({ en: "Organizer", zh: "主办方" })}</div>
      <a href={productHref(`/o/${slug}`)} style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
        <Avatar letter={initial} g="g-indigo" size={mobile ? 40 : 42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: mobile ? 14.5 : 15, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.organizer}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 1 }}>{t({ en: `Multiple events hosted · ${event.host}`, zh: `已举办多场 · ${event.host}` })}</div>
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

function RelationshipPriorityCard({
  relationshipContext,
  t,
}: {
  relationshipContext: OrbitEventDetailRelationshipContextView | null;
  t: Translate;
}) {
  if (!relationshipContext) {
    return null;
  }

  return (
    <section
      data-event-detail-section="relationship-priority"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        boxShadow: "var(--sh-sm)",
        display: "grid",
        gap: 16,
        padding: 18,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 12, minWidth: 0 }}>
        <DemoPersonAvatar displayName={relationshipContext.primaryPerson.name} fallbackGradient="g-emerald" size={44} />
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <div className="eyebrow">{t({ en: "Relationship priority", zh: "关系优先级" })}</div>
          <h2 className="h-section" style={{ color: "var(--ink)", margin: 0 }}>
            {relationshipContext.primaryPerson.name}
          </h2>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <p style={{ color: "var(--text-2)", fontSize: 14.5, lineHeight: 1.6, margin: 0, overflowWrap: "anywhere" }}>
          {relationshipContext.primaryPerson.context}
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
        }}
      >
        <div className="card-flat" style={{ display: "grid", gap: 5, minWidth: 0, padding: 14 }}>
          <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 650 }}>{t({ en: "Role", zh: "角色" })}</span>
          <strong style={{ color: "var(--ink)", fontSize: 14, overflowWrap: "anywhere" }}>
            {relationshipContext.primaryPerson.role}
          </strong>
          <span style={{ color: "var(--text-3)", fontSize: 12.5, overflowWrap: "anywhere" }}>
            {relationshipContext.primaryPerson.organization}
          </span>
        </div>
        <div className="card-flat" style={{ display: "grid", gap: 5, minWidth: 0, padding: 14 }}>
          <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 650 }}>{t({ en: "First action", zh: "第一动作" })}</span>
          <span style={{ color: "var(--ink)", fontSize: 13.5, lineHeight: 1.55, overflowWrap: "anywhere" }}>
            {relationshipContext.firstAction}
          </span>
        </div>
      </div>
      <div
        data-side-effects={relationshipContext.sideEffects.sideEffectsLabel}
        style={{
          alignItems: "center",
          color: "var(--text-3)",
          display: "flex",
          flexWrap: "wrap",
          fontSize: 12.5,
          gap: 8,
        }}
      >
        <Icon name="lock" size={14} />
        <span>
          {t({
            en: "Render only: no calendar, message, notification, AI, or external network side effects.",
            zh: "仅页面渲染：不写日历、不发消息、不触发通知、不调用 AI 或外部网络。",
          })}
        </span>
      </div>
    </section>
  );
}

function SupportingDetails({
  relationshipContext,
  t,
}: {
  relationshipContext: OrbitEventDetailRelationshipContextView | null;
  t: Translate;
}) {
  if (!relationshipContext) {
    return null;
  }

  return (
    <section data-event-detail-section="supporting-details" style={{ display: "grid", gap: 22 }}>
      <section style={{ display: "grid", gap: 12 }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Relationship context", zh: "关系上下文" })}
        </h3>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
          }}
        >
          {[
            [t({ en: "Why this event", zh: "为什么参加" }), relationshipContext.eventRelationshipContext],
            [t({ en: "Preparation", zh: "准备重点" }), relationshipContext.preparation],
            [t({ en: "Opening line", zh: "开场句" }), relationshipContext.openingLine],
          ].map(([label, value]) => (
            <div className="card-flat" key={label} style={{ display: "grid", gap: 8, minWidth: 0, padding: 14 }}>
              <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 650 }}>{label}</span>
              <span style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.55, overflowWrap: "anywhere" }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section style={{ display: "grid", gap: 12 }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Recommended people", zh: "推荐认识的人" })}
        </h3>
        <div style={{ display: "grid", gap: 10 }}>
          {relationshipContext.recommendedPeople.map((person) => (
            <div className="card-flat" key={person.name} style={{ display: "grid", gap: 7, minWidth: 0, padding: 14 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 10, minWidth: 0 }}>
                <DemoPersonAvatar displayName={person.name} fallbackGradient="g-emerald" size={34} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {person.name}
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {person.role} · {person.organization}
                  </div>
                </div>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" }}>
                {person.context}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ display: "grid", gap: 12 }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Readiness", zh: "准备状态" })}
        </h3>
        <div style={{ display: "grid", gap: 9 }}>
          {relationshipContext.readinessItems.map((item) => (
            <div className="card-flat" key={item.label} style={{ alignItems: "start", display: "grid", gap: 5, minWidth: 0, padding: 13 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
                <strong style={{ color: "var(--ink)", fontSize: 13.5 }}>{item.label}</strong>
                <span className="chip" style={{ fontSize: 11.5, height: 24 }}>{item.status}</span>
              </div>
              <span style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                {item.rationale}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section style={{ display: "grid", gap: 10 }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Source guardrails", zh: "来源保护" })}
        </h3>
        <p style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" }}>
          {relationshipContext.sourceConsistencySummary}
        </p>
      </section>
    </section>
  );
}

function EventDetailPanel({
  event,
  language,
  relationshipContext,
  t,
}: {
  event: OrbitLandingEventView;
  language: OrbitLanguage;
  relationshipContext: OrbitEventDetailRelationshipContextView | null;
  t: Translate;
}) {
  const youRsvped = Boolean(event.stats.youRsvped);
  const canSeeAttendees = youRsvped || event.status === "ended";
  const attendees = event.stats.attendees;

  return (
    <>
      <section className="card orbit-desktop-only" data-event-detail-section="registration-action" style={{ padding: 18, display: "block" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div><div style={{ fontSize: 13, color: "var(--text-3)" }}>{t({ en: "Registration", zh: "报名" })}</div><h3 className="h-section" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>{event.feeLabel}</h3></div>
          <StatusBadge language={language} status={event.status} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>{primaryAction(event, t)}{enterAction(event, t)}</div>
        {!youRsvped && event.status !== "ended" ? <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 11, display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={13} />{t({ en: "Full attendee list visible after you register", zh: "确认参加后可见完整参会者名单" })}</div> : null}
      </section>

      {event.descriptionZh ? <section><h3 className="h-section" style={{ margin: "0 0 10px" }}>{t({ en: "About this event", zh: "关于活动" })}</h3><p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text-2)", margin: 0, whiteSpace: "pre-line" }}>{event.descriptionZh}</p></section> : null}

      {event.agenda.length ? (
        <section>
          <h3 className="h-section" style={{ margin: "0 0 14px" }}>{t({ en: "Agenda", zh: "当晚议程" })}</h3>
          <div style={{ position: "relative", paddingLeft: 4 }}>
            {event.agenda.map((item, index) => (
              <div key={`${item.time}-${item.label}`} style={{ display: "flex", gap: 16, paddingBottom: index < event.agenda.length - 1 ? 18 : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 11, height: 11, borderRadius: 999, background: index === 0 ? "var(--accent)" : "var(--surface)", border: `2px solid ${index === 0 ? "var(--accent)" : "var(--border-strong)"}` }} />
                  {index < event.agenda.length - 1 ? <span style={{ width: 2, flex: 1, background: "var(--border-2)", marginTop: 4 }} /> : null}
                </div>
                <div style={{ marginTop: -3, paddingBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span className="mono" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{item.time}</span><span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{item.label}</span></div>
                  {item.description ? <div style={{ fontSize: 13.5, color: "var(--text-3)", marginTop: 3 }}>{item.description}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section data-event-detail-section="attendee-context">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className="h-section" style={{ margin: 0 }}>{t({ en: "Attendees", zh: "参会者" })} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{event.stats.count}</span></h3>
          {!canSeeAttendees ? <span style={{ fontSize: 13, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="lock" size={14} />{t({ en: "See full list after you register", zh: "确认参加后查看完整名单" })}</span> : null}
        </div>
        <div>
          {!canSeeAttendees ? (
            <div className="card-flat" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ fontSize: 13.5, color: "var(--text-2)" }}>{t({ en: "Full attendee list visible after you register", zh: "确认参加后可见完整参会者名单" })}</div>
              {event.stats.count && event.status !== "ended" ? <a className="btn btn-dark btn-sm" href={productHref(`/register?code=${event.code}`)} style={{ textDecoration: "none" }}><Icon name="lock" size={15} />{t({ en: "Register", zh: "报名参加" })}</a> : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {attendees.map((person, index) => (
                <div key={`${person.name}-${index}`} className="card-flat" style={{ padding: 12, display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  <DemoPersonAvatar displayName={person.name} fallbackGradient={avatarGradients[index % avatarGradients.length]} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</div>
                    {person.role ? <div style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.role}</div> : null}
                  </div>
                </div>
              ))}
              {event.stats.count > attendees.length ? <div className="card-flat" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", fontWeight: 600 }}>+{event.stats.count - attendees.length}</div> : null}
            </div>
          )}
        </div>
      </section>

      <SupportingDetails relationshipContext={relationshipContext} t={t} />

      <div className="orbit-mobile-only" data-event-detail-overlap-guard="fixed-mobile-cta-space" style={{ height: 84 }} />
      <div className="orbit-mobile-only orbit-detail-mobile-cta" data-event-detail-mobile="registration-actions" data-event-detail-mobile-cta="fixed-bottom" data-event-detail-section="registration-action" style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 18px 24px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(14px)", borderTop: "1px solid var(--border)", gap: 10, zIndex: 40 }}>
        {primaryAction(event, t, 1.2)}{enterAction(event, t)}
      </div>
    </>
  );
}

export function OrbitRealEventDetail({
  event,
  relationshipContext = null,
}: {
  event: OrbitLandingEventView;
  relationshipContext?: OrbitEventDetailRelationshipContextView | null;
}) {
  const { t, language } = useOrbitLanguage();
  const cover = gradientFromString(event.code || event.name || "orbit");
  const sceneAsset = getDemoEventSceneAsset(event.id);
  const time = eventTime(event, t, language);
  const name = event.name || event.code || t({ en: "Event", zh: "活动" });
  const monogram = name.slice(0, 1);
  const codeUpper = String(event.code || "").toUpperCase();

  return (
    <div className="orbit-shell" data-appscroll data-event-detail-hierarchy="restored" data-event-detail-layout="mobile-stacked" data-event-detail-layout-contract="fixed-cta-reserved-space" data-event-detail-overflow-guard="viewport-constrained" data-orbit-real-page="event-detail">
      <EventDetailViewportGuards />
      <PublicTopNav active="events" />
      <main>
        <div className="orbit-desktop-only" data-demo-visual-asset-id={sceneAsset?.assetId} data-demo-visual-source={sceneAsset?.sourceLabel} data-demo-visual-source-label={sceneAsset?.sourceLabel} data-event-detail-section="hero" style={{ position: "relative", height: 220, overflow: "hidden" }}>
          <Cover g={cover} imageUrl={event.detailLogoUrl} imageAlt={name} style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.18))" }} />
          <BackButton t={t} style={{ position: "absolute", top: 18, left: 40, border: "none", background: "rgba(255,255,255,0.9)", height: 36, padding: "0 14px", borderRadius: 999, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, color: "var(--ink)", textDecoration: "none", boxShadow: "var(--sh-sm)" }} />
        </div>
        <div className="orbit-mobile-only" data-demo-visual-asset-id={sceneAsset?.assetId} data-demo-visual-source={sceneAsset?.sourceLabel} data-demo-visual-source-label={sceneAsset?.sourceLabel} data-event-detail-mobile="hero" data-event-detail-section="hero" style={{ position: "relative", height: 248, display: "block" }}>
          <Cover g={cover} imageUrl={event.detailLogoUrl} imageAlt={name} monogram={event.detailLogoUrl ? null : { text: monogram, size: 64 }} style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.25))" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 52, display: "flex", alignItems: "center", padding: "0 16px", gap: 10 }}>
            <BackButton mobile t={t} style={{ border: "none", background: "rgba(0,0,0,0.3)", width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-dark)", textDecoration: "none" }} />
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 18, right: 18 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}><StatusBadge language={language} status={event.status} /><span style={{ background: "rgba(255,255,255,0.18)", color: "var(--on-dark)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, backdropFilter: "blur(6px)" }}>{event.code}</span></div>
          </div>
        </div>
        <div className="orbit-detail-layout">
          <aside className="orbit-detail-rail orbit-desktop-only">
            <Cover g={cover} imageUrl={event.detailLogoUrl} imageAlt={name} monogram={event.detailLogoUrl ? null : { text: monogram, size: 76 }} style={{ aspectRatio: "1", borderRadius: 18, boxShadow: "var(--sh-lg)", border: "4px solid var(--bg)" }}>
              <div style={{ position: "absolute", bottom: 14, left: 14 }}><StatusBadge language={language} status={event.status} /></div>
            </Cover>
            <OrganizerRailCard event={event} t={t} />
          </aside>
          <div className="orbit-detail-main">
            <div>
              <div className="orbit-desktop-only" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}><span className="chip" style={{ height: 26, fontSize: 12, background: "var(--accent-softer)", color: "var(--accent)" }}>{event.code}</span><StatusBadge language={language} status={event.status} /></div>
              <h1 className="h-display" style={{ margin: 0 }}>{name}</h1>
              <div className="mono" style={{ fontSize: 13, color: "var(--text-3)", letterSpacing: "0.06em", marginTop: 8 }}>{codeUpper}</div>
              {event.summaryZh ? <p style={{ fontSize: 16, color: "var(--text-2)", lineHeight: 1.5, marginTop: 14, marginBottom: 0 }}>{event.summaryZh}</p> : null}
            </div>
            <RelationshipPriorityCard relationshipContext={relationshipContext} t={t} />
            <div className="orbit-info-grid" data-event-detail-section="schedule">
              <div className="card-flat" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", textAlign: "center", flexShrink: 0 }}>
                  <div style={{ background: event.brandColor || "var(--accent)", color: "var(--on-dark)", fontSize: 11, fontWeight: 600, padding: "2px 0" }}>{time.month}</div>
                  <div style={{ fontFamily: "var(--ff-tight)", fontSize: 22, fontWeight: 700, padding: "4px 0", color: "var(--ink)" }}>{time.day}</div>
                </div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{time.date}</div><div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{time.time}</div></div>
              </div>
              <div className="card-flat" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, height: 50, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-2)" }}><Icon name="pin" size={22} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{event.venue || t({ en: "Venue TBD", zh: "地点待定" })}</div><div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{event.address || t({ en: "Organizer has not set a detailed address yet", zh: "主办方尚未设置详细地址" })}</div></div>
              </div>
            </div>
            <div className="orbit-mobile-only" data-event-detail-mobile="summary" data-event-detail-section="schedule" style={{ flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}><Icon name="calendar" size={19} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 550, color: "var(--ink)" }}>{time.date}</div><div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 1 }}>{time.time}</div></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", flexShrink: 0 }}><Icon name="pin" size={19} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 550, color: "var(--ink)" }}>{event.venue || t({ en: "Venue TBD", zh: "地点待定" })}</div><div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 1 }}>{event.address || t({ en: "Organizer has not set a detailed address yet", zh: "主办方尚未设置详细地址" })}</div></div>
              </div>
              <OrganizerRailCard event={event} mobile t={t} />
            </div>
            <EventDetailPanel
              event={event}
              language={language}
              relationshipContext={relationshipContext}
              t={t}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
