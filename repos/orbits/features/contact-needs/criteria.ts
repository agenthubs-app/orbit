import type { ContactNeedCriterionContract, ContactNeedDimensionCode } from "../../shared/contract/contact-needs";

export type CriterionDefinition = ContactNeedCriterionContract & {
  dimension: ContactNeedDimensionCode;
  aliases: readonly string[];
  weak?: boolean;
};

export function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/** Latin aliases are words, not substrings of chairperson, retail, or fundraising. */
export function containsAlias(text: string, aliases: readonly string[]): boolean {
  const normalized = normalize(text);
  return aliases.some(alias => {
    const word = normalize(alias);
    if (!/^[\x00-\x7f]+$/u.test(word)) return normalized.includes(word);
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "u").test(normalized);
  });
}

const define = (id: string, label: string, type: CriterionDefinition["type"], dimension: ContactNeedDimensionCode, aliases: readonly string[]): CriterionDefinition => ({ id, label, type, dimension, aliases });

const locations = [
  define("location:japan", "日本", "location", "location", ["日本", "japan", "日本国"]),
  define("location:united-states", "美国", "location", "location", ["美国", "美國", "united states", "usa", "u.s."]),
  define("location:china", "中国", "location", "location", ["中国", "中國", "china"]),
  define("location:tokyo", "东京", "location", "location", ["东京", "東京", "tokyo"]),
];
const industries = [
  define("industry:manufacturing_supply_chain", "制造与供应链", "industry", "scenario", ["制造业", "製造業", "制造", "製造", "manufacturing", "供应链", "サプライチェーン", "supply chain"]),
  define("industry:technology_internet", "科技与互联网", "industry", "scenario", ["科技", "技术", "テクノロジー", "technology", "互联网", "インターネット", "software", "软件", "軟件"]),
  define("industry:finance_investment", "金融与投资", "industry", "scenario", ["金融", "finance", "投资", "投資", "investment", "venture", "风投", "ベンチャー"]),
  define("industry:trade_logistics", "贸易与物流", "industry", "scenario", ["贸易", "貿易", "trade", "物流", "ロジスティクス", "logistics"]),
  define("industry:professional_services", "专业服务", "industry", "scenario", ["专业服务", "専門サービス", "professional services", "咨询", "コンサル", "consulting"]),
  define("industry:retail_consumer", "零售与消费", "industry", "scenario", ["零售", "小売", "retail", "消费", "消費財", "consumer"]),
  define("industry:healthcare_life_sciences", "医疗与健康", "industry", "scenario", ["医疗", "医療", "healthcare", "健康", "life sciences"]),
  define("industry:education_research", "教育与研究", "industry", "scenario", ["教育", "education", "研究", "research"]),
  define("industry:media_creative", "文化传媒与创意", "industry", "scenario", ["传媒", "メディア", "media", "创意", "クリエイティブ", "creative"]),
  define("scenario:restaurant", "餐饮业务", "industry", "scenario", ["餐厅", "餐飲", "餐饮", "门店", "店舗", "飲食", "レストラン", "restaurant", "restaurants"]),
  define("scenario:ordering", "点餐业务", "keyword", "scenario", ["点餐", "點餐", "点单", "點單", "注文", "ordering", "order-taking"]),
];
const capabilities = [
  define("capability:procurement", "采购", "capability", "capability", ["采购", "採購", "調達", "procurement", "purchasing", "buyer"]),
  define("capability:investment", "投资", "capability", "capability", ["投资", "投資", "investment", "investor", "investors", "venture", "融资", "資金調達", "fundraising"]),
  define("capability:sales", "销售", "capability", "capability", ["销售", "銷售", "営業", "sales", "business development"]),
  define("capability:partnership", "合作拓展", "capability", "capability", ["合作拓展", "提携", "partnerships", "alliances"]),
];
const delivery = define("capability:delivery", "交付或门店试点", "capability", "capability", ["开发", "开发者", "工程师", "开发商", "交付", "试点", "店长", "門店", "门店", "開発", "エンジニア", "実証", "店長", "developer", "developers", "engineer", "development", "implementation", "pilot"]);
const implementation = define("collaboration:implementation", "落地合作", "capability", "collaboration", ["试点合作", "落地", "实施", "交付", "実証", "導入", "implementation", "pilot", "delivery"]);
const weakAI: CriterionDefinition = { ...define("keyword:ai", "AI", "keyword", "scenario", ["ai", "人工智能", "人工知能"]), weak: true };
const filler = new Set(["现在", "在做", "一些", "最近", "系统", "做", "想", "寻找", "希望", "认识", "联系", "合作", "伙伴", "合作伙伴", "探す", "相手", "協力", "システム", "作っています", "パートナー", "find", "looking", "for", "seeking", "want", "meet", "partner", "partners", "partnership", "collaboration", "building", "system", "systems", "am", "some", "currently", "a", "an", "the", "in", "with", "and"]);

export function criteriaForNeed(goal: string): CriterionDefinition[] {
  const need = normalize(goal.trim());
  if (!need || /(?:不要|不需要|排除|除外|除く|以外|without|excluding|except|do not|don't)/u.test(need)) return [];
  // Project context still supplies the scenario; only the target clause supplies a specific role.
  const target = need.match(/(?:寻找|找|需要|求める|探す|looking for|seeking|find|want)\s*(.*)$/u)?.[1] ?? need;
  const specific = capabilities.filter(item => containsAlias(target, item.aliases));
  const known = [...locations.filter(item => containsAlias(need, item.aliases)), ...industries.filter(item => containsAlias(need, item.aliases)), ...specific];
  const restaurantProject = known.some(item => item.id === "scenario:restaurant" || item.id === "scenario:ordering");
  if (restaurantProject && specific.length === 0) known.push(delivery);
  if (/(?:合作|协作|落地|試点|试点|協力|協業|パートナー|collaboration|partners?|implementation|pilot)/u.test(need)) known.push(implementation);
  if (containsAlias(need, weakAI.aliases)) known.push(weakAI);
  // Known scenarios use concepts, never filler fragments or arbitrary extra denominators.
  if (known.length) return known;
  const words = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(need)]
    .filter(item => item.isWordLike).map(item => item.segment.trim()).filter(word => word.length > 1 && !filler.has(word));
  return [...new Set(words)].map(word => define(`keyword:${word}`, word, "keyword", "scenario", [word]));
}
