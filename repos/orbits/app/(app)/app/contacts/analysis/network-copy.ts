/**
 * W0043：人脉页的双语模板与封闭集映射（纯函数，视图模型与分组详情页共用）。
 *
 * 规则（后续 Sprint 不得放宽）：后端的「句子字段」（summary、nextAction、reason、suggestedAction、
 * recommendedAction、gap／activity 的 label、sourceLabel、lastTouchpointLabel、actionBrief 的 judgment／steps／evidence）
 * 一律不进视图；用户可见文字只来自用户数据（姓名、公司、任务标题、用户填写的地区原文、关系目标）
 * 与本文件的模板 × 结构化字段（计数、id、type、bucketId、dueLabel 封闭集）。
 * 语言：zh 用中文，其余（en、ja）用英文，沿用 `t()` 的 ja→en 回退惯例。
 */
import type { OrbitLanguage } from "../../../../../shared/contract/language";

export type NetworkCopy = { zh: string; en: string };

export function pickCopy(copy: NetworkCopy, language: OrbitLanguage): string {
  return language === "zh" ? copy.zh : copy.en;
}

/** 后端系统分组 id（`shared/compute/dashboard-distribution.ts` 的封闭集）→ 双语名；中文与后端原名一致。 */
const SYSTEM_BUCKET_NAMES: Readonly<Record<string, NetworkCopy>> = {
  unclassified: { zh: "未分类", en: "Unclassified" },
  location_unknown: { zh: "地区待完善", en: "Location missing" },
  location_tokyo: { zh: "东京", en: "Tokyo" },
  location_osaka: { zh: "大阪", en: "Osaka" },
  location_kyoto: { zh: "京都", en: "Kyoto" },
  location_kobe: { zh: "神户", en: "Kobe" },
  location_yokohama: { zh: "横滨", en: "Yokohama" },
  role_unknown: { zh: "角色待完善", en: "Role missing" },
  role_decision_maker: { zh: "经营决策者", en: "Decision makers" },
  role_business_growth: { zh: "业务拓展", en: "Business development" },
  role_professional_advisor: { zh: "专业顾问", en: "Professional advisors" },
  role_operations: { zh: "运营与专业角色", en: "Operations & specialists" },
  strong: { zh: "强关系", en: "Strong ties" },
  warm: { zh: "保持联系", en: "Keep in touch" },
  weak: { zh: "待重新联系", en: "To reconnect" },
};

/** 系统分组返回双语名；其余（用户填写的地区原文等）返回 null，由调用方原样显示。 */
export function systemBucketName(bucketId: string, language: OrbitLanguage): string | null {
  const copy = Object.prototype.hasOwnProperty.call(SYSTEM_BUCKET_NAMES, bucketId) ? SYSTEM_BUCKET_NAMES[bucketId] : undefined;
  return copy ? pickCopy(copy, language) : null;
}

/**
 * 后端 `dueLabel`（`shared/compute/dashboard-opportunity.ts` 的封闭集）→ 双语标签。
 * 后端把已逾期也归为 `Due today`，所以中文写「今天到期或已逾期」。`Due soon`（时间无法解析）与未知值返回空串，不显示标签。
 */
export function dueLabelCopy(dueLabel: string, language: OrbitLanguage): string {
  const value = dueLabel.trim();
  if (value === "No due date") return pickCopy({ zh: "未设截止", en: "No deadline" }, language);
  if (value === "Due today") return pickCopy({ zh: "今天到期或已逾期", en: "Today or overdue" }, language);
  if (value === "Due tomorrow") return pickCopy({ zh: "明天到期", en: "Tomorrow" }, language);
  const days = /^Due in (\d+) days$/.exec(value);
  if (days) return pickCopy({ zh: `${days[1]} 天后到期`, en: `In ${days[1]} days` }, language);
  return "";
}

/** 建议动作标题：任务标题（用户数据）为空时用模板。 */
export function contactActionTitle(contactName: string, language: OrbitLanguage): string {
  return pickCopy({ zh: `联系 ${contactName}`, en: `Contact ${contactName}` }, language);
}

export function actionLinkLabel(kind: string, language: OrbitLanguage): string {
  if (kind === "open_pipeline") return pickCopy({ zh: "查看关系管线", en: "View pipeline" }, language);
  if (kind === "open_contacts") return pickCopy({ zh: "查看全部人脉", en: "View all contacts" }, language);
  return pickCopy({ zh: "查看联系人", en: "View contact" }, language);
}

export type ActivityType = "new_contact" | "high_value" | "followup_due" | "dormant";

/** 最近动态的标题模板（`followup_due` 用任务标题，不走这里）。 */
export function activityTypeLabel(type: Exclude<ActivityType, "followup_due">, language: OrbitLanguage): string {
  if (type === "high_value") return pickCopy({ zh: "高价值关系", en: "High-value relationship" }, language);
  if (type === "dormant") return pickCopy({ zh: "待唤醒关系", en: "Dormant relationship" }, language);
  return pickCopy({ zh: "新增联系人", en: "New contact" }, language);
}

/** 最近动态的来源列：按 type 给「联系人／跟进」，不渲染后端 sourceLabel。 */
export function activitySourceLabel(type: ActivityType, language: OrbitLanguage): string {
  return type === "followup_due" ? pickCopy({ zh: "跟进", en: "Follow-up" }, language) : pickCopy({ zh: "联系人", en: "Contact" }, language);
}

const CONTACT_ACTIVITY_PREFIX = "activity:dashboard:contact:";

/** 从结构化的 activityId（`activity:dashboard:contact:<contactId>`）取联系人 id；不是联系人动态返回 undefined。不解析句子。 */
export function contactIdFromActivityId(activityId: string): string | undefined {
  if (!activityId.startsWith(CONTACT_ACTIVITY_PREFIX)) return undefined;
  const id = activityId.slice(CONTACT_ACTIVITY_PREFIX.length).trim();
  return id || undefined;
}

const DETAIL_STRENGTH: Readonly<Record<"strong" | "warm" | "weak", NetworkCopy>> = {
  strong: { zh: "强关系", en: "strong ties" },
  warm: { zh: "中关系", en: "warm ties" },
  weak: { zh: "弱关系", en: "weak ties" },
};

/** 分组详情页的洞察句：由计数与主要关系质量拼出，不用后端 insight。 */
export function structureDetailInsight(input: { label: string; count: number; strongest: "strong" | "warm" | "weak" }, language: OrbitLanguage): string {
  if (input.count <= 0) return pickCopy({ zh: "该分组暂时没有联系人。", en: "No contacts in this group yet." }, language);
  // 用详情页「关系质量」同一套名称（强／中／弱关系），同页不出现两套叫法。
  const strength = DETAIL_STRENGTH[input.strongest];
  return pickCopy({
    zh: `${input.label}共有 ${input.count} 位联系人，当前以${strength.zh}为主。`,
    en: `${input.label} has ${input.count} ${input.count === 1 ? "contact" : "contacts"}, mostly ${strength.en}.`,
  }, language);
}
