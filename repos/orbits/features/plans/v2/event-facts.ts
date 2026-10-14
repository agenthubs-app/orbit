/**
 * R24 会える活動的事实来源（库内活动 → `event-score.ts` 的事实）。AI 不打分：这里只放能从数据里直接读到的事实，
 * 读不到的留 null（评分时标「推定」）。活动 URL / 海报的 AI 事实由 R26 补。
 *
 * - mock：演示世界的 3 场活动（`sample: true` 的世界，事实是示例）。
 * - live：R26 起打开（见 `livePlanEventFacts`：我的外部评估 → 我的活动 → 公开活动，有界）。
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

/**
 * R26（DESIGN §6.2-1，D53，交接表 R26-03）：参加者构成、费用、移动时间、交流形式的事实已补上，live 打开。
 * 常量，不做环境开关；回退 = 改回 false 发版（`plan-event-facts-live.test.ts` 守住两种状态）。
 */
export const PLAN_LIVE_EVENT_FACTS_READY = true;
/** 有界窗口：未来 60 天、最多 20 场。 */
export const PLAN_LIVE_EVENT_WINDOW_DAYS = 60;
export const PLAN_LIVE_EVENT_LIMIT = 20;

/**
 * R26：live 事实的来源（由 service-factory 注入，避免计划模块直接依赖活动评估模块）。
 * - `myExternal`：我加入计划的外部评估（只对本人，复核 S1）；
 * - `myEventIds`：我报名 / 加入计划的库内活动；
 * - `orbitFacts`：库内活动的事实（活动级缓存 + 人级现算，`events/assessment/orbit-event-facts.ts`）。
 */
export interface LivePlanEventSources {
  myExternal(window: { from: string; until: string; limit: number }): Promise<PlanEventFact[]>;
  myEventIds(window: { from: string; until: string; limit: number }): Promise<string[]>;
  orbitFacts(events: readonly { eventId: string; title: string; startsAt: string }[]): Promise<PlanEventFact[]>;
}

/**
 * live 的会える活動事实（R26 新签名带 actor）。
 *
 * 合并顺序：我的外部评估 → 我报名 / 加入计划的库内活动 → 公开活动补足；总数 ≤20、未来 60 天（我的活动不会被公开活动挤掉）。
 * 公开活动只读开始时间窗口（三列）；事实由 `sources.orbitFacts` 给（没有注入时退回只有时段的最小事实，计分标「推定」）。
 * `ready = false`（常量回退）时不做任何读取，返回空（复核 M3）。
 */
export function livePlanEventFacts(input: {
  actorId?: string;
  workspaceId?: string;
  ready?: boolean;
  window?: () => EventStartWindowReader | null;
  now?: () => Date;
  sources?: () => Promise<LivePlanEventSources | null>;
} = {}): () => Promise<PlanEventFact[]> {
  return async () => {
    if (!(input.ready ?? PLAN_LIVE_EVENT_FACTS_READY)) return [];
    const now = (input.now ?? (() => new Date()))();
    const from = new Date(now.getTime() + 1).toISOString();
    const until = new Date(now.getTime() + PLAN_LIVE_EVENT_WINDOW_DAYS * 86_400_000).toISOString();
    const window = { from, limit: PLAN_LIVE_EVENT_LIMIT, until };
    const sources = input.sources ? await input.sources().catch(() => null) : null;
    const out: PlanEventFact[] = [];
    const seen = new Set<string>();
    const push = (fact: PlanEventFact) => {
      if (out.length >= PLAN_LIVE_EVENT_LIMIT || seen.has(fact.eventId)) return;
      seen.add(fact.eventId);
      out.push(fact);
    };
    if (sources) {
      for (const fact of await sources.myExternal(window)) push(fact);
    }
    const reader = (input.window ?? createConfiguredEventStartWindowReader)();
    const published = reader ? await reader.listPublishedStartingBetween(from, until) : [];
    const mine = sources ? new Set(await sources.myEventIds(window)) : new Set<string>();
    const ordered = [...published.filter((event) => mine.has(event.eventId)), ...published.filter((event) => !mine.has(event.eventId))].slice(0, Math.max(0, PLAN_LIVE_EVENT_LIMIT - out.length));
    if (sources && ordered.length) {
      for (const fact of await sources.orbitFacts(ordered)) push(fact);
      return out;
    }
    for (const event of ordered) {
      push({ eventId: event.eventId, facts: { ...UNKNOWN_EVENT_FACTS, attendeeSource: "none", expected: {}, timeslot: tokyoTimeslot(event.startsAt) }, startsAt: event.startsAt, title: event.title, venue: null });
    }
    return out;
  };
}
