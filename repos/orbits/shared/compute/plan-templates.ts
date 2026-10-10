/**
 * R22 计划 v2.2 的目标模板（DESIGN §3.4，数值与 b10「8 · 规范板」一致，两端共用）。
 *
 * 每类目标：① 必要な力 8 项（固定，不是 AI 现想）；② 题库 6–8 问（AI 只从这里挑 ≤5 问）；
 * ③ 人物类型配点模板（含イベント枠，合计 100，5 分一档；AI 只能 ±5、最多 2 处）；
 * ④ 枠 × 行业的固定短名（AI 不起名，只从候选里选）；⑤ 目标类型推测的关键词（C1 失败时用）。
 * 这里只放 id 和数字；三语文字在 `plan-template-copy.ts`。
 */
import type { PlanGoalKind } from "../contract/plan-v2";
import type { IndustryIdCode } from "../contract/industries";
import { lowerText } from "./compute-text";

export const PLAN_GOAL_KINDS = ["launch", "fundraising", "sales", "hiring", "partnership", "career"] as const satisfies readonly PlanGoalKind[];

/** 选题最多几问；AI 调整配点：每处 ±5、最多 2 处。 */
export const PLAN_QUESTION_LIMIT = 5;
export const PLAN_TEMPLATE_ADJUST_STEP = 5;
export const PLAN_TEMPLATE_ADJUST_MAX_SLOTS = 2;
/** 目的の階段：4 级，用户原文放第 2 级。 */
export const PLAN_PURPOSE_LADDER_LEVELS = 4;
export const PLAN_PURPOSE_ORIGINAL_LEVEL = 2;

export type PlanQuestionType = "single" | "multi";

export interface PlanQuestionTemplate {
  /** 题库编号（R1、F2 …），界面右上角显示。 */
  id: string;
  type: PlanQuestionType;
  options: readonly string[];
}

export interface PlanSlotTemplate {
  /** 枠 id（`event` = イベント枠）。 */
  slot: string;
  allocation: number;
  targetCount: number;
  emoji: string;
}

export interface PlanGoalTemplate {
  kind: PlanGoalKind;
  emoji: string;
  capabilities: readonly string[];
  questions: readonly PlanQuestionTemplate[];
  slots: readonly PlanSlotTemplate[];
  keywords: readonly string[];
}

export const PLAN_EVENT_SLOT = "event";

