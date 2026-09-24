"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { OrbitLandingEventView, OrbitLandingViewModel } from "../../orbit-landing-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { gradientFromString } from "../../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import { EventCover } from "../orbit-event-cover";
import type { EventRegistrationAvailability } from "../../orbit-event-registration-view-model";
import {
  EVENT_SCOPES,
  eventScopeFromValues,
  eventScopeSearchString,
  eventTopics,
  matchesExploreFilters,
  topicLabel,
  type EventScope,
} from "../explore-model";
import {
  CTA_TONE,
  STAT_CARDS,
  STATUS_CHIP,
  ctaFor,
  eventChipKind,
  eventDetailHref,
  formatEventDateRange,
  listStats,
  registeredCountLabel,
  timelineNodes,
  type EventListLanguage,
} from "./events-model";
import { EventsShell, type EventsListView } from "./events-shell";

/**
 * Orbit_0918 Events（参与者侧）发现活动 / 我的活动。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 59–105 行（发现）与 106–137 行（我的活动）。
 * 数据层不动：筛选/话题/scope 语义在 ../explore-model.ts；chip / CTA / 时间线 / 统计在 ./events-model.ts。
 *
 * 数据真实性决定（2026-09-22 计划）：
 * - 封面 = 真实 orbit-event-cover（设计的渐变 + coverText 无来源）；
 * - 头像串 → 只显示「+N 人已报名」（真实 registeredCount，无 / 0 → 省略）；
 * - 统计四卡 = 即将开始 / 我已报名 / 进行中 / 本月活动（设计「本周推荐 12」无来源）；
 * - 我的活动时间线「报名成功」无日期来源 → 「—」，开始 / 结束真实；
 * - 我的活动 = scope=registered（既有 URL 语义，账号菜单深链不变）。
 */

function eventName(event: OrbitLandingEventView, language: EventListLanguage) {
  return event.name || event.code || (language === "en" ? "Untitled event" : "未命名活动");
}

function eventImageUrl(event: OrbitLandingEventView) {
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  return event.detailLogoUrl || event.logoUrl || sceneAsset?.src || "";
}

function cardTopics(event: OrbitLandingEventView) {
  // 行业词已进搜索维度；标签行只放活动 tags（最多 3 个），无 → 省略。
  return eventTopics(event).filter((item) => item !== event.industry).slice(0, 3);
}

function StatusChip({ event, onCover = false }: { event: OrbitLandingEventView; onCover?: boolean }) {
  const { t } = useOrbitLanguage();
  const chip = STATUS_CHIP[eventChipKind(event.status, Boolean(event.stats.youRsvped))];
  return (
    <span className={`ev-chip${onCover ? " ev-chip-cover" : ""}`} style={{ background: chip.bg, color: chip.fg }}>
      {t(chip.label)}
    </span>
  );
}

function CardCover({ event, imagePriority, mine }: { event: OrbitLandingEventView; imagePriority: boolean; mine: boolean }) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const lang: EventListLanguage = language === "ja" ? "en" : language;
  const name = eventName(event, lang);
  const imageUrl = eventImageUrl(event);
  const monogramSize = mine ? 40 : 46;
  return (
    <a aria-label={t({ en: `View ${name} details`, zh: `查看${name}详情` })} className="ev-cover-link" href={preserveHref(eventDetailHref(event.code))}>
      <EventCover
        className={`ev-cover${mine ? " ev-mine-cover" : ""}${event.status === "ended" ? " ev-cover-ended" : ""}`}
        g={gradientFromString(event.code || name)}
        imageAlt={name}
        imageLoading={imagePriority ? "eager" : "lazy"}
        imageSizes={mine ? "(max-width: 720px) calc(100vw - 36px), 300px" : "(max-width: 720px) calc(100vw - 36px), (max-width: 1280px) 50vw, 400px"}
        imageUrl={imageUrl}
        monogram={imageUrl ? null : { text: name.slice(0, 1), size: monogramSize }}
      >
        {mine ? null : <StatusChip event={event} onCover />}
      </EventCover>
    </a>
  );
}

function CardCta({ cta, timeline = false }: { cta: ReturnType<typeof ctaFor>; timeline?: boolean }) {
  const { preserveHref, t } = useOrbitLanguage();
  const tone = CTA_TONE[cta.tone];
  return (
    <a
      className={`btn ev-cta${timeline ? " ev-cta-tl" : ""}`}
      data-events-cta={cta.kind}
      href={preserveHref(cta.href)}
      style={{ background: tone.bg, borderColor: tone.border, color: tone.fg }}
    >
      {t(cta.label)}{timeline ? " →" : ""}
    </a>
  );
}

