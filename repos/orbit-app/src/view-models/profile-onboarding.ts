/**
 * New-user onboarding (web /app/profile/onboarding, onboarding-0918) as a pure App model.
 * Same steps, limits, option lists and relationship-goal format as the web flow; the App
 * adds Japanese labels. No React, no HTTP. Progress is inferred from saved profile fields.
 */
import type { IngestBatchDetailContract } from "../api/contract/business-card-batch";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../api/contract/industries";
import type { OrbitLanguage } from "../api/contract/language";
import { isIndustryIdCode, validateIndustrySelection } from "../api/domain/industries";
import type { ProfileDetail } from "../api/profile-detail-contract";
import { ingestCards } from "./business-card-ingest";
import { safeProfileContinuationNext } from "./profile-continuation-route";

export type Copy = { readonly zh: string; readonly en: string; readonly ja: string };
export type OnboardingStep = "profile" | "goals" | "persona" | "intro" | "import";

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["profile", "goals", "persona", "intro", "import"];

// Same limits as the web model (and the server's ink-signal validation for offering/seeking).
export const GOAL_LIMIT = 3;
export const OFFER_LIMIT = 5;
export const SEEK_LIMIT = 5;
export const TOPIC_LIMIT = 8;
export const FOCUS_LIMIT = 80;
export const BIO_LIMIT = 80;
export const HEADLINE_LIMIT = 80;
export const CUSTOM_TAG_LIMIT = 24;
// 「换一版」 attempts; the automatic first draft and failed attempts do not count.
export const INTRO_REGENERATE_LIMIT = 3;

export interface GoalGroup {
  readonly title: Copy;
  readonly options: readonly Copy[];
}

export const GOAL_GROUPS: readonly GoalGroup[] = [
  {
    title: { zh: "业务增长", en: "Business growth", ja: "事業の成長" },
    options: [
      { zh: "获取客户", en: "Win customers", ja: "顧客獲得" },
      { zh: "寻找合作伙伴", en: "Find partners", ja: "パートナー探し" },
      { zh: "开拓新市场", en: "Enter a new market", ja: "新市場の開拓" },
      { zh: "出海拓展", en: "Expand overseas", ja: "海外展開" },
      { zh: "寻找供应商", en: "Source suppliers", ja: "仕入れ先探し" },
      { zh: "提升品牌曝光", en: "Build brand awareness", ja: "ブランド認知の向上" }
    ]
  },
  {
    title: { zh: "资金与团队", en: "Funding & team", ja: "資金とチーム" },
    options: [
      { zh: "寻找投资", en: "Raise funding", ja: "資金調達" },
      { zh: "寻找投资机会", en: "Find deals to invest in", ja: "投資先探し" },
      { zh: "招聘人才", en: "Hire talent", ja: "人材採用" },
      { zh: "寻找联合创始人", en: "Find a co-founder", ja: "共同創業者探し" }
    ]
  },
  {
    title: { zh: "人脉与成长", en: "Network & growth", ja: "人脈と成長" },
    options: [
      { zh: "拓展行业人脉", en: "Grow my industry network", ja: "業界人脈の拡大" },
      { zh: "学习行业趋势", en: "Learn industry trends", ja: "業界トレンドの学習" },
      { zh: "寻找导师", en: "Find a mentor", ja: "メンター探し" },
      { zh: "职业发展", en: "Advance my career", ja: "キャリアアップ" },
      { zh: "组织活动与社群", en: "Build a community", ja: "イベント・コミュニティ運営" },
      { zh: "探索新方向", en: "Explore a new direction", ja: "新しい方向性の模索" }
    ]
  }
];

const GOAL_OPTIONS_FLAT: readonly Copy[] = GOAL_GROUPS.flatMap(group => group.options);

export const HORIZONS: readonly Copy[] = [
  { zh: "本月", en: "This month", ja: "今月" },
  { zh: "本季度", en: "This quarter", ja: "今四半期" },
  { zh: "今年", en: "This year", ja: "今年" }
];

