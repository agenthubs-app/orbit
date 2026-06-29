import type { OrbitLanguage } from "./orbit-language-core";
import { localizeOrbitTree, makeOrbitServerT } from "./orbit-language-server";
import { OrbitAgentHero } from "./orbit-agent-hero";
import { getOrbitLandingViewModel, type OrbitLandingEventView } from "./orbit-landing-route-view-model";
import { PublicTopNav } from "./orbit-public-shell";
import { Cover, gradientFromString, Icon, StatusBadge } from "./orbit-reference-primitives";
import { OrbitReferenceStyles, OrbitReferenceThreeRuntime } from "./orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "./orbit-visual-freeze-runtime";

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

function eventDate(event: OrbitLandingEventView, language: OrbitLanguage) {
  const date = new Date(event.startsAt);
  return {
    day: fmtDay(date, language),
    month: fmtMonth(date, language),
    time: new Intl.DateTimeFormat(dateLocale(language), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...tz }).format(date),
  };
}

function productHref(prototypeHref: string) {
  if (prototypeHref === "/") return "/app";
  if (prototypeHref === "/explore") return "/app/events";
  if (prototypeHref === "/agent") return "/app/agent";
  if (prototypeHref === "/home") return "/app/account/login";
  if (prototypeHref === "/home/events") return "/app/home/events";
  if (prototypeHref === "/home/schedule") return "/app/followups";
  if (prototypeHref === "/home/cards") return "/app/contacts";
  if (prototypeHref === "/party") return "/app/party";
  if (prototypeHref.startsWith("/events/")) return `/app/events/${prototypeHref.split("/").pop()}`;
  return `/app${prototypeHref}`;
}

function LandingNav() {
  return <PublicTopNav active="home" />;
}

function EventCard({ event, language, t }: { event: OrbitLandingEventView; language: OrbitLanguage; t: T }) {
  const date = eventDate(event, language);
  const cover = gradientFromString(event.code || event.name);
  const actionLabel = event.status === "upcoming" || event.status === "active" ? t({ en: "RSVP", zh: "报名" }) : t({ en: "View", zh: "查看" });

  return (
    <a className="orbit-card-link" href={productHref(`/events/${event.code}`)}>
      <article className="card card-hover orbit-event-card">
        <Cover
          className="orbit-card-cover"
          g={cover}
          imageAlt={event.name}
          imageUrl={event.logoUrl}
          monogram={event.logoUrl ? null : { size: 46, text: event.name.slice(0, 1) }}
          style={{ opacity: event.status === "ended" ? 0.72 : 1 }}
        >
          <div style={{ left: 12, position: "absolute", top: 12 }}>
            <StatusBadge language={language} status={event.status} />
          </div>
          <div className="orbit-card-date">
            <div style={{ color: "var(--rose)", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>{date.month}</div>
            <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{date.day}</div>
          </div>
        </Cover>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 9, padding: "15px 16px 16px" }}>
          <div>
            <h3 className="h-section" style={{ color: "var(--ink)", margin: 0, overflowWrap: "anywhere" }}>
              {event.name}
            </h3>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2 }}>{[event.theme, event.host].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ color: "var(--text-2)", display: "flex", flexDirection: "column", fontSize: 13, gap: 6 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <Icon color="var(--text-3)" name="clock" size={15} />
              {date.time}
            </div>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <Icon color="var(--text-3)" name="pin" size={15} />
              {event.place}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", gap: 12, justifyContent: "space-between", paddingTop: 11 }}>
            <span style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 12.5, gap: 6 }}>
              <Icon color="var(--text-3)" name="users" size={15} />
              {t({ en: `${event.participantCount} going`, zh: `${event.participantCount} 人已报名` })}
            </span>
            <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 3 }}>
              {actionLabel}
              <Icon name="chevR" size={14} />
            </span>
          </div>
        </div>
      </article>
    </a>
  );
}

