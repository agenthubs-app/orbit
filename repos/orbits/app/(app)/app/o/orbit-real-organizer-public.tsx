import type { OrbitLanguage } from "../orbit-language-core";
import { makeOrbitServerT } from "../orbit-language-server";
import type { OrbitOrganizerPublicViewModel } from "../orbit-organizer-route-view-model";
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { productHref } from "../orbit-product-href";
import { PublicTopNav } from "../orbit-public-shell";
import { EventCover } from "../events/orbit-event-cover";
import { Avatar, Cover, gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";
import { ORBIT_Z } from "../orbit-z";

type T = (copy: { en: string; zh: string }) => string;

const tz = { timeZone: "Asia/Tokyo" };

function dateLocale(language: OrbitLanguage) {
  return language === "en" ? "en-US" : "zh-CN";
}

function fmtMonth(date: Date, language: OrbitLanguage) {
  return new Intl.DateTimeFormat(dateLocale(language), { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date, language: OrbitLanguage) {
  return new Intl.DateTimeFormat(dateLocale(language), { day: "2-digit", ...tz }).format(date);
}

function eventDate(event: OrbitLandingEventView, language: OrbitLanguage, t: T) {
  const date = new Date(event.startsAt);

  if (!Number.isFinite(date.getTime())) return { day: "", month: t({ en: "TBD", zh: "待定" }), time: t({ en: "Time TBD", zh: "时间待定" }) };

  return {
    day: fmtDay(date, language),
    month: fmtMonth(date, language),
    time: new Intl.DateTimeFormat(dateLocale(language), { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", ...tz }).format(date),
  };
}

function SiteHeader() {
  return <PublicTopNav active="events" />;
}

function EventCard({ event, language, t }: { event: OrbitLandingEventView; language: OrbitLanguage; t: T }) {
  const name = event.name;
  const status = event.status || "unknown";
  const date = eventDate(event, language, t);
  const cover = gradientFromString(event.code || name);
  const actionLabel = status === "upcoming" || status === "active" ? t({ en: "RSVP", zh: "报名" }) : t({ en: "View", zh: "查看" });

  return (
    <a className="orbit-card-link" href={productHref(`/events/${event.code}`)}>
      <article className="card card-hover orbit-event-card">
        <EventCover className="orbit-card-cover" g={cover} imageAlt={name} imageSizes="(max-width: 720px) calc(100vw - 36px), (max-width: 1100px) 50vw, 360px" imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 46, text: name.slice(0, 1) }} style={{ height: undefined, opacity: status === "ended" ? 0.72 : 1 }}>
          <div style={{ left: 12, position: "absolute", top: 12 }}><StatusBadge language={language} status={status} /></div>
          <div className="orbit-card-date">
            <div style={{ color: "var(--rose-text)", fontSize: 11, fontWeight: 600, letterSpacing: "0.02em" }}>{date.month}</div>
            {date.day ? <div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 19, fontWeight: 600, lineHeight: 1 }}>{date.day}</div> : null}
          </div>
        </EventCover>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 10, padding: "15px 16px 16px" }}>
          <div>
            <h3 className="h-section" style={{ color: "var(--ink)", fontSize: 17, margin: 0, overflowWrap: "anywhere" }}>{name}</h3>
            {event.theme || event.host ? <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}>{[event.theme, event.host].filter(Boolean).join(" · ")}</div> : null}
          </div>
          <div style={{ color: "var(--text-2)", display: "flex", flexDirection: "column", fontSize: 13, gap: 6 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}><Icon color="var(--text-3)" name="clock" size={15} />{date.time}</div>
            {event.place ? <div style={{ alignItems: "center", display: "flex", gap: 8 }}><Icon color="var(--text-3)" name="pin" size={15} />{event.place}</div> : null}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", gap: 12, justifyContent: "space-between", paddingTop: 11 }}>
            <span style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 13, gap: 6 }}><Icon color="var(--text-3)" name="users" size={15} />{t({ en: `${event.participantCount} going`, zh: `${event.participantCount} 人已报名` })}</span>
            <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 4 }}>{actionLabel}<Icon name="chevR" size={14} /></span>
          </div>
        </div>
      </article>
    </a>
  );
}

export function OrbitRealOrganizerPublic({ language = "zh", viewModel }: { language?: OrbitLanguage; viewModel: OrbitOrganizerPublicViewModel }) {
  const t = makeOrbitServerT(language);
  const totalAttendees = viewModel.events.reduce(
    (sum, event) => sum + event.participantCount,
    0,
  );
  const stats = [
    {
      label: t({ en: "Events hosted", zh: "举办活动" }),
      value: new Intl.NumberFormat(dateLocale(language)).format(
        viewModel.events.length,
      ),
    },
    {
      label: t({ en: "Total attendees", zh: "累计参会" }),
      value: new Intl.NumberFormat(dateLocale(language)).format(totalAttendees),
    },
  ];

  return (
    <div className="orbit-shell" data-appscroll data-orbit-real-page="organizer-public">
      <SiteHeader />
      <main>
        <div style={{ height: 180, overflow: "hidden", position: "relative" }}>
          <Cover g={gradientFromString(viewModel.name || "org")} style={{ inset: 0, position: "absolute" }} />
          <div style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.25))", inset: 0, position: "absolute" }} />
          <a aria-label={t({ en: "Back to events", zh: "返回活动" })} className="hit-44" href="/app/events" style={{ alignItems: "center", background: "var(--glass-chip)", border: "none", borderRadius: "var(--r-pill)", boxShadow: "var(--sh-sm)", color: "var(--ink)", cursor: "pointer", display: "inline-flex", fontSize: 14, fontWeight: 600, gap: 6, height: 36, left: 24, padding: "0 14px", position: "absolute", textDecoration: "none", top: 18 }}><Icon name="back" size={16} />{t({ en: "Back", zh: "返回" })}</a>
        </div>
        <div style={{ margin: "0 auto", maxWidth: 1080, padding: "0 40px 80px" }}>
          <div style={{ alignItems: "flex-end", display: "flex", gap: 18, paddingTop: 14, position: "relative", zIndex: ORBIT_Z.raised }}>
            <span style={{ display: "inline-flex", flexShrink: 0, marginTop: -56 }}><Avatar g="g-indigo" letter={viewModel.initial} ring="var(--bg)" size={88} /></span>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
              <h1 className="h-display" style={{ margin: 0 }}>{viewModel.name}</h1>
              <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 4 }}>{viewModel.handle}</div>
            </div>
            <span className="badge badge-live" style={{ height: 26, marginBottom: 4 }}><Icon name="check" size={13} />{t({ en: "Verified host", zh: "已认证主办方" })}</span>
          </div>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", gap: 30, marginTop: 22, padding: "16px 22px" }}>
            {stats.map((stat) => (
              <div key={stat.label}><div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 26, fontWeight: 600 }}>{stat.value}</div><div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 1 }}>{stat.label}</div></div>
            ))}
          </div>
          <h2 className="h-section" style={{ margin: "34px 0 16px" }}>{t({ en: "Their events", zh: "TA 的活动" })}</h2>
          <div className="orbit-grid">{viewModel.events.map((event) => <EventCard event={event} key={event.id} language={language} t={t} />)}</div>
        </div>
      </main>
    </div>
  );
}
