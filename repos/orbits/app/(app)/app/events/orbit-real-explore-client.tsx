"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { OrbitLandingEventView, OrbitLandingViewModel } from "../orbit-landing-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { partyHrefForEvent } from "../orbit-product-href";
import { productHref, PublicTopNav } from "../orbit-public-shell";
import { gradientFromString } from "../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../shared/demo-visual-assets";
import { ORBIT_Z } from "../orbit-z";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../orbit-0918-tokens";
import { EventCover } from "./orbit-event-cover";
import type { EventRegistrationAvailability } from "../orbit-event-registration-view-model";
import {
  EVENT_SCOPES as statusFilters,
  eventCardActionKind,
  eventScopeFromValues,
  eventScopeSearchString,
  eventTopics,
  exploreTopicFilters,
  matchesExploreFilters,
  topicLabel,
  type EventScope,
} from "./explore-model";

export { eventCardActionKind, eventScopeFromValues, eventScopeSearchString } from "./explore-model";

/**
 * Orbit_0918 Events（参与者侧）discover + 我的活动两屏。
 * 设计来源：docs/designs/Orbit_0918/Events.dc.html 的 isList/isDiscover/isMine。
 *
 * 设计驱动的取舍（2026-09-18，对照 ui-mapping-2026-09-18.md 第二节）：
 * - 设计无地图视图：原内容/地图切换器与示意图画布退役（git 历史可恢复）。
 * - 设计无话题筛选行：话题筛选收起，搜索框覆盖名称/编号/话题/主题词。
 * - 桌面/移动双树合并为单一响应式树（设计稿即响应式 flex/grid）。
 * - 状态统计卡只展示可从目录真实计算的四项（即将开始/我已报名/进行中/
 *   本月活动）；设计 mock 的「本周推荐 12」无真实数据源，不伪造。
 * - 我的活动 = scope=registered（既有 URL 语义不变，账号菜单深链不变），
 *   渲染为设计的时间线横卡；时间线步骤从活动状态推导（报名成功→活动现场
 *   →会后回顾），不伪造报名日期。
 */

const tz = { timeZone: "Asia/Tokyo" };
interface MappedEvent {
  code: string;
  day: string;
  g: string;
  id: string;
  imageUrl: string;
  month: string;
  name: string;
  people: number | null;
  place: string;
  status: OrbitLandingEventView["status"];
  registered: boolean;
  registrationAvailability: EventRegistrationAvailability;
  sub: string;
  time: string;
}

function fmtMonth(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "short", ...tz }).format(date);
}

export function fmtDay(date: Date, language: "en" | "zh") {
  const formatter = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "2-digit", ...tz });
  return formatter.formatToParts(date).find((part) => part.type === "day")?.value ?? formatter.format(date);
}

function formatEventDate(event: OrbitLandingEventView, language: "en" | "zh") {
  const date = new Date(event.startsAt);
  if (!Number.isFinite(date.getTime())) return { month: language === "en" ? "TBD" : "待定", day: "", time: language === "en" ? "Time TBD" : "时间待定" };
  return {
    month: fmtMonth(date, language),
    day: fmtDay(date, language),
    time: new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit", ...tz }).format(date),
  };
}

function formatEventDateFull(event: OrbitLandingEventView, language: "en" | "zh") {
  const date = new Date(event.startsAt);
  if (!Number.isFinite(date.getTime())) return language === "en" ? "Time TBD" : "时间待定";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", ...tz }).format(date);
}

function mapEvent(
  event: OrbitLandingEventView,
  language: "en" | "zh",
  registrationAvailability: EventRegistrationAvailability,
): MappedEvent {
  const date = formatEventDate(event, language);
  const name = event.name || event.code || (language === "en" ? "Untitled event" : "未命名活动");
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  return {
    code: event.code,
    day: date.day,
    g: gradientFromString(event.code || name),
    id: event.id || event.code,
    imageUrl: event.detailLogoUrl || event.logoUrl || sceneAsset?.src || "",
    month: date.month,
    name,
    people: event.participantCount,
    place: event.place,
    status: event.status,
    registered: Boolean(event.stats.youRsvped),
    registrationAvailability,
    // 行业（词典化）+ 编号；主办方代号与封面主题 slug 不进用户可见的副标题。
    sub: [topicLabel(event.industry, language), event.code].filter(Boolean).join(" · "),
    time: date.time,
  };
}

