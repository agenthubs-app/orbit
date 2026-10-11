/**
 * R12（DESIGN §3.4 第一条，D-10）：联系人信息「浓度」三档，两端共用。交接 R11（人脈一览 / 详情的 ●○○）。
 * Owner: 甲 (R12). Used by: 名刺スキャン完成页的浓度分布、手入力底部预告、人脈（R11）。
 *
 *   1 ●○○ 只有身份（姓名）；
 *   2 ●●○ 有联系方式（邮箱 / 电话之一）**且**有相遇场合（metEventId 或「出会い」备注）；
 *   3 ●●● 有目标关系（计划已关联）或往来（面谈 / 笔记 / 互动记录），或本人入力（招待で本人が入力）。
 * 输入是调用方整理好的事实，不读库；纯函数，不碰 IO 与时钟。
 */

export type ContactDensityLevel = 1 | 2 | 3;

/** 理由键（界面按键取文案）。按固定顺序列出这个人已有的信息。 */
export type ContactDensityReason = "identity" | "contact_point" | "met_context" | "goal_relation" | "interaction" | "self_reported";

export interface ContactDensityFacts {
  /** 有姓名。 */
  hasIdentity: boolean;
  /** 有邮箱或电话。 */
  hasContactPoint: boolean;
  /** 有 metEventId 或「出会い」备注。 */
  hasMetContext: boolean;
  /** 计划已关联这个人。 */
  hasGoalRelation: boolean;
  /** 有面谈 / 笔记 / 互动记录。 */
  hasInteraction: boolean;
  /** 本人入力（招待コード连接后本人填写的资料）。 */
  selfReported: boolean;
}

export interface ContactDensity {
  level: ContactDensityLevel;
  reasons: ContactDensityReason[];
}

const REASON_ORDER: readonly [ContactDensityReason, keyof ContactDensityFacts][] = [
  ["identity", "hasIdentity"],
  ["contact_point", "hasContactPoint"],
  ["met_context", "hasMetContext"],
  ["goal_relation", "hasGoalRelation"],
  ["interaction", "hasInteraction"],
  ["self_reported", "selfReported"],
];

export function contactDensity(facts: ContactDensityFacts): ContactDensity {
  const reasons = REASON_ORDER.filter(([, key]) => facts[key]).map(([reason]) => reason);
  const level: ContactDensityLevel = facts.hasGoalRelation || facts.hasInteraction || facts.selfReported
    ? 3
    : facts.hasContactPoint && facts.hasMetContext ? 2 : 1;
  return { level, reasons };
}