export const OFFER_OPTIONS: readonly Copy[] = [
  { zh: "投融资资源", en: "Investment & funding", ja: "投資・資金調達の人脈" },
  { zh: "客户引荐", en: "Customer introductions", ja: "顧客紹介" },
  { zh: "市场渠道", en: "Market channels", ja: "販売チャネル" },
  { zh: "行业经验", en: "Industry expertise", ja: "業界経験" },
  { zh: "产品与技术咨询", en: "Product & tech advice", ja: "プロダクト・技術の相談" },
  { zh: "创业辅导", en: "Startup mentoring", ja: "起業支援" },
  { zh: "日本市场资源", en: "Japan market access", ja: "日本市場のつながり" },
  { zh: "中国市场资源", en: "China market access", ja: "中国市場のつながり" },
  { zh: "出海落地支持", en: "Overseas expansion support", ja: "海外進出サポート" },
  { zh: "供应链资源", en: "Supply chain resources", ja: "サプライチェーン" },
  { zh: "人才推荐", en: "Talent referrals", ja: "人材紹介" },
  { zh: "媒体与品牌曝光", en: "Media & brand exposure", ja: "メディア・ブランド露出" },
  { zh: "活动与社群资源", en: "Events & community access", ja: "イベント・コミュニティ" },
  { zh: "法务财税咨询", en: "Legal, tax & finance advice", ja: "法務・税務・財務の相談" },
  { zh: "AI 落地经验", en: "Hands-on AI adoption", ja: "AI導入の実務経験" },
  { zh: "技术开发能力", en: "Engineering capacity", ja: "技術開発力" },
  { zh: "设计与创意", en: "Design & creative", ja: "デザイン・クリエイティブ" },
  { zh: "销售与商务拓展", en: "Sales & business development", ja: "営業・事業開発" },
  { zh: "数据分析", en: "Data & analytics", ja: "データ分析" },
  { zh: "翻译与跨文化沟通", en: "Translation & cross-cultural support", ja: "翻訳・異文化コミュニケーション" },
  { zh: "办公场地与孵化", en: "Office space & incubation", ja: "オフィス・インキュベーション" },
  { zh: "政府与政策资源", en: "Government & policy contacts", ja: "行政・政策のつながり" }
];

export const SEEK_OPTIONS: readonly Copy[] = [
  { zh: "投资人", en: "Investors", ja: "投資家" },
  { zh: "联合创始人", en: "Co-founders", ja: "共同創業者" },
  { zh: "潜在客户", en: "Potential customers", ja: "見込み顧客" },
  { zh: "渠道合作伙伴", en: "Channel partners", ja: "販売パートナー" },
  { zh: "战略合作伙伴", en: "Strategic partners", ja: "戦略パートナー" },
  { zh: "出海合作伙伴", en: "Overseas expansion partners", ja: "海外展開のパートナー" },
  { zh: "供应商", en: "Suppliers", ja: "仕入れ先" },
  { zh: "行业导师", en: "Mentors & advisors", ja: "メンター・アドバイザー" },
  { zh: "技术人才", en: "Technical talent", ja: "技術人材" },
  { zh: "媒体与 KOL", en: "Media & KOLs", ja: "メディア・KOL" },
  { zh: "活动主办方", en: "Event organisers", ja: "イベント主催者" },
  { zh: "同行交流", en: "Industry peers", ja: "同業者との交流" },
  { zh: "早期用户", en: "Early adopters", ja: "アーリーアダプター" },
  { zh: "行业专家", en: "Industry experts", ja: "業界の専門家" },
  { zh: "本地向导", en: "Local guides", ja: "現地ガイド" },
  { zh: "创业者", en: "Founders", ja: "起業家" },
  { zh: "业务人才", en: "Business talent", ja: "ビジネス人材" },
  { zh: "服务商", en: "Service providers", ja: "サービス提供者" },
  { zh: "社群运营者", en: "Community builders", ja: "コミュニティ運営者" },
  { zh: "企业决策者", en: "Enterprise decision-makers", ja: "企業の意思決定者" }
];

