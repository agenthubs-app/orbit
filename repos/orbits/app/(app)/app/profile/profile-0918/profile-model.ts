import type {
  ContactHandlesContract,
  ProfileOnboardingContract,
  ProfileOnboardingFieldCode,
} from "../../../../../shared/contract/profile";
import type { OrbitProfileEditorView } from "../profile-editor-adapter";

type Copy = { zh: string; en: string };

export const ONBOARDING_FIELD_LABEL: Record<ProfileOnboardingFieldCode, Copy> = {
  displayName: { zh: "姓名", en: "Name" },
  primaryIndustryId: { zh: "一级行业", en: "Primary industry" },
  secondaryIndustryId: { zh: "二级行业", en: "Secondary industry" },
  birthDate: { zh: "生日", en: "Birth date" },
};

/** 缺项代码 → 标签；服务端新增的未知代码回退为代码本身，不抛 TypeError（终审 M2）。 */
export function onboardingFieldLabel(code: string, language: "zh" | "en"): string {
  const copy = (ONBOARDING_FIELD_LABEL as Partial<Record<string, Copy>>)[code];
  return copy?.[language] ?? code;
}

export function missingFieldLabels(
  onboarding: ProfileOnboardingContract,
  language: "zh" | "en",
): string[] {
  return onboarding.missingFields.map(code => onboardingFieldLabel(code, language));
}

function filledText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

/*
 * 资料完整度（设计稿「资料完整度 82%」的真实派生口径）：
 * 10 项已填比例，四舍五入为百分比。清单：
 *   1. 姓名 fullName
 *   2. 一级行业 primaryIndustryId
 *   3. 二级行业 secondaryIndustryId
 *   4. 生日 birthDate
 *   5. 职位 title
 *   6. 公司 company
 *   7. 一句话介绍 / 关于我 bio
 *   8. 我能提供 offering（非空数组）
 *   9. 我在寻找 seeking（非空数组）
 *  10. 想聊的话题 topics（非空数组）
 * 纯文本项去空白后非空才算已填。
 */
export function completeness(p: OrbitProfileEditorView): { score: number; filled: number; total: number } {
  const items: boolean[] = [
    filledText(p.fullName),
    filledText(p.primaryIndustryId),
    filledText(p.secondaryIndustryId),
    filledText(p.birthDate),
    filledText(p.title),
    filledText(p.company),
    filledText(p.bio),
    p.offering.length > 0,
    p.seeking.length > 0,
    p.topics.length > 0,
  ];
  const total = items.length;
  const filled = items.filter(Boolean).length;
  return { score: Math.round((filled / total) * 100), filled, total };
}

export interface PersonaGroup {
  key: "goal" | "offer" | "seek" | "topic";
  icon: string;
  title: Copy;
  hint: Copy;
  placeholder: Copy;
  /** 预设选项：多选组点选即加 badge；goal 点选即填入输入框（单文本，替换当前内容）。 */
  options: readonly Copy[];
  values: string[];
}

/*
 * 预设选项按 Orbit 定位编写：「懂你人脉的商务秘书」，服务商业活动参与者（创业者 + 潜客维护者），
 * 中日跨境场景为主。选项只是快捷输入，存入的仍是当前语言的纯文本标签，与手动添加的标签同一口径。
 */
// 我的目标：一条人脉目标 + 两条商业目标，作为填写示例；点击后可在输入框里继续改。
export const GOAL_OPTIONS: readonly Copy[] = [
  { zh: "三个月内认识 3 位日本市场的渠道伙伴", en: "Meet three channel partners for the Japan market within three months" },
  { zh: "年内在东京开出第一家线下门店", en: "Open our first physical store in Tokyo this year" },
  { zh: "从 0 到 1 打造自有品牌", en: "Build our own brand from zero to one" },
];

