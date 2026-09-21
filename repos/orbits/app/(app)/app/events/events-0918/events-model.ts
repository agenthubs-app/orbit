/**
 * Events（Orbit_0918）纯模型：状态 chip 色、卡片 CTA、我的活动时间线、统计四卡。
 * 值来自 docs/designs/Orbit_0918/Events.dc.html renderVals（828 `stStyle`、829 `ctaFor`、
 * 831–832 `decorate`、870 `stats`）。不含 React / fetch / 路由；筛选与话题模型仍在 ../explore-model.ts。
 */
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import type { EventRegistrationAvailability } from "../../orbit-event-registration-view-model";
import { eventCardActionKind } from "../explore-model";

export type EventLifecycle = OrbitLandingEventView["status"];
export type EventListLanguage = "en" | "zh";
export type Copy = { zh: string; en: string };

// ── 状态 chip（设计 828 stStyle：进行中 / 已报名 / 即将开始 / 已结束）──
export type EventChipKind = "active" | "registered" | "upcoming" | "ended";

export const STATUS_CHIP: Record<EventChipKind, { bg: string; fg: string; label: Copy }> = {
  active: { bg: "#E6F1EC", fg: "#2F6B4F", label: { zh: "进行中", en: "Live" } },
  registered: { bg: "#DDDEFA", fg: "#2E3270", label: { zh: "已报名", en: "Registered" } },
  upcoming: { bg: "#FBF1DC", fg: "#8A6420", label: { zh: "即将开始", en: "Upcoming" } },
  ended: { bg: "#F0F1F8", fg: "#6B6F99", label: { zh: "已结束", en: "Ended" } },
};

/** 设计把「已报名」当作一种状态：未开始且已报名 → 已报名；其余按生命周期。 */
export function eventChipKind(status: EventLifecycle, registered: boolean): EventChipKind {
  if (status === "active") return "active";
  if (status === "ended") return "ended";
  return registered ? "registered" : "upcoming";
}

// ── 卡片 CTA（设计 829 ctaFor + 831 decorate 的 ctaBg/ctaFg/ctaBorder）──
export type EventCtaTone = "dark" | "accent" | "ghost";
export type EventCtaKind = "live" | "recap" | "view" | "register";

export const CTA_TONE: Record<EventCtaTone, { bg: string; fg: string; border: string }> = {
  dark: { bg: "#0E1225", fg: "#FFFFFF", border: "transparent" },
  accent: { bg: "#4B4FC7", fg: "#FFFFFF", border: "transparent" },
  ghost: { bg: "#FFFFFF", fg: "#2E3270", border: "#B9BCEB" },
};

export interface EventCta {
  href: string;
  kind: EventCtaKind;
  label: Copy;
  tone: EventCtaTone;
}

/** 详情/报名/现场都以公开路由码寻址（`/app/events/[id]` 解析 routeId）。 */
export function eventDetailHref(code: string): string {
  return `/app/events/${encodeURIComponent(code)}`;
}

/** 设计 829 `ctaFor` 的四种 CTA 文案 / 色调；`kind` 由 `eventCardActionKind` 映射得到。 */
const CTA_BY_KIND: Record<EventCtaKind, { label: Copy; tone: EventCtaTone; suffix: string }> = {
  live: { label: { zh: "进入活动现场", en: "Enter live" }, tone: "dark", suffix: "/live" },
  recap: { label: { zh: "回看活动", en: "Recap" }, tone: "ghost", suffix: "?view=recap" },
  register: { label: { zh: "立即报名", en: "Register now" }, tone: "accent", suffix: "/register" },
  view: { label: { zh: "查看活动", en: "View event" }, tone: "dark", suffix: "" },
};

/**
 * 数据真实性决定：已结束 → 回看活动；其余由既有 `explore-model.eventCardActionKind` 映射
 * （enter → live、register → register、manage / view → view），不另行推导报名 / 生命周期规则。
 * 设计对「进行中」一律给「进入活动现场」，但未报名者进现场只会落到边界态，故按真实能力收口。
 */
export function ctaKindFor(
  status: EventLifecycle,
  registered: boolean,
  registrationAvailability: EventRegistrationAvailability = "unavailable",
): EventCtaKind {
  if (status === "ended") return "recap";
  const action = eventCardActionKind(status, registered, registrationAvailability);
  return action === "enter" ? "live" : action === "register" ? "register" : "view";
}

export function ctaFor(
  event: Pick<OrbitLandingEventView, "code" | "status"> & { registered: boolean },
  registrationAvailability: EventRegistrationAvailability = "unavailable",
): EventCta {
  const kind = ctaKindFor(event.status, event.registered, registrationAvailability);
  const spec = CTA_BY_KIND[kind];
  return { href: `${eventDetailHref(event.code)}${spec.suffix}`, kind, label: spec.label, tone: spec.tone };
}

// ── 我的活动时间线（设计 832 timeline：报名成功 / 活动开始 / 活动结束）──
export interface TimelineNode {
  bg: string;
  border: string;
  date: string;
  label: Copy;
  line: string;
  mark: string;
  ring: string;
}

const TOKYO = { timeZone: "Asia/Tokyo" } as const;

/** 设计 steps 的日期口径「9月1日」；无效时间 → 「—」。 */
export function timelineDate(iso: string, language: EventListLanguage): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "numeric", month: language === "en" ? "short" : "long", ...TOKYO }).format(date);
}

