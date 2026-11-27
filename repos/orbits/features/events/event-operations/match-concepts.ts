/**
 * Program-owned match concepts (2026-11-22). Profile needs, offers and topics are tags from two vocabularies
 * (the app's trilingual options and the imported event tag list). Each tag, in any of its languages, maps to a
 * concept; the program then decides — without the model — whether a need is answered by an offer and whether two
 * topics are the same kind. Unlisted (free-text) values only match by their wording (see topicsShareByText).
 */
import { INDUSTRY_CATALOG } from "../../../shared/domain/industries";

/** Normalised tag text: width/case folded, parenthesised qualifiers (（総合）) and spaces dropped. */
export const tagKey = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[(（][^)）]*[)）]/gu, "").replace(/\s+/gu, "");

type Table = Readonly<Record<string, readonly string[]>>;

/** Need concept → the tags (any language) that express it. */
const NEED_TAGS: Table = {
  funding: ["資金調達（シード〜プレA）", "資金調達（シリーズA以降）", "エンジェル投資家との接点", "投資家", "投资人", "Investors", "IPOに向けた相談", "投資家・資金", "投资人、资金", "Investors or funding", "寻找投资", "认识投资人"],
  overseas: ["海外展開パートナー", "出海合作伙伴", "Overseas expansion partners", "对接中日资源"],
  north_america: ["北米進出サポート"],
  southeast_asia: ["東南アジア進出サポート"],
  china_entry: ["中国進出サポート"],
  channel: ["代理店・販売パートナー", "販売代理店・チャネルパートナー", "渠道合作伙伴", "Channel partners", "営業・事業開発", "销售、业务拓展人员", "Sales and BD people"],
  customers: ["最初の顧客・テストユーザー", "見込み顧客", "潜在客户", "Potential customers", "初期ユーザー", "早期用户", "Early adopters", "顧客・取引先", "客户、合作方", "Customers or clients", "获取客户", "新規顧客開拓"],
  enterprise: ["大企業との協業機会", "企業の意思決定者", "企业决策者", "Enterprise decision-makers", "事業会社の担当者", "企业业务负责人", "People at established companies"],
  partner: ["事業パートナー / 共同創業者", "共同創業者", "联合创始人", "Co-founders", "戦略的パートナー", "战略合作伙伴", "Strategic partners", "事業パートナー", "业务合作伙伴", "Business partners", "A co-founder", "找到合作机会", "找到合作伙伴", "认识合作伙伴", "寻找合作伙伴", "提携先探し"],
  tech: ["技術パートナー / 開発会社", "技術的なアドバイス", "サービス事業者", "服务商", "Service providers", "エンジニア", "工程师", "Engineers"],
  ai_dx: ["AI / DX推進の相談"],
  data: ["データ活用の相談"],
  hiring_eng: ["エンジニアの採用", "技術人材", "技术人才", "Technical talent"],
  hiring_biz: ["営業人材の採用", "副業人材・業務委託", "事業開発人材", "业务人才", "Business talent", "採用候補者", "招聘候选人", "People to hire"],
  social: ["SNS運用アドバイス"],
  brand: ["ブランド戦略の壁打ち", "PR / メディア掲載", "メディア・KOL", "媒体与 KOL", "Media & KOLs", "マーケター", "市场人员", "Marketers"],
  legal: ["法務 / 契約アドバイス"],
  accounting: ["会計 / 税務アドバイス"],
  ma: ["M&A / 事業承継の相談"],
  subsidy: ["補助金・助成金の情報"],
  mentor: ["メンター / アドバイザー", "業界メンター・アドバイザー", "行业导师", "Mentors & advisors", "壁打ち相手 / ブレスト仲間", "業界専門家", "行业专家", "Industry experts", "メンター・相談相手", "导师、可以请教的人", "A mentor", "業界の情報", "行业信息", "Industry insight", "学习行业趋势", "経営のヒントを得たい", "听听别人的创业心得"],
  community: ["コミュニティ・勉強会", "イベント主催者", "活动主办方", "Event organisers", "コミュニティ運営者", "社群运营者", "Community builders", "仲間・コミュニティ", "伙伴、社群", "Peers and community"],
  supplier: ["サプライヤー", "供应商", "Suppliers"],
  local: ["現地ガイド", "本地向导", "Local guides"],
  design: ["デザイナー", "设计师", "Designers"],
  professional: ["専門家（士業・コンサル）", "专业人士（律师、顾问等）", "Advisors and consultants"],
  research: ["研究者", "研究人员", "Researchers"],
};

