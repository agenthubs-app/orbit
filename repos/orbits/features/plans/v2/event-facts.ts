/**
 * R24 会える活動的事实来源（库内活动 → `event-score.ts` 的事实）。AI 不打分：这里只放能从数据里直接读到的事实，
 * 读不到的留 null（评分时标「推定」）。活动 URL / 海报的 AI 事实由 R26 补。
 *
 * - mock：演示世界的 3 场活动（`sample: true` 的世界，事实是示例）。
 * - live：canonical 活动目录里已发布、未开始的活动；目前只有时间与地点，参加者构成、费用、形式都没有 → 推定。
 */
import type { EventScoreFacts } from "../../../shared/compute/event-score";
import { createConfiguredEventCoreService } from "../../events/core/runtime";
import type { PlanEventFact } from "./overview";

// mock 的演示活动事实放在 mock 文件里（产品面审计：生产模块不直接 import shared/mock）。
export { demoPlanEventFacts } from "./mock-event-facts";

export const UNKNOWN_EVENT_FACTS: Omit<EventScoreFacts, "expected" | "attendeeSource" | "timeslot"> = {
  exchangeCorner: null, fee: null, firstDegree: null, matching: null, nameTags: null, networkingMinutes: null, secondDegree: null, travelMinutes: null,
};

/** 东京时间的时段：周末 → weekend；平日 18 点后 → evening；其余平日 → daytime。 */
export function tokyoTimeslot(startsAt: string): EventScoreFacts["timeslot"] {
  const time = Date.parse(startsAt);
  if (!Number.isFinite(time)) return null;
  const tokyo = new Date(time + 9 * 3_600_000);
  const day = tokyo.getUTCDay();
  if (day === 0 || day === 6) return "weekend";
  return tokyo.getUTCHours() >= 18 ? "evening" : "daytime";
}

export function livePlanEventFacts(): () => Promise<PlanEventFact[]> {
  return async () => {
    const core = createConfiguredEventCoreService();
    if (!core) return [];
    const now = new Date();
    const events = await core.listPublishedEvents(now);
    return events
      .filter((event) => event.phase === "upcoming" && Date.parse(event.startsAt) > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 20)
      .map((event) => ({
        eventId: event.eventId,
        facts: { ...UNKNOWN_EVENT_FACTS, attendeeSource: "none", expected: {}, timeslot: tokyoTimeslot(event.startsAt) },
        startsAt: event.startsAt,
        title: event.title,
        venue: (event as { venue?: string | null }).venue ?? null,
      }));
  };
}
