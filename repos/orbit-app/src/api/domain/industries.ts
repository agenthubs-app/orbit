import type { IndustryDefinitionContract, IndustryIdCode, IndustrySelectionContract, SecondaryIndustryDefinitionContract, SecondaryIndustryIdCode } from "../contract/industries";
import type { OrbitLanguage } from "../contract/language";

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
] as const satisfies readonly IndustryIdCode[];

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

export const INDUSTRY_TAXONOMY_VERSION = 1 as const;

export const SECONDARY_INDUSTRY_CATALOG: readonly SecondaryIndustryDefinitionContract[] = [
  { id: "food_hospitality.restaurants", parentId: "food_hospitality", labels: { zh: "餐饮经营", ja: "飲食店経営", en: "Restaurants" }, sortOrder: 10 },
  { id: "food_hospitality.cafes_beverages", parentId: "food_hospitality", labels: { zh: "咖啡、茶饮与饮品", ja: "カフェ・茶・飲料", en: "Cafés, Tea & Beverages" }, sortOrder: 20 },
  { id: "food_hospitality.food_production", parentId: "food_hospitality", labels: { zh: "食品生产与加工", ja: "食品製造・加工", en: "Food Production & Processing" }, sortOrder: 30 },
  { id: "food_hospitality.food_distribution", parentId: "food_hospitality", labels: { zh: "食品流通", ja: "食品流通", en: "Food Distribution" }, sortOrder: 40 },
  { id: "food_hospitality.hotels_tourism", parentId: "food_hospitality", labels: { zh: "酒店与旅游服务", ja: "宿泊・観光サービス", en: "Hotels & Tourism" }, sortOrder: 50 },
  { id: "food_hospitality.other", parentId: "food_hospitality", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Food & Hospitality" }, sortOrder: 60 },
  { id: "technology_internet.enterprise_software", parentId: "technology_internet", labels: { zh: "企业软件与 SaaS", ja: "企業向けソフトウェア・SaaS", en: "Enterprise Software & SaaS" }, sortOrder: 10 },
  { id: "technology_internet.ai_data", parentId: "technology_internet", labels: { zh: "人工智能与数据", ja: "AI・データ", en: "Artificial Intelligence & Data" }, sortOrder: 20 },
  { id: "technology_internet.cloud_infrastructure", parentId: "technology_internet", labels: { zh: "云计算与基础设施", ja: "クラウド・インフラ", en: "Cloud & Infrastructure" }, sortOrder: 30 },
  { id: "technology_internet.cybersecurity", parentId: "technology_internet", labels: { zh: "网络与信息安全", ja: "サイバーセキュリティ", en: "Cybersecurity" }, sortOrder: 40 },
  { id: "technology_internet.internet_platforms", parentId: "technology_internet", labels: { zh: "互联网平台与应用", ja: "インターネットプラットフォーム・アプリ", en: "Internet Platforms & Applications" }, sortOrder: 50 },
  { id: "technology_internet.other", parentId: "technology_internet", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Technology & Internet" }, sortOrder: 60 },
  { id: "finance_investment.banking", parentId: "finance_investment", labels: { zh: "银行与信贷", ja: "銀行・融資", en: "Banking & Credit" }, sortOrder: 10 },
  { id: "finance_investment.venture_capital", parentId: "finance_investment", labels: { zh: "创业投资", ja: "ベンチャー投資", en: "Venture Capital" }, sortOrder: 20 },
  { id: "finance_investment.private_equity", parentId: "finance_investment", labels: { zh: "私募股权投资", ja: "プライベートエクイティ投資", en: "Private Equity" }, sortOrder: 30 },
  { id: "finance_investment.asset_management", parentId: "finance_investment", labels: { zh: "证券与资产管理", ja: "証券・資産運用", en: "Securities & Asset Management" }, sortOrder: 40 },
  { id: "finance_investment.insurance", parentId: "finance_investment", labels: { zh: "保险", ja: "保険", en: "Insurance" }, sortOrder: 50 },
  { id: "finance_investment.fintech", parentId: "finance_investment", labels: { zh: "金融科技", ja: "フィンテック", en: "Fintech" }, sortOrder: 60 },
  { id: "finance_investment.other", parentId: "finance_investment", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Finance & Investment" }, sortOrder: 70 },
  { id: "professional_services.management_consulting", parentId: "professional_services", labels: { zh: "管理咨询", ja: "経営コンサルティング", en: "Management Consulting" }, sortOrder: 10 },
  { id: "professional_services.legal", parentId: "professional_services", labels: { zh: "法律服务", ja: "法律サービス", en: "Legal Services" }, sortOrder: 20 },
  { id: "professional_services.tax_accounting", parentId: "professional_services", labels: { zh: "会计、审计与税务", ja: "会計・監査・税務", en: "Accounting, Audit & Tax" }, sortOrder: 30 },
  { id: "professional_services.human_resources", parentId: "professional_services", labels: { zh: "人力资源与招聘", ja: "人材・採用", en: "Human Resources & Recruitment" }, sortOrder: 40 },
  { id: "professional_services.startup_services", parentId: "professional_services", labels: { zh: "创业与企业服务", ja: "起業・企業支援", en: "Startup & Business Services" }, sortOrder: 50 },
  { id: "professional_services.other", parentId: "professional_services", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Professional Services" }, sortOrder: 60 },
  { id: "manufacturing_supply_chain.industrial_equipment", parentId: "manufacturing_supply_chain", labels: { zh: "工业设备", ja: "産業機器", en: "Industrial Equipment" }, sortOrder: 10 },
  { id: "manufacturing_supply_chain.robotics", parentId: "manufacturing_supply_chain", labels: { zh: "机器人与自动化", ja: "ロボティクス・自動化", en: "Robotics & Automation" }, sortOrder: 20 },
  { id: "manufacturing_supply_chain.automotive", parentId: "manufacturing_supply_chain", labels: { zh: "汽车与交通装备", ja: "自動車・輸送機器", en: "Automotive & Transport Equipment" }, sortOrder: 30 },
  { id: "manufacturing_supply_chain.semiconductors", parentId: "manufacturing_supply_chain", labels: { zh: "半导体", ja: "半導体", en: "Semiconductors" }, sortOrder: 40 },
  { id: "manufacturing_supply_chain.electronics", parentId: "manufacturing_supply_chain", labels: { zh: "电子制造", ja: "電子機器製造", en: "Electronics Manufacturing" }, sortOrder: 50 },
  { id: "manufacturing_supply_chain.materials", parentId: "manufacturing_supply_chain", labels: { zh: "材料与化工", ja: "素材・化学", en: "Materials & Chemicals" }, sortOrder: 60 },
  { id: "manufacturing_supply_chain.other", parentId: "manufacturing_supply_chain", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Manufacturing & Supply Chain" }, sortOrder: 70 },
  { id: "retail_consumer.physical_retail", parentId: "retail_consumer", labels: { zh: "线下零售", ja: "店舗小売", en: "Physical Retail" }, sortOrder: 10 },
  { id: "retail_consumer.ecommerce", parentId: "retail_consumer", labels: { zh: "电子商务", ja: "電子商取引", en: "E-commerce" }, sortOrder: 20 },
  { id: "retail_consumer.consumer_brands", parentId: "retail_consumer", labels: { zh: "消费品牌", ja: "消費者向けブランド", en: "Consumer Brands" }, sortOrder: 30 },
  { id: "retail_consumer.lifestyle_services", parentId: "retail_consumer", labels: { zh: "生活服务", ja: "生活関連サービス", en: "Lifestyle Services" }, sortOrder: 40 },
  { id: "retail_consumer.consumer_products", parentId: "retail_consumer", labels: { zh: "消费品研发与生产", ja: "消費財開発・製造", en: "Consumer Product Development & Production" }, sortOrder: 50 },
  { id: "retail_consumer.other", parentId: "retail_consumer", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Retail & Consumer" }, sortOrder: 60 },
  { id: "trade_logistics.import_export", parentId: "trade_logistics", labels: { zh: "进出口贸易", ja: "輸出入貿易", en: "Import & Export" }, sortOrder: 10 },
  { id: "trade_logistics.freight", parentId: "trade_logistics", labels: { zh: "货运与运输", ja: "貨物・輸送", en: "Freight & Transport" }, sortOrder: 20 },
  { id: "trade_logistics.warehousing", parentId: "trade_logistics", labels: { zh: "仓储与配送", ja: "倉庫・配送", en: "Warehousing & Distribution" }, sortOrder: 30 },
  { id: "trade_logistics.cross_border_services", parentId: "trade_logistics", labels: { zh: "跨境贸易服务", ja: "越境貿易サービス", en: "Cross-border Trade Services" }, sortOrder: 40 },
  { id: "trade_logistics.procurement", parentId: "trade_logistics", labels: { zh: "采购与供应链服务", ja: "調達・サプライチェーンサービス", en: "Procurement & Supply Chain Services" }, sortOrder: 50 },
  { id: "trade_logistics.other", parentId: "trade_logistics", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Trade & Logistics" }, sortOrder: 60 },
  { id: "real_estate_construction.property_development", parentId: "real_estate_construction", labels: { zh: "房地产开发", ja: "不動産開発", en: "Property Development" }, sortOrder: 10 },
  { id: "real_estate_construction.construction", parentId: "real_estate_construction", labels: { zh: "建筑工程", ja: "建設工事", en: "Construction" }, sortOrder: 20 },
  { id: "real_estate_construction.architecture_design", parentId: "real_estate_construction", labels: { zh: "建筑与空间设计", ja: "建築・空間デザイン", en: "Architecture & Spatial Design" }, sortOrder: 30 },
  { id: "real_estate_construction.property_operations", parentId: "real_estate_construction", labels: { zh: "物业与空间运营", ja: "不動産・施設運営", en: "Property & Space Operations" }, sortOrder: 40 },
  { id: "real_estate_construction.real_estate_services", parentId: "real_estate_construction", labels: { zh: "房地产交易与服务", ja: "不動産取引・サービス", en: "Real Estate Transactions & Services" }, sortOrder: 50 },
  { id: "real_estate_construction.other", parentId: "real_estate_construction", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Real Estate & Construction" }, sortOrder: 60 },
  { id: "healthcare_life_sciences.medical_services", parentId: "healthcare_life_sciences", labels: { zh: "医疗服务", ja: "医療サービス", en: "Medical Services" }, sortOrder: 10 },
  { id: "healthcare_life_sciences.pharmaceuticals", parentId: "healthcare_life_sciences", labels: { zh: "药品研发与生产", ja: "医薬品開発・製造", en: "Pharmaceutical Development & Production" }, sortOrder: 20 },
  { id: "healthcare_life_sciences.medical_devices", parentId: "healthcare_life_sciences", labels: { zh: "医疗器械", ja: "医療機器", en: "Medical Devices" }, sortOrder: 30 },
  { id: "healthcare_life_sciences.biotechnology", parentId: "healthcare_life_sciences", labels: { zh: "生物技术", ja: "バイオテクノロジー", en: "Biotechnology" }, sortOrder: 40 },
  { id: "healthcare_life_sciences.health_management", parentId: "healthcare_life_sciences", labels: { zh: "健康管理", ja: "健康管理", en: "Health Management" }, sortOrder: 50 },
  { id: "healthcare_life_sciences.other", parentId: "healthcare_life_sciences", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Healthcare & Life Sciences" }, sortOrder: 60 },
  { id: "education_research.school_education", parentId: "education_research", labels: { zh: "基础教育", ja: "初等・中等教育", en: "Primary & Secondary Education" }, sortOrder: 10 },
  { id: "education_research.higher_education", parentId: "education_research", labels: { zh: "高等教育", ja: "高等教育", en: "Higher Education" }, sortOrder: 20 },
  { id: "education_research.professional_training", parentId: "education_research", labels: { zh: "职业与专业培训", ja: "職業・専門教育", en: "Vocational & Professional Training" }, sortOrder: 30 },
  { id: "education_research.edtech", parentId: "education_research", labels: { zh: "教育科技", ja: "教育テクノロジー", en: "Education Technology" }, sortOrder: 40 },
  { id: "education_research.research_institutes", parentId: "education_research", labels: { zh: "科研机构与研发服务", ja: "研究機関・研究開発サービス", en: "Research Institutes & R&D Services" }, sortOrder: 50 },
  { id: "education_research.other", parentId: "education_research", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Education & Research" }, sortOrder: 60 },
  { id: "media_creative.publishing_content", parentId: "media_creative", labels: { zh: "出版与内容", ja: "出版・コンテンツ", en: "Publishing & Content" }, sortOrder: 10 },
  { id: "media_creative.advertising_marketing", parentId: "media_creative", labels: { zh: "广告与营销", ja: "広告・マーケティング", en: "Advertising & Marketing" }, sortOrder: 20 },
  { id: "media_creative.film_video", parentId: "media_creative", labels: { zh: "影视与视频", ja: "映画・映像", en: "Film & Video" }, sortOrder: 30 },
  { id: "media_creative.games_entertainment", parentId: "media_creative", labels: { zh: "游戏与娱乐", ja: "ゲーム・エンターテインメント", en: "Games & Entertainment" }, sortOrder: 40 },
  { id: "media_creative.design_creative", parentId: "media_creative", labels: { zh: "设计与创意服务", ja: "デザイン・クリエイティブサービス", en: "Design & Creative Services" }, sortOrder: 50 },
  { id: "media_creative.other", parentId: "media_creative", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Media & Creative" }, sortOrder: 60 },
  { id: "community_nonprofit.industry_associations", parentId: "community_nonprofit", labels: { zh: "行业协会", ja: "業界団体", en: "Industry Associations" }, sortOrder: 10 },
  { id: "community_nonprofit.nonprofits", parentId: "community_nonprofit", labels: { zh: "公益与非营利组织", ja: "公益・非営利団体", en: "Nonprofit Organizations" }, sortOrder: 20 },
  { id: "community_nonprofit.community_operations", parentId: "community_nonprofit", labels: { zh: "社群运营", ja: "コミュニティ運営", en: "Community Operations" }, sortOrder: 30 },
  { id: "community_nonprofit.social_enterprises", parentId: "community_nonprofit", labels: { zh: "社会企业", ja: "社会的企業", en: "Social Enterprises" }, sortOrder: 40 },
  { id: "community_nonprofit.other", parentId: "community_nonprofit", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Community & Nonprofit" }, sortOrder: 50 },
  { id: "government_public_affairs.public_administration", parentId: "government_public_affairs", labels: { zh: "公共行政", ja: "行政", en: "Public Administration" }, sortOrder: 10 },
  { id: "government_public_affairs.public_services", parentId: "government_public_affairs", labels: { zh: "公共服务", ja: "公共サービス", en: "Public Services" }, sortOrder: 20 },
  { id: "government_public_affairs.economic_development", parentId: "government_public_affairs", labels: { zh: "招商与产业发展", ja: "企業誘致・産業振興", en: "Investment Promotion & Industry Development" }, sortOrder: 30 },
  { id: "government_public_affairs.public_policy", parentId: "government_public_affairs", labels: { zh: "公共政策与事务", ja: "公共政策・公共渉外", en: "Public Policy & Affairs" }, sortOrder: 40 },
  { id: "government_public_affairs.other", parentId: "government_public_affairs", labels: { zh: "本类其他行业", ja: "この分類のその他", en: "Other Government & Public Affairs" }, sortOrder: 50 },
  { id: "other.other", parentId: "other", labels: { zh: "其他未列明行业", ja: "その他の業種", en: "Other Unlisted Industries" }, sortOrder: 10 },
];

const secondaryIndustryById = new Map<string, SecondaryIndustryDefinitionContract>(
  SECONDARY_INDUSTRY_CATALOG.map((industry) => [industry.id, industry]),
);

export function listSecondaryIndustries(
  primaryId: IndustryIdCode,
): readonly SecondaryIndustryDefinitionContract[] {
  return SECONDARY_INDUSTRY_CATALOG.filter((industry) => industry.parentId === primaryId);
}

export function secondaryIndustryLabel(
  id: SecondaryIndustryIdCode,
  locale: OrbitLanguage,
): string {
  return secondaryIndustryById.get(id)?.labels[locale] ?? id;
}

export function validateIndustrySelection(selection: {
  primaryIndustryId?: unknown;
  secondaryIndustryId?: unknown;
}): { valid: true } | { valid: false; reason: "unknown_primary" | "unknown_secondary" | "parent_mismatch" } {
  const { primaryIndustryId, secondaryIndustryId } = selection;
  if (primaryIndustryId != null && !isIndustryIdCode(primaryIndustryId)) {
    return { valid: false, reason: "unknown_primary" };
  }
  if (secondaryIndustryId == null) return { valid: true };
  const secondary = typeof secondaryIndustryId === "string"
    ? secondaryIndustryById.get(secondaryIndustryId)
    : undefined;
  if (!secondary) return { valid: false, reason: "unknown_secondary" };
  if (secondary.parentId !== primaryIndustryId) return { valid: false, reason: "parent_mismatch" };
  return { valid: true };
}


// Sparse updates preserve the selection; changing only the parent clears its child.
// Validate the returned pair before persisting: explicit mismatches remain visible.
export function mergeIndustrySelection(
  base: IndustrySelectionContract,
  update: IndustrySelectionContract,
): IndustrySelectionContract {
  const primaryIndustryId = update.primaryIndustryId === undefined
    ? base.primaryIndustryId
    : update.primaryIndustryId;
  const secondaryIndustryId = update.secondaryIndustryId !== undefined
    ? update.secondaryIndustryId
    : update.primaryIndustryId !== undefined &&
        (update.primaryIndustryId === null || update.primaryIndustryId !== base.primaryIndustryId)
      ? null
      : base.secondaryIndustryId;
  return {
    ...(primaryIndustryId === undefined ? {} : { primaryIndustryId }),
    ...(secondaryIndustryId === undefined ? {} : { secondaryIndustryId }),
  };
}

export function isIndustryIdCode(value: unknown): value is IndustryIdCode {
  return typeof value === "string" && industryIdSet.has(value);
}

export function industryLabel(
  id: IndustryIdCode,
  language: OrbitLanguage,
): string {
  return INDUSTRY_CATALOG.find((industry) => industry.id === id)?.labels[language] ?? id;
}
