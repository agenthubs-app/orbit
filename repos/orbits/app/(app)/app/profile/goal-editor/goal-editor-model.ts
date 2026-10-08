/**
 * 共享目标编辑器（资料页「我的目标」与 onboarding 设目标步共用，RW-05 / D7）的纯模型：
 * 10 条示例句、三档期限、目标文本合成与解析。无 React、无 fetch。
 *
 * 存储仍是资料里的一段 relationshipGoal 文字：`正文（期限）`（英文 `Body (Horizon)`）。
 * 解析兼容两种旧格式，保证已存目标不丢内容：
 *   - 旧期限「本月／本季度／今年」（This month / This quarter / This year）→ 一个月内／3 个月内／一年内；
 *   - 旧 onboarding 方向 chip 前缀「A、B：正文」→ 整段并入正文。
 */

export type Copy = { zh: string; en: string };
export type GoalLang = "zh" | "en";
export type GoalHorizon = "month" | "quarter" | "year";

export const GOAL_TEXT_LIMIT = 100;

export interface GoalHorizonOption {
  key: GoalHorizon;
  /** 写进 relationshipGoal 的期限文字。 */
  label: Copy;
  /** 旧版期限文字（W0002 前 onboarding 写入），只用于解析。 */
  legacy: Copy;
  /** 卡片大字（数字）与单位、说明。 */
  num: string;
  unit: Copy;
  sub: Copy;
}

export const GOAL_HORIZONS: readonly GoalHorizonOption[] = [
  {
    key: "month",
    label: { zh: "一个月内", en: "Within 1 month" },
    legacy: { zh: "本月", en: "This month" },
    num: "1",
    unit: { zh: "个月", en: "month" },
    sub: { zh: "按周排 · 共 4 周", en: "Weekly · 4 weeks" },
  },
  {
    key: "quarter",
    label: { zh: "3 个月内", en: "Within 3 months" },
    legacy: { zh: "本季度", en: "This quarter" },
    num: "3",
    unit: { zh: "个月", en: "months" },
    sub: { zh: "按周排 · 分 3 段", en: "Weekly · 3 phases" },
  },
  {
    key: "year",
    label: { zh: "一年内", en: "Within 1 year" },
    legacy: { zh: "今年", en: "This year" },
    num: "1",
    unit: { zh: "年", en: "year" },
    sub: { zh: "按季度 · 分 4 段", en: "Quarterly · 4 phases" },
  },
];

// 示例句：点一下整句填入输入框（替换当前内容），再改成自己的。带时间的示例同时选上期限。
export const GOAL_EXAMPLES: readonly Copy[] = [
  { zh: "三个月内拿到 10 家企业客户的试用", en: "Get 10 business customers onto a trial within three months" },
  { zh: "三个月内认识 3 位日本市场的渠道伙伴", en: "Meet three channel partners for the Japan market within three months" },
  { zh: "一个月内见 10 位关注我们赛道的投资人", en: "Meet 10 investors who follow our space within a month" },
  { zh: "三个月内找到一位技术合伙人", en: "Find a technical co-founder within three months" },
  { zh: "一个月内招到一位会日语的销售负责人", en: "Hire a Japanese-speaking head of sales within a month" },
  { zh: "年内在东京开出第一家线下门店", en: "Open our first physical store in Tokyo this year" },
  { zh: "年内找到 2 家稳定的日本供应商", en: "Secure two reliable Japanese suppliers this year" },
  { zh: "三个月内认识 20 位本行业的决策者", en: "Meet 20 decision-makers in my industry within three months" },
  { zh: "年内找到一位行业导师，每月聊一次", en: "Find an industry mentor this year and talk once a month" },
  { zh: "从 0 到 1 打造自有品牌", en: "Build our own brand from zero to one" },
];

/** 示例句里的时间词 → 期限；按中文原句判断，英文界面点同一条示例得到同一期限。 */
export function exampleHorizon(example: Copy): GoalHorizon | null {
  if (example.zh.includes("一个月内")) return "month";
  if (example.zh.includes("三个月内")) return "quarter";
  if (example.zh.includes("年内")) return "year";
  return null;
}

/** 输入框内容（去首尾空白）与示例句在任一语言下完全一致 → 该示例为选中态。 */
export function goalExampleMatches(example: Copy, text: string): boolean {
  const value = text.trim();
  return value.length > 0 && (value === example.zh || value === example.en);
}

export function horizonOption(key: GoalHorizon): GoalHorizonOption {
  return GOAL_HORIZONS.find(option => option.key === key)!;
}

/** 期限文字（新旧写法、中英文，或期限 key 本身）→ key；认不出返回 null。 */
export function horizonFromText(value: string): GoalHorizon | null {
  const text = value.trim();
  if (!text) return null;
  const found = GOAL_HORIZONS.find(option => option.key === text
    || text === option.label.zh || text === option.label.en
    || text === option.legacy.zh || text === option.legacy.en);
  return found ? found.key : null;
}

export interface GoalDraft {
  text: string;
  horizon: GoalHorizon | "";
}

/** 编辑器 → relationshipGoal：「正文（期限）」。正文为空时不写期限，整段为空。 */
export function composeRelationshipGoal(draft: GoalDraft, language: GoalLang): string {
  const text = draft.text.trim();
  if (!text) return "";
  if (!draft.horizon) return text;
  const label = horizonOption(draft.horizon).label[language];
  return language === "en" ? `${text} (${label})` : `${text}（${label}）`;
}

/**
 * composeRelationshipGoal 的逆运算：去掉句末可识别的期限（新旧写法都认），其余整段作为正文。
 * 旧 onboarding 写出的「方向、方向：正文」前缀原样留在正文里——不丢内容，用户可自行改写。
 * 句末括号不是已知期限时不动，整段都算正文。
 */
export function parseRelationshipGoal(value: string): GoalDraft {
  const text = value.trim();
  if (!text) return { text: "", horizon: "" };
  const match = text.match(/(?:（([^（）]+)）|\s?\(([^()]+)\))$/u);
  if (match) {
    const horizon = horizonFromText(match[1] ?? match[2] ?? "");
    if (horizon) return { text: text.slice(0, match.index).trim(), horizon };
  }
  return { text, horizon: "" };
}
