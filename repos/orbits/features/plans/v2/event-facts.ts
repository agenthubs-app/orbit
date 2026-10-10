/**
 * R24 会える活動的事实来源（库内活动 → `event-score.ts` 的事实）。AI 不打分：这里只放能从数据里直接读到的事实，
 * 读不到的留 null（评分时标「推定」）。活动 URL / 海报的 AI 事实由 R26 补。
 *
 * - mock：演示世界的 3 场活动（`sample: true` 的世界，事实是示例）。
 * - live：R26 补参加者事实之前不读活动（见 `livePlanEventFacts`）。
 */
import type { EventScoreFacts } from "../../../shared/compute/event-score";
import { createConfiguredEventStartWindowReader } from "../../events/core/runtime";
import type { EventStartWindowReader } from "../../events/core/start-window";
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

/** R26 补上参加者事实前为 false：live 不读活动（复核 M3）。 */
export const PLAN_LIVE_EVENT_FACTS_READY = false;
/** 有界窗口：未来 60 天、最多 20 场。 */
export const PLAN_LIVE_EVENT_WINDOW_DAYS = 60;
export const PLAN_LIVE_EVENT_LIMIT = 20;

/**
 * live 的会える活動事实。
 *
 * 复核 M3：live 的事实里没有参加者构成（`expected` 恒为 `{}`），类型详情的会える活動与今日のチャンス的活动兜底
 * 因此必然为空；原来每次打开概要 / 类型详情 / pending 都全量读一遍活动表（`listPublishedEvents` → 整表），结果却用不上。
 * R26 补上参加者事实（参加者构成、费用、移动时间、交流形式）之前直接返回空、不做任何读取；
 * R26 打开 `ready` 后走有界的开始时间窗口读取（只取 id / 标题 / 开始时间三列，未来 60 天、最多 20 场），不再读整表。
 */
export function livePlanEventFacts(input: {
  ready?: boolean;
  window?: () => EventStartWindowReader | null;
  now?: () => Date;
} = {}): () => Promise<PlanEventFact[]> {
  return async () => {
    if (!(input.ready ?? PLAN_LIVE_EVENT_FACTS_READY)) return [];
    const reader = (input.window ?? createConfiguredEventStartWindowReader)();
    if (!reader) return [];
    const now = (input.now ?? (() => new Date()))();
    const until = new Date(now.getTime() + PLAN_LIVE_EVENT_WINDOW_DAYS * 86_400_000);
    const events = await reader.listPublishedStartingBetween(new Date(now.getTime() + 1).toISOString(), until.toISOString());
    return events.slice(0, PLAN_LIVE_EVENT_LIMIT).map((event) => ({
      eventId: event.eventId,
      facts: { ...UNKNOWN_EVENT_FACTS, attendeeSource: "none", expected: {}, timeslot: tokyoTimeslot(event.startsAt) },
      startsAt: event.startsAt,
      title: event.title,
      venue: null,
    }));
  };
}
