"use client";

import type { CSSProperties, ReactNode } from "react";

import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { productHref, PublicTopNav } from "../../orbit-public-shell";
import { Avatar, Cover, gradientFromString, Icon, StatusBadge } from "../../orbit-reference-primitives";

const tz = { timeZone: "Asia/Tokyo" };
const avatarGradients = ["g-indigo", "g-violet", "g-rose", "g-amber", "g-emerald", "g-sky", "g-slate"];

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", ...tz }).format(date);
}

function eventTime(event: OrbitLandingEventView) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  if (!Number.isFinite(start.getTime())) {
    return { date: "时间待定", day: "--", month: "--", time: "开始时间待定" };
  }

  const date = new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "short", day: "numeric", ...tz }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", ...tz });
  return {
    date,
    day: fmtDay(start),
    month: fmtMonth(start),
    time: Number.isFinite(end.getTime()) ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` : timeFormatter.format(start),
  };
}

function BackButton({ mobile = false, style }: { mobile?: boolean; style: CSSProperties }) {
  const goBack = () => {
    window.location.href = productHref("/events");
  };

  return (
    <button aria-label="返回上一页" onClick={goBack} style={style} type="button">
      {mobile ? <Icon name="chevL" size={20} /> : <><Icon name="back" size={16} />返回</>}
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

function primaryAction(event: OrbitLandingEventView, flex = 1) {
  const youRsvped = Boolean(event.stats.youRsvped);

  if (event.status === "ended") {
    return <ActionButton className="btn is-disabled" disabled style={{ flex }}>已结束</ActionButton>;
  }

  if (youRsvped) {
    return (
      <ActionButton className="btn btn-soft" disabled style={{ flex }}>
        <Icon name="check" size={17} />已报名
      </ActionButton>
    );
  }

  return (
    <ActionButton className="btn btn-primary" href={productHref(`/register?code=${event.code}`)} style={{ background: event.brandColor || undefined, flex }}>
      报名参加<Icon color="#fff" name="arrow" size={17} />
    </ActionButton>
  );
}

function enterAction(event: OrbitLandingEventView, flex = 1) {
  const youRsvped = Boolean(event.stats.youRsvped);
  const canEnter = youRsvped && (event.status === "active" || event.status === "ended");
  const label = event.status === "ended" ? "回看" : event.status === "upcoming" && youRsvped ? "未开始" : "进入活动";

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

function OrganizerRailCard({ event, mobile = false }: { event: OrbitLandingEventView; mobile?: boolean }) {
  const initial = (event.organizer || "O").slice(0, 1).toUpperCase();
  const slug = (event.code || "org").toLowerCase();

  return (
    <div className="card-flat" style={{ padding: mobile ? 14 : 16, marginTop: mobile ? 6 : 18 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>主办方</div>
      <a href={productHref(`/o/${slug}`)} style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
        <Avatar letter={initial} g="g-indigo" size={mobile ? 40 : 42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: mobile ? 14.5 : 15, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.organizer}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 1 }}>{`已举办多场 · ${event.host}`}</div>
        </div>
        <Icon name="chevR" size={18} color="var(--text-4)" />
      </a>
      {!mobile ? (
        <a href={productHref(`/o/${slug}`)} className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 14, textDecoration: "none" }}>
          <Icon name="calendar" size={15} />查看 TA 的全部活动
        </a>
      ) : null}
    </div>
  );
}

function EventDetailPanel({ event }: { event: OrbitLandingEventView }) {
  const youRsvped = Boolean(event.stats.youRsvped);
  const canSeeAttendees = youRsvped || event.status === "ended";
  const attendees = event.stats.attendees;

  return (
    <>
      <section className="card orbit-desktop-only" style={{ padding: 18, display: "block" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div><div style={{ fontSize: 13, color: "var(--text-3)" }}>报名</div><div className="h-section" style={{ fontSize: 20, color: "var(--ink)", whiteSpace: "nowrap" }}>{event.feeLabel}</div></div>
          <StatusBadge status={event.status} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>{primaryAction(event)}{enterAction(event)}</div>
        {!youRsvped && event.status !== "ended" ? <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 11, display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={13} />确认参加后可见完整参会者名单</div> : null}
      </section>

      {event.descriptionZh ? <section><h3 className="h-section" style={{ fontSize: 18, margin: "0 0 10px" }}>关于活动</h3><p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text-2)", margin: 0, whiteSpace: "pre-line" }}>{event.descriptionZh}</p></section> : null}

      {event.agenda.length ? (
        <section>
          <h3 className="h-section" style={{ fontSize: 18, margin: "0 0 14px" }}>当晚议程</h3>
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

      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 className="h-section" style={{ fontSize: 18, margin: 0 }}>参会者 <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{event.stats.count}</span></h3>
          {!canSeeAttendees ? <span style={{ fontSize: 13, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="lock" size={14} />确认参加后查看完整名单</span> : null}
        </div>
        <div>
          {!canSeeAttendees ? (
            <div className="card-flat" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ fontSize: 13.5, color: "var(--text-2)" }}>确认参加后可见完整参会者名单</div>
              {event.stats.count && event.status !== "ended" ? <a className="btn btn-dark btn-sm" href={productHref(`/register?code=${event.code}`)} style={{ textDecoration: "none" }}><Icon name="lock" size={15} />报名参加</a> : null}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {attendees.map((person, index) => (
                <div key={`${person.name}-${index}`} className="card-flat" style={{ padding: 12, display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  <Avatar letter={person.initial || person.name.slice(0, 1)} g={avatarGradients[index % avatarGradients.length]} size={40} />
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

      <div className="orbit-mobile-only" style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 18px 24px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(14px)", borderTop: "1px solid var(--border)", gap: 10, zIndex: 40 }}>
        {primaryAction(event, 1.2)}{enterAction(event)}
      </div>
    </>
  );
}

export function OrbitRealEventDetail({ event }: { event: OrbitLandingEventView }) {
  const cover = gradientFromString(event.code || event.name || "orbit");
  const time = eventTime(event);
  const name = event.name || event.code || "活动";
  const monogram = name.slice(0, 1);
  const codeUpper = String(event.code || "").toUpperCase();

  return (
    <div className="orbit-shell" data-appscroll data-orbit-real-page="event-detail">
      <PublicTopNav active="events" />
      <main>
        <div className="orbit-desktop-only" style={{ position: "relative", height: 220, overflow: "hidden" }}>
          <Cover g={cover} imageUrl={event.detailLogoUrl} imageAlt={name} style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.18))" }} />
          <BackButton style={{ position: "absolute", top: 18, left: 40, border: "none", background: "rgba(255,255,255,0.9)", height: 36, padding: "0 14px", borderRadius: 999, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, color: "var(--ink)", textDecoration: "none", boxShadow: "var(--sh-sm)" }} />
        </div>
        <div className="orbit-mobile-only" style={{ position: "relative", height: 248, display: "block" }}>
          <Cover g={cover} imageUrl={event.detailLogoUrl} imageAlt={name} monogram={event.detailLogoUrl ? null : { text: monogram, size: 64 }} style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.25))" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 52, display: "flex", alignItems: "center", padding: "0 16px", gap: 10 }}>
            <BackButton mobile style={{ border: "none", background: "rgba(0,0,0,0.3)", width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textDecoration: "none" }} />
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 18, right: 18 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}><StatusBadge status={event.status} /><span style={{ background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, backdropFilter: "blur(6px)" }}>{event.code}</span></div>
          </div>
        </div>
        <div className="orbit-detail-layout">
          <aside className="orbit-detail-rail orbit-desktop-only">
            <Cover g={cover} imageUrl={event.detailLogoUrl} imageAlt={name} monogram={event.detailLogoUrl ? null : { text: monogram, size: 76 }} style={{ aspectRatio: "1", borderRadius: 18, boxShadow: "var(--sh-lg)", border: "4px solid var(--bg)" }}>
              <div style={{ position: "absolute", bottom: 14, left: 14 }}><StatusBadge status={event.status} /></div>
            </Cover>
            <OrganizerRailCard event={event} />
          </aside>
          <div className="orbit-detail-main">
            <div>
              <div className="orbit-desktop-only" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}><span className="chip" style={{ height: 26, fontSize: 12, background: "var(--accent-softer)", color: "var(--accent)" }}>{event.code}</span><StatusBadge status={event.status} /></div>
              <h1 className="h-display" style={{ fontSize: "clamp(27px, 5vw, 40px)", margin: 0 }}>{name}</h1>
              <div className="mono" style={{ fontSize: 13, color: "var(--text-3)", letterSpacing: "0.06em", marginTop: 8 }}>{codeUpper}</div>
              {event.summaryZh ? <p style={{ fontSize: 16, color: "var(--text-2)", lineHeight: 1.5, marginTop: 14, marginBottom: 0 }}>{event.summaryZh}</p> : null}
            </div>
            <div className="orbit-info-grid">
              <div className="card-flat" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", textAlign: "center", flexShrink: 0 }}>
                  <div style={{ background: event.brandColor || "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "2px 0" }}>{time.month}</div>
                  <div style={{ fontFamily: "var(--ff-tight)", fontSize: 22, fontWeight: 700, padding: "4px 0", color: "var(--ink)" }}>{time.day}</div>
                </div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{time.date}</div><div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{time.time}</div></div>
              </div>
              <div className="card-flat" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, height: 50, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-2)" }}><Icon name="pin" size={22} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{event.venue || "地点待定"}</div><div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{event.address || "主办方尚未设置详细地址"}</div></div>
              </div>
            </div>
            <div className="orbit-mobile-only" style={{ flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}><Icon name="calendar" size={19} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 550, color: "var(--ink)" }}>{time.date}</div><div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 1 }}>{time.time}</div></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", flexShrink: 0 }}><Icon name="pin" size={19} /></div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 550, color: "var(--ink)" }}>{event.venue || "地点待定"}</div><div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 1 }}>{event.address || "主办方尚未设置详细地址"}</div></div>
              </div>
              <OrganizerRailCard event={event} mobile />
            </div>
            <EventDetailPanel event={event} />
          </div>
        </div>
      </main>
    </div>
  );
}
