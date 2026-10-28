/**
 * R27 探す 的纯逻辑（规则，不调 AI）：主题 / 形式 / 地区 / 时期判定、契约 9「興味なし」降权、三组划分。Owner: 甲 (R27).
 * - 分数：调用方传进来的就是计划页同一套 `scoreEvent`（经 R26 `judgeEvent`）的结果；这里只排序、分组，不改显示分数。
 * - 興味なし（DESIGN §9 #12）：被点的那一场离开推荐（コミュニティ / プランに効く），「すべて」里保留；
 *   schedule → 同时段降权、distance → 同地区降权、content → 同主办且同主题降权；同一主办方累计 3 次 → 整体降权；
 *   known 只过滤这一场。降权只影响排序，从不改分数。
 */
import type { EventRecommendationDismissReason } from "../../../shared/contract/event-recommendation-feedback";
import type {
  EventDiscoverArea,
  EventDiscoverBadge,
  EventDiscoverCommunityReason,
  EventDiscoverFormat,
  EventDiscoverResponse,
  EventDiscoverRow,
  EventDiscoverTheme,
  EventDiscoverWidenSuggestion,
} from "../../../shared/contract/event-discover";
import type { EventDiscoverParsedQuery } from "../../../shared/api-schema/event-discover";
import { guessPlace } from "../../../shared/compute/event-travel-estimate";
import { tokyoParts } from "../../../shared/compute/event-score-input";

export const DISCOVER_THEME_KEYWORDS: Readonly<Record<EventDiscoverTheme, RegExp>> = {
  funding: /資金調達|調達|シリーズ\s?[A-DＡ-Ｄ]|VC|CVC|投資家|エンジェル|ファイナンス|デット/i,
  global: /海外|グローバル|global|越境|英語/i,
  hiring: /採用|人材|HR|リクルート|組織づくり/i,
  ipo: /IPO|上場/i,
  management: /経営|CFO|CEO|財務|会計|管理部|資本政策|経営企画/i,
  manufacturing_dx: /製造|ファクトリー|工場|IoT|モノづくり|ものづくり|DX/i,
  networking: /交流|ネットワーキング|懇親|ミートアップ|meetup|ナイト|night|朝会/i,
  saas: /SaaS/i,
};

const FORMAT_KEYWORDS: Readonly<Record<Exclude<EventDiscoverFormat, "small">, RegExp>> = {
  networking: /交流|ネットワーキング|懇親|ミートアップ|meetup|テーブルトーク|名刺交換|ナイト|night/i,
  speakers: /登壇|キーノート|基調講演|パネル|カンファレンス|フォーラム|summit|サミット|講演|セミナー/i,
};

export function eventThemes(text: string): EventDiscoverTheme[] {
  return (Object.keys(DISCOVER_THEME_KEYWORDS) as EventDiscoverTheme[]).filter((key) => DISCOVER_THEME_KEYWORDS[key].test(text));
}

export function eventFormats(text: string, capacity: number | null | undefined): EventDiscoverFormat[] {
  const out: EventDiscoverFormat[] = [];
  if (FORMAT_KEYWORDS.speakers.test(text)) out.push("speakers");
  if (FORMAT_KEYWORDS.networking.test(text)) out.push("networking");
  if ((typeof capacity === "number" && capacity > 0 && capacity <= 30) || /少人数|もくもく/.test(text)) out.push("small");
  return out;
}

export function eventArea(place: string | null | undefined): EventDiscoverArea | null {
  const guess = guessPlace(place ?? null);
  if (!guess) return null;
  if (guess.online) return "online";
  if (guess.prefecture === "東京都") return "tokyo";
  if (guess.prefecture === "大阪府") return "osaka";
  if (guess.prefecture === "愛知県") return "nagoya";
  return null;
}

/** 过去 1 年内结束的才算「開催済み」（DISCOVER-RULES D4）。 */
export const PAST_DAYS = 365;
/** これから 的上限 = 目录窗口（live.ts CATALOGUE_DAYS）。 */
const UPCOMING_DAYS = 120;

/**
 * 东京时间的 [from, to)：これから = 现在起 120 天；今週 = 现在到本周日结束；今月 / 来月 = 东京自然月；custom = from 0:00 到 to 24:00；
 * 開催済み = 过去 1 年到现在（`ended`：按结束时间落在窗口内判断）。没有时期 → 现在起 60 天。
 */
