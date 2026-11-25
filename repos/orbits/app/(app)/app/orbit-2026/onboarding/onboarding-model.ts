/**
 * 新用户引导（三步版，onboarding-3step-proposal）的纯模型：步骤、与服务端 1–5 屏进度的对应、缺项、
 * 候选选项、本地草稿（含五步版旧草稿的迁移）。无 React、无 fetch。
 * 目标步改用与资料页共用的目标编辑器（D7）：目标文本的合成与解析在 goal-editor-model，这里转发导出。
 */
import {
  composeRelationshipGoal,
  horizonFromText,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../../profile/goal-editor/goal-editor-model";
import { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS } from "../../profile/profile-tag-options";
import { profileBioLimit, profileVisibleLength } from "../../../../../shared/api-schema/profile-bio";

export type Copy = { zh: string; en: string; ja?: string };
export type Lang = "zh" | "en" | "ja";

export type OnboardingStep = "basics" | "goals" | "intro";
export type OnboardingView = OnboardingStep;
export type ProfileScreenNumber = 1 | 2 | 3 | 4 | 5;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["basics", "goals", "intro"];

/** 服务端进度仍是五屏（两端与旧账号共用）：① 确认 1；② 确认 2、3；③ 确认 4、5 再 finish。 */
export const ONBOARDING_STEP_SCREENS: Record<OnboardingStep, readonly ProfileScreenNumber[]> = { basics: [1], goals: [2, 3], intro: [4, 5] };

export function onboardingStepForProgress(lastConfirmedScreen: number): OnboardingStep {
  return lastConfirmedScreen >= 3 ? "intro" : lastConfirmedScreen >= 1 ? "goals" : "basics";
}

/** 已完成几步（0–3）：首页指南与「おかえりなさい」用。 */
export function onboardingStepsDone(lastConfirmedScreen: number): number {
  return lastConfirmedScreen >= 5 ? 3 : lastConfirmedScreen >= 3 ? 2 : lastConfirmedScreen >= 1 ? 1 : 0;
}

export function isOnboardingView(value: unknown): value is OnboardingView {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** 五步版草稿的步骤名 → 三步版；更早的 welcome / home / network 回第一步。 */
export function migrateOnboardingView(value: unknown): OnboardingView {
  if (isOnboardingView(value)) return value;
  if (value === "persona") return "goals";
  if (value === "import") return "intro";
  return "basics";
}

// ── 缺项（「次へ」始终可点；点了才提示）──
export type OnboardingMissing = "name" | "birthDate" | "industry" | "industryDetail" | "goal" | "introGenerating" | "introEmpty" | "introOver" | "headlineOver";

export function missingBasics(input: { name: string; birthValid: boolean; primaryIndustryId: string; industryValid: boolean }): OnboardingMissing[] {
  return [
    ...(input.name.trim() ? [] : ["name" as const]),
    ...(input.birthValid ? [] : ["birthDate" as const]),
    // 没选一级时细分还不能选，只算一项。
    ...(!input.primaryIndustryId ? ["industry" as const] : input.industryValid ? [] : ["industryDetail" as const]),
  ];
}

export function missingIntro(input: { generating: boolean; bio: string; bioOver: boolean; headlineOver: boolean }): OnboardingMissing[] {
  if (input.generating) return ["introGenerating"];
  if (!input.bio.trim()) return ["introEmpty"];
  return [...(input.bioOver ? ["introOver" as const] : []), ...(input.headlineOver ? ["headlineOver" as const] : [])];
}

// 与服务端 profileInkSignalFieldsAreValid 一致：offering / seeking 各 ≤ 5。
export const OFFER_LIMIT = 5;
export const SEEK_LIMIT = 5;
export const TOPIC_LIMIT = 8;
/** 「关于我」计数：含中日韩文字上限 80，其余 200（与服务端同一份规则）。 */
export function bioCounter(bio: string): { count: number; limit: number; over: boolean } {
  const text = bio.trim();
  const count = profileVisibleLength(text);
  const limit = profileBioLimit(text);
  return { count, limit, over: count > limit };
}
export const HEADLINE_LIMIT = 80;

export { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS };
export { composeRelationshipGoal, parseRelationshipGoal };

/** 选项在任一语言下的文本与 value 相同即视为同一个（切换语言后仍能识别）。 */
export function optionMatches(option: Copy, value: string): boolean {
  return value === option.zh || value === option.en || value === option.ja;
}

/** AI 返回的建议标签（当前语言原文）→ SEEK_OPTIONS 里的选项，保持 AI 给出的顺序。 */
export function seekOptionsFromLabels(labels: readonly string[]): Copy[] {
  const picked: Copy[] = [];
  for (const label of labels) {
    const option = SEEK_OPTIONS.find(item => optionMatches(item, label));
    if (option && !picked.includes(option)) picked.push(option);
  }
  return picked;
}

export function toggleValue(values: readonly string[], value: string, limit?: number): string[] {
  if (values.includes(value)) return values.filter(item => item !== value);
  if (limit !== undefined && values.length >= limit) return [...values];
  return [...values, value];
}

/** 自定义 badge：去空白、NFKC、忽略大小写去重；超上限不加。 */
export function addCustomValue(values: readonly string[], raw: string, limit?: number): string[] {
  const value = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!value || value.length > 24) return [...values];
  if (values.some(item => item.toLowerCase() === value.toLowerCase())) return [...values];
  if (limit !== undefined && values.length >= limit) return [...values];
  return [...values, value];
}

// 最初の成功 1 回 + 再生成の成功 2 回。失敗は回数に含めない。
export const INTRO_REGENERATE_LIMIT = 2;

// ── 本地草稿：刷新/中途离开后回到同一步，未提交的输入不丢（「自動保存済み」）；只在完成引导时清除 ──
/** 一项内容的来源：名片上印着的 / AI 推断的；用户一改就去掉。 */
export type FieldOrigin = "card" | "ai";
export type BasicField = "name" | "company" | "title" | "email" | "phone" | "homeMarket" | "seniorityLevel" | "primaryIndustryId" | "secondaryIndustryId";

export interface OnboardingBasicDraft {
  birthDate: string;
  company: string;
  email: string;
  /** 所在地（自由文本）。 */
  homeMarket: string;
  name: string;
  phone: string;
  primaryIndustryId: string;
  secondaryIndustryId: string;
  /** 役職層（SENIORITY_LEVELS 六档，空串 = 未选）。 */
  seniorityLevel: string;
  title: string;
}

/** 未提交的输入：只在该屏尚未经服务端确认时用来复原，不覆盖已确认的字段。 */
export interface OnboardingDraftFields {
  basic?: OnboardingBasicDraft;
  offer?: string[];
  seek?: string[];
  topics?: string[];
  bio?: string;
}

/** 扫描带来的附加信息：各项来源、读到 / 推断到几项、AI 预选还没被动过的两组。 */
export interface OnboardingScanDraft {
  ai: number;
  card: number;
  offerFromAi: boolean;
  origins: Partial<Record<BasicField, FieldOrigin>>;
  topicsFromAi: boolean;
}

export interface OnboardingDraft {
  view: OnboardingView;
  goalText: string;
  goalChoices?: string[];
  horizon: GoalHorizon | "";
  introRegenerations: number;
  fields?: OnboardingDraftFields;
  scan?: OnboardingScanDraft;
}

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

function draftFields(value: unknown): OnboardingDraftFields | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const basicRaw = raw.basic && typeof raw.basic === "object" ? raw.basic as Record<string, unknown> : null;
  const text = (key: string) => (basicRaw && typeof basicRaw[key] === "string" ? basicRaw[key] as string : "");
  return {
    // 五步版草稿没有 email / phone / 役職層 / 所在地：读成空。
    basic: basicRaw ? { birthDate: text("birthDate"), company: text("company"), email: text("email"), homeMarket: text("homeMarket"), name: text("name"), phone: text("phone"), primaryIndustryId: text("primaryIndustryId"), secondaryIndustryId: text("secondaryIndustryId"), seniorityLevel: text("seniorityLevel"), title: text("title") } : undefined,
    offer: strings(raw.offer),
    seek: strings(raw.seek),
    topics: strings(raw.topics),
    bio: typeof raw.bio === "string" ? raw.bio : undefined,
  };
}

