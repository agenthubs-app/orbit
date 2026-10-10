/**
 * R24 会える活動 / 活动评估的固定评分（DESIGN §8 R26 行、b10 规范板「イベントスコアの基準」）。两端共用。
 *
 * - 5 项固定标准：① 会える人の適合 45 · ② 推定の確度 15 · ③ 時間とコスト 20 · ④ 既存のつながり 10 · ⑤ 交流の形式 10。
 * - AI 只填事实（人数、金额、时间、有无），点数只由这里的公式算：同样的事实 → 同样的分。
 * - ① 用「剩余目标人数 × 每人分值」加权：这类人见得越多，同一个会的分越低（例：B 见到 1 人后 82 → 76）。
 * - 取不到的事实：该项按默认值并标「推定」，② 每个推定项 −2。
 * - 阈值：≥70 おすすめ（recommend）、50–69 条件付き（conditional）、<50 見送り（skip）。
 */
export const EVENT_SCORE_RUBRIC_VERSION = "event-score-v2";
export const EVENT_SCORE_MAX = { connections: 10, confidence: 15, fit: 45, format: 10, timeCost: 20 } as const;
export const EVENT_SCORE_RECOMMEND = 70;
export const EVENT_SCORE_CONDITIONAL = 50;
/** 一场活动里能聊到的同类人比例（预计到场 × 0.25）。 */
export const EVENT_MEET_RATE = 0.25;

export type EventScoreCriterion = keyof typeof EVENT_SCORE_MAX;

/** 事实来源：申込者タグ公開 > 登壇者のみ公開 > 過去回 > 主催者の説明 > なし。 */
export type EventAttendeeSource = "registrants" | "speakers" | "past" | "organizer" | "none";

export interface EventScorePreferences {
  /** 费用上限（日元）。 */
  maxFee: number;
  /** 移动时间上限（分钟）。 */
  maxTravelMinutes: number;
  /** 平日夜可。 */
  weekdayEvening: boolean;
}

/** 默认偏好（R26 定存储；R24 用默认值）：平日夜可 · 移动 60 分 · ¥5,000 まで。 */
export const DEFAULT_EVENT_SCORE_PREFERENCES: EventScorePreferences = { maxFee: 5000, maxTravelMinutes: 60, weekdayEvening: true };

export interface EventScoreType {
  key: string;
  allocation: number;
  targetCount: number;
  /** 已计入 base 的人数。 */
  metCount: number;
  skipped: boolean;
}

export interface EventScoreFacts {
  /** 每类人预计到场人数（typeKey → 人数）。 */
  expected: Readonly<Record<string, number>>;
  attendeeSource: EventAttendeeSource;
  fee: number | null;
  travelMinutes: number | null;
  /** 时段：evening = 平日夜 / weekend；daytime = 平日日间；null = 不明。 */
  timeslot: "evening" | "weekend" | "daytime" | null;
  /** 人脉里参加的人（一度）与二度。 */
  firstDegree: number | null;
  secondDegree: number | null;
  /** 交流时间（分钟）、名札、匹配、展示 / 名刺交換コーナー。 */
  networkingMinutes: number | null;
  nameTags: boolean | null;
  matching: boolean | null;
  exchangeCorner: boolean | null;
}

export interface EventScoreItem {
  criterion: EventScoreCriterion;
  score: number;
  max: number;
  estimated: boolean;
}

