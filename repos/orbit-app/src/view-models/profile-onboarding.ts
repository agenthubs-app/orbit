/**
 * New-user onboarding (docs/designs/redesign-2026-10/onboarding-3step-proposal.html) as a pure App model:
 * three steps, no skipping. Same limits, option lists and relationship-goal format as Web. No React, no HTTP.
 */
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../api/contract/industries";
import type { OrbitLanguage } from "../api/contract/language";
import { isIndustryIdCode, validateIndustrySelection } from "../api/domain/industries";
import type { ProfileDetail } from "../api/profile-detail-contract";
import { profileBioLimit, profileVisibleLength } from "../api/schema/profile-bio";
import { invalidProfileContactMethods, profileContactMethodsValid, type ProfileContactMethods } from "../api/compute/profile-contact-methods";
import { PROFILE_ONBOARDING_GOALS } from "../api/compute/profile-onboarding-goal";
import { isSeniorityLevelValue, type SeniorityLevelValue } from "../api/compute/seniority-group";
import { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS } from "../api/compute/profile-tag-options";
import { safeProfileContinuationNext } from "./profile-continuation-route";

export type Copy = { readonly zh: string; readonly en: string; readonly ja: string };
export type OnboardingStep = "profile" | "goals" | "intro";

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["profile", "goals", "intro"];

/**
 * The server's progress keeps its five screens (shared with Web and older Apps): step ① confirms screen 1,
 * step ② (goals + strengths) screens 2 and 3, step ③ screens 4 and 5, then finishes.
 */
export const STEP_SCREENS: Readonly<Record<OnboardingStep, readonly (1 | 2 | 3 | 4 | 5)[]>> = { profile: [1], goals: [2, 3], intro: [4, 5] };

/** The step that continues a flow whose last confirmed screen is `lastConfirmed`. */
export function stepForConfirmedScreen(lastConfirmed: number): OnboardingStep {
  return lastConfirmed < 1 ? "profile" : lastConfirmed < 3 ? "goals" : "intro";
}

// Same limits as the web model (and the server's ink-signal validation for offering/seeking).
export const GOAL_LIMIT = 2;
export const OFFER_LIMIT = 5;
export const SEEK_LIMIT = 5;
export const TOPIC_LIMIT = 8;
export const FOCUS_LIMIT = 80;

/** About-me counter: 80 when the text contains CJK, otherwise 200 (shared with the server). */
export function bioCounter(bio: string): { count: number; limit: number; over: boolean } {
  const text = bio.trim();
  const count = profileVisibleLength(text);
  const limit = profileBioLimit(text);
  return { count, limit, over: count > limit };
}
export const HEADLINE_LIMIT = 80;
export const CUSTOM_TAG_LIMIT = 24;
// 「换一版」 attempts; the automatic first draft and failed attempts do not count.
export const INTRO_REGENERATE_LIMIT = 2;

export type GoalTone = "pink" | "apricot" | "blue" | "teal" | "lav";
export interface GoalOption extends Copy {
  readonly id: string;
  readonly emoji: string;
  readonly tone: GoalTone;
  readonly sub: Copy;
}

const GOAL_TILES: Readonly<Record<string, { emoji: string; tone: GoalTone; sub: Copy }>> = {
  funding: { emoji: "💰", tone: "pink", sub: { ja: "投資家・金融機関", zh: "投资人、金融机构", en: "Investors · lenders" } },
  customers: { emoji: "🏭", tone: "blue", sub: { ja: "決裁者・購買担当", zh: "决策者、采购负责人", en: "Decision makers · buyers" } },
  hiring: { emoji: "🧑‍💼", tone: "teal", sub: { ja: "候補者・紹介者", zh: "候选人、推荐人", en: "Candidates · referrers" } },
  partners: { emoji: "🤝", tone: "apricot", sub: { ja: "協業・販路", zh: "合作、渠道", en: "Alliances · channels" } },
  awareness: { emoji: "📣", tone: "lav", sub: { ja: "登壇・メディア", zh: "演讲、媒体", en: "Talks · media" } },
  research: { emoji: "📚", tone: "blue", sub: { ja: "業界の知見", zh: "行业见解", en: "Industry insight" } },
};

