/**
 * 新用户引导（docs/designs/Orbit_0918/新用户引导.dc.html）的纯模型：步骤、badge 选项、
 * 目标 → 「我在寻找」建议映射、本地草稿。无 React、无 fetch。
 * 目标步改用与资料页共用的目标编辑器（D7）：目标文本的合成与解析在 goal-editor-model，这里转发导出。
 */
import {
  composeRelationshipGoal,
  horizonFromText,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../goal-editor/goal-editor-model";
import { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS } from "../profile-0918/profile-model";

export type Copy = { zh: string; en: string };
export type Lang = "zh" | "en";

export type OnboardingStep = "profile" | "goals" | "persona" | "intro" | "import";
export type OnboardingView = "welcome" | OnboardingStep | "home" | "network";

// 设计稿 4 步 + 用户新增的「AI 生成介绍」一屏（画像之后、人脉之前）。
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["profile", "goals", "persona", "intro", "import"];

export const ONBOARDING_VIEWS: readonly OnboardingView[] = ["welcome", ...ONBOARDING_STEPS, "home", "network"];

export function isOnboardingView(value: unknown): value is OnboardingView {
  return typeof value === "string" && (ONBOARDING_VIEWS as readonly string[]).includes(value);
}

// 与服务端 profileInkSignalFieldsAreValid 一致：offering / seeking 各 ≤ 5。
export const OFFER_LIMIT = 5;
export const SEEK_LIMIT = 5;
export const TOPIC_LIMIT = 8;
export const BIO_LIMIT = 80;
export const HEADLINE_LIMIT = 80;

export { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS };
export { composeRelationshipGoal, parseRelationshipGoal };

/** 选项在任一语言下的文本与 value 相同即视为同一个（切换语言后仍能识别）。 */
export function optionMatches(option: Copy, value: string): boolean {
  return value === option.zh || value === option.en;
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

// 「换一版」次数上限（自动生成的第一版与失败的尝试不计）。
export const INTRO_REGENERATE_LIMIT = 3;

// ── 本地草稿：刷新/中途离开后回到同一步，目标正文与期限不丢；只在完成引导时清除 ──
export interface OnboardingDraft {
  view: OnboardingView;
  goalText: string;
  horizon: GoalHorizon | "";
  introRegenerations: number;
  /** 第 5 步名片批次（名片 V2）；刷新/返回后接着显示解析进度或确认界面。 */
  cardBatchId: string | null;
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
      view: isOnboardingView(parsed.view) ? parsed.view : "welcome",
      // 不截断：旧草稿（3 个 24 字 chip + 80 字一句话）可能超过 GOAL_TEXT_LIMIT；上限只约束新输入。
      goalText: goalTextFromDraft(parsed),
      horizon: typeof parsed.horizon === "string" ? horizonFromText(parsed.horizon) ?? "" : "",
      introRegenerations: typeof parsed.introRegenerations === "number" && parsed.introRegenerations >= 0
        ? Math.min(Math.floor(parsed.introRegenerations), INTRO_REGENERATE_LIMIT)
        : 0,
      cardBatchId: typeof parsed.cardBatchId === "string" && parsed.cardBatchId ? parsed.cardBatchId : null,
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
