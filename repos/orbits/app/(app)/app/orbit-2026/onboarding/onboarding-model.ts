/**
 * 新用户引导（b1 A3 #16–#20，五屏资料）的纯模型：步骤、badge 选项、
 * 目标 → 「我在寻找」建议映射、本地草稿。无 React、无 fetch。
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

export type OnboardingStep = "profile" | "goals" | "persona" | "intro" | "import";
/** b1 A3 没有欢迎页和预览屏：引导只有五屏资料。 */
export type OnboardingView = OnboardingStep;

// b1 #16–#20：基本情報 → 目標 → 強み・ニーズ → 自己紹介 → 名刺の取り込み。
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["profile", "goals", "persona", "intro", "import"];

export function isOnboardingView(value: unknown): value is OnboardingView {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
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
/** 未提交的输入：只在该屏尚未经服务端确认时用来复原，不覆盖已确认的字段。 */
export interface OnboardingDraftFields {
  basic?: { birthDate: string; company: string; name: string; primaryIndustryId: string; secondaryIndustryId: string; title: string };
  offer?: string[];
  seek?: string[];
  topics?: string[];
  bio?: string;
}

export interface OnboardingDraft {
  view: OnboardingView;
  goalText: string;
  goalChoices?: string[];
  horizon: GoalHorizon | "";
  introRegenerations: number;
  fields?: OnboardingDraftFields;
}

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

function draftFields(value: unknown): OnboardingDraftFields | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const basicRaw = raw.basic && typeof raw.basic === "object" ? raw.basic as Record<string, unknown> : null;
  const text = (key: string) => (basicRaw && typeof basicRaw[key] === "string" ? basicRaw[key] as string : "");
  return {
    basic: basicRaw ? { birthDate: text("birthDate"), company: text("company"), name: text("name"), primaryIndustryId: text("primaryIndustryId"), secondaryIndustryId: text("secondaryIndustryId"), title: text("title") } : undefined,
    offer: strings(raw.offer),
    seek: strings(raw.seek),
    topics: strings(raw.topics),
    bio: typeof raw.bio === "string" ? raw.bio : undefined,
  };
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
      // 旧草稿的 welcome / home / network（欢迎页与预览屏已删）回到第一屏。
      view: isOnboardingView(parsed.view) ? parsed.view : "profile",
      // 不截断：旧草稿（3 个 24 字 chip + 80 字一句话）可能超过 GOAL_TEXT_LIMIT；上限只约束新输入。
      goalText: goalTextFromDraft(parsed),
      goalChoices: Array.isArray(parsed.goalChoices) ? parsed.goalChoices.filter((item): item is string => typeof item === "string").slice(0, 2) : [],
      horizon: typeof parsed.horizon === "string" ? horizonFromText(parsed.horizon) ?? "" : "",
      introRegenerations: typeof parsed.introRegenerations === "number" && parsed.introRegenerations >= 0
        ? Math.min(Math.floor(parsed.introRegenerations), INTRO_REGENERATE_LIMIT)
        : 0,
      fields: draftFields(parsed.fields),
    };
  } catch {
    return null;
  }
}

export function writeOnboardingDraft(actorKey: string, draft: OnboardingDraft): void {
  try {
    window.localStorage.setItem(`${DRAFT_PREFIX}${actorKey}`, JSON.stringify(draft));
  } catch {
    // 无痕模式/存储被禁：草稿只是便利，失败不影响流程。
  }
}

export function clearOnboardingDraft(actorKey: string): void {
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${actorKey}`);
  } catch {
    // 同上。
  }
}
