import { createHash } from "node:crypto";

import type {
  ContactNeedCriterionContract, ContactNeedCriterionMatchContract, ContactNeedDimensionCode,
  ContactNeedMatchContract, ContactNeedScoreComponentContract,
} from "../../shared/contract/contact-needs";
import type { ContactListItemContract } from "../../shared/contract/contacts";
import { containsAlias, criteriaForNeed, type CriterionDefinition } from "./criteria";

export { criteriaForNeed } from "./criteria";
export const CONTACT_NEEDS_SCORING_VERSION = "needs-evidence-v2" as const;

const baseWeights: Readonly<Record<ContactNeedDimensionCode, number>> = { scenario: 35, capability: 35, collaboration: 20, location: 10 };

function evidenceSources(contact: ContactListItemContract): readonly (readonly [string, string])[] {
  // Names and company brands never establish capability. Preserve exact source text.
  return [
    ["role", contact.role], ["profile", contact.profileSnippet], ["relationship", contact.relationshipContext],
    ...contact.evidence.map(item => [`evidence:${item.evidenceId}`, item.excerpt] as const),
  ];
}

function hasAssessableData(definition: CriterionDefinition, contact: ContactListItemContract): boolean {
  if (definition.type === "location") return Boolean(contact.location.trim());
  return evidenceSources(contact).some(([, value]) => value.trim())
    || (definition.dimension === "scenario" && Boolean(contact.primaryIndustryId || contact.secondaryIndustryId));
}

function implementationEvidence(contact: ContactListItemContract, definitions: readonly CriterionDefinition[], aliases: readonly string[]): readonly [string, string] | undefined {
  const scenarios = definitions.filter(item => item.dimension === "scenario" && !item.weak);
  // A generic implementation word is not itself proof of the requested business context.
  const related = scenarios.length ? scenarios : definitions.filter(item => item.dimension === "capability");
  const completedActions = ["delivered", "deployed", "implemented", "launched", "piloted", "builds", "built", "develops", "developed"];
  const intentOrNegation = ["hope", "hopes", "want", "wants", "wish", "plan", "plans", "planned", "intend", "will", "would", "can", "could", "offer", "offers", "seeking", "seeks", "looking for", "interested in", "no", "not", "never", "without", "cannot", "can't", "haven't", "hasn't", "didn't"];
  for (const [field, value] of evidenceSources(contact)) {
    // Keep an actual source substring; do not borrow an action from another request or field.
    for (const fragment of value.split(/[。！？.!?；;\n，,、]|(?:并且|并|但)|\b(?:and|but)\b/iu)) {
      const clause = fragment.trim();
      if (!related.some(item => containsAlias(clause, item.aliases))) continue;
      if (/(?:本次关注|关注|希望|计划|打算|想|将要|将负责|拟|未来|可(?:以)?提供|没有|未曾|尚未|未完成|不负责|不提供|未实施|未交付|未上线|未能|无法|讨论|予定|計画|検討|探す|探し|求め|関心|したい|できる|可能|未経験|未実施|未導入|未完了|していない|していません|したことがない)/u.test(clause)
        || containsAlias(clause, intentOrNegation)
        || containsAlias(clause, ["税务", "稅務", "税務", "设立", "設立", "tax", "taxation", "accounting", "incorporation"])) continue;
      const action = containsAlias(clause, aliases) || containsAlias(clause, completedActions) || /上线/u.test(clause);
      const fact = /(?:曾|已|完成|上线|负责|承担|提供|完了|導入済|導入した|実施した|実証した|担当|担う|提供して)/u.test(clause)
        || containsAlias(clause, [...completedActions, "completed", "responsible for", "provides"]);
      if (action && fact) return [field, clause];
    }
  }
  return undefined;
}

