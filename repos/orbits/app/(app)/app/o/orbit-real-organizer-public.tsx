import type { OrbitOrganizerPublicViewModel } from "../orbit-organizer-route-view-model";
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { productHref, PublicTopNav } from "../orbit-public-shell";
import { Avatar, Cover, gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";

const tz = { timeZone: "Asia/Tokyo" };

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", ...tz }).format(date);
}

function eventDate(event: OrbitLandingEventView) {
  const date = new Date(event.startsAt);

  if (!Number.isFinite(date.getTime())) return { day: "", month: "待定", time: "时间待定" };

  return {
    day: fmtDay(date),
    month: fmtMonth(date),
    time: new Intl.DateTimeFormat("zh-CN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", ...tz }).format(date),
  };
}

function SiteHeader() {
  return <PublicTopNav active="events" />;
}

function EventCard({ event }: { event: OrbitLandingEventView }) {
  const name = event.name;
  const status = event.status || "unknown";
  const date = eventDate(event);
  const cover = gradientFromString(event.code || name);
  const actionLabel = status === "upcoming" || status === "active" ? "报名" : "查看";

  return (
    <a className="orbit-card-link" href={productHref(`/events/${event.code}`)}>
      <article className="card card-hover orbit-event-card">
        <Cover className="orbit-card-cover" g={cover} imageAlt={name} imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 46, text: name.slice(0, 1) }} style={{ height: undefined, opacity: status === "ended" ? 0.72 : 1 }}>
          <div style={{ left: 12, position: "absolute", top: 12 }}><StatusBadge status={status} /></div>
          <div className="orbit-card-date">
            <div style={{ color: "var(--rose)", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>{date.month}</div>
            {date.day ? <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{date.day}</div> : null}
          </div>
        </Cover>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 9, padding: "15px 16px 16px" }}>
          <div>
            <h3 className="h-section" style={{ color: "var(--ink)", fontSize: 17, margin: 0, overflowWrap: "anywhere" }}>{name}</h3>
            {event.theme || event.host ? <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2 }}>{[event.theme, event.host].filter(Boolean).join(" · ")}</div> : null}
          </div>
          <div style={{ color: "var(--text-2)", display: "flex", flexDirection: "column", fontSize: 13, gap: 6 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}><Icon color="var(--text-3)" name="clock" size={15} />{date.time}</div>
            {event.place ? <div style={{ alignItems: "center", display: "flex", gap: 8 }}><Icon color="var(--text-3)" name="pin" size={15} />{event.place}</div> : null}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", gap: 12, justifyContent: "space-between", paddingTop: 11 }}>
            <span style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 12.5, gap: 6 }}><Icon color="var(--text-3)" name="users" size={15} />{event.participantCount} 人已报名</span>
            <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 3 }}>{actionLabel}<Icon name="chevR" size={14} /></span>
          </div>
        </div>
      </article>
    </a>
  );
}

export function OrbitRealOrganizerPublic({ viewModel }: { viewModel: OrbitOrganizerPublicViewModel }) {
  return (
    <div className="orbit-shell" data-appscroll data-orbit-real-page="organizer-public">
      <SiteHeader />
      <main>
        <div style={{ height: 180, overflow: "hidden", position: "relative" }}>
          <Cover g={gradientFromString(viewModel.name || "org")} style={{ inset: 0, position: "absolute" }} />
          <div style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.25))", inset: 0, position: "absolute" }} />
          <a href="/app/events" style={{ alignItems: "center", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: 999, boxShadow: "var(--sh-sm)", color: "var(--ink)", cursor: "pointer", display: "inline-flex", fontSize: 13.5, fontWeight: 550, gap: 6, height: 36, left: 24, padding: "0 14px", position: "absolute", textDecoration: "none", top: 18 }}><Icon name="back" size={16} />返回</a>
        </div>
        <div style={{ margin: "0 auto", maxWidth: 1080, padding: "0 40px 80px" }}>
          <div style={{ alignItems: "flex-end", display: "flex", gap: 18, paddingTop: 14, position: "relative", zIndex: 1 }}>
            <span style={{ display: "inline-flex", flexShrink: 0, marginTop: -56 }}><Avatar g="g-indigo" letter={viewModel.initial} ring="var(--bg)" size={88} /></span>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
              <h1 className="h-display" style={{ fontSize: 30, margin: 0 }}>{viewModel.name}</h1>
              <div style={{ color: "var(--text-2)", fontSize: 13.5, marginTop: 4 }}>{viewModel.handle}</div>
            </div>
            <span className="badge badge-live" style={{ height: 26, marginBottom: 4 }}><Icon name="check" size={13} />已认证主办方</span>
          </div>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", gap: 30, marginTop: 22, padding: "16px 22px" }}>
            {([["举办活动", "12"], ["累计参会", "4,200+"], ["满意度", "4.8"]] as const).map(([label, value]) => (
              <div key={label}><div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 26, fontWeight: 700 }}>{value}</div><div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 1 }}>{label}</div></div>
            ))}
          </div>
          <h2 className="h-section" style={{ fontSize: 20, margin: "34px 0 16px" }}>TA 的活动</h2>
          <div className="orbit-grid">{viewModel.events.map((event) => <EventCard event={event} key={event.id} />)}</div>
        </div>
      </main>
    </div>
  );
}
