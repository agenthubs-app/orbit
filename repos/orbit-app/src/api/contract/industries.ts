import type { OrbitLanguage } from "./language";

export const INDUSTRY_IDS = [
  "food_hospitality",
  "technology_internet",
  "finance_investment",
  "professional_services",
  "manufacturing_supply_chain",
  "retail_consumer",
  "trade_logistics",
  "real_estate_construction",
  "healthcare_life_sciences",
  "education_research",
  "media_creative",
  "community_nonprofit",
  "government_public_affairs",
  "other",
] as const;

export type IndustryIdCode = (typeof INDUSTRY_IDS)[number];

export interface IndustryDefinitionContract {
  id: IndustryIdCode;
  labels: Readonly<Record<OrbitLanguage, string>>;
  sortOrder: number;
}

export const INDUSTRY_CATALOG: readonly IndustryDefinitionContract[] = [
  { id: "food_hospitality", labels: { zh: "餐饮与食品", en: "Food & Hospitality", ja: "飲食・食品" }, sortOrder: 10 },
  { id: "technology_internet", labels: { zh: "科技与互联网", en: "Technology & Internet", ja: "テクノロジー・インターネット" }, sortOrder: 20 },
  { id: "finance_investment", labels: { zh: "金融与投资", en: "Finance & Investment", ja: "金融・投資" }, sortOrder: 30 },
  { id: "professional_services", labels: { zh: "专业服务", en: "Professional Services", ja: "プロフェッショナルサービス" }, sortOrder: 40 },
  { id: "manufacturing_supply_chain", labels: { zh: "制造与供应链", en: "Manufacturing & Supply Chain", ja: "製造・サプライチェーン" }, sortOrder: 50 },
  { id: "retail_consumer", labels: { zh: "零售与消费", en: "Retail & Consumer", ja: "小売・消費財" }, sortOrder: 60 },
  { id: "trade_logistics", labels: { zh: "贸易与物流", en: "Trade & Logistics", ja: "貿易・物流" }, sortOrder: 70 },
  { id: "real_estate_construction", labels: { zh: "房地产与建设", en: "Real Estate & Construction", ja: "不動産・建設" }, sortOrder: 80 },
  { id: "healthcare_life_sciences", labels: { zh: "医疗与健康", en: "Healthcare & Life Sciences", ja: "医療・ヘルスケア" }, sortOrder: 90 },
  { id: "education_research", labels: { zh: "教育与研究", en: "Education & Research", ja: "教育・研究" }, sortOrder: 100 },
  { id: "media_creative", labels: { zh: "文化传媒与创意", en: "Media & Creative", ja: "メディア・クリエイティブ" }, sortOrder: 110 },
  { id: "community_nonprofit", labels: { zh: "社群与非营利", en: "Community & Nonprofit", ja: "コミュニティ・非営利" }, sortOrder: 120 },
  { id: "government_public_affairs", labels: { zh: "政府与公共事务", en: "Government & Public Affairs", ja: "政府・公共政策" }, sortOrder: 130 },
  { id: "other", labels: { zh: "其他", en: "Other", ja: "その他" }, sortOrder: 140 },
] as const;

const industryIdSet = new Set<string>(INDUSTRY_IDS);

export function isIndustryIdCode(value: unknown): value is IndustryIdCode {
  return typeof value === "string" && industryIdSet.has(value);
}

export function industryLabel(
  id: IndustryIdCode,
  language: OrbitLanguage,
): string {
  return INDUSTRY_CATALOG.find((industry) => industry.id === id)?.labels[language] ?? id;
}