function MobilePublicEventCard({ event, language, t }: { event: OrbitLandingEventView; language: OrbitLanguage; t: T }) {
  const date = eventDate(event, language);
  const sub = [event.theme, event.host, event.code].filter(Boolean).join(" · ");
  const actionLabel = event.status === "upcoming" || event.status === "active" ? t({ en: "RSVP", zh: "报名" }) : t({ en: "View", zh: "查看" });

  return (
    <a className="orbit-landing-mobile-event-card" href={productHref(`/events/${event.code}`)}>
      <Cover className="orbit-landing-mobile-event-cover" g={gradientFromString(event.code)} imageAlt={event.name} imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 40, text: event.name.slice(0, 1) }}>
        <span className="orbit-landing-event-status"><StatusBadge language={language} status={event.status} /></span>
        <span className="orbit-landing-event-date"><small>{date.month}</small><b>{date.day}</b></span>
      </Cover>
      <span className="orbit-landing-mobile-event-body">
        <b>{event.name}</b>
        <small>{sub}</small>
        <span>
          <i><Icon color="var(--text-3)" name="clock" size={14} />{date.time}</i>
          <i><Icon color="var(--text-3)" name="pin" size={14} />{event.place}</i>
        </span>
        <em>
          <i><Icon color="var(--text-3)" name="users" size={14} />{t({ en: `${event.participantCount}`, zh: `${event.participantCount} 人` })}</i>
          <strong>{actionLabel}<Icon name="chevR" size={13} /></strong>
        </em>
      </span>
    </a>
  );
}

function MiniRegisteredEvent({ event, language }: { event: OrbitLandingEventView; language: OrbitLanguage }) {
  return (
    <a className="orbit-landing-registered-card" href={productHref(`/events/${event.code}`)}>
      <Cover className="orbit-landing-registered-cover" g={gradientFromString(event.code)} imageAlt={event.name} imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 28, text: event.name.slice(0, 1) }} />
      <span className="orbit-landing-registered-body">
        <span>{event.name}</span>
        <small>{eventDate(event, language).time}</small>
      </span>
      <StatusBadge language={language} status={event.status} />
    </a>
  );
}

