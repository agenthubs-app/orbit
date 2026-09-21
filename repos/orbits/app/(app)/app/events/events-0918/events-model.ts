/**
 * Events（Orbit_0918）纯模型：状态 chip 色、卡片 CTA、我的活动时间线、统计四卡。
 * 值来自 docs/designs/Orbit_0918/Events.dc.html renderVals（828 `stStyle`、829 `ctaFor`、
 * 831–832 `decorate`、870 `stats`）。不含 React / fetch / 路由；筛选与话题模型仍在 ../explore-model.ts。
 */
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import type { EventRegistrationAvailability } from "../../orbit-event-registration-view-model";
import { eventCardActionKind } from "../explore-model";
import type {
  OrbitPartyAgendaItemView,
  OrbitPartyContactRequestView,
  OrbitPartyGraphView,
  OrbitPartyPersonView,
} from "../../orbit-party-route-view-model";

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

// ═══ 现场屏（设计 221–519；renderVals 857–858 agState/agendaRows、862–867 graph、865 relColor、873 hotTags/pages）═══

export type LiveTab = "home" | "rec" | "all" | "group" | "graph" | "agenda";
export const LIVE_TABS: { key: LiveTab; label: Copy }[] = [
  { key: "home", label: { zh: "现场主页", en: "Live home" } },
  { key: "rec", label: { zh: "推荐给你", en: "For you" } },
  { key: "all", label: { zh: "全部参会者", en: "All attendees" } },
  { key: "group", label: { zh: "分组", en: "Groups" } },
  { key: "graph", label: { zh: "关系图谱", en: "Graph" } },
  { key: "agenda", label: { zh: "流程议程", en: "Agenda" } },
];

export function liveTabFrom(value: string | null | undefined): LiveTab {
  return LIVE_TABS.some((tab) => tab.key === value) ? (value as LiveTab) : "home";
}

// ── 议程状态（设计 857 agState：done / now / soon / later；据 ISO `at` 推导，不看 `time` 标签）──
export type AgendaStatus = "done" | "now" | "soon" | "later";

export const AGENDA_STATE: Record<AgendaStatus, { tag: Copy; tagBg: string; tagFg: string; dotBg: string; mark: string; dotBorder: string; rowBg: string }> = {
  done: { tag: { zh: "已完成", en: "Done" }, tagBg: "#E6F1EC", tagFg: "#2F6B4F", dotBg: "#2F6B4F", mark: "✓", dotBorder: "#2F6B4F", rowBg: "transparent" },
  now: { tag: { zh: "进行中", en: "Now" }, tagBg: "#DDDEFA", tagFg: "#2E3270", dotBg: "#4B4FC7", mark: "●", dotBorder: "#4B4FC7", rowBg: "#F7F7FD" },
  soon: { tag: { zh: "即将开始", en: "Up next" }, tagBg: "#F0F1F8", tagFg: "#6B6F99", dotBg: "#FFFFFF", mark: "", dotBorder: "#C9CBEA", rowBg: "transparent" },
  later: { tag: { zh: "未开始", en: "Later" }, tagBg: "#F0F1F8", tagFg: "#9FA3C4", dotBg: "#FFFFFF", mark: "", dotBorder: "#C9CBEA", rowBg: "transparent" },
};

/**
 * 每项按 `at` 与 `now` 比：最后一个已开始的环节 = now，其前 = done，第一个未开始 = soon，其余 = later。
 * `at` 无效的项按 later（永不宣称进行中）。
 */
export function agendaStatus(items: readonly Pick<OrbitPartyAgendaItemView, "at">[], now: number | Date): AgendaStatus[] {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const startedAt = items.map((item) => Date.parse(item.at));
  const started = startedAt.map((ms) => Number.isFinite(ms) && ms <= nowMs);
  const currentIndex = started.lastIndexOf(true);
  const soonIndex = startedAt.findIndex((ms, index) => Number.isFinite(ms) && !started[index] && index > currentIndex);
  return items.map((_, index) => {
    if (index === currentIndex) return "now";
    if (index < currentIndex && started[index]) return "done";
    if (index === soonIndex) return "soon";
    return "later";
  });
}