/** 当前步：未开始 0 / 进行中 1 / 已结束 2（设计 step）。 */
export function timelineStep(status: EventLifecycle): 0 | 1 | 2 {
  return status === "ended" ? 2 : status === "active" ? 1 : 0;
}

/** 「报名成功」无日期来源 → 「—」；开始 / 结束用真实时间。 */
export function timelineNodes(
  event: Pick<OrbitLandingEventView, "status" | "startsAt" | "endsAt">,
  language: EventListLanguage,
): TimelineNode[] {
  const step = timelineStep(event.status);
  const dates = ["—", timelineDate(event.startsAt, language), timelineDate(event.endsAt, language)];
  const labels: Copy[] = [
    { zh: "报名成功", en: "Registered" },
    { zh: "活动开始", en: "Starts" },
    { zh: "活动结束", en: "Ends" },
  ];
  return labels.map((label, i) => ({
    bg: i <= step ? "#4B4FC7" : "#FFFFFF",
    border: i <= step ? "#4B4FC7" : "#C9CBEA",
    date: dates[i],
    label,
    line: i < 2 ? (i < step ? "#4B4FC7" : "#DDDEFA") : "transparent",
    mark: i < step || (step === 2 && i === 2) ? "✓" : "",
    ring: i === step && step < 2 ? "0 0 0 4px #DDDEFA" : "none",
  }));
}

// ── 统计四卡（设计 870 stats；数据真实性：本周推荐 → 即将开始，本月活动 desc → 本月社区活动）──
export type EventStatKey = "upcoming" | "registered" | "active" | "thisMonth";

export const STAT_CARDS: { key: EventStatKey; icon: string; bg: string; fg: string; label: Copy; desc: Copy }[] = [
  { key: "upcoming", icon: "✦", bg: "#ECEEFB", fg: "#4B4FC7", label: { zh: "即将开始", en: "Upcoming" }, desc: { zh: "正在开放报名", en: "Open for registration" } },
  { key: "registered", icon: "◎", bg: "#ECEEFB", fg: "#4B4FC7", label: { zh: "我已报名", en: "Registered" }, desc: { zh: "在你的日程里", en: "In your calendar" } },
  { key: "active", icon: "▶", bg: "#E6F1EC", fg: "#2F6B4F", label: { zh: "进行中", en: "Live" }, desc: { zh: "现在可以参加", en: "Join right now" } },
  { key: "thisMonth", icon: "▦", bg: "#ECEEFB", fg: "#4B4FC7", label: { zh: "本月活动", en: "This month" }, desc: { zh: "本月社区活动", en: "Across the community" } },
];

export function listStats(
  events: readonly Pick<OrbitLandingEventView, "status" | "startsAt" | "stats">[],
  now: Date = new Date(),
): Record<EventStatKey, number> {
  const monthKey = new Intl.DateTimeFormat("en-US", { month: "2-digit", year: "numeric", ...TOKYO });
  const nowKey = monthKey.format(now);
  return {
    active: events.filter((event) => event.status === "active").length,
    registered: events.filter((event) => Boolean(event.stats.youRsvped)).length,
    thisMonth: events.filter((event) => {
      const startsAt = new Date(event.startsAt);
      return Number.isFinite(startsAt.getTime()) && monthKey.format(startsAt) === nowKey;
    }).length,
    upcoming: events.filter((event) => event.status === "upcoming").length,
  };
}

// ── 卡片人数（设计 95：「+N 人已报名」；真实 registeredCount，无或 0 → 省略）──
export function registeredCountLabel(count: number | null, language: EventListLanguage): string | null {
  if (count === null || !Number.isFinite(count) || count <= 0) return null;
  return language === "en" ? `+${count} registered` : `+${count} 人已报名`;
}

// ── 日期格式化（设计 `e.date` / `e.dateFull`；列表与详情共用）──
const tz = TOKYO;

export function fmtDay(date: Date, language: EventListLanguage) {
  const formatter = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "2-digit", ...tz });
  return formatter.formatToParts(date).find((part) => part.type === "day")?.value ?? formatter.format(date);
}

function partsOf(date: Date, language: EventListLanguage, withYear: boolean) {
  const parts = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: language === "en" ? "short" : "numeric",
    weekday: "short",
    ...(withYear ? { year: "numeric" } : {}),
    ...tz,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), hour: get("hour"), minute: get("minute"), month: get("month"), weekday: get("weekday"), year: get("year") };
}

/**
 * 设计 `e.date`「9月20日（周日） 19:00 - 21:00」/ `e.dateFull`「2026年9月20日（周日） 19:00 - 21:00」。
 * 结束时间无效 → 只显示开始；开始时间无效 → 「时间待定」。
 */
export function formatEventDateRange(
  event: Pick<OrbitLandingEventView, "startsAt" | "endsAt">,
  language: EventListLanguage,
  withYear = false,
): string {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) return language === "en" ? "Time TBD" : "时间待定";
  const end = new Date(event.endsAt);
  const s = partsOf(start, language, withYear);
  const startClock = `${s.hour}:${s.minute}`;
  const endClock = Number.isFinite(end.getTime()) ? (() => { const e = partsOf(end, language, false); return `${e.hour}:${e.minute}`; })() : "";
  const clock = endClock ? `${startClock} - ${endClock}` : startClock;
  if (language === "en") {
    return `${s.month} ${s.day}${withYear ? `, ${s.year}` : ""} (${s.weekday}) ${clock}`;
  }
  return `${withYear ? `${s.year}年` : ""}${s.month}月${s.day}日（${s.weekday}） ${clock}`;
}
