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

function criterionMatch(definition: CriterionDefinition, contact: ContactListItemContract): ContactNeedCriterionMatchContract {
  const structuredIndustry = definition.id.startsWith("industry:")
    ? [contact.primaryIndustryId, contact.secondaryIndustryId].find(value => value === definition.id.slice("industry:".length)
      || value?.startsWith(`${definition.id.slice("industry:".length)}.`))
    : undefined;
  const candidates = definition.type === "location" ? [["location", contact.location] as const] : evidenceSources(contact);
  const source = candidates.find(([, value]) => containsAlias(value, definition.aliases))
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
    const criterionMatches = definitions.map(definition => criterionMatch(definition, contact));
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