/** Offer concept → the tags (any language) that express it. */
const OFFER_TAGS: Table = {
  investor_intro: ["投資家・VCの紹介", "エンジェル投資", "投資・資金調達", "投融资资源", "Investment & funding", "出資・投資", "投资", "Investment"],
  funding_advice: ["資金調達アドバイス", "IPO準備支援"],
  finance: ["財務・経理支援", "法務・税務・財務相談", "法务财税咨询", "Legal, tax & finance advice", "専門知識（法務・財務など）", "专业知识（法务、财务等）", "Expertise (legal, finance and so on)"],
  legal: ["法務・契約・知財"],
  overseas_market: ["海外市場の販路・知見", "海外展開支援", "出海落地支持", "Overseas expansion support", "海外展開の支援", "海外拓展支持", "Help going overseas"],
  north_america: ["北米市場の知見"],
  southeast_asia: ["東南アジア市場の知見"],
  china_market: ["中国市場の知見", "中国市場のネットワーク", "中国市场资源", "China market access"],
  japan_market: ["日本市場のネットワーク", "日本市场资源", "Japan market access", "日本落地经验分享"],
  cross_culture: ["翻訳・異文化コミュニケーション", "翻译与跨文化沟通", "Translation & cross-cultural support"],
  channel: ["販路・代理店開拓", "販路", "市场渠道", "Market channels", "営業・事業開発", "销售与商务拓展", "Sales & business development"],
  enterprise_intro: ["大企業への営業紹介", "顧客紹介", "客户引荐", "Customer introductions", "顧客・販路の紹介", "介绍客户和渠道", "Customer or channel introductions"],
  alliance: ["業務提携マッチング", "人の紹介", "介绍人脉", "Introductions to people", "人脉介绍", "人脈の紹介"],
  new_business: ["新規事業立ち上げ支援", "起業支援", "创业辅导", "Startup mentoring"],
  tech_build: ["プロダクト開発支援", "システム設計・アーキテクチャ", "開発力", "技术开发能力", "Engineering capacity", "技術・開発の支援", "技术和开发支持", "Technical help"],
  tech_team: ["技術チーム構築"],
  tech_advice: ["CTO的な技術アドバイス", "プロダクト・技術相談", "产品与技术咨询", "Product & tech advice"],
  ai: ["AI・機械学習の導入支援", "AI 活用の実践経験", "AI 落地经验", "Hands-on AI adoption"],
  data: ["データ分析・BI", "データ分析", "数据分析", "Data & analytics"],
  hiring: ["採用・HR支援", "人材紹介", "人才推荐", "Talent referrals", "採用の相談", "招聘咨询", "Hiring advice", "経営幹部人材の紹介"],
  social: ["SNSマーケティング", "インフルエンサー紹介"],
  marketing: ["マーケティング戦略", "SEO / コンテンツ戦略"],
  brand_pr: ["ブランディング", "メディア露出・PR", "メディア・ブランド露出", "媒体与品牌曝光", "Media & brand exposure", "デザイン・クリエイティブ", "设计与创意", "Design & creative"],
  mentoring: ["メンタリング / コーチング", "業界経験", "行业经验", "Industry expertise", "事業・経営の相談", "业务和经营咨询", "Business advice", "経験・事例の共有", "分享经验和案例", "Stories and lessons", "分享创业经验", "给经营建议", "提供行业信息"],
  events: ["イベント企画・運営", "イベント・コミュニティ", "活动与社群资源", "Events & community access", "コミュニティ運営ノウハウ"],
  research: ["大学・研究機関との連携"],
  supply_chain: ["サプライチェーン", "供应链资源", "Supply chain resources"],
  government: ["行政・政策ネットワーク", "政府与政策资源", "Government & policy contacts"],
  office: ["オフィス・インキュベーション", "办公场地与孵化", "Office space & incubation", "場所・設備", "场地、设备", "Space or equipment"],
  work: ["仕事の依頼", "工作机会", "Work to hand out"],
  ma_support: ["M&A・事業売却支援"],
};

