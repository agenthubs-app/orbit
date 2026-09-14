import { createHash } from "node:crypto";

import type {
  ContactNeedCriterionContract,
  ContactNeedCriterionMatchContract,
  ContactNeedCriterionTypeCode,
  ContactNeedMatchContract,
} from "../../shared/contract/contact-needs";
import type { ContactListItemContract } from "../../shared/contract/contacts";

export const CONTACT_NEEDS_SCORING_VERSION = "needs-lexical-v1" as const;

type CriterionDefinition = ContactNeedCriterionContract & { aliases: readonly string[] };

const locations: readonly CriterionDefinition[] = [
  { id: "location:japan", label: "日本", type: "location", aliases: ["日本", "japan", "日本国"] },
  { id: "location:united-states", label: "美国", type: "location", aliases: ["美国", "美國", "united states", "usa", "u.s."] },
  { id: "location:china", label: "中国", type: "location", aliases: ["中国", "中國", "china"] },
  { id: "location:tokyo", label: "东京", type: "location", aliases: ["东京", "東京", "tokyo"] },
];

const industries: readonly CriterionDefinition[] = [
  { id: "industry:manufacturing_supply_chain", label: "制造与供应链", type: "industry", aliases: ["制造业", "製造業", "制造", "製造", "manufacturing", "供应链", "サプライチェーン", "supply chain"] },
  { id: "industry:technology_internet", label: "科技与互联网", type: "industry", aliases: ["科技", "技术", "テクノロジー", "technology", "互联网", "インターネット", "software", "软件", "軟件"] },
  { id: "industry:finance_investment", label: "金融与投资", type: "industry", aliases: ["金融", "finance", "投资", "投資", "investment", "venture", "风投", "ベンチャー"] },
  { id: "industry:trade_logistics", label: "贸易与物流", type: "industry", aliases: ["贸易", "貿易", "trade", "物流", "ロジスティクス", "logistics"] },
  { id: "industry:professional_services", label: "专业服务", type: "industry", aliases: ["专业服务", "専門サービス", "professional services", "咨询", "コンサル", "consulting"] },
  { id: "industry:retail_consumer", label: "零售与消费", type: "industry", aliases: ["零售", "小売", "retail", "消费", "消費財", "consumer"] },
  { id: "industry:healthcare_life_sciences", label: "医疗与健康", type: "industry", aliases: ["医疗", "医療", "healthcare", "健康", "life sciences"] },
  { id: "industry:education_research", label: "教育与研究", type: "industry", aliases: ["教育", "education", "研究", "research"] },
  { id: "industry:media_creative", label: "文化传媒与创意", type: "industry", aliases: ["传媒", "メディア", "media", "创意", "クリエイティブ", "creative"] },
];

const capabilities: readonly CriterionDefinition[] = [
  { id: "capability:procurement", label: "采购", type: "capability", aliases: ["采购", "採購", "調達", "procurement", "purchasing", "buyer"] },
  { id: "capability:investment", label: "投资", type: "capability", aliases: ["投资", "投資", "investment", "investor", "venture", "融资", "資金調達", "fundraising"] },
  { id: "capability:sales", label: "销售", type: "capability", aliases: ["销售", "銷售", "営業", "sales", "business development"] },
  { id: "capability:partnership", label: "合作拓展", type: "capability", aliases: ["合作拓展", "提携", "partnerships", "alliances"] },
];

const stopWords = new Set([
  "寻找", "尋找", "希望", "想", "认识", "認識", "联系", "聯繫", "合作", "伙伴", "夥伴", "合作伙伴",
  "探す", "求める", "知り合う", "パートナー", "協力", "人", "方",
  "find", "looking", "for", "seeking", "want", "meet", "partner", "partners", "partnership", "collaboration", "a", "an", "the", "in", "with", "and",
]);

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function containsAlias(text: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => text.includes(normalize(alias)));
}

function uniqueDefinitions(definitions: readonly CriterionDefinition[], need: string): CriterionDefinition[] {
  return definitions.filter((definition) => containsAlias(need, definition.aliases));
}

function extractKeywords(need: string, known: readonly CriterionDefinition[]): CriterionDefinition[] {
  let remainder = need;
  for (const definition of known) {
    for (const alias of definition.aliases) remainder = remainder.split(normalize(alias)).join(" ");
  }
  const words = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(remainder)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment.trim())
    .filter((word) => word.length > 1 && !stopWords.has(word));
  return [...new Set(words)].map((word) => ({
    id: `keyword:${word}`,
    label: word,
    type: "keyword" as const,
    aliases: [word],
  }));
}