/** 当前轮：议程第三项（第二轮）已开始且存在 roundTwo → 2，否则 1。 */
export function currentRound(items: readonly Pick<OrbitPartyAgendaItemView, "at">[], hasRoundTwo: boolean, now: number | Date): 1 | 2 {
  const statuses = agendaStatus(items, now);
  return hasRoundTwo && statuses[2] === "now" ? 2 : 1;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const two = (value: number) => String(value).padStart(2, "0");

/** JST `HH:MM`（固定偏移 + UTC getter，服务端 / 浏览器字节一致）；无效 → 「—」。 */
export function formatJstClock(iso: string): string {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "—";
  const tokyo = new Date(instant.getTime() + JST_OFFSET_MS);
  return `${two(tokyo.getUTCHours())}:${two(tokyo.getUTCMinutes())}`;
}

/** 设计 484「当前时间：9月20日 19:40（JST）」。 */
export function formatJstStamp(iso: string | number, language: EventListLanguage): string {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "—";
  const tokyo = new Date(instant.getTime() + JST_OFFSET_MS);
  const clock = `${two(tokyo.getUTCHours())}:${two(tokyo.getUTCMinutes())}`;
  return language === "en"
    ? `${tokyo.getUTCMonth() + 1}/${tokyo.getUTCDate()} ${clock} (JST)`
    : `${tokyo.getUTCMonth() + 1}月${tokyo.getUTCDate()}日 ${clock}（JST）`;
}

// ── 图谱（设计 862–867：R=170, cx=260, cy=210；节点 48px 故 -24；连线自圆心，长度 R，rotate(deg)）──
export interface GraphNodeLayout {
  angle: number;
  deg: number;
  len: number;
  /** 节点左上（x-24, y-24） */
  left: number;
  top: number;
  x: number;
  y: number;
}

export const GRAPH_R = 170;
export const GRAPH_CX = 260;
export const GRAPH_CY = 210;

export function graphLayout<T>(nodes: readonly T[]): GraphNodeLayout[] {
  const count = nodes.length;
  return nodes.map((_, index) => {
    const angle = -Math.PI / 2 + index * ((2 * Math.PI) / count);
    const x = GRAPH_CX + GRAPH_R * Math.cos(angle);
    const y = GRAPH_CY + GRAPH_R * Math.sin(angle);
    const len = Math.sqrt((x - GRAPH_CX) ** 2 + (y - GRAPH_CY) ** 2);
    const deg = (Math.atan2(y - GRAPH_CY, x - GRAPH_CX) * 180) / Math.PI;
    return { angle, deg, len, left: x - 24, top: y - 24, x, y };
  });
}

// ── 图例（设计 865 relColor；kind 由 edges + contactRequests 推导，节点本身无 kind）──
export type GraphLegendKind = "me" | "known" | "recommended" | "group" | "other";

export const GRAPH_LEGEND: { kind: GraphLegendKind; color: string; label: Copy }[] = [
  { kind: "me", color: "#4B4FC7", label: { zh: "我自己", en: "Me" } },
  { kind: "known", color: "#5B8C7A", label: { zh: "已认识", en: "Connected" } },
  { kind: "recommended", color: "#7C4FC7", label: { zh: "推荐认识", en: "Recommended" } },
  { kind: "group", color: "#9FA3D9", label: { zh: "同组成员", en: "Same table" } },
  { kind: "other", color: "#C9CBEA", label: { zh: "其他", en: "Other" } },
];

export function graphLegendColor(kind: GraphLegendKind): string {
  return GRAPH_LEGEND.find((item) => item.kind === kind)?.color ?? "#C9CBEA";
}

/** 优先级：我 > 已接受交换（已认识） > 推荐边 > 同桌边 > 其他；只看与我相连的边。 */
export function graphLegendKind(
  node: Pick<OrbitPartyGraphView["nodes"][number], "participantId">,
  edges: OrbitPartyGraphView["edges"],
  contactRequests: readonly Pick<OrbitPartyContactRequestView, "otherParticipantId" | "status">[],
  meId: string,
): GraphLegendKind {
  const id = node.participantId;
  if (id === meId) return "me";
  if (contactRequests.some((request) => request.otherParticipantId === id && request.status === "accepted")) return "known";
  const mine = edges.filter(
    (edge) =>
      (edge.fromParticipantId === meId && edge.toParticipantId === id) ||
      (edge.toParticipantId === meId && edge.fromParticipantId === id),
  );
  if (mine.some((edge) => edge.kind === "recommendation")) return "recommended";
  if (mine.some((edge) => edge.kind === "round_one_table" || edge.kind === "round_two_topic")) return "group";
  return "other";
}

// ── 热门标签（设计 873 hotTags：topics 频次前 10）──
export function hotTags(people: readonly Pick<OrbitPartyPersonView, "topics">[], limit = 10): string[] {
  const counts = new Map<string, number>();
  for (const person of people) {
    for (const raw of person.topics) {
      const topic = raw.trim();
      if (!topic) continue;
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic);
}

// ── 分页（设计 874 pages：每页 12 条；仅 >12 时显示）──
export interface Paginated<T> {
  items: T[];
  page: number;
  pageCount: number;
  pages: number[];
  total: number;
}

export function paginate<T>(list: readonly T[], page: number, pageSize = 12): Paginated<T> {
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return {
    items: list.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pageCount,
    pages: Array.from({ length: pageCount }, (_, index) => index + 1),
    total,
  };
}

/** 全部参会者搜索（设计 364 placeholder：姓名、公司、职位或关键词）。 */
export function matchesPersonQuery(person: Pick<OrbitPartyPersonView, "name" | "company" | "title" | "topics" | "industry">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [person.name, person.company, person.title, person.industry, ...person.topics].some((value) => value.toLowerCase().includes(needle));
}

/** 共同兴趣 = topics 交集（设计 456 gselInterests 是 mock 列表）。 */
export function sharedTopics(a: readonly string[], b: readonly string[]): string[] {
  const mine = new Set(b.map((topic) => topic.trim().toLowerCase()));
  return a.filter((topic) => mine.has(topic.trim().toLowerCase()));
}