export function periodWindow(query: Pick<EventDiscoverParsedQuery, "period" | "from" | "to">, now: Date): { from: number; to: number; ended?: true } {
  const DAY = 86_400_000;
  const tokyoMidnight = (time: number) => tokyoParts(time).dayIndex * DAY - 9 * 3_600_000;
  const nowTime = now.getTime();
  const start = tokyoMidnight(nowTime);
  const monthStart = (year: number, month: number) => Date.UTC(year, month, 1) - 9 * 3_600_000;
  const tokyo = new Date(nowTime + 9 * 3_600_000);
  switch (query.period) {
    case "upcoming":
      return { from: nowTime, to: nowTime + UPCOMING_DAYS * DAY };
    case "past":
      return { ended: true, from: nowTime - PAST_DAYS * DAY, to: nowTime };
    case "this_week": {
      const weekday = tokyoParts(nowTime).day; // 0 = 日曜
      const daysToSunday = weekday === 0 ? 0 : 7 - weekday;
      return { from: nowTime, to: start + (daysToSunday + 1) * DAY };
    }
    case "this_month":
      return { from: nowTime, to: monthStart(tokyo.getUTCFullYear(), tokyo.getUTCMonth() + 1) };
    case "next_month":
      return { from: monthStart(tokyo.getUTCFullYear(), tokyo.getUTCMonth() + 1), to: monthStart(tokyo.getUTCFullYear(), tokyo.getUTCMonth() + 2) };
    case "custom": {
      const from = query.from ? Date.parse(`${query.from}T00:00:00+09:00`) : nowTime;
      const to = query.to ? Date.parse(`${query.to}T00:00:00+09:00`) + DAY : from + 60 * DAY;
      return { from: Math.max(from, nowTime), to };
    }
    default:
      return { from: nowTime, to: nowTime + 60 * DAY };
  }
}

/** 一场候选活动：调用方读好的事实 + （已登录且有计划时）判定结果。 */
export interface DiscoverCandidate {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  description?: string | null;
  priceYen?: number | null;
  capacity?: number | null;
  emoji: string;
  organizerId?: string | null;
  organizerName?: string | null;
  registrationCount?: number | null;
  badges?: readonly EventDiscoverBadge[];
  judge?: {
    score: number;
    verdict: "recommend" | "conditional" | "skip";
    reason?: string | null;
    reasonDetail?: string | null;
    meetCandidates?: readonly { emoji: string; label: string }[];
    knownAttendees?: readonly string[];
  } | null;
}

export interface DiscoverFeedbackEntry {
  eventId: string;
  organizerId?: string | null;
  reason: EventRecommendationDismissReason;
  /** The dismissed event's own facts at dismissal time (for 同时段 / 同地区 / 同主题). */
  startsAt?: string | null;
  area?: EventDiscoverArea | null;
  themes?: readonly EventDiscoverTheme[];
}

export const FEEDBACK_PENALTY = { content: 15, distance: 15, organizer: 25, schedule: 15 } as const;
export const ORGANIZER_DISMISS_LIMIT = 3;

const slot = (iso: string | null | undefined) => {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const parts = tokyoParts(time);
  return { day: parts.day, hour: Math.floor(parts.minute / 60) };
};

/** Ranking penalty for one candidate (0 = untouched); `hidden` = leaves the recommendation groups. */
export function feedbackEffect(candidate: { eventId: string; startsAt: string; organizerId?: string | null; area?: EventDiscoverArea | null; themes: readonly EventDiscoverTheme[] }, feedback: readonly DiscoverFeedbackEntry[]): { penalty: number; hidden: boolean } {
  let penalty = 0;
  let hidden = false;
  const own = slot(candidate.startsAt);
  const organizerCount = candidate.organizerId ? feedback.filter((entry) => entry.organizerId === candidate.organizerId).length : 0;
  for (const entry of feedback) {
    if (entry.eventId === candidate.eventId) { hidden = true; continue; }
    if (entry.reason === "known") continue;
    if (entry.reason === "schedule") {
      const other = slot(entry.startsAt);
      if (own && other && own.day === other.day && Math.abs(own.hour - other.hour) <= 1) penalty = Math.max(penalty, FEEDBACK_PENALTY.schedule);
    } else if (entry.reason === "distance") {
      if (candidate.area && entry.area && candidate.area === entry.area && candidate.area !== "online") penalty = Math.max(penalty, FEEDBACK_PENALTY.distance);
    } else if (entry.reason === "content") {
      if (candidate.organizerId && entry.organizerId === candidate.organizerId && (entry.themes ?? []).some((theme) => candidate.themes.includes(theme))) penalty = Math.max(penalty, FEEDBACK_PENALTY.content);
    }
  }
  if (organizerCount >= ORGANIZER_DISMISS_LIMIT) penalty += FEEDBACK_PENALTY.organizer;
  return { hidden, penalty };
}

