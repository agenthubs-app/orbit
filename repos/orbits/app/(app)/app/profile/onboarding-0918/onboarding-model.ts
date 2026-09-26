/**
 * 新用户引导（docs/designs/Orbit_0918/新用户引导.dc.html）的纯模型：步骤、badge 选项、
 * 目标 → 「我在寻找」建议映射、目标文本合成、本地草稿。无 React、无 fetch。
 */
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

export const GOAL_LIMIT = 3;
// 与服务端 profileInkSignalFieldsAreValid 一致：offering / seeking 各 ≤ 5。
export const OFFER_LIMIT = 5;
export const SEEK_LIMIT = 5;
export const TOPIC_LIMIT = 8;
export const FOCUS_LIMIT = 80;
export const BIO_LIMIT = 80;
export const HEADLINE_LIMIT = 80;

export interface GoalGroup {
  title: Copy;
  options: readonly Copy[];
}

// 目标 badge：设计稿 6 个扩成三组 16 个，覆盖业务、资金团队与个人成长。
export const GOAL_GROUPS: readonly GoalGroup[] = [
  {
    title: { zh: "业务增长", en: "Business growth" },
    options: [
      { zh: "获取客户", en: "Win customers" },
      { zh: "寻找合作伙伴", en: "Find partners" },
      { zh: "开拓新市场", en: "Enter a new market" },
      { zh: "出海拓展", en: "Expand overseas" },
      { zh: "寻找供应商", en: "Source suppliers" },
      { zh: "提升品牌曝光", en: "Build brand awareness" },
    ],
  },
  {
    title: { zh: "资金与团队", en: "Funding & team" },
    options: [
      { zh: "寻找投资", en: "Raise funding" },
      { zh: "寻找投资机会", en: "Find deals to invest in" },
      { zh: "招聘人才", en: "Hire talent" },
      { zh: "寻找联合创始人", en: "Find a co-founder" },
    ],
  },
  {
    title: { zh: "人脉与成长", en: "Network & growth" },
    options: [
      { zh: "拓展行业人脉", en: "Grow my industry network" },
      { zh: "学习行业趋势", en: "Learn industry trends" },
      { zh: "寻找导师", en: "Find a mentor" },
      { zh: "职业发展", en: "Advance my career" },
      { zh: "组织活动与社群", en: "Build a community" },
      { zh: "探索新方向", en: "Explore a new direction" },
    ],
  },
];

export const GOAL_OPTIONS_FLAT: readonly Copy[] = GOAL_GROUPS.flatMap(group => group.options);

export const HORIZONS: readonly Copy[] = [
  { zh: "本月", en: "This month" },
  { zh: "本季度", en: "This quarter" },
  { zh: "今年", en: "This year" },
];

export { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS };

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

export interface GoalDraft {
  goals: readonly string[];
  focus: string;
  horizon: string;
}

/**
 * 目标步 → 资料的 relationshipGoal（单文本，个人中心「我的目标」同一字段）。
 * 形如「寻找合作伙伴、开拓新市场：把产品推到日本市场（本季度）」。
 */
export function composeRelationshipGoal(draft: GoalDraft, language: Lang): string {
  const goals = draft.goals.map(goal => goal.trim()).filter(Boolean);
  const focus = draft.focus.trim();
  const horizon = draft.horizon.trim();
  if (!goals.length && !focus) return "";
  const separator = language === "en" ? ", " : "、";
  const head = goals.join(separator);
  const body = head && focus ? `${head}${language === "en" ? ": " : "："}${focus}` : head || focus;
  if (!horizon) return body;
  return language === "en" ? `${body} (${horizon})` : `${body}（${horizon}）`;
}

/**
 * composeRelationshipGoal 的逆运算：本地草稿丢失（换设备、清缓存）时，从已保存的目标文本
 * 还原 chip / 一句话 / 时间范围。只认本引导写出的格式；认不出就整段当作「一句话」。
 */
export function parseRelationshipGoal(text: string): GoalDraft {
  let rest = text.trim();
  if (!rest) return { goals: [], focus: "", horizon: "" };
  let horizon = "";
  const horizonMatch = rest.match(/(?:（([^（）]+)）|\s\(([^()]+)\))$/u);
  const horizonText = horizonMatch ? (horizonMatch[1] ?? horizonMatch[2] ?? "").trim() : "";
  if (horizonText && HORIZONS.some(option => optionMatches(option, horizonText))) {
    horizon = horizonText;
    rest = rest.slice(0, horizonMatch!.index).trim();
  }
  const split = rest.match(/^([^]*?)(?:：|: )([^]*)$/u);
  const head = split ? split[1]! : rest;
  const focus = split ? split[2]!.trim() : "";
  const candidates = head.split(/、|, /u).map(item => item.trim()).filter(Boolean);
  const known = candidates.length > 0 && candidates.length <= GOAL_LIMIT && candidates.every(item => GOAL_OPTIONS_FLAT.some(option => optionMatches(option, item)));
  if (known) return { goals: candidates, focus: focus.slice(0, FOCUS_LIMIT), horizon };
  return { goals: [], focus: rest.slice(0, FOCUS_LIMIT), horizon };
}

// 「换一版」次数上限（自动生成的第一版与失败的尝试不计）。
export const INTRO_REGENERATE_LIMIT = 3;

// ── 本地草稿：刷新/中途离开后回到同一步，目标结构（chip/时间范围）不丢；只在完成引导时清除 ──
export interface OnboardingDraft {
  view: OnboardingView;
  goals: string[];
  focus: string;
  horizon: string;
  introRegenerations: number;
  /** 第 5 步名片批次（名片 V2）；刷新/返回后接着显示解析进度或确认界面。 */
  cardBatchId: string | null;
}

const DRAFT_PREFIX = "orbit.onboarding.v1:";

export function readOnboardingDraft(actorKey: string): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${actorKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      view: isOnboardingView(parsed.view) ? parsed.view : "welcome",
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter((item): item is string => typeof item === "string").slice(0, GOAL_LIMIT) : [],
      focus: typeof parsed.focus === "string" ? parsed.focus.slice(0, FOCUS_LIMIT) : "",
      horizon: typeof parsed.horizon === "string" ? parsed.horizon : "",
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