export const OFFER_OPTIONS: readonly Copy[] = [
  { zh: "投融资资源", en: "Investment & funding" },
  { zh: "客户引荐", en: "Customer introductions" },
  { zh: "市场渠道", en: "Market channels" },
  { zh: "行业经验", en: "Industry expertise" },
  { zh: "产品与技术咨询", en: "Product & tech advice" },
  { zh: "创业辅导", en: "Startup mentoring" },
  { zh: "日本市场资源", en: "Japan market access" },
  { zh: "中国市场资源", en: "China market access" },
  { zh: "出海落地支持", en: "Overseas expansion support" },
  { zh: "供应链资源", en: "Supply chain resources" },
  { zh: "人才推荐", en: "Talent referrals" },
  { zh: "媒体与品牌曝光", en: "Media & brand exposure" },
  { zh: "活动与社群资源", en: "Events & community access" },
  { zh: "法务财税咨询", en: "Legal, tax & finance advice" },
  { zh: "AI 落地经验", en: "Hands-on AI adoption" },
  { zh: "技术开发能力", en: "Engineering capacity" },
  { zh: "设计与创意", en: "Design & creative" },
  { zh: "销售与商务拓展", en: "Sales & business development" },
  { zh: "数据分析", en: "Data & analytics" },
  { zh: "翻译与跨文化沟通", en: "Translation & cross-cultural support" },
  { zh: "办公场地与孵化", en: "Office space & incubation" },
  { zh: "政府与政策资源", en: "Government & policy contacts" },
];

export const SEEK_OPTIONS: readonly Copy[] = [
  { zh: "投资人", en: "Investors" },
  { zh: "联合创始人", en: "Co-founders" },
  { zh: "潜在客户", en: "Potential customers" },
  { zh: "渠道合作伙伴", en: "Channel partners" },
  { zh: "战略合作伙伴", en: "Strategic partners" },
  { zh: "出海合作伙伴", en: "Overseas expansion partners" },
  { zh: "供应商", en: "Suppliers" },
  { zh: "行业导师", en: "Mentors & advisors" },
  { zh: "技术人才", en: "Technical talent" },
  { zh: "媒体与 KOL", en: "Media & KOLs" },
  { zh: "活动主办方", en: "Event organisers" },
  { zh: "同行交流", en: "Industry peers" },
  { zh: "早期用户", en: "Early adopters" },
  { zh: "行业专家", en: "Industry experts" },
  { zh: "本地向导", en: "Local guides" },
  { zh: "创业者", en: "Founders" },
  { zh: "业务人才", en: "Business talent" },
  { zh: "服务商", en: "Service providers" },
  { zh: "社群运营者", en: "Community builders" },
  { zh: "企业决策者", en: "Enterprise decision-makers" },
];

export const TOPIC_OPTIONS: readonly Copy[] = [
  { zh: "生成式 AI", en: "Generative AI" },
  { zh: "创业与融资", en: "Startups & fundraising" },
  { zh: "出海与跨境", en: "Going global" },
  { zh: "日本市场", en: "Japan market" },
  { zh: "中国市场", en: "China market" },
  { zh: "SaaS 与企业服务", en: "SaaS & enterprise" },
  { zh: "金融科技", en: "Fintech" },
  { zh: "消费品牌", en: "Consumer brands" },
  { zh: "产品与增长", en: "Product & growth" },
  { zh: "投资趋势", en: "Investment trends" },
  { zh: "可持续发展", en: "Sustainability" },
  { zh: "医疗健康", en: "Healthcare" },
  { zh: "Web3", en: "Web3" },
  { zh: "团队与管理", en: "Leadership & teams" },
  { zh: "跨境电商", en: "Cross-border e-commerce" },
  { zh: "机器人与硬件", en: "Robotics & hardware" },
  { zh: "新能源", en: "New energy" },
  { zh: "内容与媒体", en: "Content & media" },
  { zh: "教育", en: "Education" },
  { zh: "文旅与餐饮", en: "Travel, food & hospitality" },
];

/** 选项在任一语言下已被选中（切换语言后仍能识别之前选的标签）。 */
export function selectedOptionValue(option: Copy, values: readonly string[]): string | undefined {
  return values.find(value => value === option.zh || value === option.en);
}

