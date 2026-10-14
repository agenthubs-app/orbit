/**
 * R26「部分参加」提示（events DESIGN §3.5、b8 #4「午前のキーノートと VC セッション（10:00–12:30）だけの参加なら、時間対効果は 64 → 78」）。
 * 有带时间的议程、且只有一部分时段和目标相关时，算出只参加那一段的時間対効果；没有议程或全部相关 / 全部不相关时不出。规则，不调 AI。
 */
import type { EventAssessmentAgendaItem } from "../contract/event-assessment";
import { agendaMinuteOfDay } from "./event-facts-derive";
import { lowerText } from "./compute-text";

/** 只参加相关时段时，省下的时间折算进時間対効果的比例（全天活动省一半以上时约 +14）。 */
export const PARTIAL_ATTENDANCE_GAIN = 0.55;

const hhmm = (minute: number) => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;

export function partialAttendance(input: {
  agenda: readonly EventAssessmentAgendaItem[] | null | undefined;
  /** 目标相关的关键词（计划人物类型短名、目标模板关键词）。 */
  keywords: readonly string[];
  /** 活动终点（一天中的分钟），没有就用最后一条 + 30 分。 */
  endMinute?: number | null;
  /** 当前的時間対効果（0–100）。 */
  timeCost: number;
}): { window: string; timeCostAfter: number } | null {
  const items = (input.agenda ?? [])
    .map((item) => ({ start: agendaMinuteOfDay(item.at), title: item.title }))
    .filter((item): item is { start: number; title: string } => item.start !== null)
    .sort((a, b) => a.start - b.start);
  if (items.length < 2 || input.keywords.length === 0) return null;
  const end = input.endMinute ?? items[items.length - 1]!.start + 30;
  const words = input.keywords.map(lowerText).filter((word) => word.length >= 2);
  const relevant = items.map((item, index) => ({
    end: items[index + 1]?.start ?? end,
    hit: words.some((word) => lowerText(item.title).includes(word)),
    start: item.start,
  }));
  const hits = relevant.filter((item) => item.hit);
  if (hits.length === 0 || hits.length === relevant.length) return null;
  // 第一段相关 → 最后一段相关，连成一个窗口。
  const from = hits[0]!.start;
  const to = hits[hits.length - 1]!.end;
  const total = end - items[0]!.start;
  if (total <= 0 || to - from >= total) return null;
  const saved = 1 - (to - from) / total;
  const after = Math.min(100, Math.round(input.timeCost + saved * (100 - input.timeCost) * PARTIAL_ATTENDANCE_GAIN));
  if (after <= input.timeCost) return null;
  return { timeCostAfter: after, window: `${hhmm(from)}–${hhmm(to)}` };
}