export interface DiscoverInput {
  candidates: readonly DiscoverCandidate[];
  query: EventDiscoverParsedQuery;
  now: Date;
  /** null = signed out. */
  signedIn: boolean;
  hasPlan: boolean;
  planGoal?: string | null;
  followedOrganizers: ReadonlySet<string>;
  attendedOrganizers: ReadonlySet<string>;
  /** Events I already registered for / attended (never recommended back). */
  myEventIds: ReadonlySet<string>;
  feedback: readonly DiscoverFeedbackEntry[];
  /** Organizer ids allowed in community rows (members-only / early-access badges are read upstream). */
  hrefFor?: (eventId: string) => string;
}

const PLAN_FIT_ROWS = 3;
const COMMUNITY_ROWS = 3;
const ALL_ROWS = 50;

interface Enriched { candidate: DiscoverCandidate; area: EventDiscoverArea | null; themes: EventDiscoverTheme[]; formats: EventDiscoverFormat[]; time: number; end: number }

function enrich(candidate: DiscoverCandidate): Enriched {
  const text = [candidate.title, candidate.description, candidate.organizerName].filter(Boolean).join(" ");
  const time = Date.parse(candidate.startsAt);
  const end = Date.parse(candidate.endsAt ?? "");
  return { area: eventArea(candidate.venue), candidate, end: Number.isFinite(end) ? end : time, formats: eventFormats(text, candidate.capacity), themes: eventThemes(text), time };
}

function matches(item: Enriched, query: EventDiscoverParsedQuery, window: { from: number; to: number; ended?: true }, filters: { areas?: readonly EventDiscoverArea[]; themes?: readonly EventDiscoverTheme[] } = {}): boolean {
  if (!Number.isFinite(item.time)) return false;
  // 開催済み：结束时间落在 (from, to]；其余时期按重叠——已开始、还没结束的也算（DISCOVER-RULES D1 / D3）。
  if (window.ended ? item.end <= window.from || item.end > window.to : item.end <= window.from || item.time >= window.to) return false;
  const areas = filters.areas ?? query.areas;
  const themes = filters.themes ?? query.themes;
  if (areas.length && (!item.area || !areas.includes(item.area))) return false;
  if (themes.length && !themes.some((theme) => item.themes.includes(theme))) return false;
  if (query.formats.length && !query.formats.every((format) => item.formats.includes(format))) return false;
  if (query.freeOnly && item.candidate.priceYen !== 0) return false;
  return true;
}