function eventCardAction(
  event: Pick<OrbitLandingEventView, "code" | "id" | "status" | "stats">,
  t: ReturnType<typeof useOrbitLanguage>["t"],
  registrationAvailability: EventRegistrationAvailability,
) {
  const registered = Boolean(event.stats.youRsvped);
  const kind = eventCardActionKind(
    event.status,
    registered,
    registrationAvailability,
  );
  if (kind === "register" || kind === "view") {
    return {
      badgeLabel: null,
      href: productHref(`/events/${event.code}`),
      kind,
      label:
        kind === "view"
          ? t({ en: "View event", zh: "查看活动" })
          : t({ en: "Register now", zh: "立即报名" }),
    };
  }
  if (kind === "enter") {
    return {
      badgeLabel: t({ en: "Registered", zh: "已报名" }),
      href: partyHrefForEvent(event.id),
      kind,
      label: t({ en: "Enter event", zh: "进入现场" }),
    };
  }
  return {
    badgeLabel: t({ en: "Registered", zh: "已报名" }),
    href: productHref(`/events/${event.code}`),
    kind,
    label:
      kind === "manage"
        ? t({ en: "Manage registration", zh: "管理报名" })
        : t({ en: "View event", zh: "查看活动" }),
  };
}

/** 设计稿状态 pill（卡片封面右上角）：软底深字，按状态取色。 */
function statusPillColors(status: OrbitLandingEventView["status"]) {
  if (status === "active") return { background: "#E6F1EC", color: "#2F6B4F" };
  if (status === "ended") return { background: C.panelSoft, color: C.text3 };
  return { background: C.panel, color: C.text2 };
}