export const PLAN_GOAL_TEMPLATES: Readonly<Record<PlanGoalKind, PlanGoalTemplate>> = {
  launch: {
    capabilities: ["product", "ai_data", "ops_infra", "design", "brand", "sales", "marketing", "pricing"],
    emoji: "🚀",
    keywords: ["上市", "収益", "黒字", "売上", "ローンチ", "リリース", "有料", "マネタイズ", "launch", "revenue", "monetize", "收入", "盈利", "变现", "落地"],
    kind: "launch",
    questions: [
      { id: "R1", options: ["idea", "building", "beta", "paying"], type: "single" },
      { id: "R2", options: ["individuals", "businesses", "both", "undecided"], type: "single" },
      { id: "R3", options: ["decided", "draft", "none"], type: "single" },
      { id: "R4", options: ["free_first", "subscription", "per_use", "undecided"], type: "single" },
      { id: "R5", options: ["direct", "substitute", "none_known"], type: "single" },
      { id: "R6", options: ["side_under10", "side_10to20", "fulltime"], type: "single" },
      { id: "R7", options: ["recruit", "outsource", "learn"], type: "multi" },
      { id: "R8", options: ["interviews", "ads", "sales_calls", "nothing_yet"], type: "multi" },
    ],
    slots: [
      { allocation: 25, emoji: "🎪", slot: "first_payer", targetCount: 5 },
      { allocation: 15, emoji: "🎨", slot: "brand_pr", targetCount: 2 },
      { allocation: 15, emoji: "📇", slot: "prior_product", targetCount: 2 },
      { allocation: 15, emoji: "🛠️", slot: "same_path_founder", targetCount: 3 },
      { allocation: 10, emoji: "🖌️", slot: "missing_expert", targetCount: 2 },
      { allocation: 5, emoji: "🙋", slot: "heavy_user", targetCount: 1 },
      { allocation: 15, emoji: "🎟️", slot: "event", targetCount: 3 },
    ],
  },
  fundraising: {
    capabilities: ["pitch", "financial_model", "metrics", "investor_relations", "legal_admin", "product", "market_research", "storytelling"],
    emoji: "💰",
    keywords: ["資金調達", "調達", "シリーズ", "シード", "出資", "投資家", "VC", "fundraising", "raise", "investor", "seed", "series", "融资", "投资"],
    kind: "fundraising",
    questions: [
      { id: "F1", options: ["seed", "series_a", "series_b_plus", "undecided"], type: "single" },
      { id: "F2", options: ["pre_revenue", "early_revenue", "growing", "profitable"], type: "single" },
      { id: "F3", options: ["has_lead", "has_existing", "none"], type: "single" },
      { id: "F4", options: ["first_time", "raised_before"], type: "single" },
      { id: "F5", options: ["within_3m", "within_6m", "within_12m", "undecided"], type: "single" },
      { id: "F6", options: ["yes", "maybe", "no"], type: "single" },
      { id: "F7", options: ["side_under10", "side_10to20", "fulltime"], type: "single" },
    ],
    slots: [
      { allocation: 10, emoji: "📊", slot: "cfo", targetCount: 1 },
      { allocation: 15, emoji: "🧗", slot: "funded_founder", targetCount: 3 },
      { allocation: 10, emoji: "👼", slot: "angel", targetCount: 2 },
      { allocation: 30, emoji: "🏦", slot: "vc_partner", targetCount: 3 },
      { allocation: 15, emoji: "🏢", slot: "cvc", targetCount: 3 },
      { allocation: 10, emoji: "⚖️", slot: "lawyer", targetCount: 1 },
      { allocation: 10, emoji: "🎟️", slot: "event", targetCount: 2 },
    ],
  },
  sales: {
    capabilities: ["product_knowledge", "prospecting", "proposal", "negotiation", "industry_network", "marketing", "customer_success", "pricing"],
    emoji: "🤝",
    keywords: ["新規", "開拓", "顧客", "営業", "商談", "受注", "販路", "sales", "customer", "client", "leads", "客户", "销售", "获客"],
    kind: "sales",
    questions: [
      { id: "S1", options: ["under_100k", "100k_1m", "over_1m"], type: "single" },
      { id: "S2", options: ["smb", "mid", "enterprise", "public"], type: "single" },
      { id: "S3", options: ["none", "1to5", "over5"], type: "single" },
      { id: "S4", options: ["yes", "sometimes", "no"], type: "single" },
      { id: "S5", options: ["high", "some", "none"], type: "single" },
      { id: "S6", options: ["alone", "small_team", "team"], type: "single" },
    ],
    slots: [
      { allocation: 30, emoji: "🧑‍💼", slot: "decision_maker", targetCount: 3 },
      { allocation: 20, emoji: "🏭", slot: "field_lead", targetCount: 4 },
      { allocation: 15, emoji: "🔗", slot: "introducer", targetCount: 3 },
      { allocation: 10, emoji: "🧭", slot: "senior_seller", targetCount: 2 },
      { allocation: 10, emoji: "🏛️", slot: "industry_body", targetCount: 2 },
      { allocation: 15, emoji: "🎟️", slot: "event", targetCount: 3 },
    ],
  },
  hiring: {
    capabilities: ["job_design", "employer_brand", "sourcing", "interviewing", "compensation", "onboarding", "network", "hr_admin"],
    emoji: "🧑‍💼",
    keywords: ["採用", "採る", "人材", "エンジニアを", "仲間を", "hiring", "recruit", "hire", "招聘", "招人"],
    kind: "hiring",
    questions: [
      { id: "H1", options: ["one", "two_to_three", "four_plus"], type: "single" },
      { id: "H2", options: ["fulltime", "contract", "side_job", "flexible"], type: "single" },
      { id: "H3", options: ["referral", "job_board", "agency", "none_yet"], type: "multi" },
      { id: "H4", options: ["mission", "growth", "compensation", "work_style"], type: "multi" },
      { id: "H5", options: ["within_1m", "within_3m", "within_6m", "undecided"], type: "single" },
      { id: "H6", options: ["alone", "with_team", "outsourced"], type: "single" },
    ],
    slots: [
      { allocation: 30, emoji: "🙋", slot: "candidate", targetCount: 5 },
      { allocation: 20, emoji: "🔗", slot: "referrer", targetCount: 4 },
      { allocation: 15, emoji: "🧭", slot: "senior_peer", targetCount: 3 },
      { allocation: 10, emoji: "📋", slot: "recruiter", targetCount: 2 },
      { allocation: 10, emoji: "🎪", slot: "community_host", targetCount: 2 },
      { allocation: 15, emoji: "🎟️", slot: "event", targetCount: 3 },
    ],
  },
  partnership: {
    capabilities: ["business_dev", "product", "legal_ip", "negotiation", "industry_network", "technical_integration", "marketing", "finance"],
    emoji: "🔗",
    keywords: ["提携", "協業", "アライアンス", "パートナー", "共同", "partnership", "alliance", "partner", "合作", "联盟"],
    kind: "partnership",
    questions: [
      { id: "P1", options: ["sales_channel", "technology", "brand", "funding"], type: "multi" },
      { id: "P2", options: ["startup", "mid", "enterprise", "public"], type: "single" },
      { id: "P3", options: ["product", "customers", "technology", "data"], type: "multi" },
      { id: "P4", options: ["simple", "committee", "unknown"], type: "single" },
      { id: "P5", options: ["met_before", "via_intro", "none"], type: "single" },
      { id: "P6", options: ["referral", "reseller", "joint_development", "capital"], type: "single" },
    ],
    slots: [
      { allocation: 30, emoji: "🏢", slot: "partner_lead", targetCount: 3 },
      { allocation: 15, emoji: "🏭", slot: "partner_field", targetCount: 3 },
      { allocation: 15, emoji: "🤝", slot: "alliance_veteran", targetCount: 3 },
      { allocation: 15, emoji: "🔗", slot: "introducer", targetCount: 3 },
      { allocation: 10, emoji: "⚖️", slot: "legal_ip", targetCount: 1 },
      { allocation: 15, emoji: "🎟️", slot: "event", targetCount: 3 },
    ],
  },
  career: {
    capabilities: ["domain_skill", "portfolio", "network", "interviewing", "language", "certification", "personal_brand", "negotiation"],
    emoji: "🧭",
    keywords: ["転職", "キャリア", "就職", "独立", "職種", "career", "job", "switch", "跳槽", "转行", "求职"],
    kind: "career",
    questions: [
      { id: "K1", options: ["under3y", "3to10y", "over10y"], type: "single" },
      { id: "K2", options: ["same_field", "new_field", "independent"], type: "single" },
      { id: "K3", options: ["within_3m", "within_1y", "someday"], type: "single" },
      { id: "K4", options: ["skills", "results", "network", "not_sure"], type: "multi" },
      { id: "K5", options: ["income", "location", "work_style", "role"], type: "multi" },
      { id: "K6", options: ["active", "some", "none"], type: "single" },
    ],
    slots: [
      { allocation: 30, emoji: "🧑‍💻", slot: "practitioner", targetCount: 5 },
      { allocation: 20, emoji: "🔀", slot: "switcher", targetCount: 4 },
      { allocation: 15, emoji: "📋", slot: "hiring_side", targetCount: 3 },
      { allocation: 10, emoji: "🧑‍🏫", slot: "mentor", targetCount: 1 },
      { allocation: 10, emoji: "👥", slot: "peer", targetCount: 2 },
      { allocation: 15, emoji: "🎟️", slot: "event", targetCount: 3 },
    ],
  },
};

