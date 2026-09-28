/**
 * 人脉需求匹配的规则层（RW-11，Sprint W0010）。纯函数，不读时钟、不碰存储。
 *
 * 只看一级／二级行业（W0013 在名片识别时补好，存在联系人 payload 上）：
 * - 二级行业相同 → 强候选（strong）；
 * - 否则一级行业相同 → 候选（candidate）；
 * - 任一方缺行业、或只落在「其他」这类兜底分类里 → 不参与（不猜）。二级是「本类其他行业」
 *   （`*.other`）时不算强候选，只按一级比较。
 *
 * 输入是本人**所有**生效的人脉需求（不设人数上限，没有「已填满」的概念）；唯一的排除是
 * 这个联系人已经关联在同一条需求上（`linkedContactIds`），已关联的人不重复提示。
 * 第二轮（公司、职位）由 `ai-matcher.ts` 负责，结果同样经过 `acceptedPairs` 的同一套排除。
 */
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";
import { sanitizeIndustryPair } from "../../shared/domain/industries";
import type { NetworkNeedCriteria } from "./contract";

export type PlanMatchStrength = "strong" | "candidate";
export type PlanMatchTier = "rule" | "ai";

export interface PlanMatchContact {
  id: string;
  displayName: string;
  organization: string | null;
  role: string | null;
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
}

export interface PlanMatchNeed {
  id: string;
  planId: string;
  title: string;
  criteria: NetworkNeedCriteria | null;
  /** 已关联在这条需求上的联系人：规则层与 AI 层都不再为他们提示这条需求。 */
  linkedContactIds: readonly string[];
}

export interface PlanMatchPair {
  contactId: string;
  needId: string;
  planId: string;
  tier: PlanMatchTier;
  strength: PlanMatchStrength;
  reason: string | null;
}

/** 兜底分类：落在这里说明识别不出具体行业，不作为匹配依据。 */
const CATCH_ALL_PRIMARY: ReadonlySet<string> = new Set(["other"]);

function effectiveIndustry(primary: unknown, secondary: unknown) {
  const pair = sanitizeIndustryPair(primary, secondary);
  if (!pair.primaryIndustryId || CATCH_ALL_PRIMARY.has(pair.primaryIndustryId)) {
    return { primary: null, secondary: null };
  }
  const specificSecondary =
    pair.secondaryIndustryId && !pair.secondaryIndustryId.endsWith(".other") ? pair.secondaryIndustryId : null;
  return { primary: pair.primaryIndustryId, secondary: specificSecondary };
}

/** 单个联系人对单条需求的规则打分；null = 不是候选。 */
export function ruleStrength(contact: PlanMatchContact, need: PlanMatchNeed): PlanMatchStrength | null {
  if (!need.criteria) return null;
  const wanted = effectiveIndustry(need.criteria.primaryIndustryId, need.criteria.secondaryIndustryId);
  const actual = effectiveIndustry(contact.primaryIndustryId, contact.secondaryIndustryId);
  if (!wanted.primary || !actual.primary) return null;
  if (wanted.secondary && actual.secondary && wanted.secondary === actual.secondary) return "strong";
  return wanted.primary === actual.primary ? "candidate" : null;
}

function isLinked(need: PlanMatchNeed, contactId: string): boolean {
  return need.linkedContactIds.includes(contactId);
}

/** 规则层：每个（联系人, 需求）至多一条，强候选排在前面，其余保持输入顺序。 */
export function scoreRuleMatches(
  contacts: readonly PlanMatchContact[],
  needs: readonly PlanMatchNeed[],
): PlanMatchPair[] {
  const pairs: PlanMatchPair[] = [];
  for (const contact of contacts) {
    for (const need of needs) {
      if (isLinked(need, contact.id)) continue;
      const strength = ruleStrength(contact, need);
      if (!strength) continue;
      pairs.push({
        contactId: contact.id,
        needId: need.id,
        planId: need.planId,
        reason: strength === "strong" ? "same_secondary_industry" : "same_primary_industry",
        strength,
        tier: "rule",
      });
    }
  }
  return pairs.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1));
}

/**
 * 第二轮（AI）返回的配对只接受本批联系人与本计划需求的 id；越界 id、重复配对、
 * 已关联的人、规则层已经给出的配对一律丢弃。`reason` 截到 200 字。
 */
export function acceptedAiPairs(input: {
  proposals: ReadonlyArray<{ contactId: unknown; needId: unknown; reason?: unknown }>;
  contacts: readonly PlanMatchContact[];
  needs: readonly PlanMatchNeed[];
  existing?: ReadonlyArray<Pick<PlanMatchPair, "contactId" | "needId">>;
}): PlanMatchPair[] {
  const contactIds = new Set(input.contacts.map((contact) => contact.id));
  const needsById = new Map(input.needs.map((need) => [need.id, need]));
  const seen = new Set((input.existing ?? []).map((pair) => `${pair.contactId}\u0000${pair.needId}`));
  const pairs: PlanMatchPair[] = [];
  for (const proposal of input.proposals) {
    if (typeof proposal.contactId !== "string" || typeof proposal.needId !== "string") continue;
    const need = needsById.get(proposal.needId);
    if (!need || !contactIds.has(proposal.contactId) || isLinked(need, proposal.contactId)) continue;
    const key = `${proposal.contactId}\u0000${proposal.needId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reason = typeof proposal.reason === "string" && proposal.reason.trim() ? proposal.reason.trim().slice(0, 200) : null;
    pairs.push({
      contactId: proposal.contactId,
      needId: need.id,
      planId: need.planId,
      reason,
      strength: "candidate",
      tier: "ai",
    });
  }
  return pairs;
}