export const TOPIC_OPTIONS: readonly Copy[] = [
  { zh: "生成式 AI", en: "Generative AI", ja: "生成AI" },
  { zh: "创业与融资", en: "Startups & fundraising", ja: "起業・資金調達" },
  { zh: "出海与跨境", en: "Going global", ja: "海外進出・越境" },
  { zh: "日本市场", en: "Japan market", ja: "日本市場" },
  { zh: "中国市场", en: "China market", ja: "中国市場" },
  { zh: "SaaS 与企业服务", en: "SaaS & enterprise", ja: "SaaS・法人向けサービス" },
  { zh: "金融科技", en: "Fintech", ja: "フィンテック" },
  { zh: "消费品牌", en: "Consumer brands", ja: "消費者ブランド" },
  { zh: "产品与增长", en: "Product & growth", ja: "プロダクト・グロース" },
  { zh: "投资趋势", en: "Investment trends", ja: "投資トレンド" },
  { zh: "可持续发展", en: "Sustainability", ja: "サステナビリティ" },
  { zh: "医疗健康", en: "Healthcare", ja: "医療・ヘルスケア" },
  { zh: "Web3", en: "Web3", ja: "Web3" },
  { zh: "团队与管理", en: "Leadership & teams", ja: "チーム・マネジメント" },
  { zh: "跨境电商", en: "Cross-border e-commerce", ja: "越境EC" },
  { zh: "机器人与硬件", en: "Robotics & hardware", ja: "ロボット・ハードウェア" },
  { zh: "新能源", en: "New energy", ja: "新エネルギー" },
  { zh: "内容与媒体", en: "Content & media", ja: "コンテンツ・メディア" },
  { zh: "教育", en: "Education", ja: "教育" },
  { zh: "文旅与餐饮", en: "Travel, food & hospitality", ja: "旅行・飲食・ホスピタリティ" }
];

export function optionLabel(option: Copy, language: OrbitLanguage): string {
  return option[language];
}

/** A saved tag equals an option when it matches the option in any language. */
export function optionMatches(option: Copy, value: string): boolean {
  return value === option.zh || value === option.en || value === option.ja;
}

export function isKnownOption(options: readonly Copy[], value: string): boolean {
  return options.some(option => optionMatches(option, value));
}

export function toggleValue(values: readonly string[], value: string, limit?: number): string[] {
  if (values.includes(value)) return values.filter(item => item !== value);
  if (limit !== undefined && values.length >= limit) return [...values];
  return [...values, value];
}

/** Custom chip: NFKC, collapse whitespace, case-insensitive de-duplication, ≤ 24 characters. */
export function addCustomValue(values: readonly string[], raw: string, limit?: number): string[] {
  const value = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!value || value.length > CUSTOM_TAG_LIMIT) return [...values];
  if (values.some(item => item.toLowerCase() === value.toLowerCase())) return [...values];
  if (limit !== undefined && values.length >= limit) return [...values];
  return [...values, value];
}

export interface GoalDraft {
  readonly goals: readonly string[];
  readonly focus: string;
  readonly horizon: string;
}

/** Goals step → relationshipGoal, the web format: 「a、b：focus（horizon）」 / "a, b: focus (horizon)". */
export function composeRelationshipGoal(draft: GoalDraft, language: OrbitLanguage): string {
  const goals = draft.goals.map(goal => goal.trim()).filter(Boolean);
  const focus = draft.focus.trim();
  const horizon = draft.horizon.trim();
  if (!goals.length && !focus) return "";
  const en = language === "en";
  const head = goals.join(en ? ", " : "、");
  const body = head && focus ? `${head}${en ? ": " : "："}${focus}` : head || focus;
  if (!horizon) return body;
  return en ? `${body} (${horizon})` : `${body}（${horizon}）`;
}

/** Inverse of composeRelationshipGoal; unrecognised text becomes the one-line focus. */
export function parseRelationshipGoal(text: string): GoalDraft {
  let rest = text.trim();
  if (!rest) return { goals: [], focus: "", horizon: "" };
  let horizon = "";
  const horizonMatch = rest.match(/(?:（([^（）]+)）|\s\(([^()]+)\))$/u);
  const horizonText = horizonMatch ? (horizonMatch[1] ?? horizonMatch[2] ?? "").trim() : "";
  if (horizonMatch && horizonText && isKnownOption(HORIZONS, horizonText)) {
    horizon = horizonText;
    rest = rest.slice(0, horizonMatch.index).trim();
  }
  const split = rest.match(/^([^]*?)(?:：|: )([^]*)$/u);
  const head = split ? split[1]! : rest;
  const focus = split ? split[2]!.trim() : "";
  const candidates = head.split(/、|, /u).map(item => item.trim()).filter(Boolean);
  const known = candidates.length > 0 && candidates.length <= GOAL_LIMIT && candidates.every(item => isKnownOption(GOAL_OPTIONS_FLAT, item));
  if (known) return { goals: candidates, focus: focus.slice(0, FOCUS_LIMIT), horizon };
  return { goals: [], focus: rest.slice(0, FOCUS_LIMIT), horizon };
}

// Same rule as the server's completion policy: calendar strings, never a local instant.
export function isValidProfileBirthDate(value: unknown, today: string): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value > today) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

