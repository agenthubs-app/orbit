// 个人 Home hub 的 demo 资料本地化。
//
// 个人档案字段是生成/种子数据（英文或 "中文 / English" 双语），无法自动跟随语言。
// 中文界面：优先从双语片段里挑中文，其次用词表把已知英文映射成中文；
// 日文界面：双语片段取英文段（不显示中文），已知英文按词表换成日文；
// 未知内容原样返回。语言为 "en" 时保留原文。
// 只做展示层兜底，不改动 profile service / 契约 / 测试。

import type { OrbitLanguage } from "../orbit-language-core";

function active(language: OrbitLanguage): boolean {
  return language !== "en";
}

// 生成档案里常见的英文取值 → 中文 / 日文（产品写的词表，三语）。
const VALUE_LOCALIZED: Record<string, { ja: string; zh: string; en: string }> = {
  // 角色 / 行业
  "relationship operations lead": { ja: "リレーション運用リード", zh: "关系运营负责人", en: "relationship operations lead" },
  "relationship operator": { ja: "リレーション運用", zh: "关系运营", en: "relationship operator" },
  "relationship operations": { ja: "リレーション運用", zh: "关系运营", en: "relationship operations" },
  founder: { ja: "創業者", zh: "创始人", en: "founder" },
  "founder ceo": { ja: "創業者 CEO", zh: "创始人 CEO", en: "founder ceo" },
  operator: { ja: "オペレーター", zh: "运营者", en: "operator" },
  community: { ja: "コミュニティ", zh: "社群", en: "community" },
  "community lead": { ja: "コミュニティリード", zh: "社群负责人", en: "community lead" },
  "community organizer": { ja: "コミュニティ主宰者", zh: "社群组织者", en: "community organizer" },
  investor: { ja: "投資家", zh: "投资人", en: "investor" },
  "product manager": { ja: "プロダクトマネージャー", zh: "产品经理", en: "product manager" },
  // 目标 / 关系类型
  founders: { ja: "創業者", zh: "创始人", en: "founders" },
  operators: { ja: "オペレーター", zh: "运营者", en: "operators" },
  "community leads": { ja: "コミュニティリード", zh: "社群负责人", en: "community leads" },
  "relevant introductions": { ja: "関連する紹介", zh: "相关引荐", en: "relevant introductions" },
  "warm introductions": { ja: "知人からの紹介", zh: "暖介绍", en: "warm introductions" },
  "warm intro": { ja: "知人からの紹介", zh: "暖介绍", en: "warm intro" },
  "event follow-up": { ja: "イベント後のフォロー", zh: "活动后跟进", en: "event follow-up" },
  "profile details": { ja: "プロフィールの詳細", zh: "个人资料细节", en: "profile details" },
  "relationship context": { ja: "関係の背景", zh: "关系背景", en: "relationship context" },
  "follow-up": { ja: "フォロー", zh: "跟进", en: "follow-up" },
  // 引荐渠道 / 跟进节奏
  email: { ja: "メール", zh: "邮件", en: "email" },
  linkedin: { ja: "LinkedIn", zh: "LinkedIn", en: "linkedin" },
  "warm introduction": { ja: "知人からの紹介", zh: "暖介绍", en: "warm introduction" },
  referral: { ja: "紹介", zh: "引荐", en: "referral" },
  "48 hours": { ja: "48時間以内", zh: "48 小时内", en: "48 hours" },
  "24 hours": { ja: "24時間以内", zh: "24 小时内", en: "24 hours" },
  "within a week": { ja: "1週間以内", zh: "一周内", en: "within a week" },
  // 通用工作区占位
  "orbit generated relationship workspace": { ja: "リレーション運用ワークスペース", zh: "关系运营工作区", en: "orbit generated relationship workspace" },
  // 主场市场
  tokyo: { ja: "東京", zh: "东京", en: "tokyo" },
  osaka: { ja: "大阪", zh: "大阪", en: "osaka" },
  kyoto: { ja: "京都", zh: "京都", en: "kyoto" },
  shanghai: { ja: "上海", zh: "上海", en: "shanghai" },
  taipei: { ja: "台北", zh: "台北", en: "taipei" },
  // 关系目标 / headline 兜底散文
  "use live relationship context to decide which follow-up matters next.":
    { ja: "いまの関係の状況から、次に誰をフォローすべきかを判断する。", zh: "根据实时的关系背景，判断下一步最该跟进谁。", en: "use live relationship context to decide which follow-up matters next." },
  "founder building a relationship operating system":
    { ja: "リレーション運用の仕組みをつくっている創業者", zh: "正在打造一套关系运营系统的创始人", en: "founder building a relationship operating system" },
  // 主用户 小雨（AI/CV 工程师）
  "ai & computer vision engineer": { ja: "AI・コンピュータビジョンエンジニア", zh: "AI 与计算机视觉工程师", en: "ai & computer vision engineer" },
  "oppo japan research": { ja: "OPPO 日本研究所", zh: "OPPO 日本研究所", en: "oppo japan research" },
  "shipped camera ai on 10m+ devices; now building trustworthy genai":
    { ja: "カメラ AI を1,000万台超に搭載。いまは信頼できる生成 AI に取り組む", zh: "把相机 AI 做到千万级出货，如今专注可信生成式 AI", en: "shipped camera ai on 10m+ devices; now building trustworthy genai" },
};

function lookup(value: string, language: OrbitLanguage): string | null {
  const entry = VALUE_LOCALIZED[value.trim().toLowerCase()];
  if (!entry) return null;
  return language === "ja" ? entry.ja : entry.zh;
}

// 双语 "中文 / English" 里挑出中文段和英文段。
function pickBilingualSegments(value: string): { chinese: string; english: string } | null {
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
  return chineseSegment && englishSegment ? { chinese: chineseSegment, english: englishSegment } : null;
}

// 单个档案文本值：先挑双语对应段，再查词表，最后原样返回。
export function localizeHomeValue(value: string, language: OrbitLanguage): string {
  if (!active(language) || !value) {
    return value;
  }
  const segments = pickBilingualSegments(value);
  if (segments) {
    return language === "ja" ? lookup(segments.english, language) ?? segments.english : segments.chinese;
  }
  return lookup(value, language) ?? value;
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
  const segments = pickBilingualSegments(headline);
  if (segments) {
    return language === "ja" ? lookup(segments.english, language) ?? segments.english : segments.chinese;
  }
  const generated = headline.match(
    /^(.+?) managing source-backed relationship follow-up$/i,
  );
  if (generated) {
    const roleText = localizeHomeValue(role ?? generated[1], language);
    const suffix = { ja: "根拠に基づく関係フォロー", zh: "以来源为依据的关系跟进", en: "source-backed relationship follow-up" };
    return `${roleText} · ${language === "ja" ? suffix.ja : suffix.zh}`;
  }
  return lookup(headline, language) ?? headline;
}