function EventStatusPill({
  language,
  status,
}: {
  language: "en" | "zh";
  status: OrbitLandingEventView["status"];
}) {
  const label =
    status === "active"
      ? language === "en" ? "Live" : "进行中"
      : status === "ended"
        ? language === "en" ? "Ended" : "已结束"
        : language === "en" ? "Upcoming" : "即将开始";
  return (
    <span
      className="orbit-explore-status-pill"
      style={{
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        padding: "5px 12px",
        ...statusPillColors(status),
      }}
    >
      {label}
    </span>
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
    <div className="orbit-event-module-grid">
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

function EventModuleCard({
  event,
  imagePriority = false,
  registrationAvailability,
}: {
  event: OrbitLandingEventView;
  imagePriority?: boolean;
  registrationAvailability: EventRegistrationAvailability;
}) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const lang = language === "ja" ? "en" : language;
  const mapped = mapEvent(event, lang, registrationAvailability);
  const action = eventCardAction(event, t, registrationAvailability);
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  // 行业已作为卡片眉行展示，标签行不再重复同一个词。
  const topics = eventTopics(event)
    .filter((item) => item !== event.industry)
    .slice(0, 3);
  const dateLabel = formatEventDateFull(event, lang);
  const primaryCta = action.kind === "register" || action.kind === "enter";
  return (
    <div className="orbit-card-link">
      <article
        className="card card-hover orbit-event-module-card"
        data-demo-visual-asset-id={sceneAsset?.assetId}
        data-demo-visual-source={sceneAsset?.sourceLabel}
        data-demo-visual-source-label={sceneAsset?.sourceLabel}
        style={{
          background: "#FFFFFF",
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "14px 14px 18px",
          position: "relative",
        }}
      >
        <a
          aria-label={t({ en: `View ${mapped.name} details`, zh: `查看${mapped.name}详情` })}
          href={preserveHref(productHref(`/events/${event.code}`))}
          style={{ inset: 0, position: "absolute", zIndex: ORBIT_Z.raised }}
        />
        <EventCover
          className="orbit-event-module-cover"
          g={mapped.g}
          imageAlt={mapped.name}
          imageLoading={imagePriority ? "eager" : "lazy"}
          imageSizes="(max-width: 720px) calc(100vw - 36px), (max-width: 1280px) 50vw, 400px"
          imageUrl={mapped.imageUrl}
          monogram={mapped.imageUrl ? null : { text: mapped.name.slice(0, 1), size: 46 }}
          style={{ borderRadius: 12, height: 150, opacity: event.status === "ended" ? 0.74 : 1 }}
        >
          <div style={{ position: "absolute", right: 12, top: 12 }}>
            <EventStatusPill language={lang} status={event.status} />
          </div>
        </EventCover>
        <div className="orbit-event-module-body" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 4px" }}>
          <h2 style={{ color: C.ink, fontSize: 17, fontWeight: 700, lineHeight: 1.4, margin: 0 }}>{mapped.name}</h2>
          <div className="orbit-event-module-meta" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ alignItems: "center", color: C.text2, display: "flex", fontSize: 14, gap: 10 }}>
              <span aria-hidden="true" style={{ color: C.text4 }}>▦</span>
              {dateLabel}
            </span>
            <span style={{ alignItems: "center", color: C.text2, display: "flex", fontSize: 14, gap: 10 }}>
              <span aria-hidden="true" style={{ color: C.text4 }}>◎</span>
              {mapped.place}
            </span>
          </div>
          {topics.length > 0 ? (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topics.map((topicItem) => (
                <span key={topicItem} style={{ background: C.panel, borderRadius: 999, color: C.text2, fontSize: 12, padding: "4px 10px" }}>
                  {topicLabel(topicItem, lang)}
                </span>
              ))}
            </span>
          ) : null}
          <div className="orbit-event-module-foot" style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 6 }}>
            <span style={{ color: C.text3, fontSize: 13, whiteSpace: "nowrap" }}>
              {mapped.people !== null && mapped.people >= 5
                ? t({ en: `${mapped.people} registered`, zh: `${mapped.people} 人已报名` })
                : ""}
            </span>
            <a
              href={preserveHref(action.href)}
              style={{
                background: primaryCta ? C.ink : "#FFFFFF",
                border: primaryCta ? `1px solid ${C.ink}` : `1px solid ${C.borderStrong}`,
                borderRadius: 10,
                color: primaryCta ? "#FFFFFF" : C.accentDeep,
                fontSize: 14,
                fontWeight: 500,
                padding: "10px 18px",
                position: "relative",
                textDecoration: "none",
                whiteSpace: "nowrap",
                zIndex: ORBIT_Z.raised + 1,
              }}
            >
              {action.badgeLabel ? `${action.badgeLabel} · ` : ""}
              {action.label}
            </a>
          </div>
        </div>
      </article>
    </div>
  );
}