function PhaseBento({ t }: { t: T }) {
  const before = t({ en: "Before", zh: "会前" });
  const during = t({ en: "During", zh: "会中" });
  const after = t({ en: "After", zh: "会后" });

  return (
    <section className="orbit-landing-section">
      <div className="orbit-landing-section-inner">
        <div className="orbit-landing-phase-grid">
          <article className="orbit-landing-phase-card is-wide">
            <span className="orbit-landing-chip">{before}</span>
            <h3>{t({ en: "One profile, reused everywhere", zh: "报名即填一次画像" })}</h3>
            <p>{t({ en: "Fill in one universal profile and reuse it across every event. AI pre-arranges your seating and matches in advance.", zh: "填一次通用档案，报名各场自动复用。AI 提前为你预排座位与匹配。" })}</p>
            <div className="orbit-landing-mini-chips">{[t({ en: "Company", zh: "公司" }), t({ en: "Role", zh: "职位" }), t({ en: "Can offer", zh: "能提供" }), t({ en: "Looking for", zh: "想寻求" })].map((text) => <span key={text}>{text}</span>)}</div>
          </article>
          <article className="orbit-landing-phase-card">
            <span className="orbit-landing-chip is-live">{during}</span>
            <h3>{t({ en: "Matched at your table", zh: "同桌即匹配" })}</h3>
            <div className="orbit-landing-match-line"><span><Icon color="var(--on-dark)" name="users" size={17} /></span><b>MATCH</b><span><Icon name="target" size={18} /></span></div>
            <p>{t({ en: "Comes with reasons to connect and icebreakers, so introductions never feel awkward.", zh: "附带推荐理由与破冰问题，握手不再尴尬。" })}</p>
          </article>
          <article className="orbit-landing-phase-card">
            <span className="orbit-landing-chip">{after}</span>
            <h3>{t({ en: "Kept as lasting contacts", zh: "沉淀为会后人脉" })}</h3>
            <div className="orbit-landing-stage-list">
              {[[t({ en: "To contact", zh: "待联系" }), "var(--amber)"], [t({ en: "In progress", zh: "在推进" }), "var(--sky)"], [t({ en: "Partnered", zh: "已合作" }), "var(--live)"]].map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function BrandExplainer({ t }: { t: T }) {
  const items = [
    { icon: "target", phase: t({ en: "Before", zh: "会前" }), title: t({ en: "Drawn in", zh: "吸引进来" }), description: t({ en: "Before the event, the algorithm draws people whose needs complement yours to the same event and the same table.", zh: "会前，算法把和你诉求互补的人，吸引到同一场活动、同一张圆桌。" }) },
    { icon: "users", phase: t({ en: "During", zh: "会中" }), title: t({ en: "Orbits meet", zh: "相遇运转" }), description: t({ en: "During the event, you meet at the right moment, with reasons to connect and icebreakers that make it natural to start talking.", zh: "会中，你们在对的时刻相遇，带着推荐理由与破冰问题，自然开口。" }) },
    { icon: "refresh", phase: t({ en: "After", zh: "会后" }), title: t({ en: "Stay in orbit", zh: "留在轨道" }), description: t({ en: "After the event, each relationship stays in your contacts, orbiting around you and warming up over time.", zh: "会后，每段关系继续留在你的会后人脉里，绕你持续运转、慢慢升温。" }) },
  ];

  return (
    <section className="orbit-landing-brand-explainer">
      <div className="orbit-landing-section-inner">
        <div className="orbit-landing-section-head is-centered">
          <h2 className="orbit-landing-section-title">{t({ en: "Why", zh: "为什么叫" })} <span>Orbit</span></h2>
          <p>{t({ en: "Everyone has their own orbit. Orbit lets the people you should meet enter yours — not by luck, but by letting the right relationships draw close and stay.", zh: "每个人都有自己的轨道。Orbit 让该认识的人进入你的轨道，不再靠运气，而是让对的关系自然靠近、长久留下。" })}</p>
        </div>
        <div className="orbit-landing-brand-grid">
          {items.map((item) => (
            <article className="orbit-landing-info-card" key={item.title}>
              <span className="orbit-landing-chip">{item.phase}</span>
              <div className="orbit-landing-info-icon"><Icon name={item.icon} size={21} /></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OrbitRealLandingPage({ language = "zh" }: { language?: OrbitLanguage }) {
  const t = makeOrbitServerT(language);
  const viewModel = localizeOrbitTree(getOrbitLandingViewModel(), language);
  const publicEvents = viewModel.events.filter((event) => event.status !== "ended").concat(viewModel.events.filter((event) => event.status === "ended"));
  const accountEvents = viewModel.events.filter((event) => event.youRsvped);

  return (
    <div className="orbit-landing-page" data-appscroll data-orbit-real-page="landing">
      <OrbitReferenceStyles />
      <OrbitReferenceThreeRuntime />
      <OrbitVisualFreezeRuntime />
      <LandingNav />
      <OrbitAgentHero />
      <main className="orbit-landing-main">
        <PhaseBento t={t} />
        <BrandExplainer t={t} />
        <section className="orbit-landing-section">
          <div className="orbit-landing-section-inner">
            <div className="orbit-landing-section-row-head">
              <h2 className="orbit-landing-section-title">{t({ en: "My events", zh: "我报名的活动" })}</h2>
              <a className="orbit-landing-small-link" href="/app/home/events">{t({ en: "All", zh: "全部" })}<Icon name="chevR" size={15} /></a>
            </div>
            <div className="orbit-landing-registered-grid">
              {accountEvents.slice(0, 3).map((event) => <MiniRegisteredEvent event={event} key={event.id} language={language} />)}
            </div>
          </div>
        </section>
        <section className="orbit-landing-section is-recent">
          <div className="orbit-landing-section-inner">
            <div className="orbit-landing-section-row-head">
              <h2 className="orbit-landing-section-title">{t({ en: "Recent events", zh: "近期活动" })}</h2>
              <a className="orbit-landing-small-link is-button" href="/app/events">{t({ en: "View all", zh: "查看全部" })}<Icon color="var(--on-dark)" name="arrow" size={20} /></a>
            </div>
            <div className="orbit-landing-event-grid orbit-desktop-event-grid">
              {publicEvents.map((event) => <EventCard event={event} key={event.id} language={language} t={t} />)}
            </div>
            <div className="orbit-landing-mobile-event-list">
              {publicEvents.map((event) => <MobilePublicEventCard event={event} key={event.id} language={language} t={t} />)}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
