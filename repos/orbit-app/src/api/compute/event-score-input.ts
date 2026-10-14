/**
 * R26 契约 8 的事实 → `event-score.ts` 的 `EventScoreFacts`（events DESIGN §3.5 映射表，复核 M1）。全部规则，AI 不参与。
 * 评估页、计划概要、类型详情、今日のチャンス都经这里得到同一份计分输入，所以同一场活动三处分数一致。
 */
import type { EventAssessmentFacts } from "../contract/event-assessment";
import type { EventAttendeeSource, EventScoreFacts } from "./event-score";
import { formatFlags, networkingMinutesFromAgenda, agendaMinuteOfDay } from "./event-facts-derive";
import { parseTimestamp } from "./compute-text";

const FULL_WIDTH_DIGITS = /[０-９]/g;

/** The fact values the clients write when the person picks 無料 / オンライン (stored as facts, not UI text). */
export const EVENT_PRICE_FREE = "無料";
export const EVENT_AREA_ONLINE = "オンライン";

/**
 * 参加費字符串 → 日元（取上限）：「無料 / 0円 / Free」→ 0；「¥15,000 / 15000円 / 1.5万円」→ 15000；
 * 「3,000〜5,000円」→ 5000；「不明 / 未定 / 空」→ null（评分出区间）。
 */
export function parsePriceYen(price: string | null | undefined): number | null {
  if (price === null || price === undefined) return null;
  const text = price.replace(FULL_WIDTH_DIGITS, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0)).replace(/[，]/g, ",").trim();
  if (!text) return null;
  if (/不明|未定|tbd|unknown|要問合せ|お問い合わせ/i.test(text)) return null;
  if (/無料|free|免费|0\s*円|¥\s*0(?![\d,])/i.test(text) && !/[1-9]/.test(text.replace(/0\s*円/g, ""))) return 0;
  const values: number[] = [];
  const pattern = /(\d+(?:[.,]\d+)*)\s*(万)?/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]!;
    const number = match[2] ? Number(raw.replace(/,/g, "")) * 10_000 : Number(raw.replace(/,(?=\d{3}(\D|$))/g, "").replace(/,/g, ""));
    if (Number.isFinite(number)) values.push(Math.round(number));
  }
  if (values.length === 0) return /無料|free|免费/i.test(text) ? 0 : null;
  return Math.max(...values);
}

/** 东京时间的时段：周末 → weekend；平日 18 点后 → evening；其余平日 → daytime；认不出 → null。 */
export function eventTimeslot(startsAt: string | null | undefined): EventScoreFacts["timeslot"] {
  if (!startsAt) return null;
  const time = parseTimestamp(startsAt);
  if (!Number.isFinite(time)) return null;
  const { day, minute } = tokyoParts(time);
  if (day === 0 || day === 6) return "weekend";
  return minute >= 18 * 60 ? "evening" : "daytime";
}

const DAY_MS = 86_400_000;
/** 东京时间的星期（0 = 日）与一天中的分钟；不用 Date 对象（compute 规则）。 */
export function tokyoParts(time: number): { day: number; minute: number; dayIndex: number } {
  const tokyo = time + 9 * 3_600_000;
  const dayIndex = Math.floor(tokyo / DAY_MS);
  const day = (((dayIndex + 4) % 7) + 7) % 7;
  const minute = Math.floor((tokyo - dayIndex * DAY_MS) / 60_000);
  return { day, dayIndex, minute };
}

/** 东京时间的「一天中的分钟」（议程终点用）。 */
export function tokyoMinuteOfDay(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = parseTimestamp(iso);
  if (!Number.isFinite(time)) return agendaMinuteOfDay(iso);
  return tokyoParts(time).minute;
}

export interface EventScoreInputExtras {
  expected: Readonly<Record<string, number>>;
  attendeeSource: EventAttendeeSource;
  travelMinutes: number | null;
  firstDegree: number | null;
  secondDegree: number | null;
  /** 库内活动：主办方开了 event-ops 匹配 / 名札。 */
  matchingEnabled?: boolean | null;
  nameTags?: boolean | null;
  /** 库内活动直接给数字费用时优先（日元）。 */
  feeYen?: number | null;
}

/** 契约事实 + 规则推出的人级事实 → 计分输入。 */
export function toEventScoreFacts(facts: EventAssessmentFacts, extras: EventScoreInputExtras): EventScoreFacts {
  const flags = formatFlags({ agenda: facts.agenda, format: facts.format, matchingEnabled: extras.matchingEnabled, nameTags: extras.nameTags });
  let networkingMinutes = networkingMinutesFromAgenda(facts.agenda, tokyoMinuteOfDay(facts.endsAt));
  // 没有议程但页面写了有交流时间（format.networking）：按 30 分算，仍标推定（由 nameTags 等是否为 null 决定）。
  if (networkingMinutes === null && facts.format?.networking) networkingMinutes = 30;
  if (networkingMinutes === null && facts.format && facts.format.networking === false) networkingMinutes = 0;
  return {
    attendeeSource: extras.attendeeSource,
    exchangeCorner: flags.exchangeCorner,
    expected: extras.expected,
    fee: extras.feeYen !== undefined && extras.feeYen !== null ? extras.feeYen : parsePriceYen(facts.price),
    firstDegree: extras.firstDegree,
    matching: flags.matching,
    nameTags: flags.nameTags,
    networkingMinutes,
    secondDegree: extras.secondDegree,
    timeslot: eventTimeslot(facts.startsAt),
    travelMinutes: extras.travelMinutes,
  };
}
