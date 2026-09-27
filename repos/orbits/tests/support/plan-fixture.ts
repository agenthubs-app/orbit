/**
 * W0007 计划测试共用的输入：一份三个月、三阶段、四类条目齐全的计划。
 */
import type { CreatePlanVersionInput, NewPlanItemInput } from "../../features/plans/contract";

export const PLAN_PHASES: CreatePlanVersionInput["phases"] = [
  { endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "摸清市场" },
  { endWeek: 8, granularity: "week", key: "p2", startWeek: 5, title: "建立渠道" },
  { endWeek: 13, granularity: "week", key: "p3", startWeek: 9, title: "拿下试用" },
];

export const PLAN_ITEMS: NewPlanItemInput[] = [
  { kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "整理 20 家目标客户名单" },
  { kind: "action", phaseKey: "p1", suggestedWeek: 2, title: "约两位行业前辈喝咖啡" },
  {
    criteria: {
      description: "能介绍日本渠道的人",
      primaryIndustryId: "trade_logistics",
      secondaryIndustryId: null,
      titleKeywords: ["渠道", "BD"],
    },
    kind: "network_need",
    phaseKey: "p2",
    title: "日本市场的渠道伙伴",
  },
  { kind: "info", phaseKey: "p1", title: "日本 SaaS 采购一般要多久" },
  { kind: "event", linkedEventId: "event:tokyo-saas-night", phaseKey: "p2", title: "Tokyo SaaS Night" },
];

export function planInput(overrides: Partial<CreatePlanVersionInput> = {}): CreatePlanVersionInput {
  return {
    analysis: { summary: "先摸清市场，再建渠道。" },
    goalSnapshot: "三个月内拿到 10 家企业客户的试用（3 个月内）",
    horizon: "quarter",
    items: PLAN_ITEMS,
    phases: PLAN_PHASES,
    sourceSessionId: "session:plan-bootstrap",
    startsOn: "2026-09-28",
    ...overrides,
  };
}

/** 递增的确定性时间戳。 */
export function steppingClock(start = Date.UTC(2026, 8, 28, 1, 0, 0)): () => string {
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
}