function EventModuleGrid({
  events,
  registrationAvailabilityByEventId,
}: {
  events: OrbitLandingEventView[];
  registrationAvailabilityByEventId: Readonly<Record<string, EventRegistrationAvailability>>;
}) {
  return (
    <div className="ev-grid">
      {events.map((event, index) => (
        <EventModuleCard
          event={event}
          imagePriority={index < 2}
          key={event.id}
          registrationAvailability={registrationAvailabilityByEventId[event.id] ?? "unavailable"}
        />
      ))}
    </div>
  );
}

/** 发现活动卡片（设计 82–100 行）。 */
function EventModuleCard({
  event,
  imagePriority = false,
  registrationAvailability,
}: {
  event: OrbitLandingEventView;
  imagePriority?: boolean;
  registrationAvailability: EventRegistrationAvailability;
}) {
  const { language, preserveHref } = useOrbitLanguage();
  const lang: EventListLanguage = language === "ja" ? "en" : language;
  const name = eventName(event, lang);
  const registered = Boolean(event.stats.youRsvped);
  const cta = ctaFor({ code: event.code, registered, status: event.status }, registrationAvailability);
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  const topics = cardTopics(event);
  const people = registeredCountLabel(event.participantCount, lang);
  return (
    <article
      className="ev-card"
      data-demo-visual-asset-id={sceneAsset?.assetId}
      data-demo-visual-source={sceneAsset?.sourceLabel}
      data-demo-visual-source-label={sceneAsset?.sourceLabel}
      data-events-card="discover"
    >
      <CardCover event={event} imagePriority={imagePriority} mine={false} />
      <div className="ev-body">
        <h2 className="ev-title"><a className="ev-title-link" href={preserveHref(eventDetailHref(event.code))}>{name}</a></h2>
        <span className="ev-meta"><span aria-hidden="true" className="ev-meta-icon">▦</span>{formatEventDateRange(event, lang)}</span>
        <span className="ev-meta"><span aria-hidden="true" className="ev-meta-icon">◎</span>{event.place}</span>
        {topics.length > 0 ? (
          <span className="ev-tags">
            {topics.map((topicItem) => <span className="ev-tag" key={topicItem}>{topicLabel(topicItem, lang)}</span>)}
          </span>
        ) : null}
        <div className="ev-foot">
          <span className="ev-people">{people ? <span className="ev-people-n">{people}</span> : null}</span>
          <CardCta cta={cta} />
        </div>
      </div>
    </article>
  );
}

/** 我的活动横卡（设计 110–133 行）：封面 / 正文 / 时间线 / 状态 + CTA。 */
function MineEventCard({
  event,
  imagePriority = false,
  registrationAvailability,
}: {
  event: OrbitLandingEventView;
  imagePriority?: boolean;
  registrationAvailability: EventRegistrationAvailability;
}) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const lang: EventListLanguage = language === "ja" ? "en" : language;
  const name = eventName(event, lang);
  const registered = Boolean(event.stats.youRsvped);
  const cta = ctaFor({ code: event.code, registered, status: event.status }, registrationAvailability);
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  const topics = cardTopics(event);
  const people = registeredCountLabel(event.participantCount, lang);
  const nodes = timelineNodes(event, lang);
  return (
    <article
      className="ev-mine-card"
      data-demo-visual-asset-id={sceneAsset?.assetId}
      data-demo-visual-source={sceneAsset?.sourceLabel}
      data-demo-visual-source-label={sceneAsset?.sourceLabel}
      data-events-card="mine"
    >
      <CardCover event={event} imagePriority={imagePriority} mine />
      <div className="ev-mine-body">
        <h2 className="ev-title ev-mine-title"><a className="ev-title-link" href={preserveHref(eventDetailHref(event.code))}>{name}</a></h2>
        <span className="ev-meta"><span aria-hidden="true" className="ev-meta-icon">▦</span>{formatEventDateRange(event, lang, true)}</span>
        <span className="ev-meta"><span aria-hidden="true" className="ev-meta-icon">◎</span>{event.place}</span>
        {topics.length > 0 ? (
          <span className="ev-tags">
            {topics.map((topicItem) => <span className="ev-tag" key={topicItem}>{topicLabel(topicItem, lang)}</span>)}
          </span>
        ) : null}
        {people ? <span className="ev-people"><span className="ev-people-n">{people}</span></span> : null}
      </div>
      <div className="ev-timeline">
        {nodes.map((node) => (
          <div className="ev-tl-node" key={node.label.zh}>
            <span aria-hidden="true" className="ev-tl-line" style={{ background: node.line }} />
            <span className="ev-tl-dot" style={{ background: node.bg, borderColor: node.border, boxShadow: node.ring }}>{node.mark}</span>
            <span className="ev-tl-label">{t(node.label)}</span>
            <span className="ev-tl-date">{node.date}</span>
          </div>
        ))}
      </div>
      <div className="ev-mine-side">
        <StatusChip event={event} />
        <CardCta cta={cta} timeline />
      </div>
    </article>
  );
}

