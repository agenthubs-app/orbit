import type { OrbitLanguage } from "./orbit-language-core";
import type {
  OrbitLandingConnectionView,
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "./orbit-landing-route-view-model";
import { OrbitAgentHero } from "./orbit-agent-hero";
import { Avatar, Cover, gradientFromString, Icon, Logo, StatusBadge } from "./orbit-reference-primitives";
import { getDemoEventSceneAsset, getDemoPersonAvatarAsset } from "../../../shared/demo-visual-assets";

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
    month: "long",
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

function primaryEvent(events: OrbitLandingEventView[]) {
  return (
    events.find((event) => event.status === "active") ??
    events.find((event) => event.status === "upcoming") ??
    events[0]
  );
}

function RootAssetImage({
  alt,
  assetId,
  sourceLabel,
  src,
}: {
  alt: string;
  assetId: string;
  sourceLabel: string;
  src: string;
}) {
  return (
    <img
      alt={alt}
      data-demo-visual-asset-id={assetId}
      data-demo-visual-source={sourceLabel}
      data-demo-visual-source-label={sourceLabel}
      decoding="async"
      loading="lazy"
      src={src}
      style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
    />
  );
}

function RootContactAvatar({
  connection,
  size,
}: {
  connection: OrbitLandingConnectionView;
  size: number;
}) {
  const asset = getDemoPersonAvatarAsset({
    displayName: connection.displayName,
    recordId: connection.id,
  });

  if (!asset) {
    return (
      <Avatar
        letter={connection.initial}
        size={size}
        title={connection.displayName}
      />
    );
  }

  return (
    <span
      className="avatar"
      data-demo-visual-asset-id={asset.assetId}
      data-demo-visual-source={asset.sourceLabel}
      data-demo-visual-source-label={asset.sourceLabel}
      style={{ height: size, overflow: "hidden", width: size }}
      title={connection.displayName}
    >
      <RootAssetImage
        alt={asset.alt}
        assetId={asset.assetId}
        sourceLabel={asset.sourceLabel}
        src={asset.src}
      />
    </span>
  );
}

function rootActivityItems({
  language,
  primaryConnection,
  primaryEventView,
}: {
  language: OrbitLanguage;
  primaryConnection?: OrbitLandingConnectionView;
  primaryEventView?: OrbitLandingEventView;
}) {
  return [
    {
      description: text(language, {
        en: "Ask for one source-backed follow-up before opening another tool.",
        zh: "先要一条带来源的跟进建议，再打开别的工具。",
      }),
      href: "/app/agent",
      icon: "sparkle",
      label: text(language, { en: "Agent", zh: "Agent" }),
      title: text(language, { en: "Ask iOrbit first", zh: "先问 iOrbit" }),
    },
    {
      description: primaryConnection
        ? text(language, {
            en: `Start with ${primaryConnection.displayName}; check where the relationship came from and what should happen next.`,
            zh: `从 ${primaryConnection.displayName} 开始，补上见面来源和下一步。`,
          })
        : text(language, {
            en: "Add one sourced contact before deciding whether to follow up.",
            zh: "先补一条有来源的人脉，再决定要不要跟进。",
          }),
      href: "/app/contacts",
      icon: "users",
      label: text(language, { en: "Contacts", zh: "人脉" }),
      title: text(language, { en: "Review contact context", zh: "查看人脉上下文" }),
    },
    {
      description: primaryEventView
        ? text(language, {
            en: `${primaryEventView.name} already has attendees, timing, and source notes.`,
            zh: `${primaryEventView.name} 已经有参与者、时间和来源线索。`,
          })
        : text(language, {
            en: "Events keep registration, attendee, and post-event notes in one place.",
            zh: "活动页会保留报名、参与者和会后线索。",
          }),
      href: primaryEventView ? eventDetailHref(primaryEventView) : "/app/events",
      icon: "calendar",
      label: text(language, { en: "Events", zh: "活动" }),
      title: text(language, { en: "Open event context", zh: "看活动背景" }),
    },
  ];
}

function LandingTopBar({ language }: { language: OrbitLanguage }) {
  return (
    <header className="orbit-root-topbar">
      <a aria-label="Orbit" className="orbit-root-brand" href="/">
        <Logo size={25} />
      </a>
      <nav aria-label={text(language, { en: "Root navigation", zh: "根路径导航" })}>
        <a href="/app/agent">{text(language, { en: "Agent", zh: "Agent" })}</a>
        <a href="/app/events">{text(language, { en: "Events", zh: "活动" })}</a>
        <a href="/app/contacts">{text(language, { en: "Contacts", zh: "人脉" })}</a>
        <a href="/app/home">{text(language, { en: "Me", zh: "我的" })}</a>
      </nav>
    </header>
  );
}

function ActivityOverview({
  connections,
  events,
  language,
}: {
  connections: OrbitLandingConnectionView[];
  events: OrbitLandingEventView[];
  language: OrbitLanguage;
}) {
  const featuredEvent = primaryEvent(events);
  const featuredConnection = connections[0];
  const featuredConnectionAsset = featuredConnection
    ? getDemoPersonAvatarAsset({
        displayName: featuredConnection.displayName,
        recordId: featuredConnection.id,
      })
    : null;
  const featuredEventAsset = featuredEvent
    ? getDemoEventSceneAsset(featuredEvent.id)
    : null;
  const items = rootActivityItems({
    language,
    primaryConnection: featuredConnection,
    primaryEventView: featuredEvent,
  });

  return (
    <section
      aria-labelledby="orbit-root-activity-title"
      className="orbit-root-section orbit-root-activity"
      data-orbit-activity-overview="root"
    >
      <div className="orbit-root-section-head">
        <span className="eyebrow">{text(language, { en: "Activity overview", zh: "动态概览" })}</span>
        <h2 className="h-title" id="orbit-root-activity-title">
          {text(language, {
            en: "The useful work starts from the latest relationship signal.",
            zh: "有用的工作，从最近一条关系信号开始。",
          })}
        </h2>
      </div>
      <div className="orbit-root-activity-grid">
        {items.map((item) => {
          const visualAsset =
            item.href === "/app/contacts"
              ? featuredConnectionAsset
              : featuredEvent && item.href === eventDetailHref(featuredEvent)
                ? featuredEventAsset
                : null;

          return (
            <a className="orbit-root-activity-card" href={item.href} key={item.href}>
              <span className="orbit-root-activity-icon">
                {visualAsset ? (
                  <RootAssetImage
                    alt={visualAsset.alt}
                    assetId={visualAsset.assetId}
                    sourceLabel={visualAsset.sourceLabel}
                    src={visualAsset.src}
                  />
                ) : (
                  <Icon name={item.icon} size={18} />
                )}
              </span>
              <span className="orbit-root-activity-copy">
                <small>{item.label}</small>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </span>
              <Icon color="var(--text-4)" name="chevR" size={17} />
            </a>
          );
        })}
      </div>
      <div className="orbit-root-connection-strip" aria-label={text(language, { en: "Recent contacts", zh: "最近人脉" })}>
        {connections.slice(0, 5).map((connection) => (
          <a aria-label={contactContextLabel(connection, language)} href="/app/contacts" key={connection.id}>
            <RootContactAvatar connection={connection} size={34} />
            <span>{connection.displayName}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function EventContext({
  events,
  language,
}: {
  events: OrbitLandingEventView[];
  language: OrbitLanguage;
}) {
  return (
    <section
      aria-labelledby="orbit-root-events-title"
      className="orbit-root-section orbit-root-events"
      data-orbit-event-context="root"
    >
      <div className="orbit-root-section-head">
        <span className="eyebrow">{text(language, { en: "Event context", zh: "活动上下文" })}</span>
        <h2 className="h-title" id="orbit-root-events-title">
          {text(language, {
            en: "Events are not the destination. They explain why a relationship exists.",
            zh: "活动不是终点，它解释一段关系为什么出现。",
          })}
        </h2>
      </div>
      <div className="orbit-root-event-grid">
        {events.slice(0, 3).map((event) => {
          const sceneAsset = getDemoEventSceneAsset(event.id);

          return (
            <a className="orbit-root-event-card" data-demo-visual-asset-id={sceneAsset?.assetId} data-demo-visual-source={sceneAsset?.sourceLabel} data-demo-visual-source-label={sceneAsset?.sourceLabel} href={eventDetailHref(event)} key={event.id}>
              <Cover
                g={gradientFromString(event.code || event.name)}
                imageAlt={sceneAsset?.alt ?? event.name}
                imageUrl={sceneAsset?.src}
                monogram={sceneAsset ? null : { size: 34, text: event.name.slice(0, 1) }}
                style={{ aspectRatio: "16 / 9", borderRadius: 16 }}
              >
                <span className="orbit-root-event-status">
                  <StatusBadge language={language} status={event.status} />
                </span>
              </Cover>
              <span className="orbit-root-event-body">
                <span className="orbit-root-event-date">{eventDate(event.startsAt, language)}</span>
                <strong>{event.name}</strong>
                <span>{localizedEventSummary(event, language)}</span>
                <span className="orbit-root-event-link">
                  {text(language, { en: "Open event", zh: "打开活动" })}
                  <Icon name="chevR" size={15} />
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function OrbitRealLandingPage({
  language,
  viewModel,
}: {
  language: OrbitLanguage;
  viewModel: OrbitLandingViewModel;
}) {
  const featuredEvent = primaryEvent(viewModel.events);
  const activeEventCount = viewModel.events.filter((event) => event.status === "active").length;

  return (
    <main className="orbit-root-landing" data-orbit-real-page="landing">
      <LandingTopBar language={language} />
      <OrbitAgentHero
        accountName={viewModel.account.fullName}
        activeEventCount={activeEventCount}
        connectionCount={viewModel.connections.length}
        eventCount={viewModel.events.length}
        language={language}
        primaryConnection={viewModel.connections[0]}
        primaryEvent={featuredEvent}
      />
      <ActivityOverview connections={viewModel.connections} events={viewModel.events} language={language} />
      <EventContext events={viewModel.events} language={language} />
    </main>
  );
}