/**
 * 枠 × 行业的固定短名：短名 id = `<slot>`（通用）或 `<slot>@<industry>`（行业覆盖）。
 * AI 只能从 `planShortNameCandidates` 给出的 id 里选；文字在 `plan-template-copy.ts`。
 */
export const PLAN_SHORT_NAME_OVERRIDES: Readonly<Record<string, readonly IndustryIdCode[]>> = {
  first_payer: ["community_nonprofit", "media_creative", "retail_consumer"],
  prior_product: ["technology_internet"],
  decision_maker: ["manufacturing_supply_chain", "healthcare_life_sciences"],
  candidate: ["technology_internet"],
};

export function planShortNameCandidates(slot: string, industries: readonly IndustryIdCode[]): string[] {
  const overrides = (PLAN_SHORT_NAME_OVERRIDES[slot] ?? []).filter((industry) => industries.includes(industry));
  return [slot, ...overrides.map((industry) => `${slot}@${industry}`)];
}

/** 字典里的全部短名 id。 */
export function allPlanShortNameIds(): string[] {
  const ids: string[] = [];
  for (const template of Object.values(PLAN_GOAL_TEMPLATES)) {
    for (const slot of template.slots) {
      if (slot.slot === PLAN_EVENT_SLOT) continue;
      ids.push(...planShortNameCandidates(slot.slot, PLAN_SHORT_NAME_OVERRIDES[slot.slot] ?? []));
    }
  }
  return [...new Set(ids)];
}