export const GOAL_OPTIONS: readonly GoalOption[] = PROFILE_ONBOARDING_GOALS.map(({ id, zh, en, ja }) => ({ id, zh, en, ja, ...GOAL_TILES[id]! }));
const LEGACY_GOAL_LABELS = new Set([
  "开拓新市场", "出海拓展", "寻找供应商", "寻找投资机会", "寻找联合创始人", "拓展行业人脉", "寻找导师", "职业发展", "组织活动与社群", "探索新方向",
  "Enter a new market", "Expand overseas", "Source suppliers", "Find deals to invest in", "Find a co-founder", "Grow my industry network", "Find a mentor", "Advance my career", "Build a community", "Explore a new direction",
  "顧客獲得", "パートナー探し", "新市場の開拓", "海外展開", "仕入れ先探し", "ブランド認知の向上", "投資先探し", "人材採用", "共同創業者探し", "業界人脈の拡大", "業界トレンドの学習", "メンター探し", "キャリアアップ", "イベント・コミュニティ運営", "新しい方向性の模索"
]);

export const HORIZONS: readonly Copy[] = [
  { zh: "本月", en: "This month", ja: "今月" },
  { zh: "本季度", en: "This quarter", ja: "今四半期" },
  { zh: "今年", en: "This year", ja: "今年" }
];

export { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS };

/** Japanese labels the App used before it shared the candidate table (2026-11-25); saved profiles still hold them. */
const EARLIER_JA: Readonly<Record<string, string>> = {
  "投融资资源": "投資・資金調達の人脈",
  "市场渠道": "販売チャネル",
  "产品与技术咨询": "プロダクト・技術の相談",
  "日本市场资源": "日本市場のつながり",
  "中国市场资源": "中国市場のつながり",
  "出海落地支持": "海外進出サポート",
  "法务财税咨询": "法務・税務・財務の相談",
  "AI 落地经验": "AI 導入の実務経験",
  "技术开发能力": "技術開発力",
  "政府与政策资源": "行政・政策のつながり",
  "渠道合作伙伴": "販売パートナー",
  "战略合作伙伴": "戦略パートナー",
  "出海合作伙伴": "海外展開のパートナー",
  "供应商": "仕入れ先",
  "行业导师": "メンター・アドバイザー",
  "早期用户": "アーリーアダプター",
  "行业专家": "業界の専門家",
  "业务人才": "ビジネス人材",
  "服务商": "サービス提供者",
  "出海与跨境": "海外進出・越境",
  "SaaS 与企业服务": "SaaS・法人向けサービス",
  "消费品牌": "消費者ブランド",
  "产品与增长": "プロダクト・グロース",
  "投资趋势": "投資トレンド",
  "医疗健康": "医療・ヘルスケア",
  "机器人与硬件": "ロボット・ハードウェア",
  "文旅与餐饮": "旅行・飲食・ホスピタリティ",
};

export function optionLabel(option: Copy, language: OrbitLanguage): string {
  return option[language];
}

/** A saved tag equals an option when it matches the option in any language. */
export function optionMatches(option: Copy, value: string): boolean {
  return value === option.zh || value === option.en || value === option.ja || value === EARLIER_JA[option.zh];
}

export function isKnownOption(options: readonly Copy[], value: string): boolean {
  return options.some(option => optionMatches(option, value));
}

/**
 * Display label for a saved tag. Saved values stay exactly as stored (in whichever language
 * they were picked); a value that equals a known option is shown in the reader's language,
 * a custom value is shown as typed.
 */
export function savedOptionLabel(options: readonly Copy[], value: string, language: OrbitLanguage): string {
  const option = options.find(item => optionMatches(item, value));
  return option ? option[language] : value;
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
  const known = candidates.length > 0 && candidates.length <= GOAL_LIMIT && candidates.every(item => isKnownOption(GOAL_OPTIONS, item) || LEGACY_GOAL_LABELS.has(item));
  if (known) return { goals: candidates, focus, horizon };
  return { goals: [], focus: rest, horizon };
}

/** The saved goal as the six cards + one line: goals of earlier lists have no card, so their text stays in the line. */
export function onboardingGoals(text: string): GoalDraft {
  const { goals, focus, horizon } = parseRelationshipGoal(text);
  const known = goals.filter(goal => isKnownOption(GOAL_OPTIONS, goal));
  const earlier = goals.filter(goal => !known.includes(goal));
  return { goals: known, focus: [...earlier, focus].filter(Boolean).join("、").slice(0, FOCUS_LIMIT), horizon };
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
  email: string;
  phone: string;
  lineId?: string;
  wechatId?: string;
  /** 所在地: free text, the profile's homeMarket. */
  homeMarket: string;
  /** 役職層: one of the six levels, empty when not chosen. */
  seniorityLevel: SeniorityLevelValue | "";
  name: string;
  primaryIndustryId: IndustryIdCode | "";
  secondaryIndustryId: SecondaryIndustryIdCode | "";
  title: string;
}

