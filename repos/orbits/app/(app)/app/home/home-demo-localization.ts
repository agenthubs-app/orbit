// 个人 Home hub 的 demo 资料本地化。
//
// 个人档案字段是生成/种子数据（英文或 "中文 / English" 双语），无法自动跟随语言。
// demo 默认展示中文：优先从双语片段里挑中文，其次用词表把已知英文映射成中文，
// 未知内容原样返回。语言为 "en" 时保留原文。
// 只做展示层兜底，不改动 profile service / 契约 / 测试。

import type { OrbitLanguage } from "../orbit-language-core";

function active(language: OrbitLanguage): boolean {
  return language !== "en";
}

// 生成档案里常见的英文取值 → 中文。
const VALUE_ZH: Record<string, string> = {
  // 角色 / 行业
  "relationship operations lead": "关系运营负责人",
  "relationship operator": "关系运营",
  "relationship operations": "关系运营",
  founder: "创始人",
  "founder ceo": "创始人 CEO",
  operator: "运营者",
  community: "社群",
  "community lead": "社群负责人",
  "community organizer": "社群组织者",
  investor: "投资人",
  "product manager": "产品经理",
  // 目标 / 关系类型
  founders: "创始人",
  operators: "运营者",
  "community leads": "社群负责人",
  "relevant introductions": "相关引荐",
  "warm introductions": "暖介绍",
  "warm intro": "暖介绍",
  "event follow-up": "活动后跟进",
  "profile details": "个人资料细节",
  "relationship context": "关系背景",
  "follow-up": "跟进",
  // 引荐渠道 / 跟进节奏
  email: "邮件",
  linkedin: "LinkedIn",
  "warm introduction": "暖介绍",
  referral: "引荐",
  "48 hours": "48 小时内",
  "24 hours": "24 小时内",
  "within a week": "一周内",
  // 通用工作区占位
  "orbit generated relationship workspace": "关系运营工作区",
  // 主场市场
  tokyo: "东京",
  osaka: "大阪",
  kyoto: "京都",
  shanghai: "上海",
  taipei: "台北",
  // 关系目标 / headline 兜底散文
  "use live relationship context to decide which follow-up matters next.":
    "根据实时的关系背景，判断下一步最该跟进谁。",
  "founder building a relationship operating system":
    "正在打造一套关系运营系统的创始人",
  // 主用户 小雨（AI/CV 工程师）
  "ai & computer vision engineer": "AI 与计算机视觉工程师",
  "oppo japan research": "OPPO 日本研究所",
  "shipped camera ai on 10m+ devices; now building trustworthy genai":
    "把相机 AI 做到千万级出货，如今专注可信生成式 AI",
};

// 双语 "中文 / English" 里挑中文片段。
function pickChineseSegment(value: string): string | null {
  const segments = value
    .split(/\s*\/\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return null;
  }
  const han = /[一-鿿]/;
  const kana = /[぀-ヿ]/;
  const chineseSegment = segments.find(
    (segment) => han.test(segment) && !kana.test(segment),
  );
  // Only treat "/" as a language separator when there is a genuine
  // English-only counterpart segment ("中文 / English"). For monolingual
  // Chinese that merely uses "/" (e.g. "人工智能 / 计算机视觉", "AI/CV"), keep
  // the whole value instead of truncating to the first segment.
  const englishSegment = segments.find(
    (segment) => !han.test(segment) && !kana.test(segment) && /[A-Za-z]/.test(segment),
  );
  return chineseSegment && englishSegment ? chineseSegment : null;
}

// 单个档案文本值：先挑双语中文，再查词表，最后原样返回。
export function localizeHomeValue(value: string, language: OrbitLanguage): string {
  if (!active(language) || !value) {
    return value;
  }
  const chinese = pickChineseSegment(value);
  if (chinese) {
    return chinese;
  }
  return VALUE_ZH[value.trim().toLowerCase()] ?? value;
}

export function localizeHomeList(
  values: readonly string[] | undefined,
  language: OrbitLanguage,
): readonly string[] {
  if (!values) {
    return [];
  }
  return values.map((value) => localizeHomeValue(value, language));
}

// headline：优先双语中文；其次 "X managing source-backed relationship follow-up"
// 模式改写成中文；再退到词表；最后原样。
export function localizeHomeHeadline(
  headline: string,
  role: string | undefined,
  language: OrbitLanguage,
): string {
  if (!active(language) || !headline) {
    return headline;
  }
  const chinese = pickChineseSegment(headline);
  if (chinese) {
    return chinese;
  }
  const generated = headline.match(
    /^(.+?) managing source-backed relationship follow-up$/i,
  );
  if (generated) {
    const roleText = localizeHomeValue(role ?? generated[1], language);
    return `${roleText} · 以来源为依据的关系跟进`;
  }
  return VALUE_ZH[headline.trim().toLowerCase()] ?? headline;
}