/** Need concept → the offer concepts that answer it directly. */
const ANSWERS: Table = {
  funding: ["investor_intro", "funding_advice"],
  overseas: ["overseas_market", "north_america", "southeast_asia", "china_market", "japan_market", "channel"],
  north_america: ["north_america", "overseas_market"],
  southeast_asia: ["southeast_asia", "overseas_market"],
  china_entry: ["china_market", "cross_culture"],
  channel: ["channel", "enterprise_intro", "alliance"],
  customers: ["enterprise_intro", "channel", "alliance", "work"],
  enterprise: ["enterprise_intro", "alliance"],
  partner: ["alliance", "new_business"],
  tech: ["tech_build", "tech_team", "tech_advice"],
  ai_dx: ["ai", "data", "tech_advice"],
  data: ["data", "ai"],
  hiring_eng: ["hiring", "tech_team"],
  hiring_biz: ["hiring"],
  social: ["social", "marketing"],
  brand: ["brand_pr", "marketing", "social"],
  legal: ["legal"],
  accounting: ["finance"],
  ma: ["finance", "investor_intro", "funding_advice", "ma_support"],
  subsidy: ["funding_advice", "government"],
  mentor: ["mentoring", "new_business", "tech_advice"],
  community: ["events"],
  supplier: ["supply_chain"],
  local: ["japan_market", "china_market", "cross_culture"],
  design: ["brand_pr"],
  professional: ["legal", "finance", "mentoring", "funding_advice", "tech_advice"],
  research: ["research"],
};

/** Topic concept → the tags (any language) that are the same kind of topic. */
const TOPIC_TAGS: Table = {
  ai: ["生成AI / LLMの活用", "AIエージェント", "AI × 業界特化", "生成 AI", "生成式 AI", "Generative AI"],
  overseas: ["海外展開（総合）", "北米進出", "東南アジアビジネス", "海外展開・越境", "出海与跨境", "Going global", "越境 EC", "跨境电商", "Cross-border e-commerce", "クロスボーダーM&A"],
  china: ["中国ビジネス", "中国市場", "中国市场", "China market"],
  japan: ["日本市場", "日本市场", "Japan market", "日本の少子高齢化ビジネス"],
  new_business: ["新規事業の立ち上げ", "PMF（プロダクトマーケットフィット）", "事業のスケール戦略", "グロースハック", "プロダクト・成長", "产品与增长", "Product & growth"],
  startup_mgmt: ["スタートアップ経営", "組織崩壊と再建", "チームビルディング", "採用戦略", "チーム・マネジメント", "团队与管理", "Leadership & teams"],
  founder_wellbeing: ["経営者のメンタルヘルス"],
  funding: ["資金調達 / VC交渉術", "スタートアップ投資（する側）", "IPO準備", "M&A / EXIT戦略", "起業・資金調達", "创业与融资", "Startups & fundraising"],
  investing: ["株式・暗号資産投資", "不動産投資", "投資動向", "投资趋势", "Investment trends"],
  web3: ["Web3 / ブロックチェーン", "Web3"],
  marketing: ["コンテンツマーケティング", "インフルエンサーマーケ", "ブランディング・PR", "コミュニティドリブン成長", "コンテンツ・メディア", "内容与媒体", "Content & media", "消費者向けブランド", "消费品牌", "Consumer brands"],
  work_style: ["副業・複業", "ワークライフバランス"],
  trends: ["次の10年の大きなトレンド"],
  lessons: ["失敗談・教訓シェア"],
  sustainability: ["ESG / サステナビリティ", "サステナビリティ", "可持续发展", "Sustainability", "新エネルギー", "新能源", "New energy"],
  saas: ["SaaS・企業向けサービス", "SaaS 与企业服务", "SaaS & enterprise"],
  fintech: ["フィンテック", "金融科技", "Fintech"],
  health: ["ヘルスケア", "医疗健康", "Healthcare"],
  education: ["教育", "Education"],
  hardware: ["ロボティクス・ハードウェア", "机器人与硬件", "Robotics & hardware"],
  hospitality: ["旅行・食・ホスピタリティ", "文旅与餐饮", "Travel, food & hospitality"],
};