export interface EventScoreResult {
  total: number;
  verdict: "recommend" | "conditional" | "skip";
  items: EventScoreItem[];
  rubricVersion: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** ① 会える人の適合（0–45）。 */
export function fitScore(types: readonly EventScoreType[], expected: Readonly<Record<string, number>>): number {
  let gain = 0;
  let potential = 0;
  for (const type of types) {
    if (type.skipped || type.targetCount <= 0) continue;
    const remaining = Math.max(0, type.targetCount - type.metCount);
    if (remaining === 0) continue;
    const unit = type.allocation / type.targetCount;
    potential += remaining * unit;
    gain += Math.min(remaining, Math.max(0, expected[type.key] ?? 0) * EVENT_MEET_RATE) * unit;
  }
  if (potential <= 0) return 0;
  return Math.round(EVENT_SCORE_MAX.fit * clamp(gain / potential, 0, 1));
}

const SOURCE_CONFIDENCE: Record<EventAttendeeSource, number> = { none: 3, organizer: 6, past: 9, registrants: 12, speakers: 10 };

export function scoreEvent(input: { types: readonly EventScoreType[]; facts: EventScoreFacts; preferences?: EventScorePreferences }): EventScoreResult {
  const preferences = input.preferences ?? DEFAULT_EVENT_SCORE_PREFERENCES;
  const facts = input.facts;
  const fit = fitScore(input.types, facts.expected);

  // ③ 時間とコスト：费 8 · 移动 6 · 时段 6。
  const feeKnown = facts.fee !== null;
  const fee = feeKnown ? Math.round(8 * Math.max(0, 1 - facts.fee! / (2 * preferences.maxFee))) : 4;
  const travelKnown = facts.travelMinutes !== null;
  const travel = travelKnown ? Math.round(6 * Math.max(0, 1 - facts.travelMinutes! / (2 * preferences.maxTravelMinutes))) : 3;
  const slotKnown = facts.timeslot !== null;
  const slot = !slotKnown ? 3 : facts.timeslot === "daytime" ? 3 : facts.timeslot === "weekend" ? 6 : preferences.weekdayEvening ? 6 : 3;
  const timeCostEstimated = !feeKnown || !travelKnown || !slotKnown;

  // ④ 既存のつながり。
  const connectionsEstimated = facts.firstDegree === null && facts.secondDegree === null;
  const connections = connectionsEstimated ? 3 : clamp(Math.round(3 + 4 * (facts.firstDegree ?? 0) + 1.5 * (facts.secondDegree ?? 0)), 0, EVENT_SCORE_MAX.connections);

  // ⑤ 交流の形式。
  const formatEstimated = facts.networkingMinutes === null && facts.nameTags === null && facts.matching === null && facts.exchangeCorner === null;
  const minutes = facts.networkingMinutes ?? 0;
  const format = formatEstimated
    ? 3
    : clamp((minutes >= 30 ? 7 : minutes > 0 ? 4 : 0) + (facts.nameTags ? 3 : 0) + (facts.matching ? 2 : 0) + (facts.exchangeCorner ? 3 : 0), 0, EVENT_SCORE_MAX.format);

  // ② 推定の確度：来源 − 每个推定项 2。
  const estimatedCount = [timeCostEstimated, connectionsEstimated, formatEstimated].filter(Boolean).length;
  const confidence = clamp(SOURCE_CONFIDENCE[facts.attendeeSource] - 2 * estimatedCount, 0, EVENT_SCORE_MAX.confidence);

  const items: EventScoreItem[] = [
    { criterion: "fit", estimated: facts.attendeeSource === "none", max: EVENT_SCORE_MAX.fit, score: fit },
    { criterion: "confidence", estimated: false, max: EVENT_SCORE_MAX.confidence, score: confidence },
    { criterion: "timeCost", estimated: timeCostEstimated, max: EVENT_SCORE_MAX.timeCost, score: fee + travel + slot },
    { criterion: "connections", estimated: connectionsEstimated, max: EVENT_SCORE_MAX.connections, score: connections },
    { criterion: "format", estimated: formatEstimated, max: EVENT_SCORE_MAX.format, score: format },
  ];
  const total = items.reduce((sum, item) => sum + item.score, 0);
  return { items, rubricVersion: EVENT_SCORE_RUBRIC_VERSION, total, verdict: eventVerdict(total) };
}

export function eventVerdict(total: number): EventScoreResult["verdict"] {
  return total >= EVENT_SCORE_RECOMMEND ? "recommend" : total >= EVENT_SCORE_CONDITIONAL ? "conditional" : "skip";
}
