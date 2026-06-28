import { OrbitAgentHero } from "./orbit-agent-hero";
import { getOrbitLandingViewModel, type OrbitLandingEventView } from "./orbit-landing-route-view-model";
import { OrbitLangRuntime } from "./orbit-lang-runtime";
import { Cover, gradientFromString, Icon, Logo, StatusBadge } from "./orbit-reference-primitives";
import { OrbitReferenceStyles, OrbitReferenceThreeRuntime } from "./orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "./orbit-visual-freeze-runtime";

const tz = { timeZone: "Asia/Tokyo" };

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", ...tz }).format(date);
}

function eventDate(event: OrbitLandingEventView) {
  const date = new Date(event.startsAt);
  return {
    day: fmtDay(date),
    month: fmtMonth(date),
    time: new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...tz }).format(date),
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
  return (
    <>
      <div className="orbit-desktop-only">
        <header
          style={{
            alignItems: "center",
            backdropFilter: "blur(14px)",
            background: "rgba(255,255,255,0.9)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: 24,
            height: 60,
            padding: "0 28px",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <a href="/app" style={{ display: "inline-flex", textDecoration: "none" }}>
            <Logo size={25} />
          </a>
          <a className="orbit-agent-btn" href="/app/agent">
            <Icon name="sparkle" size={15} />
            Orbit Agent
          </a>
          <nav style={{ display: "flex", gap: 2 }}>
            {[
              ["/explore", "活动浏览"],
              ["/home/schedule", "日程"],
              ["/home/cards", "名片夹"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={productHref(href)}
                style={{
                  borderRadius: 8,
                  color: "var(--text-2)",
                  fontSize: 14.5,
                  fontWeight: 540,
                  padding: "8px 13px",
                  textDecoration: "none",
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ color: "var(--text-3)", fontSize: 12.5, marginRight: 6 }}>
            中 / 日
          </span>
          <a className="orbit-landing-login" href="/app/account/login" style={{ alignItems: "center", display: "inline-flex", justifyContent: "center", textDecoration: "none" }}>
            我的
          </a>
        </header>
      </div>
      <div className="orbit-mobile-only">
        <div style={{ alignItems: "center", background: "var(--bg)", borderBottom: "1px solid var(--border)", display: "flex", padding: "40px 16px 8px" }}>
          <a href="/app" style={{ display: "inline-flex", flexShrink: 0, textDecoration: "none" }}>
            <Logo size={22} />
          </a>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ color: "var(--text-3)", flexShrink: 0, fontSize: 12.5, marginRight: 8 }}>
            中 / 日
          </span>
          <a className="orbit-landing-login" href="/app/account/login" style={{ alignItems: "center", display: "inline-flex", flexShrink: 0, justifyContent: "center", textDecoration: "none" }}>
            我的
          </a>
        </div>
      </div>
    </>
  );
}

function EventCard({ event }: { event: OrbitLandingEventView }) {
  const date = eventDate(event);
  const cover = gradientFromString(event.code || event.name);
  const actionLabel = event.status === "upcoming" || event.status === "active" ? "报名" : "查看";

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
            <StatusBadge status={event.status} />
          </div>
          <div className="orbit-card-date">
            <div style={{ color: "var(--rose)", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>{date.month}</div>
            <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{date.day}</div>
          </div>
        </Cover>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 9, padding: "15px 16px 16px" }}>
          <div>
            <h3 className="h-section" style={{ color: "var(--ink)", fontSize: 17, margin: 0, overflowWrap: "anywhere" }}>
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
              {event.participantCount} 人已报名
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

function MobilePublicEventCard({ event }: { event: OrbitLandingEventView }) {
  const date = eventDate(event);
  const sub = [event.theme, event.host, event.code].filter(Boolean).join(" · ");
  const actionLabel = event.status === "upcoming" || event.status === "active" ? "报名" : "查看";

  return (
    <a className="orbit-landing-mobile-event-card" href={productHref(`/events/${event.code}`)}>
      <Cover className="orbit-landing-mobile-event-cover" g={gradientFromString(event.code)} imageAlt={event.name} imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 40, text: event.name.slice(0, 1) }}>
        <span className="orbit-landing-event-status"><StatusBadge status={event.status} /></span>
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
          <i><Icon color="var(--text-3)" name="users" size={14} />{event.participantCount} 人</i>
          <strong>{actionLabel}<Icon name="chevR" size={13} /></strong>
        </em>
      </span>
    </a>
  );
}

function MiniRegisteredEvent({ event }: { event: OrbitLandingEventView }) {
  return (
    <a className="orbit-landing-registered-card" href={productHref(`/events/${event.code}`)}>
      <Cover className="orbit-landing-registered-cover" g={gradientFromString(event.code)} imageAlt={event.name} imageUrl={event.logoUrl} monogram={event.logoUrl ? null : { size: 28, text: event.name.slice(0, 1) }} />
      <span className="orbit-landing-registered-body">
        <span>{event.name}</span>
        <small>{eventDate(event).time}</small>
      </span>
      <StatusBadge status={event.status} />
    </a>
  );
}

function PhaseBento() {
  return (
    <section className="orbit-landing-section">
      <div className="orbit-landing-section-inner">
        <div className="orbit-landing-phase-grid">
          <article className="orbit-landing-phase-card is-wide">
            <span className="orbit-landing-chip">会前</span>
            <h3>报名即填一次画像</h3>
            <p>填一次通用档案，报名各场自动复用。AI 提前为你预排座位与匹配。</p>
            <div className="orbit-landing-mini-chips">{["公司", "职位", "能提供", "想寻求"].map((text) => <span key={text}>{text}</span>)}</div>
          </article>
          <article className="orbit-landing-phase-card">
            <span className="orbit-landing-chip is-live">会中</span>
            <h3>同桌即匹配</h3>
            <div className="orbit-landing-match-line"><span><Icon color="#fff" name="users" size={17} /></span><b>MATCH</b><span><Icon name="target" size={18} /></span></div>
            <p>附带推荐理由与破冰问题，握手不再尴尬。</p>
          </article>
          <article className="orbit-landing-phase-card">
            <span className="orbit-landing-chip">会后</span>
            <h3>沉淀为会后人脉</h3>
            <div className="orbit-landing-stage-list">
              {[["待联系", "var(--amber)"], ["在推进", "var(--sky)"], ["已合作", "var(--live)"]].map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function BrandExplainer() {
  const items = [
    { icon: "target", phase: "会前", title: "吸引进来", description: "会前，算法把和你诉求互补的人，吸引到同一场活动、同一张圆桌。" },
    { icon: "users", phase: "会中", title: "相遇运转", description: "会中，你们在对的时刻相遇，带着推荐理由与破冰问题，自然开口。" },
    { icon: "refresh", phase: "会后", title: "留在轨道", description: "会后，每段关系继续留在你的会后人脉里，绕你持续运转、慢慢升温。" },
  ];

  return (
    <section className="orbit-landing-brand-explainer">
      <div className="orbit-landing-section-inner">
        <div className="orbit-landing-section-head is-centered">
          <h2 className="orbit-landing-section-title">为什么叫 <span>Orbit</span></h2>
          <p>每个人都有自己的轨道。Orbit 让该认识的人进入你的轨道，不再靠运气，而是让对的关系自然靠近、长久留下。</p>
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

export function OrbitRealLandingPage() {
  const viewModel = getOrbitLandingViewModel();
  const publicEvents = viewModel.events.filter((event) => event.status !== "ended").concat(viewModel.events.filter((event) => event.status === "ended"));
  const accountEvents = viewModel.events.filter((event) => event.youRsvped);

  return (
    <div className="orbit-landing-page" data-appscroll data-orbit-real-page="landing">
      <OrbitReferenceStyles />
      <OrbitReferenceThreeRuntime />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <LandingNav />
      <OrbitAgentHero />
      <main className="orbit-landing-main">
        <PhaseBento />
        <BrandExplainer />
        <section className="orbit-landing-section">
          <div className="orbit-landing-section-inner">
            <div className="orbit-landing-section-row-head">
              <h2 className="orbit-landing-section-title">我报名的活动</h2>
              <a className="orbit-landing-small-link" href="/app/home/events">全部<Icon name="chevR" size={15} /></a>
            </div>
            <div className="orbit-landing-registered-grid">
              {accountEvents.slice(0, 3).map((event) => <MiniRegisteredEvent event={event} key={event.id} />)}
            </div>
          </div>
        </section>
        <section className="orbit-landing-section is-recent">
          <div className="orbit-landing-section-inner">
            <div className="orbit-landing-section-row-head">
              <h2 className="orbit-landing-section-title">近期活动</h2>
              <a className="orbit-landing-small-link is-button" href="/app/events">查看全部<Icon color="#fff" name="arrow" size={20} /></a>
            </div>
            <div className="orbit-landing-event-grid orbit-desktop-event-grid">
              {publicEvents.map((event) => <EventCard event={event} key={event.id} />)}
            </div>
            <div className="orbit-landing-mobile-event-list">
              {publicEvents.map((event) => <MobilePublicEventCard event={event} key={event.id} />)}
            </div>
          </div>
        </section>
      </main>
      <div className="orbit-mobile-only">
        <div style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", height: 62, left: 0, position: "fixed", right: 0, zIndex: 60 }}>
          {[
            ["home", "/app", "home", "首页"],
            ["agent", "/app/agent", "sparkle", "Orbit Agent"],
            ["events", "/app/events", "calendar", "活动浏览"],
            ["me", "/app/account/login", "user", "我的"],
          ].map(([key, href, icon, label]) => (
            <a key={key} href={href} style={{ alignItems: "center", background: "none", border: "none", color: key === "home" ? "var(--accent)" : "var(--text-4)", display: "flex", flex: 1, flexDirection: "column", gap: 3, paddingTop: 9, textDecoration: "none" }}>
              <Icon name={icon} size={21} stroke={key === "home" ? 2 : 1.7} />
              <span style={{ fontSize: 9.5, fontWeight: key === "home" ? 650 : 500, whiteSpace: "nowrap" }}>{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