const index = (table: Table) => {
  const map = new Map<string, string>();
  for (const [concept, tags] of Object.entries(table)) for (const tag of tags) map.set(tagKey(tag), concept);
  return map;
};
const NEED_CONCEPT = index(NEED_TAGS);
const OFFER_CONCEPT = index(OFFER_TAGS);
/**
 * Registration industries (2026-11-28): one industry in any language is one topic, so 科技与互联网 and
 * テクノロジー・インターネット are the same; a listed topic tag with the same wording keeps its own concept.
 */
const INDUSTRY_TOPIC_TAGS: Table = Object.fromEntries(
  INDUSTRY_CATALOG.filter((industry) => industry.id !== "other").map((industry) => [`industry_${industry.id}`, Object.values(industry.labels)]),
);
const TOPIC_CONCEPT = index({ ...INDUSTRY_TOPIC_TAGS, ...TOPIC_TAGS });

export const needConcept = (text: string) => NEED_CONCEPT.get(tagKey(text)) ?? null;
export const offerConcept = (text: string) => OFFER_CONCEPT.get(tagKey(text)) ?? null;
export const topicConcept = (text: string) => TOPIC_CONCEPT.get(tagKey(text)) ?? null;

const tagParts = (text: string) => new Set(tagKey(text).split(/[/・、,，×&+]+/u).filter((part) => part.length >= 2));
/** Wording overlap for values outside the tables: equal, one containing the other, or a shared listed part. */
const GENERIC = new Set(["その他", "其他", "other", "others", "なし", "无", "none"].map(tagKey));
export function textsOverlap(left: string, right: string): boolean {
  const a = tagKey(left);
  const b = tagKey(right);
  if (!a || !b || GENERIC.has(a) || GENERIC.has(b)) return false;
  if (a === b || (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a)))) return true;
  const parts = tagParts(right);
  return [...tagParts(left)].some((part) => parts.has(part));
}

/** Two topics are a shared topic: the same concept, or (for values outside the table) overlapping wording. */
export function topicsShare(left: string, right: string): boolean {
  const a = topicConcept(left);
  const b = topicConcept(right);
  if (a && b) return a === b;
  return textsOverlap(left, right);
}

/** A need is answered by an offer: by the concept table, or (for values outside it) by overlapping wording. */
export function offerAnswersNeed(need: string, offer: string): boolean {
  const n = needConcept(need);
  const o = offerConcept(offer);
  if (n && o) return ANSWERS[n]?.includes(o) ?? false;
  if (!n && !o) return textsOverlap(need, offer);
  return false;
}

/** Profile terms the program knows (every tag of every table, any language), as normalised parts of 4+ characters. */
const GENERIC_PARTS = new Set(["壁打ち相手", "ブレスト仲間", "イベント", "コミュニティ", "パートナー", "アドバイザー"].map(tagKey));
// Whole tags only: a fragment (「メディア」 of 「メディア・ブランド露出」) also appears in free-text profiles written in
// another language, where it cannot be found (replay: the only false positives came from fragments).
const PROFILE_TERM_PARTS = [...new Set([NEED_TAGS, OFFER_TAGS, TOPIC_TAGS].flatMap((table) => Object.values(table).flat())
  .map((tag) => tagKey(tag)).filter((part) => part.length >= 4 && !GENERIC_PARTS.has(part)))];
/**
 * Known profile terms a text mentions that appear nowhere in the given profile texts (both people's needs, offers,
 * topics, highlight, industry, role). A reason that names such a term attributes something neither person said
 * (2026-11-22: 「{TARGET}さんが関心を持つ海外展開」 for someone with no such interest, in three runs out of three).
 */
export function unsupportedProfileTerms(text: string, profileTexts: readonly string[]): string[] {
  const normalized = tagKey(text);
  const own = profileTexts.map(tagKey).join("|");
  return PROFILE_TERM_PARTS.filter((part) => normalized.includes(part) && !own.includes(part));
}

/** The offer concepts that answer a need (empty for a value outside the table). */
export function offerConceptsAnswering(need: string): readonly string[] {
  const concept = needConcept(need);
  return concept ? ANSWERS[concept] ?? [] : [];
}
/** The need concepts an offer answers (empty for a value outside the table). */
export function needConceptsAnsweredBy(offer: string): readonly string[] {
  const concept = offerConcept(offer);
  return concept ? Object.entries(ANSWERS).filter(([, offers]) => offers.includes(concept)).map(([need]) => need) : [];
}
