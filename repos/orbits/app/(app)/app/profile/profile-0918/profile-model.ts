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
  /** 只读组（goal）没有输入框，也就没有占位文案。 */
  placeholder?: Copy;
  values: string[];
}

// goal 只有单文本 intro(=relationshipGoal)，且 hook 没有它的保存通道，只读展示为一个 chip：
// hint 说明来源（设计 groupMeta 的「可选择多个」不成立），无 placeholder。
// 其余三组 icon / hint / placeholder 取设计稿 renderVals().groupMeta（◎ ✦ ⚇ ▤）。
export function personaGroups(p: OrbitProfileEditorView): PersonaGroup[] {
  const intro = p.intro.trim();
  return [
    {
      key: "goal",
      icon: "◎",
      title: { zh: "我的目标", en: "My goal" },
      hint: { zh: "目标来自基础资料的关系目标", en: "Your goal comes from the relationship goal in your basic profile" },
      values: intro ? [intro] : [],
    },
    {
      key: "offer",
      icon: "✦",
      title: { zh: "我能提供", en: "I can offer" },
      hint: { zh: "你可以为他人提供什么帮助或资源？（可选择多个）", en: "What help or resources can you offer others? (multiple allowed)" },
      placeholder: { zh: "添加我能提供的内容，例如：投资机会", en: "Add what you can offer, e.g. investment opportunities" },
      values: [...p.offering],
    },
    {
      key: "seek",
      icon: "⚇",
      title: { zh: "我在寻找", en: "I am seeking" },
      hint: { zh: "你希望结识什么样的人或组织？（可选择多个）", en: "Who or which organisations do you hope to meet? (multiple allowed)" },
      placeholder: { zh: "添加你在寻找的对象，例如：市场渠道伙伴", en: "Add who you are seeking, e.g. channel partners" },
      values: [...p.seeking],
    },
    {
      key: "topic",
      icon: "▤",
      title: { zh: "想聊的话题", en: "Topics to talk about" },
      hint: { zh: "你对哪些话题感兴趣？（可选择多个）", en: "Which topics interest you? (multiple allowed)" },
      placeholder: { zh: "添加你感兴趣的话题，例如：可持续发展", en: "Add a topic you care about, e.g. sustainability" },
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