/** 我的活动：时间线步骤（从活动状态推导，不伪造报名日期）。 */
function mineTimelineSteps(
  status: OrbitLandingEventView["status"],
  language: "en" | "zh",
) {
  const steps = [
    { done: true, label: language === "en" ? "Registered" : "报名成功" },
    { done: status === "active" || status === "ended", label: language === "en" ? "Attended" : "活动现场" },
    { done: status === "ended", label: language === "en" ? "Recap" : "会后回顾" },
  ];
  return steps;
}

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
  const lang = language === "ja" ? "en" : language;
  const mapped = mapEvent(event, lang, registrationAvailability);
  const action = eventCardAction(event, t, registrationAvailability);
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  const topics = eventTopics(event)
    .filter((item) => item !== event.industry)
    .slice(0, 3);
  const steps = mineTimelineSteps(event.status, lang);
  return (
    <article
      className="card card-hover orbit-event-mine-card"
      data-demo-visual-asset-id={sceneAsset?.assetId}
      data-demo-visual-source={sceneAsset?.sourceLabel}
      data-demo-visual-source-label={sceneAsset?.sourceLabel}
      style={{
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        display: "grid",
        gap: 24,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
        padding: 18,
        position: "relative",
      }}
    >
      <a
        aria-label={t({ en: `View ${mapped.name} details`, zh: `查看${mapped.name}详情` })}
        href={preserveHref(productHref(`/events/${event.code}`))}
        style={{ inset: 0, position: "absolute", zIndex: ORBIT_Z.raised }}
      />
      <EventCover
        g={mapped.g}
        imageAlt={mapped.name}
        imageLoading={imagePriority ? "eager" : "lazy"}
        imageSizes="(max-width: 720px) calc(100vw - 36px), 300px"
        imageUrl={mapped.imageUrl}
        monogram={mapped.imageUrl ? null : { text: mapped.name.slice(0, 1), size: 40 }}
        style={{ borderRadius: 12, height: 140, opacity: event.status === "ended" ? 0.72 : 1 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <h2 style={{ color: C.ink, fontSize: 17, fontWeight: 700, margin: 0 }}>{mapped.name}</h2>
        <span style={{ alignItems: "center", color: C.text2, display: "flex", fontSize: 14, gap: 10 }}>
          <span aria-hidden="true" style={{ color: C.text4 }}>▦</span>
          {formatEventDateFull(event, lang)}
        </span>
        <span style={{ alignItems: "center", color: C.text2, display: "flex", fontSize: 14, gap: 10 }}>
          <span aria-hidden="true" style={{ color: C.text4 }}>◎</span>
          {mapped.place}
        </span>
        {topics.length > 0 ? (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {topics.map((topicItem) => (
              <span key={topicItem} style={{ background: C.panel, borderRadius: 999, color: C.text2, fontSize: 12, padding: "4px 10px" }}>
                {topicLabel(topicItem, lang)}
              </span>
            ))}
          </span>
        ) : null}
        <span style={{ color: C.text3, fontSize: 13 }}>
          {mapped.people !== null && mapped.people >= 5
            ? t({ en: `${mapped.people} registered`, zh: `${mapped.people} 人已报名` })
            : ""}
        </span>
      </div>
      <div className="orbit-event-mine-timeline" style={{ alignItems: "start", display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {steps.map((step, index) => (
          <div key={step.label} style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
            {index > 0 ? (
              <span
                aria-hidden="true"
                style={{
                  background: step.done ? C.accent : C.border,
                  height: 2,
                  left: "-50%",
                  position: "absolute",
                  right: "50%",
                  top: 11,
                }}
              />
            ) : null}
            <span
              style={{
                alignItems: "center",
                background: step.done ? C.accent : "#FFFFFF",
                border: `2px solid ${step.done ? C.accent : C.borderStrong}`,
                borderRadius: "50%",
                color: step.done ? "#FFFFFF" : C.text4,
                display: "flex",
                fontSize: 12,
                fontWeight: 700,
                height: 24,
                justifyContent: "center",
                position: "relative",
                width: 24,
              }}
            >
              {step.done ? "✓" : index + 1}
            </span>
            <span style={{ color: C.text2, fontSize: 13, textAlign: "center" }}>{step.label}</span>
          </div>
        ))}
      </div>
      <div style={{ alignItems: "flex-end", alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24 }}>
        <EventStatusPill language={lang} status={event.status} />
        <a
          href={preserveHref(action.href)}
          style={{
            background: action.kind === "enter" ? C.ink : "#FFFFFF",
            border: action.kind === "enter" ? `1px solid ${C.ink}` : `1px solid ${C.borderStrong}`,
            borderRadius: 10,
            color: action.kind === "enter" ? "#FFFFFF" : C.accentDeep,
            fontSize: 14,
            fontWeight: 500,
            padding: "12px 20px",
            position: "relative",
            textDecoration: "none",
            whiteSpace: "nowrap",
            zIndex: ORBIT_Z.raised + 1,
          }}
        >
          {action.badgeLabel ? `${action.badgeLabel} · ` : ""}
          {action.label} →
        </a>
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
    <section
      className="card"
      data-orbit-events-empty
      style={{
        alignItems: "center",
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        display: "grid",
        justifyItems: "center",
        minHeight: 280,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: C.panel,
          borderRadius: 999,
          color: C.accent,
          display: "flex",
          fontSize: 22,
          height: 52,
          justifyContent: "center",
          width: 52,
        }}
      >
        ✦
      </span>
      <div style={{ marginTop: 16, maxWidth: 460 }}>
        <h2 style={{ color: C.ink, fontSize: 20, fontWeight: 700, margin: 0 }}>
          {registeredView
            ? t({ en: "No registered events yet", zh: "还没有已报名活动" })
            : filteredView
            ? t({ en: "No events match these filters", zh: "没有符合当前筛选的活动" })
            : t({ en: "New events are on the way", zh: "新的活动正在筹备中" })}
        </h2>
        <p style={{ color: C.text3, lineHeight: 1.65, margin: "10px 0 0" }}>
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
        <button
          onClick={onReset}
          style={{
            background: C.ink,
            border: 0,
            borderRadius: 10,
            color: "#FFFFFF",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            marginTop: 18,
            padding: "12px 22px",
          }}
          type="button"
        >
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

export function OrbitRealExploreClient({
  initialScope = "all",
  registrationAvailabilityByEventId,
  viewModel,
}: {
  initialScope?: EventScope;
  registrationAvailabilityByEventId: Readonly<Record<string, EventRegistrationAvailability>>;
  viewModel: OrbitLandingViewModel;
}) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const lang = language === "ja" ? "en" : language;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EventScope>(initialScope);
  // 我的活动屏的本地子筛选（设计：全部/即将开始/进行中/已结束），不进 URL。
  const [mineFilter, setMineFilter] = useState<"all" | "upcoming" | "active" | "ended">("all");
  const scopeInUrl = eventScopeFromValues(searchParams.getAll("scope"));
  useEffect(() => {
    setStatus(scopeInUrl);
  }, [scopeInUrl]);
  const events = viewModel.events;
  const topicFilters = useMemo(() => exploreTopicFilters(events), [events]);
  // 话题词典仍用于标签展示与搜索匹配（matchesExploreFilters 的 topic 维度固定 all）。
  void topicFilters;
  const filtered = useMemo(
    () => events.filter((event) => matchesExploreFilters(event, { language, query, status, topic: "all" })),
    [events, language, query, status],
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
  const isMine = status === "registered";
  const stats = useMemo(() => {
    const monthKey = new Intl.DateTimeFormat("en-US", { month: "2-digit", year: "numeric", ...tz });
    const nowKey = monthKey.format(new Date());
    return {
      active: events.filter((event) => event.status === "active").length,
      registered: events.filter((event) => Boolean(event.stats.youRsvped)).length,
      thisMonth: events.filter((event) => {
        const startsAt = new Date(event.startsAt);
        return Number.isFinite(startsAt.getTime()) && monthKey.format(startsAt) === nowKey;
      }).length,
      upcoming: events.filter((event) => event.status === "upcoming").length,
    };
  }, [events]);
  const resultLabel = filtered.length === 0
    ? t({ en: "No matching open events.", zh: "没有匹配的开放活动。" })
    : t({ en: `${filtered.length} events`, zh: `${filtered.length} 场活动` });
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
  const resetFilters = () => {
    setQuery("");
    setMineFilter("all");
    setEventScope("all");
  };
  const filteredView = Boolean(query || status !== "all");

  const discoverScopes = statusFilters.filter((key) => key !== "registered");
  const mineScopes = ["all", "upcoming", "active", "ended"] as const;

  return (
    <div className="orbit-shell" data-orbit-real-page="explore" style={{ background: C.pageBg, minHeight: "100dvh" }}>
      <style>{`
        [data-orbit-real-page=explore] .orbit-event-module-grid {
          display: grid;
          gap: 20px;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
        }
        [data-orbit-real-page=explore] .orbit-event-module-card {
          transition: box-shadow 0.2s, transform 0.2s;
        }
        [data-orbit-real-page=explore] .orbit-event-module-card:hover {
          box-shadow: 0 12px 32px rgba(59, 63, 122, 0.10);
          transform: translateY(-2px);
        }
        [data-orbit-real-page=explore] .orbit-explore-seg-button:focus-visible {
          outline: 2px solid ${C.accent};
          outline-offset: -2px;
        }
        [data-orbit-real-page=explore] .orbit-explore-tab:focus-visible {
          outline: 2px solid ${C.accent};
          outline-offset: 2px;
        }
        @media (pointer: coarse) {
          [data-orbit-real-page=explore] .orbit-explore-seg-button {
            min-height: 44px;
          }
        }
        @media (max-width: 640px) {
          [data-orbit-real-page=explore] .orbit-explore-main {
            padding: 20px 16px 72px !important;
          }
          [data-orbit-real-page=explore] .orbit-explore-title {
            font-size: 30px !important;
          }
          [data-orbit-real-page=explore] .orbit-explore-stats {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @keyframes orbit-fade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
      <PublicTopNav active="events" />
      <main className="orbit-explore-main" data-appscroll style={{ display: "flex", flexDirection: "column", gap: 22, margin: "0 auto", maxWidth: 1240, padding: "28px 40px 96px" }}>
        <div style={{ alignItems: "flex-start", animation: "orbit-fade .3s ease", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1
              className="orbit-explore-title"
              style={{ color: C.ink, fontFamily: ORBIT_0918_FONTS.serif, fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}
            >
              {isMine ? t({ en: "My events", zh: "我的活动" }) : t({ en: "Discover events", zh: "发现活动" })}
            </h1>
            <p style={{ color: C.text2, fontSize: 15, margin: 0 }}>
              {isMine
                ? t({ en: "Track the events you have registered for and never miss a moment.", zh: "查看你已报名的活动，掌握活动进展，不错过任何精彩时刻。" })
                : t({ en: "Explore events that interest you, meet remarkable people, and expand what is possible.", zh: "探索你感兴趣的活动，连接更多优秀的人，拓展你的可能性。" })}
            </p>
          </div>
          <a
            href={preserveHref(productHref("/events/center"))}
            style={{ background: C.ink, borderRadius: 12, color: "#FFFFFF", fontSize: 15, fontWeight: 500, padding: "13px 22px", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            {t({ en: "+ Create event", zh: "＋ 创建活动" })}
          </a>
        </div>

        <div role="tablist" style={{ borderBottom: `1px solid ${C.border}`, display: "flex", fontSize: 15, gap: 8 }}>
          <button
            aria-selected={!isMine}
            className="orbit-explore-tab"
            onClick={() => setEventScope("all")}
            role="tab"
            style={{
              background: "transparent",
              border: 0,
              borderBottom: `2px solid ${isMine ? "transparent" : C.ink}`,
              color: isMine ? C.text2 : C.ink,
              cursor: "pointer",
              fontWeight: isMine ? 400 : 500,
              marginBottom: -1,
              padding: "12px 16px",
            }}
            type="button"
          >
            {t({ en: "Discover", zh: "发现活动" })}
          </button>
          <button
            aria-selected={isMine}
            className="orbit-explore-tab"
            onClick={() => setEventScope("registered")}
            role="tab"
            style={{
              background: "transparent",
              border: 0,
              borderBottom: `2px solid ${isMine ? C.ink : "transparent"}`,
              color: isMine ? C.ink : C.text2,
              cursor: "pointer",
              fontWeight: isMine ? 500 : 400,
              marginBottom: -1,
              padding: "12px 16px",
            }}
            type="button"
          >
            {t({ en: "My events", zh: "我的活动" })}
          </button>
          <a
            className="orbit-explore-tab"
            href={preserveHref(productHref("/events/center"))}
            role="tab"
            style={{
              borderBottom: "2px solid transparent",
              color: C.text2,
              marginBottom: -1,
              padding: "12px 16px",
              textDecoration: "none",
            }}
          >
            {t({ en: "Host dashboard", zh: "主办管理" })}
          </a>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <div style={{ alignItems: "center", background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flex: 1, gap: 10, minWidth: 280, padding: "0 16px" }}>
            <span aria-hidden="true" style={{ color: C.text4 }}>⌕</span>
            <input
              aria-label={t({ en: "Search event name, keyword, or organizer", zh: "搜索活动名称、关键词或主办方" })}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t({ en: "Search event name, keyword, or organizer…", zh: "搜索活动名称、关键词或主办方…" })}
              style={{ background: "transparent", border: 0, flex: 1, fontSize: 14, outline: "none", padding: "14px 0" }}
              type="search"
              value={query}
            />
          </div>
          <div
            aria-label={isMine ? t({ en: "My event status", zh: "我的活动状态" }) : t({ en: "Event status", zh: "活动状态" })}
            role="group"
            style={{ background: C.panelSoft, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", padding: 4 }}
          >
            {isMine
              ? mineScopes.map((key) => (
                  <button
                    aria-pressed={mineFilter === key}
                    className="orbit-explore-seg-button"
                    key={key}
                    onClick={() => setMineFilter(key)}
                    style={{
                      background: mineFilter === key ? "#FFFFFF" : "transparent",
                      border: 0,
                      borderRadius: 9,
                      boxShadow: mineFilter === key ? "0 1px 4px rgba(14, 18, 37, 0.08)" : "none",
                      color: mineFilter === key ? C.ink : C.text3,
                      cursor: "pointer",
                      fontSize: 14,
                      padding: "10px 22px",
                      transition: "all .2s",
                      whiteSpace: "nowrap",
                    }}
                    type="button"
                  >
                    {scopeLabel(key, t)}
                  </button>
                ))
              : discoverScopes.map((key) => (
                  <button
                    aria-pressed={status === key}
                    className="orbit-explore-seg-button"
                    key={key}
                    onClick={() => setEventScope(key)}
                    style={{
                      background: status === key ? "#FFFFFF" : "transparent",
                      border: 0,
                      borderRadius: 9,
                      boxShadow: status === key ? "0 1px 4px rgba(14, 18, 37, 0.08)" : "none",
                      color: status === key ? C.ink : C.text3,
                      cursor: "pointer",
                      fontSize: 14,
                      padding: "10px 22px",
                      transition: "all .2s",
                      whiteSpace: "nowrap",
                    }}
                    type="button"
                  >
                    {scopeLabel(key, t)}
                  </button>
                ))}
          </div>
        </div>

        {!isMine ? (
          <div className="orbit-explore-stats" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            {[
              { desc: t({ en: "Open for registration", zh: "正在开放报名" }), icon: "◎", label: t({ en: "Upcoming", zh: "即将开始" }), n: stats.upcoming },
              { desc: t({ en: "In your calendar", zh: "在你的日程里" }), icon: "✦", label: t({ en: "Registered", zh: "我已报名" }), n: stats.registered },
              { desc: t({ en: "Join right now", zh: "现在可以参加" }), icon: "▶", label: t({ en: "Live", zh: "进行中" }), n: stats.active },
              { desc: t({ en: "Across the community", zh: "本月社区活动" }), icon: "▦", label: t({ en: "This month", zh: "本月活动" }), n: stats.thisMonth },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 16, display: "flex", gap: 16, padding: 22 }}>
                <span aria-hidden="true" style={{ alignItems: "center", background: stat.label === (lang === "en" ? "Live" : "进行中") ? "#E6F1EC" : C.panel, borderRadius: 12, color: stat.label === (lang === "en" ? "Live" : "进行中") ? "#2F6B4F" : C.accent, display: "flex", flexShrink: 0, fontSize: 20, height: 48, justifyContent: "center", width: 48 }}>
                  {stat.icon}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ color: C.text2, fontSize: 14 }}>{stat.label}</span>
                  <strong style={{ color: C.ink, fontFamily: ORBIT_0918_FONTS.serif, fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{stat.n}</strong>
                  <span style={{ color: C.text3, fontSize: 13 }}>{stat.desc}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {isMine ? (
          mineEvents.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {mineEvents.map((event, index) => (
                <MineEventCard
                  event={event}
                  imagePriority={index < 2}
                  key={event.id}
                  registrationAvailability={registrationAvailabilityByEventId[event.id] ?? "unavailable"}
                />
              ))}
              <span style={{ alignSelf: "center", color: C.text4, fontSize: 13, paddingTop: 10 }}>
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
          <>
            <div style={{ color: C.text3, fontSize: 13 }}>{resultLabel}</div>
            <EventModuleGrid events={filtered} registrationAvailabilityByEventId={registrationAvailabilityByEventId} />
          </>
        ) : (
          <EventsEmptyState
            filteredView={filteredView}
            onReset={resetFilters}
            registeredView={false}
          />
        )}
      </main>
    </div>
  );
}