/** C1 失败时的关键词推测；都不中返回 `launch`。 */
export function guessGoalKindByKeywords(text: string): PlanGoalKind {
  const lowered = lowerText(text);
  let best: PlanGoalKind = "launch";
  let bestHits = 0;
  for (const kind of PLAN_GOAL_KINDS) {
    const hits = PLAN_GOAL_TEMPLATES[kind].keywords.filter((keyword) => lowered.includes(lowerText(keyword))).length;
    if (hits > bestHits) {
      best = kind;
      bestHits = hits;
    }
  }
  return best;
}

/** 「空き」= 必要な力里没有任何成员勾选的项（规则，不调 AI）。 */
export function planCapabilityGaps(kind: PlanGoalKind, members: readonly { capabilities: readonly string[] }[]): string[] {
  const covered = new Set(members.flatMap((member) => member.capabilities));
  return PLAN_GOAL_TEMPLATES[kind].capabilities.filter((capability) => !covered.has(capability));
}

/**
 * 初版相对模板的调整是否合规：每处 ±5、最多 2 处、合计 100、5 分一档；
 * 枠可以整枠去掉（配点降到 0，也算一处）。
 */
export function checkTemplateAdjustment(kind: PlanGoalKind, allocations: Readonly<Record<string, number>>): { ok: true } | { ok: false; reason: string } {
  const template = PLAN_GOAL_TEMPLATES[kind];
  let changed = 0;
  let total = 0;
  for (const slot of template.slots) {
    const value = allocations[slot.slot] ?? 0;
    if (value % PLAN_TEMPLATE_ADJUST_STEP !== 0 || value < 0) return { ok: false, reason: `not_multiple_of_5:${slot.slot}` };
    const diff = Math.abs(value - slot.allocation);
    if (diff > PLAN_TEMPLATE_ADJUST_STEP) return { ok: false, reason: `over_adjusted:${slot.slot}` };
    if (diff > 0) changed += 1;
    total += value;
  }
  for (const key of Object.keys(allocations)) {
    if (!template.slots.some((slot) => slot.slot === key)) return { ok: false, reason: `unknown_slot:${key}` };
  }
  if (changed > PLAN_TEMPLATE_ADJUST_MAX_SLOTS) return { ok: false, reason: "too_many_adjustments" };
  if (total !== 100) return { ok: false, reason: "total_not_100" };
  return { ok: true };
}
