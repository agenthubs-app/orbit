/**
 * R11a（PLANNER 契约 5）：和本人生效目标有关的联系人（人脈「目標に関係」页签、浓度「计划已关联」合并、
 * 列表第三行「🎯 人物タイプ · 話した」）。Owner: 乙 (R11a). Used by: App 人脈（缓存，离线用上次值）、Web 人脈。
 * GET /api/contacts/goal-related-ids. 计划不在同步域里，所以 App 单独缓存这一份。
 */
export interface ContactGoalRelatedLinkDTO {
  contactId: string;
  /** The person type (人物タイプ) title of the first plan need that links this contact. */
  label: string;
  /** The link is established (話した). */
  talked: boolean;
}

export interface ContactGoalRelatedIdsDTO {
  /** Sorted, de-duplicated contact ids, at most GOAL_RELATED_IDS_LIMIT. */
  ids: string[];
  /** True when the cap cut some ids off. */
  truncated: boolean;
  asOf: string;
  /** One entry per id in `ids` (same order); older deployments may omit it. */
  links?: ContactGoalRelatedLinkDTO[] | undefined;
  /**
   * R11a: contacts with an open follow-up (plain tasks on a contact and relationship lifecycle tasks;
   * shared/compute/follow-up-task.ts). The App caches it with the ids above for the 要フォロー tab offline,
   * because its task mirror does not carry lifecycle tasks. Sorted, at most OPEN_FOLLOW_UP_IDS_LIMIT.
   */
  followUpContactIds?: string[] | undefined;
  /** R08: demo-world data (mock mode only). */
  sample?: true | undefined;
}