export function buildDiscover(input: DiscoverInput, options: { dailyCandidates?: boolean } = {}): EventDiscoverResponse {
  const href = input.hrefFor ?? ((eventId: string) => `/events/${eventId}`);
  const enriched = input.candidates.map(enrich);
  const window = periodWindow(input.query, input.now);
  const matched = enriched.filter((item) => matches(item, input.query, window));
  const scored = input.signedIn && input.hasPlan;
  // 開催済み：不打分、不推荐，只按开始时间倒序列出（DISCOVER-RULES D4）。
  const past = input.query.period === "past";
  const effects = new Map(matched.map((item) => [item.candidate.eventId, feedbackEffect({ area: item.area, eventId: item.candidate.eventId, organizerId: item.candidate.organizerId, startsAt: item.candidate.startsAt, themes: item.themes }, input.feedback)]));
  const toRow = (item: Enriched, communityReason?: EventDiscoverCommunityReason | null): EventDiscoverRow => {
    const judge = scored && !past ? item.candidate.judge ?? null : null;
    return {
      area: item.area,
      emoji: item.candidate.emoji,
      endsAt: item.candidate.endsAt ?? null,
      eventId: item.candidate.eventId,
      href: href(item.candidate.eventId),
      organizerId: input.signedIn ? item.candidate.organizerId ?? null : null,
      organizerName: item.candidate.organizerName ?? null,
      priceYen: item.candidate.priceYen ?? null,
      registrationCount: item.candidate.registrationCount ?? null,
      startsAt: item.candidate.startsAt,
      title: item.candidate.title,
      venue: item.candidate.venue ?? null,
      ...(item.candidate.badges?.length ? { badges: item.candidate.badges } : {}),
      ...(communityReason ? { communityReason } : {}),
      ...(judge ? {
        score: judge.score,
        verdict: judge.verdict,
        ...(judge.reason ? { reason: judge.reason } : {}),
        ...(judge.reasonDetail ? { reasonDetail: judge.reasonDetail } : {}),
        ...(judge.meetCandidates?.length ? { meetCandidates: judge.meetCandidates } : {}),
        ...(judge.knownAttendees?.length ? { knownAttendees: judge.knownAttendees } : {}),
      } : {}),
    };
  };
  const rank = (item: Enriched) => (item.candidate.judge?.score ?? 0) - (effects.get(item.candidate.eventId)?.penalty ?? 0);
  const popularity = (a: Enriched, b: Enriched) => (b.candidate.registrationCount ?? 0) - (a.candidate.registrationCount ?? 0) || a.time - b.time;
  const byDate = (a: Enriched, b: Enriched) => a.time - b.time || a.candidate.eventId.localeCompare(b.candidate.eventId);
  const recommendable = (item: Enriched) => !effects.get(item.candidate.eventId)?.hidden && !input.myEventIds.has(item.candidate.eventId);

  // すべて：日付順；没有计划 / 未登录 → 人气順（DESIGN §9 #13）；planFirst 且有分 → 分数顺。
  const allSorted = [...matched].sort(past ? (a, b) => byDate(b, a) : !scored ? popularity : input.query.planFirst && input.query.sort === "recommended" ? (a, b) => rank(b) - rank(a) || byDate(a, b) : byDate);
  const planFitAll = scored && !past ? matched.filter((item) => recommendable(item) && item.candidate.judge && item.candidate.judge.verdict !== "skip")
    .sort(options.dailyCandidates
      ? (a, b) => (b.candidate.judge!.score - a.candidate.judge!.score) || a.candidate.eventId.localeCompare(b.candidate.eventId)
      : (a, b) => rank(b) - rank(a) || byDate(a, b)) : [];
  const community = input.signedIn && !past
    ? matched
      .filter((item) => recommendable(item) && item.candidate.organizerId && (input.followedOrganizers.has(item.candidate.organizerId) || input.attendedOrganizers.has(item.candidate.organizerId)))
      .sort(byDate)
      .slice(0, COMMUNITY_ROWS)
      .map((item) => toRow(item, input.followedOrganizers.has(item.candidate.organizerId!) ? "following" : "attended"))
    : [];

  // 结果很少（≤5）时给「条件を広げる」：每项单独放宽后多出的件数。
  const widen: EventDiscoverWidenSuggestion[] = [];
  if (input.signedIn && !past && matched.length <= 5) {
    const extraWith = (variant: Partial<EventDiscoverParsedQuery>, filters: { areas?: readonly EventDiscoverArea[]; themes?: readonly EventDiscoverTheme[] } = {}) => {
      const w = periodWindow({ ...input.query, ...variant }, input.now);
      return enriched.filter((item) => matches(item, { ...input.query, ...variant }, w, filters)).length - matched.length;
    };
    if (input.query.period === "this_week") { const extra = extraWith({ period: "this_month" }); if (extra > 0) widen.push({ extra, kind: "period", value: "this_month" }); }
    for (const area of ["osaka", "tokyo", "nagoya", "online"] as const) {
      if (!input.query.areas.length || input.query.areas.includes(area)) continue;
      const extra = extraWith({}, { areas: [...input.query.areas, area] });
      if (extra > 0) { widen.push({ extra, kind: "area", value: area }); break; }
    }
    if (input.query.themes.length) {
      for (const theme of ["funding", "saas", "management", "networking"] as const) {
        if (input.query.themes.includes(theme)) continue;
        const extra = extraWith({}, { themes: [...input.query.themes, theme] });
        if (extra > 0) { widen.push({ extra, kind: "theme", value: theme }); break; }
      }
    }
  }

  return {
    all: allSorted.slice(0, ALL_ROWS).map((item) => toRow(item)),
    community,
    planFit: (options.dailyCandidates ? planFitAll : planFitAll.slice(0, PLAN_FIT_ROWS)).map((item) => toRow(item)),
    planFitTotal: planFitAll.length,
    planGoal: scored ? input.planGoal ?? null : null,
    popularityFallback: !scored,
    total: matched.length,
    ...(widen.length ? { widen } : {}),
    ...(past ? {} : { pastTotal: enriched.filter((item) => matches(item, input.query, periodWindow({ period: "past" }, input.now))).length }),
    ...(input.signedIn ? {} : { signedOut: true }),
  };
}
