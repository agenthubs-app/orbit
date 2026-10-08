/**
 * W0051（W51-4）：目标相关度 0–100，纯规则计算，模型只写文字（对标 Apollo／HubSpot 线索评分：分数独立于 AI 文案）。
 *
 * 优先级严格按：计划需求已确认关联（已建立联系 > 已关联）> 待确认候选 > 行业与计划需求一致 > 强度档 > 最近往来。
 * 权重保证上一级的最低分高于下面各级之和（表驱动测试覆盖），不会出现「下一级凑分超过上一级」。
 */
import type { RelationshipTier } from "../../../shared/contract/relationship-strength";

export interface ContactInsightRelevanceInput {
  /** 在生效计划任一人脉需求上的关联状态（取最强的一条）。 */
  planLink: "established" | "linked" | null;
  /** 有待确认的匹配候选（且还没关联）。 */
  pendingCandidate: boolean;
  /** 联系人行业与任一计划人脉需求的行业一致。 */
  industryMatchesNeed: boolean;
  tier: RelationshipTier | null;
  /** 最近一条关系记录时间（W0047 lastSignalAt）。 */
  lastSignalAt: string | null;
  now: Date;
}

export const CONTACT_INSIGHT_RELEVANCE_WEIGHTS = {
  candidate: 30,
  established: 61,
  industry: 14,
  linked: 56,
  recency30: 2,
  recency90: 1,
  tier: { active: 6, core: 9, new: 3 } as Readonly<Record<RelationshipTier, number>>,
} as const;

const DAY_MS = 86_400_000;

export function contactInsightRelevance(input: ContactInsightRelevanceInput): number {
  const weights = CONTACT_INSIGHT_RELEVANCE_WEIGHTS;
  let score = 0;
  if (input.planLink === "established") score += weights.established;
  else if (input.planLink === "linked") score += weights.linked;
  else if (input.pendingCandidate) score += weights.candidate;
  if (input.industryMatchesNeed) score += weights.industry;
  if (input.tier) score += weights.tier[input.tier];
  const last = input.lastSignalAt ? Date.parse(input.lastSignalAt) : Number.NaN;
  if (Number.isFinite(last)) {
    const days = (input.now.getTime() - last) / DAY_MS;
    if (days <= 30) score += weights.recency30;
    else if (days <= 90) score += weights.recency90;
  }
  return Math.max(0, Math.min(100, score));
}