export const EMPTY_BASIC: BasicDraft = { birthDate: "", company: "", email: "", phone: "", lineId: "", wechatId: "", homeMarket: "", seniorityLevel: "", name: "", primaryIndustryId: "", secondaryIndustryId: "", title: "" };

export function basicDraftFromProfile(profile: ProfileDetail["profile"]): BasicDraft {
  if (!profile) return EMPTY_BASIC;
  return {
    birthDate: profile.birthDate ?? "",
    company: profile.organization ?? "",
    email: profile.handles?.email ?? "",
    phone: profile.handles?.phone ?? "",
    lineId: profile.handles?.lineId ?? "",
    wechatId: profile.handles?.wechatId ?? "",
    homeMarket: profile.homeMarket ?? "",
    seniorityLevel: isSeniorityLevelValue(profile.seniorityLevel) ? profile.seniorityLevel : "",
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
  return Boolean(draft.name.trim()) && basicIndustryValid(draft) && (!draft.birthDate || isValidProfileBirthDate(draft.birthDate, today));
}

/** UR-C：联系方式里第一处格式不对的栏（メール → 電話）；没有就是 null。空栏不算（同 Web invalidProfileContactMethods）。 */
export function contactFormatProblem(handles: ProfileContactMethods): "email" | "phone" | null {
  const invalid = invalidProfileContactMethods(handles);
  return invalid.includes("email") ? "email" : invalid.includes("phone") ? "phone" : null;
}

export type OnboardingMissingField = "name" | "primaryIndustry" | "secondaryIndustry" | "contact" | "birthDate" | "goals" | "intro";

/** What still stops 「次へ」 on a step, in screen order. 詳細 is asked for only once 業界 is chosen. */
export function onboardingMissing(step: OnboardingStep, draft: { basic: BasicDraft; goals: readonly string[]; bio: string }, repairToday?: string): OnboardingMissingField[] {
  if (step === "goals") return draft.goals.length ? [] : ["goals"];
  if (step === "intro") return draft.bio.trim() && !bioCounter(draft.bio).over ? [] : ["intro"];
  const missing: OnboardingMissingField[] = [];
  if (!draft.basic.name.trim()) missing.push("name");
  // 补资料页（UR-R）没选行业时两项都列（「あと 2 項目：業界、業界の詳細」）；引导里详细只在选了行业之后才问。
  if (!draft.basic.primaryIndustryId) missing.push(...(repairToday ? ["primaryIndustry", "secondaryIndustry"] as const : ["primaryIndustry"] as const));
  else if (!basicIndustryValid(draft.basic)) missing.push("secondaryIndustry");
  if (repairToday) {
    if (draft.basic.birthDate && !isValidProfileBirthDate(draft.basic.birthDate, repairToday)) missing.push("birthDate");
  } else if (!profileContactMethodsValid(draft.basic)) missing.push("contact");
  return missing;
}

/**
 * Whether this account still has to go through onboarding. A finished flow only needs the server's own
 * completion policy; an unfinished one also needs a goal and an introduction when it was once put off
 * (「あとで」 of the five-step flow), and everything otherwise. An account that never had a flow and is
 * complete by the server's policy is left alone.
 */
export function onboardingRequired(
  detail: ProfileDetail,
  flow: { deferred: boolean; finishedAt: string | null } | null
): boolean {
  if (detail.onboarding?.status === "incomplete") return true;
  if (!flow || flow.finishedAt) return false;
  if (!flow.deferred) return true;
  return !detail.profile?.relationshipGoal.trim() || !detail.profile?.bio?.trim();
}

/** Where a finished onboarding goes: back to the page it started from, or Home. */
export function onboardingDestination(next: string | string[] | undefined): string {
  return safeProfileContinuationNext(next);
}

/** The intro-draft endpoint writes Chinese or English (web sends "en" for every non-zh language). */
export function introDraftLanguage(language: OrbitLanguage): "zh" | "en" | "ja" {
  return language;
}