// goal = 单文本 intro(=relationshipGoal)，手动输入，随画像保存（matching 作用域）。
// 其余三组 icon / hint / placeholder 取设计稿 renderVals().groupMeta（◎ ✦ ⚇ ▤），外加预设多选选项。
export function personaGroups(p: OrbitProfileEditorView): PersonaGroup[] {
  const intro = p.intro.trim();
  return [
    {
      key: "goal",
      icon: "◎",
      title: { zh: "我的目标", en: "My goal" },
      hint: { zh: "用一句话写下你近期最想达成的目标，人脉或商业目标都可以。", en: "In one sentence, what do you most want to achieve right now? A networking or business goal both work." },
      placeholder: { zh: "写下你的目标，或点击下方示例快速填入", en: "Write your goal, or tap an example below" },
      options: GOAL_OPTIONS,
      values: intro ? [intro] : [],
    },
    {
      key: "offer",
      icon: "✦",
      title: { zh: "我能提供", en: "I can offer" },
      hint: { zh: "你可以为他人提供什么帮助或资源？（可选择多个）", en: "What help or resources can you offer others? (multiple allowed)" },
      placeholder: { zh: "添加我能提供的内容，例如：投资机会", en: "Add what you can offer, e.g. investment opportunities" },
      options: OFFER_OPTIONS,
      values: [...p.offering],
    },
    {
      key: "seek",
      icon: "⚇",
      title: { zh: "我在寻找", en: "I am seeking" },
      hint: { zh: "你希望结识什么样的人或组织？（可选择多个）", en: "Who or which organisations do you hope to meet? (multiple allowed)" },
      placeholder: { zh: "添加你在寻找的对象，例如：市场渠道伙伴", en: "Add who you are seeking, e.g. channel partners" },
      options: SEEK_OPTIONS,
      values: [...p.seeking],
    },
    {
      key: "topic",
      icon: "▤",
      title: { zh: "想聊的话题", en: "Topics to talk about" },
      hint: { zh: "你对哪些话题感兴趣？（可选择多个）", en: "Which topics interest you? (multiple allowed)" },
      placeholder: { zh: "添加你感兴趣的话题，例如：可持续发展", en: "Add a topic you care about, e.g. sustainability" },
      options: TOPIC_OPTIONS,
      values: [...p.topics],
    },
  ];
}

export interface ContactRow {
  icon: string;
  label: string;
  value: string;
}

// 非空 handles，顺序 email/linkedin/line/wechat/phone/website/x。
// email/line/wechat 读可见草稿字段（与编辑器一致），其余读 handles。
export function contactRows(p: OrbitProfileEditorView): ContactRow[] {
  const handles: ContactHandlesContract = p.handles ?? {};
  const candidates: readonly (readonly [string, string, string | undefined])[] = [
    ["✉", "Email", p.email],
    ["in", "LinkedIn", handles.linkedinUrl],
    ["L", "LINE", p.lineId],
    ["W", "WeChat", p.wechatName],
    ["☎", "Phone", handles.phone],
    ["⌂", "Website", handles.website],
    ["X", "X", handles.xHandle],
  ];
  const rows: ContactRow[] = [];
  for (const [icon, label, raw] of candidates) {
    const value = raw?.trim();
    if (value) rows.push({ icon, label, value });
  }
  return rows;
}

// 设计稿 renderVals().aboutShort：关于我（bio）前 62 个字符 + …；右卡「当前 iOrbit 使用的信息」用。
export const ABOUT_SHORT_LIMIT = 62;

export function aboutShort(bio: string): string {
  const text = bio.trim();
  const chars = Array.from(text);
  return chars.length > ABOUT_SHORT_LIMIT ? `${chars.slice(0, ABOUT_SHORT_LIMIT).join("")}…` : text;
}

export type SuggestionKey = "basic" | "persona" | "connect";

// 资料建议三条 = 真实条件：基础资料未完成 / 任一画像组为空 / 连接数 0。
export function suggestions(p: OrbitProfileEditorView, connectedCount: number): SuggestionKey[] {
  const keys: SuggestionKey[] = [];
  if (p.onboarding.status !== "complete") keys.push("basic");
  if (personaGroups(p).some(group => group.values.length === 0)) keys.push("persona");
  if (connectedCount === 0) keys.push("connect");
  return keys;
}