function EventsEmptyState({
  filteredView,
  onReset,
  registeredView,
}: {
  filteredView: boolean;
  onReset: () => void;
  registeredView: boolean;
}) {
  const { t } = useOrbitLanguage();

  return (
    <section className="ev-empty" data-orbit-events-empty>
      <span aria-hidden="true" className="ev-empty-icon">✦</span>
      <div className="ev-empty-copy">
        <h2 className="ev-empty-h2">
          {registeredView
            ? t({ en: "No registered events yet", zh: "还没有已报名活动" })
            : filteredView
            ? t({ en: "No events match these filters", zh: "没有符合当前筛选的活动" })
            : t({ en: "New events are on the way", zh: "新的活动正在筹备中" })}
        </h2>
        <p className="ev-empty-p">
          {registeredView
            ? t({
                en: "Events you register for will appear here. Browse the full catalogue to find your next gathering.",
                zh: "报名成功的活动会出现在这里。浏览全部活动，找到下一场适合你的聚会。",
              })
            : filteredView
            ? t({
                en: "Clear the search and filters to return to the full event catalogue.",
                zh: "清除搜索和筛选，即可返回完整活动目录。",
              })
            : t({
                en: "There are no published events right now. Check back soon for the next gathering.",
                zh: "目前还没有已发布的活动，下一场聚会开放后会出现在这里。",
              })}
        </p>
      </div>
      {filteredView ? (
        <button className="btn ev-btn-reset" onClick={onReset} type="button">
          {registeredView
            ? t({ en: "Browse all events", zh: "浏览全部活动" })
            : t({ en: "Clear filters", zh: "清除筛选" })}
        </button>
      ) : null}
    </section>
  );
}

const scopeLabel = (
  key: EventScope,
  t: ReturnType<typeof useOrbitLanguage>["t"],
) =>
  ({
    active: t({ en: "Live", zh: "进行中" }),
    all: t({ en: "All", zh: "全部" }),
    ended: t({ en: "Ended", zh: "已结束" }),
    registered: t({ en: "Registered", zh: "已报名" }),
    upcoming: t({ en: "Upcoming", zh: "即将开始" }),
  })[key];

// 我的活动子筛选（设计 868：全部 / 已报名 / 进行中 / 已结束）：这里的「已报名」= 已报名且未开始。
type MineFilter = "all" | "upcoming" | "active" | "ended";
const MINE_FILTERS: readonly MineFilter[] = ["all", "upcoming", "active", "ended"];
const mineLabel = (key: MineFilter, t: ReturnType<typeof useOrbitLanguage>["t"]) =>
  key === "upcoming" ? t({ en: "Registered", zh: "已报名" }) : scopeLabel(key, t);