function deliveryEvidence(contact: ContactListItemContract, aliases: readonly string[]): readonly [string, string] | undefined {
  const careers = ["开发者", "工程师", "店长", "開発者", "エンジニア", "店長", "developer", "developers", "engineer", "store manager"];
  const actions = ["builds", "built", "develops", "developed", "delivered", "deployed", "implemented", "launched", "piloted"];
  const intentOrNegation = ["looking for", "seeking", "seeks", "want", "wants", "hope", "hopes", "plan", "plans", "will", "would", "learning", "no", "not", "never", "without", "cannot", "can't", "haven't", "hasn't", "didn't"];
  for (const [field, value] of evidenceSources(contact)) {
    for (const fragment of value.split(/[。！？.!?；;\n，,、]|(?:并且|并|但)|\b(?:and|but)\b/iu)) {
      const clause = fragment.trim();
      if (/(?:本次关注|关注|寻找|寻求|希望|计划|打算|想|未来|将要|将负责|学习|没有|不是|未曾|尚未|未完成|未交付|未实施|不负责|不提供|无法|讨论|予定|計画|検討|探す|探し|求め|したい|なりたい|未経験|未実施|未導入|未完了|していない|していません)/u.test(clause)
        || containsAlias(clause, intentOrNegation)) continue;
      const deliveryWork = containsAlias(clause, ["开发", "開発", "系统", "システム", "点单", "點單", "点餐", "點餐", "实施", "実装", "试点", "実証", "development", "implementation", "pilot", "software", "system", "systems", "ordering", "order-taking"]);
      const duty = deliveryWork && (/(?:负责|承担)[^。；;]*?(?:开发|交付|实施|试点)|(?:开发|交付|实施|试点)(?:负责人|职责)|(?:已|曾|完成)[^。；;]*?(?:开发|交付|上线|实施)|(?:開発|実装|実証)[^。；;]*?(?:担当|完了|した)/u.test(clause)
        || containsAlias(clause, actions)
        || (containsAlias(clause, ["responsible for"]) && containsAlias(clause, aliases)));
      // Supply statements are capability claims, not proof of completed collaboration.
      const service = deliveryWork && containsAlias(clause, aliases)
        && (/(?:可(?:以)?提供|提供|提供可能)/u.test(clause) || containsAlias(clause, ["provide", "provides", "offer", "offers"]))
        && !/(?:介绍|介紹|紹介|招聘)/u.test(clause)
        && !containsAlias(clause, ["introduction", "introductions", "introduce", "referral", "referrals", "recruit", "recruiting"]);
      // A profession mentioned in a company brand, client or referral is not the contact's job.
      const career = containsAlias(clause, careers)
        && !/(?:市场|市場|营销|行銷|介绍|介紹|紹介|客户|客戶|朋友)/u.test(clause)
        && !containsAlias(clause, ["marketing", "company", "client", "customer", "friend", "introduction", "referral"]);
      if (duty || service || career) return [field, clause];
    }
  }
  return undefined;
}

function criterionMatch(definition: CriterionDefinition, contact: ContactListItemContract, definitions: readonly CriterionDefinition[]): ContactNeedCriterionMatchContract {
  const structuredIndustry = definition.id.startsWith("industry:")
    ? [contact.primaryIndustryId, contact.secondaryIndustryId].find(value => value === definition.id.slice("industry:".length)
      || value?.startsWith(`${definition.id.slice("industry:".length)}.`))
    : undefined;
  const candidates = definition.type === "location" ? [["location", contact.location] as const] : evidenceSources(contact);
  const source = definition.dimension === "collaboration" ? implementationEvidence(contact, definitions, definition.aliases)
    : definition.id === "capability:delivery" ? deliveryEvidence(contact, definition.aliases)
    : candidates.find(([, value]) => containsAlias(value, definition.aliases))
    ?? (structuredIndustry ? ["industry", structuredIndustry] as const : undefined)
    ?? (definition.weak ? contact.tags.filter(tag => containsAlias(tag, definition.aliases)).map(tag => ["tags", tag] as const)[0] : undefined);
  return {
    id: definition.id, label: definition.label, type: definition.type, dimension: definition.dimension,
    matched: Boolean(source), strength: source ? definition.weak ? "weak" : "direct" : "none",
    evidenceField: source?.[0] ?? null, evidenceExcerpt: source?.[1] ?? null,
  };
}

function componentsFor(definitions: readonly CriterionDefinition[], criteria: readonly ContactNeedCriterionMatchContract[]): ContactNeedScoreComponentContract[] {
  const dimensions = (Object.keys(baseWeights) as ContactNeedDimensionCode[]).filter(dimension => definitions.some(item => item.dimension === dimension));
  const totalWeight = dimensions.reduce((sum, dimension) => sum + baseWeights[dimension], 0);
  return dimensions.map(dimension => {
    const items = criteria.filter(item => item.dimension === dimension);
    const direct = items.filter(item => item.id !== "keyword:ai");
    // AI cannot dilute or inflate specific scenario evidence.
    const fraction = direct.length ? direct.filter(item => item.matched).length / direct.length : items.some(item => item.matched) ? 0.15 : 0;
    const weight = 100 * baseWeights[dimension] / totalWeight;
    return { dimension, baseWeight: baseWeights[dimension], weight, points: weight * fraction, criterionIds: items.map(item => item.id) };
  });
}