function draftScan(value: unknown): OnboardingScanDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const count = (item: unknown) => (typeof item === "number" && item >= 0 ? Math.min(Math.floor(item), 9) : 0);
  const origins = raw.origins && typeof raw.origins === "object" ? raw.origins as Record<string, unknown> : {};
  return {
    ai: count(raw.ai),
    card: count(raw.card),
    offerFromAi: raw.offerFromAi === true,
    origins: Object.fromEntries(Object.entries(origins).filter(([, origin]) => origin === "card" || origin === "ai")) as OnboardingScanDraft["origins"],
    topicsFromAi: raw.topicsFromAi === true,
  };
}

/** 草稿里有没有人填的内容（打开页面就会写一份空草稿，不算）。 */
export function hasDraftInput(draft: OnboardingDraft): boolean {
  const { basic, offer, seek, topics, bio } = draft.fields ?? {};
  return [draft.goalText, bio ?? "", ...Object.values(basic ?? {})].some(value => value.trim())
    || [draft.goalChoices, offer, seek, topics].some(values => Boolean(values?.length));
}

/**
 * W0002 前的草稿存的是 { goals: 方向 chip[], focus: 一句话, horizon: 本月|本季度|今年 }。
 * 读到旧草稿时把 chip 并入正文（与 parseRelationshipGoal 对旧目标文字的处理一致），不丢内容。
 */
