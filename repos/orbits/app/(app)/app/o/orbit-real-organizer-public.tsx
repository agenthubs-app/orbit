import type { OrbitLanguage } from "../orbit-language-core";
import { makeOrbitServerT } from "../orbit-language-server";
import type { OrbitOrganizerPublicViewModel } from "../orbit-organizer-route-view-model";
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { productHref } from "../orbit-product-href";
import { PublicTopNav } from "../orbit-public-shell";
import { EventCover } from "../events/orbit-event-cover";
import { gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../orbit-0918-tokens";

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

function EventCard({ event, language, t }: { event: OrbitLandingEventView; language: OrbitLanguage; t: T }) {
  const name = event.name;
  const status = event.status || "unknown";
  const date = eventDate(event, language, t);
  const cover = gradientFromString(event.code || name);
  const actionLabel = status === "upcoming" || status === "active" ? t({ en: "RSVP", zh: "报名" }) : t({ en: "View", zh: "查看" });

  return (
    <a className="op-card-link" href={productHref(`/events/${event.code}`)}>
      <article className="op-card">
        <EventCover className="op-card-cover" g={cover} imageAlt={name} imageSizes="(max-width: 720px) calc(100vw - 36px), (max-width: 1100px) 50vw, 360px" imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 46, text: name.slice(0, 1) }} style={{ height: undefined, opacity: status === "ended" ? 0.72 : 1 }}>
          <div style={{ left: 12, position: "absolute", top: 12 }}><StatusBadge language={language} status={status} /></div>
        </EventCover>
        <div className="op-card-body">
          <div>
            <h3 className="op-card-title">{name}</h3>
            {event.theme || event.host ? <div className="op-card-sub">{[event.theme, event.host].filter(Boolean).join(" · ")}</div> : null}
          </div>
          <div className="op-card-meta">
            <span className="op-card-row"><Icon name="clock" size={15} />{date.time}</span>
            {event.place ? <span className="op-card-row"><Icon name="pin" size={15} />{event.place}</span> : null}
          </div>
          <div className="op-card-foot">
            <span className="op-card-row"><Icon name="users" size={15} />{t({ en: `${event.participantCount} going`, zh: `${event.participantCount} 人已报名` })}</span>
            <span className="op-card-cta">{actionLabel}<Icon name="chevR" size={14} /></span>
          </div>
        </div>
      </article>
    </a>
  );
}

/**
 * 作用域样式。React 静态渲染会把 <style> 里的双引号转义成 &quot;，
 * 因此属性选择器一律不加引号。
 */
const ORGANIZER_CSS = `
[data-orbit-real-page=organizer-public] .op-main { max-width: 1120px; margin: 0 auto; padding: 20px 24px 96px; display: flex; flex-direction: column; gap: 26px; }
[data-orbit-real-page=organizer-public] .op-back { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; text-decoration: none; }
[data-orbit-real-page=organizer-public] .op-back:hover { background: #ECEEFB; }
[data-orbit-real-page=organizer-public] .op-head { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px 28px; }
[data-orbit-real-page=organizer-public] .op-logo { width: 72px; height: 72px; border-radius: 18px; background: #0E1225; color: #FFFFFF; display: inline-flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 26px; font-weight: 900; flex-shrink: 0; }
[data-orbit-real-page=organizer-public] .op-head-copy { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page=organizer-public] .op-name { margin: 0; color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 32px; font-weight: 900; line-height: 1.15; letter-spacing: -0.03em; }
[data-orbit-real-page=organizer-public] .op-handle { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page=organizer-public] .op-badge { align-self: flex-start; padding: 5px 12px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 12px; font-weight: 600; }
[data-orbit-real-page=organizer-public] .op-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; }
[data-orbit-real-page=organizer-public] .op-stat { border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; padding: 18px 22px; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page=organizer-public] .op-stat-n { color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 28px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.1; }
[data-orbit-real-page=organizer-public] .op-stat-l { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=organizer-public] .op-section-title { margin: 0; color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
[data-orbit-real-page=organizer-public] .op-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 18px; }
[data-orbit-real-page=organizer-public] .op-card-link { color: inherit; text-decoration: none; display: block; }
[data-orbit-real-page=organizer-public] .op-card { height: 100%; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.16s ease, transform 0.16s ease; }
[data-orbit-real-page=organizer-public] .op-card:hover { box-shadow: 0 14px 34px rgba(59, 63, 122, 0.12); transform: translateY(-2px); }
[data-orbit-real-page=organizer-public] .op-card-cover { position: relative; height: 170px; }
[data-orbit-real-page=organizer-public] .op-card-body { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 15px 16px 16px; }
[data-orbit-real-page=organizer-public] .op-card-title { margin: 0; color: #0E1225; font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
[data-orbit-real-page=organizer-public] .op-card-sub { color: #6B6F99; font-size: 13px; margin-top: 2px; }
[data-orbit-real-page=organizer-public] .op-card-meta { color: #3B3F7A; display: flex; flex-direction: column; font-size: 13px; gap: 6px; }
[data-orbit-real-page=organizer-public] .op-card-row { align-items: center; display: inline-flex; gap: 8px; }
[data-orbit-real-page=organizer-public] .op-card-row svg { color: #4B4FC7; }
[data-orbit-real-page=organizer-public] .op-card-foot { align-items: center; border-top: 1px solid #E8E9F6; display: flex; gap: 12px; justify-content: space-between; margin-top: auto; padding-top: 11px; color: #3B3F7A; font-size: 13px; }
[data-orbit-real-page=organizer-public] .op-card-cta { align-items: center; color: #4B4FC7; display: inline-flex; font-size: 13px; font-weight: 600; gap: 4px; }
[data-orbit-real-page=organizer-public] .op-back:focus-visible, [data-orbit-real-page=organizer-public] .op-card-link:focus-visible { outline: 2px solid #4B4FC7; outline-offset: 2px; }
@media (max-width: 760px) {
  [data-orbit-real-page=organizer-public] .op-main { padding: 14px 16px 88px; }
  [data-orbit-real-page=organizer-public] .op-name { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page=organizer-public] .op-card { transition: none; }
}
`;

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
    <div className="orbit-shell" data-orbit-real-page="organizer-public" style={{ background: C.pageBg, minHeight: "100dvh" }}>
      <style>{ORGANIZER_CSS}</style>
      <PublicTopNav active="events" />
      <main className="op-main">
        <a aria-label={t({ en: "Back to events", zh: "返回活动" })} className="op-back hit-44" href="/app/events">
          <Icon name="back" size={15} />{t({ en: "Back to events", zh: "返回活动列表" })}
        </a>

        <section className="op-head">
          <span className="op-logo">{viewModel.initial}</span>
          <div className="op-head-copy">
            <h1 className="op-name">{viewModel.name}</h1>
            <span className="op-handle">{viewModel.handle}</span>
          </div>
          <span className="op-badge">{t({ en: "Canonical organizer", zh: "已记录主办方" })}</span>
        </section>

        <section aria-label={t({ en: "Organizer stats", zh: "主办方统计" })} className="op-stats">
          {stats.map((stat) => (
            <div className="op-stat" key={stat.label}>
              <strong className="op-stat-n">{stat.value}</strong>
              <span className="op-stat-l">{stat.label}</span>
            </div>
          ))}
        </section>

        <h2 className="op-section-title">{t({ en: "Their events", zh: "TA 的活动" })}</h2>
        <div className="op-grid">{viewModel.events.map((event) => <EventCard event={event} key={event.id} language={language} t={t} />)}</div>
      </main>
    </div>
  );
}