function canonicalData(contacts: readonly ContactListItemContract[]): string {
  const data = contacts.map((contact) => ({
    id: contact.id,
    role: contact.role,
    organization: contact.organization,
    location: contact.location,
    profileSnippet: contact.profileSnippet,
    relationshipContext: contact.relationshipContext,
    primaryIndustryId: contact.primaryIndustryId ?? null,
    secondaryIndustryId: contact.secondaryIndustryId ?? null,
    tags: [...contact.tags].sort(),
    evidence: contact.evidence.map((item) => ({ id: item.evidenceId, excerpt: item.excerpt })).sort((a, b) => a.id.localeCompare(b.id)),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export function scoreContactsForNeed(goal: string, inputContacts: readonly ContactListItemContract[]): {
  criteria: readonly ContactNeedCriterionContract[];
  dataVersion: string;
  matches: readonly ContactNeedMatchContract[];
} {
  const contacts = [...new Map(inputContacts.map(contact => [contact.id, contact])).values()];
  const definitions = criteriaForNeed(goal);
  const criteria = definitions.map(({ id, label, type, dimension }) => ({ id, label, type, dimension }));
  const matches = contacts.map((contact): ContactNeedMatchContract => {
    const criterionMatches = definitions.map(definition => criterionMatch(definition, contact, definitions));
    const missingFields = [...new Set(definitions.filter(definition => !hasAssessableData(definition, contact)).map(definition => definition.type))];
    const components = componentsFor(definitions, criterionMatches);
    const direct = criterionMatches.filter(item => item.matched && item.strength === "direct");
    const weakOnly = direct.length === 0 && criterionMatches.some(item => item.matched && item.strength === "weak");
    if (weakOnly) {
      const earned = components.reduce((sum, item) => sum + item.points, 0);
      if (earned > 15) for (const component of components) component.points *= 15 / earned;
    }
    const pending = missingFields.length > 0 || definitions.length === 0;
    const score = pending ? null : Math.round(components.reduce((sum, item) => sum + item.points, 0));
    const summaryPriority: Readonly<Record<ContactNeedDimensionCode, number>> = { capability: 0, scenario: 1, collaboration: 2, location: 3 };
    const seenDimensions = new Set<ContactNeedDimensionCode>();
    const grounds = [...direct].sort((left, right) => {
      const points = (id: string) => components.find(item => item.criterionIds.includes(id))?.points ?? 0;
      return points(right.id) - points(left.id)
        || summaryPriority[left.dimension!] - summaryPriority[right.dimension!];
    }).filter(item => {
      if (seenDimensions.has(item.dimension!)) return false;
      seenDimensions.add(item.dimension!);
      return true;
    }).slice(0, 2).map(item => item.id);
    return {
      contactId: contact.id, displayName: contact.displayName, role: contact.role, organization: contact.organization,
      location: contact.location, ...(contact.primaryIndustryId ? { primaryIndustryId: contact.primaryIndustryId } : {}),
      ...(contact.secondaryIndustryId ? { secondaryIndustryId: contact.secondaryIndustryId } : {}),
      score, status: pending ? "insufficient_data" : score! > 0 ? "matched" : "no_match",
      reason: weakOnly ? "仅有泛 AI 关联，具体业务与合作能力尚待核实。" : pending ? "资料不足，当前需求的具体能力仍待核实。" : grounds.length ? `现有资料支持：${direct.filter(item => grounds.includes(item.id)).map(item => item.label).join("、")}。` : "现有资料未证明符合当前需求。",
      criteria: criterionMatches, missingFields, components,
      summary: { code: weakOnly ? "weak_ai" : pending ? "missing_data" : grounds.length ? "evidence" : "no_match", criterionIds: grounds },
    };
  }).sort((left, right) => {
    if (left.score === null && right.score !== null) return 1;
    if (left.score !== null && right.score === null) return -1;
    if (left.score !== right.score) return (right.score ?? -1) - (left.score ?? -1);
    return left.contactId.localeCompare(right.contactId);
  });
  return { criteria, dataVersion: canonicalData(contacts), matches };
}