function goalTextFromDraft(parsed: Record<string, unknown>): string {
  if (typeof parsed.goalText === "string") return parsed.goalText;
  const goals = Array.isArray(parsed.goals) ? parsed.goals.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  const focus = typeof parsed.focus === "string" ? parsed.focus.trim() : "";
  const head = goals.map(goal => goal.trim()).join("、");
  return head && focus ? `${head}：${focus}` : head || focus;
}

const DRAFT_PREFIX = "orbit.onboarding.v1:";

export function readOnboardingDraft(actorKey: string): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${actorKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      // 五步版与更早草稿的步骤名迁到三步。
      view: migrateOnboardingView(parsed.view),
      // 不截断：旧草稿（3 个 24 字 chip + 80 字一句话）可能超过 GOAL_TEXT_LIMIT；上限只约束新输入。
      goalText: goalTextFromDraft(parsed),
      goalChoices: Array.isArray(parsed.goalChoices) ? parsed.goalChoices.filter((item): item is string => typeof item === "string").slice(0, 2) : [],
      horizon: typeof parsed.horizon === "string" ? horizonFromText(parsed.horizon) ?? "" : "",
      introRegenerations: typeof parsed.introRegenerations === "number" && parsed.introRegenerations >= 0
        ? Math.min(Math.floor(parsed.introRegenerations), INTRO_REGENERATE_LIMIT)
        : 0,
      fields: draftFields(parsed.fields),
      scan: draftScan(parsed.scan),
    };
  } catch {
    return null;
  }
}

/** 返回是否真的写进了本地（「自動保存済み」只在写成之后显示）。 */
export function writeOnboardingDraft(actorKey: string, draft: OnboardingDraft): boolean {
  try {
    window.localStorage.setItem(`${DRAFT_PREFIX}${actorKey}`, JSON.stringify(draft));
    return true;
  } catch {
    // 无痕模式/存储被禁：草稿只是便利，失败不影响流程。
    return false;
  }
}

export function clearOnboardingDraft(actorKey: string): void {
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${actorKey}`);
  } catch {
    // 同上。
  }
}