export interface BasicDraft {
  birthDate: string;
  company: string;
  name: string;
  primaryIndustryId: IndustryIdCode | "";
  secondaryIndustryId: SecondaryIndustryIdCode | "";
  title: string;
}

export const EMPTY_BASIC: BasicDraft = { birthDate: "", company: "", name: "", primaryIndustryId: "", secondaryIndustryId: "", title: "" };

export function basicDraftFromProfile(profile: ProfileDetail["profile"]): BasicDraft {
  if (!profile) return EMPTY_BASIC;
  return {
    birthDate: profile.birthDate ?? "",
    company: profile.organization ?? "",
    name: profile.displayName ?? "",
    primaryIndustryId: isIndustryIdCode(profile.primaryIndustryId) ? profile.primaryIndustryId : "",
    secondaryIndustryId: (profile.secondaryIndustryId as SecondaryIndustryIdCode | null | undefined) ?? "",
    title: profile.role ?? ""
  };
}

export function basicIndustryValid(draft: BasicDraft): boolean {
  return Boolean(draft.primaryIndustryId && draft.secondaryIndustryId)
    && validateIndustrySelection({ primaryIndustryId: draft.primaryIndustryId, secondaryIndustryId: draft.secondaryIndustryId }).valid;
}

export function basicDraftValid(draft: BasicDraft, today: string): boolean {
  return Boolean(draft.name.trim()) && basicIndustryValid(draft) && isValidProfileBirthDate(draft.birthDate, today);
}

export interface OnboardingProgress {
  profile: boolean;
  goals: boolean;
  persona: boolean;
  intro: boolean;
}

/** Which steps the saved profile already covers (the web preview uses the same rules). */
export function onboardingProgress(detail: ProfileDetail): OnboardingProgress {
  const profile = detail.profile;
  return {
    profile: detail.onboarding?.status === "complete",
    goals: Boolean(profile?.relationshipGoal.trim()),
    persona: Boolean(profile?.offering?.length || profile?.seeking?.length),
    intro: Boolean(profile?.bio?.trim() || profile?.headline.trim())
  };
}

export type OnboardingEntry =
  | { kind: "done" }
  | { kind: "welcome" }
  | { kind: "resume"; completed: number; step: OnboardingStep };

/**
 * Where the flow opens. Steps 1–4 all saved → leave; none → welcome; otherwise the
 * 「继续设置你的资料」 card pointing at the first unfinished step. The import step is
 * never inferable, so it is only reached through the flow itself.
 */
export function onboardingEntry(detail: ProfileDetail): OnboardingEntry {
  const progress = onboardingProgress(detail);
  const order: (keyof OnboardingProgress)[] = ["profile", "goals", "persona", "intro"];
  const completed = order.filter(step => progress[step]).length;
  if (completed === order.length) return { kind: "done" };
  if (completed === 0) return { kind: "welcome" };
  return { kind: "resume", completed, step: order.find(step => !progress[step])! };
}

/** Finish/"later" destination: a safe next, the plain profile page, or /home. */
export function onboardingDestination(next: string | string[] | undefined): string {
  const first = (Array.isArray(next) ? next[0] : next)?.trim();
  if (first === "/profile") return "/profile";
  return safeProfileContinuationNext(first);
}

/** The intro-draft endpoint writes Chinese or English (web sends "en" for every non-zh language). */
export function introDraftLanguage(language: OrbitLanguage): "zh" | "en" {
  return language === "zh" ? "zh" : "en";
}

export interface OnboardingImportSummary {
  imported: number;
  review: number;
  recognizing: number;
  reviewBatchId: string | null;
}

const RECOGNIZING = new Set(["awaiting_upload", "uploaded", "queued", "processing"]);
const SET_ASIDE = new Set(["skipped", "excluded"]);

/** Per-card counts for the batches started from the import step. */
export function onboardingImportSummary(details: readonly IngestBatchDetailContract[]): OnboardingImportSummary {
  const summary: OnboardingImportSummary = { imported: 0, review: 0, recognizing: 0, reviewBatchId: null };
  for (const detail of details) {
    for (const card of ingestCards(detail)) {
      const statuses = card.items.map(item => item.status);
      if (statuses.every(status => status === "confirmed")) summary.imported++;
      else if (statuses.some(status => RECOGNIZING.has(status))) summary.recognizing++;
      else if (statuses.every(status => SET_ASIDE.has(status))) continue;
      else {
        summary.review++;
        summary.reviewBatchId ??= detail.batch.id;
      }
    }
  }
  return summary;
}