export function EventsList({
  initialScope = "all",
  registrationAvailabilityByEventId,
  viewModel,
}: {
  initialScope?: EventScope;
  registrationAvailabilityByEventId: Readonly<Record<string, EventRegistrationAvailability>>;
  viewModel: OrbitLandingViewModel;
}) {
  const { language, t } = useOrbitLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EventScope>(initialScope);
  // 发现活动的「已报名」筛选只在本地（URL 的 scope=registered 表示我的活动页签）。
  const [discoverRegisteredOnly, setDiscoverRegisteredOnly] = useState(false);
  // 我的活动屏的本地子筛选，不进 URL。
  const [mineFilter, setMineFilter] = useState<MineFilter>("all");
  const scopeInUrl = eventScopeFromValues(searchParams.getAll("scope"));
  useEffect(() => {
    setStatus(scopeInUrl);
  }, [scopeInUrl]);
  const events = viewModel.events;
  const isMine = status === "registered";
  const discoverStatus: EventScope = discoverRegisteredOnly ? "registered" : status;
  const filtered = useMemo(
    () => events.filter((event) => matchesExploreFilters(event, { language, query, status: discoverStatus, topic: "all" })),
    [events, language, query, discoverStatus],
  );
  const mineEvents = useMemo(
    () =>
      events.filter((event) =>
        matchesExploreFilters(event, {
          language,
          query,
          status: "registered",
          topic: "all",
        }),
      ).filter((event) => mineFilter === "all" || event.status === mineFilter),
    [events, language, query, mineFilter],
  );
  const stats = useMemo(() => listStats(events), [events]);
  const setEventScope = (nextStatus: EventScope) => {
    setStatus(nextStatus);
    const queryString = eventScopeSearchString(
      nextStatus,
      searchParams.toString(),
    );
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };
  const setDiscoverFilter = (key: EventScope) => {
    if (key === "registered") {
      setDiscoverRegisteredOnly(true);
      if (status !== "all") setEventScope("all");
      return;
    }
    setDiscoverRegisteredOnly(false);
    setEventScope(key);
  };
  const selectView = (view: EventsListView) => {
    setDiscoverRegisteredOnly(false);
    setEventScope(view === "mine" ? "registered" : "all");
  };
  const resetFilters = () => {
    setQuery("");
    setMineFilter("all");
    setDiscoverRegisteredOnly(false);
    setEventScope("all");
  };
  const filteredView = Boolean(query || status !== "all" || discoverRegisteredOnly);

  return (
    <EventsShell onSelectView={selectView} view={isMine ? "mine" : "discover"}>
      <div className="ev-toolbar">
        <div className="ev-search">
          <span aria-hidden="true" className="ev-search-icon">⌕</span>
          <input
            aria-label={t({ en: "Search event name, keyword, or organizer", zh: "搜索活动名称、关键词或主办方" })}
            className="ev-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t({ en: "Search event name, keyword, or organizer…", zh: "搜索活动名称、关键词或主办方…" })}
            type="search"
            value={query}
          />
        </div>
        <div
          aria-label={isMine ? t({ en: "My event status", zh: "我的活动状态" }) : t({ en: "Event status", zh: "活动状态" })}
          className="ev-seg"
          role="group"
        >
          {isMine
            ? MINE_FILTERS.map((key) => (
                <button
                  aria-pressed={mineFilter === key}
                  className={`btn ev-seg-btn${mineFilter === key ? " ev-seg-on" : ""}`}
                  key={key}
                  onClick={() => setMineFilter(key)}
                  type="button"
                >
                  {mineLabel(key, t)}
                </button>
              ))
            : EVENT_SCOPES.map((key) => (
                <button
                  aria-pressed={discoverStatus === key}
                  className={`btn ev-seg-btn${discoverStatus === key ? " ev-seg-on" : ""}`}
                  key={key}
                  onClick={() => setDiscoverFilter(key)}
                  type="button"
                >
                  {scopeLabel(key, t)}
                </button>
              ))}
        </div>
      </div>

      {!isMine ? (
        <div className="ev-stats">
          {STAT_CARDS.map((stat) => (
            <div className="ev-stat" key={stat.key}>
              <span aria-hidden="true" className="ev-stat-icon" style={{ background: stat.bg, color: stat.fg }}>{stat.icon}</span>
              <span className="ev-stat-copy">
                <span className="ev-stat-label">{t(stat.label)}</span>
                <strong className="ev-stat-n">{stats[stat.key]}</strong>
                <span className="ev-stat-desc">{t(stat.desc)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {isMine ? (
        mineEvents.length > 0 ? (
          <div className="ev-mine">
            {mineEvents.map((event, index) => (
              <MineEventCard
                event={event}
                imagePriority={index < 2}
                key={event.id}
                registrationAvailability={registrationAvailabilityByEventId[event.id] ?? "unavailable"}
              />
            ))}
            <span className="ev-mine-foot">
              {t({ en: "✦ Keep joining great events to unlock more possibilities.", zh: "✦ 持续参与优质活动，连接更多可能性。" })}
            </span>
          </div>
        ) : (
          <EventsEmptyState
            filteredView={Boolean(query || mineFilter !== "all")}
            onReset={resetFilters}
            registeredView
          />
        )
      ) : filtered.length > 0 ? (
        <EventModuleGrid events={filtered} registrationAvailabilityByEventId={registrationAvailabilityByEventId} />
      ) : (
        <EventsEmptyState
          filteredView={filteredView}
          onReset={resetFilters}
          registeredView={false}
        />
      )}
    </EventsShell>
  );
}