export function criteriaForNeed(goal: string): CriterionDefinition[] {
  const need = normalize(goal.trim());
  if (!need || /(?:不要|不需要|排除|除外|除く|以外|without|excluding|except)/u.test(need)) return [];
  const known = [
    ...uniqueDefinitions(locations, need),
    ...uniqueDefinitions(industries, need),
    ...uniqueDefinitions(capabilities, need),
  ];
  return [...known, ...extractKeywords(need, known)];
}

function evidenceText(contact: ContactListItemContract): string {
  return normalize([
    contact.role,
    contact.organization,
    contact.location,
    contact.profileSnippet,
    contact.relationshipContext,
    ...contact.evidence.map((item) => item.excerpt),
    ...contact.tags,
  ].filter(Boolean).join(" "));
}

function hasAssessableData(type: ContactNeedCriterionTypeCode, contact: ContactListItemContract): boolean {
  if (type === "location") return contact.location.trim().length > 0;
  if (type === "industry") {
    return Boolean(contact.primaryIndustryId || contact.secondaryIndustryId || contact.organization.trim() || contact.profileSnippet.trim());
  }
  return Boolean(contact.role.trim() || contact.organization.trim() || contact.profileSnippet.trim() || contact.relationshipContext.trim() || contact.evidence.some((item) => item.excerpt.trim()));
}

function criterionMatch(definition: CriterionDefinition, contact: ContactListItemContract): ContactNeedCriterionMatchContract {
  const text = evidenceText(contact);
  const structuredIndustry = definition.type === "industry"
    && (contact.primaryIndustryId === definition.id.slice("industry:".length)
      || contact.secondaryIndustryId?.startsWith(`${definition.id.slice("industry:".length)}.`));
  const matched = Boolean(structuredIndustry || containsAlias(text, definition.aliases));
  let evidenceField: string | null = null;
  let evidenceExcerpt: string | null = null;
  if (matched) {
    const candidates: readonly (readonly [string, string])[] = [
      ["location", contact.location], ["industry", contact.primaryIndustryId ?? contact.secondaryIndustryId ?? ""],
      ["role", contact.role], ["organization", contact.organization], ["profile", contact.profileSnippet],
      ["relationship", contact.relationshipContext],
      ...contact.evidence.map((item) => ["evidence", item.excerpt] as const),
    ];
    const source = candidates.find(([, value]) => containsAlias(normalize(value), definition.aliases))
      ?? (structuredIndustry ? candidates[1] : undefined);
    evidenceField = source?.[0] ?? null;
    evidenceExcerpt = source?.[1] ?? null;
  }
  return { id: definition.id, label: definition.label, type: definition.type, matched, evidenceField, evidenceExcerpt };
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
  const contacts = [...new Map(inputContacts.map((contact) => [contact.id, contact])).values()];
  const definitions = criteriaForNeed(goal);
  const criteria = definitions.map(({ id, label, type }) => ({ id, label, type }));
  const matches = contacts.map((contact): ContactNeedMatchContract => {
    const criterionMatches = definitions.map((definition) => criterionMatch(definition, contact));
    const missingFields = definitions
      .filter((definition) => !hasAssessableData(definition.type, contact))
      .map((definition) => definition.type)
      .filter((value, index, all) => all.indexOf(value) === index);
    if (missingFields.length > 0 || definitions.length === 0) {
      return {
        contactId: contact.id, displayName: contact.displayName, role: contact.role, organization: contact.organization,
        location: contact.location, ...(contact.primaryIndustryId ? { primaryIndustryId: contact.primaryIndustryId } : {}),
        ...(contact.secondaryIndustryId ? { secondaryIndustryId: contact.secondaryIndustryId } : {}),
        score: null, status: "insufficient_data", reason: "缺少评估当前需求所需的联系人资料。",
        criteria: criterionMatches, missingFields,
      };
    }
    const score = Math.round(100 * criterionMatches.filter((item) => item.matched).length / definitions.length);
    const matchedLabels = criterionMatches.filter((item) => item.matched).map((item) => item.label);
    return {
      contactId: contact.id, displayName: contact.displayName, role: contact.role, organization: contact.organization,
      location: contact.location, ...(contact.primaryIndustryId ? { primaryIndustryId: contact.primaryIndustryId } : {}),
      ...(contact.secondaryIndustryId ? { secondaryIndustryId: contact.secondaryIndustryId } : {}),
      score, status: score > 0 ? "matched" : "no_match",
      reason: matchedLabels.length > 0 ? `匹配：${matchedLabels.join("、")}` : "现有资料未命中当前需求条件。",
      criteria: criterionMatches, missingFields: [],
    };
  }).sort((left, right) => {
    if (left.score === null && right.score !== null) return 1;
    if (left.score !== null && right.score === null) return -1;
    if (left.score !== right.score) return (right.score ?? -1) - (left.score ?? -1);
    return left.contactId.localeCompare(right.contactId);
  });
  return { criteria, dataVersion: canonicalData(contacts), matches };
}
