/**
 * R26 5 项 → 3 个展示维度（events DESIGN §3.5、附录 D-c）：
 * 目標との一致 = (適合 + 確度) / 60、会える人 = (つながり + 形式) / 20、時間対効果 = 時間とコスト / 20，各换算到 0–100、四舍五入。
 * 评估页、计划页「会える活動 · 内訳」用同一个函数（复核：两处同源）。
 */
import type { EventAssessmentDisplay } from "../contract/event-assessment";
import { EVENT_SCORE_MAX, type EventScoreCriterion } from "./event-score";

const pct = (value: number, max: number) => Math.max(0, Math.min(100, Math.round((value / max) * 100)));

export function eventDisplayFromItems(
  items: readonly { criterion: EventScoreCriterion; score: number }[],
  timeCostRange?: { timeCostMin: number; timeCostMax: number } | null,
): EventAssessmentDisplay {
  const of = (criterion: EventScoreCriterion) => items.find((item) => item.criterion === criterion)?.score ?? 0;
  const goalMax = EVENT_SCORE_MAX.fit + EVENT_SCORE_MAX.confidence;
  const peopleMax = EVENT_SCORE_MAX.connections + EVENT_SCORE_MAX.format;
  const timeCost = { value: pct(of("timeCost"), EVENT_SCORE_MAX.timeCost) } as EventAssessmentDisplay["timeCost"];
  if (timeCostRange) {
    timeCost.min = pct(timeCostRange.timeCostMin, EVENT_SCORE_MAX.timeCost);
    timeCost.max = pct(timeCostRange.timeCostMax, EVENT_SCORE_MAX.timeCost);
  }
  return {
    goalFit: { value: pct(of("fit") + of("confidence"), goalMax) },
    people: { value: pct(of("connections") + of("format"), peopleMax) },
    timeCost,
  };
}

/** 「55–70」或「64」。 */
export function displayValueText(value: { value: number; min?: number; max?: number }): string {
  return value.min !== undefined && value.max !== undefined && value.min !== value.max ? `${value.min}–${value.max}` : String(value.value);
}
