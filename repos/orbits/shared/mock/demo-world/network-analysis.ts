// R11b 人脈分析（演示世界）：人只从 index.ts 取（RD-22），这里只补分析要用的属性（业界 / 城市 / 出会った場所 / 职级 / 段階 /
// 加入与最近接点的天数 / 要フォロー）。「目標に関係」= 示例计划里已关联的人；需求 = 示例计划的人物类型（目标人数 vs 已关联）。
import { DEMO_PEOPLE, DEMO_PLAN, DEMO_TODOS } from "./index";

export interface DemoNetworkAnalysisPerson {
  id: string;
  name: string;
  organization: string;
  role: string;
  primaryIndustryId: string;
  city: string | null;
  metKind: "event" | "referral" | "visit" | "other";
  seniorityLevel: string | null;
  status: "active" | "nurture";
  /** Days before the demo day. */
  addedDaysAgo: number;
  lastTouchDaysAgo: number | null;
  sample: true;
}

const ATTRIBUTES: Record<string, Omit<DemoNetworkAnalysisPerson, "id" | "name" | "organization" | "role" | "sample">> = {
  "demo-person-watanabe": { primaryIndustryId: "technology_internet", city: "Tokyo", metKind: "event", seniorityLevel: "founder", status: "nurture", addedDaysAgo: 120, lastTouchDaysAgo: 6 },
  "demo-person-takahashi": { primaryIndustryId: "finance_investment", city: "Tokyo", metKind: "event", seniorityLevel: "vp", status: "nurture", addedDaysAgo: 200, lastTouchDaysAgo: 12 },
  "demo-person-yamamoto": { primaryIndustryId: "finance_investment", city: "Tokyo", metKind: "referral", seniorityLevel: "manager", status: "active", addedDaysAgo: 160, lastTouchDaysAgo: 104 },
  "demo-person-aoki": { primaryIndustryId: "technology_internet", city: "Tokyo", metKind: "event", seniorityLevel: "c_level", status: "active", addedDaysAgo: 40, lastTouchDaysAgo: 20 },
  "demo-person-kobayashi": { primaryIndustryId: "community_nonprofit", city: "Tokyo", metKind: "visit", seniorityLevel: "founder", status: "nurture", addedDaysAgo: 300, lastTouchDaysAgo: 45 },
  "demo-person-ito": { primaryIndustryId: "finance_investment", city: "Osaka", metKind: "referral", seniorityLevel: "manager", status: "active", addedDaysAgo: 90, lastTouchDaysAgo: null },
  "demo-person-sasaki": { primaryIndustryId: "finance_investment", city: "Tokyo", metKind: "other", seniorityLevel: "manager", status: "active", addedDaysAgo: 15, lastTouchDaysAgo: null },
  "demo-person-suzuki": { primaryIndustryId: "manufacturing_supply_chain", city: "Nagoya", metKind: "event", seniorityLevel: "director", status: "nurture", addedDaysAgo: 75, lastTouchDaysAgo: 38 },
  "demo-person-matsui": { primaryIndustryId: "technology_internet", city: "Tokyo", metKind: "event", seniorityLevel: "individual_contributor", status: "active", addedDaysAgo: 8, lastTouchDaysAgo: 8 },
  "demo-person-okada": { primaryIndustryId: "finance_investment", city: null, metKind: "other", seniorityLevel: "individual_contributor", status: "active", addedDaysAgo: 4, lastTouchDaysAgo: null },
};

export const DEMO_NETWORK_ANALYSIS_PEOPLE: readonly DemoNetworkAnalysisPerson[] = DEMO_PEOPLE.map((person) => ({
  id: person.id, name: person.name, organization: person.company, role: person.role, ...ATTRIBUTES[person.id]!, sample: true as const,
}));

export const DEMO_NETWORK_ANALYSIS_GOAL_IDS: readonly string[] = [...new Set(DEMO_PLAN.personTypes.filter((type) => !type.skipped).flatMap((type) => [...type.personIds]))].sort();

export const DEMO_NETWORK_ANALYSIS_FOLLOW_UP_IDS: readonly string[] = [...new Set(DEMO_TODOS.flatMap((todo) => (todo.personId ? [todo.personId] : [])))].sort();

/** The plan's person types as needs (target vs already linked). */
export const DEMO_NETWORK_ANALYSIS_NEEDS = DEMO_PLAN.personTypes.map((type) => ({
  planId: DEMO_PLAN.id, needId: type.key, title: type.label, primaryIndustryId: type.key === "cvc" || type.key === "vc_partner" || type.key === "angel" ? "finance_investment" : null,
  targetCount: type.target, linkedCount: type.personIds.length, skipped: type.skipped, sample: true as const,
}));
