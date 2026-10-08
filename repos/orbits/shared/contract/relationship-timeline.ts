/**
 * W0046（RN-04）定稿共享契约：关系时间线 RelationshipTimelineItem。
 *
 * 时间线没有自己的表：每次由各来源现读现算（只读聚合），`ref` 永远指回唯一事实来源。
 * W0047（强度计分）、W0051（洞察）、W0052（最近动态）都读它；改名须追加记录。
 *
 * 契约只放类型；来源全集常量在 features/relationship-timeline/build.ts。
 * 本文件随 `npm run sync:contract` 逐字复制进 App（`src/api/contract`），只能 `./` 引用同目录契约。
 */

export type RelationshipTimelineSource =
  /** contact_detail_states.notes 中用户 memo（noteId 前缀 `note:live-contact-detail-update:`）。 */
  | "memo"
  /** human_encounters（其投影 `note:<encounterId>` 不再单列）。 */
  | "encounter"
  /** notes 集合，payload.note.contactIds 含该联系人。 */
  | "note"
  /** plan_log，linked_contact_ids 含该联系人。 */
  | "plan"
  /** personal_schedule_items，contactIds/contactId 含该联系人，state ≠ cancelled，已开始。 */
  | "schedule"
  /** tasks 集合，status = completed 且 contactId 匹配。 */
  | "followup_done"
  /** 联系人建立（名片／扫码／活动交换／手动），每人恰好 1 条。 */
  | "capture";

/** 由 memo 提取得到（W0047 计分用）。 */
export type MemoEventType = "met" | "collaborated" | "introduced" | "followed_up" | "other";

export type RelationshipTimelineRefStore =
  | "contact_detail_states"
  | "human_encounters"
  | "notes"
  | "plan_log"
  | "personal_schedule_items"
  | "tasks"
  | "contacts";

export type RelationshipTimelineCaptureMethod = "business_card" | "qr" | "event_exchange" | "manual" | "other";

export interface RelationshipTimelineItem {
  /** `${source}:${原记录 id}`（plan 用 plan_log.id；capture 用 contactId）；稳定，W0047 signals 引用它。 */
  id: string;
  source: RelationshipTimelineSource;
  contactId: string;
  /**
   * UTC ISO（`toISOString()` 形式）。memo = 用户选的日期（东京当日 00:00）；encounter = observedAt；
   * schedule = startsAt；plan = created_at；note = createdAt；followup_done = updatedAt；capture = contact.createdAt。
   */
  occurredAt: string;
  /** memo 只选了日期时为 day，展示不编时分（按东京日期显示）。 */
  occurredAtPrecision: "day" | "instant";
  /** 规则生成的一句话。 */
  title: { zh: string; en: string };
  /** 用户原文节选（memo／encounter／note 正文，≤160 字，不翻译）。 */
  excerpt?: string;
  /** 关联活动（memo 选的、encounter／schedule 自带、capture 的 metEventId）。 */
  eventId?: string;
  /** 指回唯一事实来源，供「依据」跳转。 */
  ref: { store: RelationshipTimelineRefStore; recordId: string; subId?: string };
  detail?: {
    planEvent?: string;
    scheduleKind?: "meeting" | "event" | "personal";
    captureMethod?: RelationshipTimelineCaptureMethod;
    memoEventTypes?: readonly MemoEventType[];
  };
}

export interface RelationshipTimelineResult {
  /** occurredAt 降序，同刻按 id。 */
  items: readonly RelationshipTimelineItem[];
  /** 读失败的来源；不为空时 UI 说明「部分记录暂时读不到」。 */
  unavailableSources: readonly RelationshipTimelineSource[];
  /** 合并后、截断前的条数（每来源至多读 50 条，所以是下限）；`total > items.length` 时 UI 显示「共 N 条」。 */
  total?: number;
}

/** memo 写入（PATCH /api/contacts/:id 的 `note`）——W0046 新增的可选字段，旧形状照常可用。 */
export interface ContactMemoNoteInputContract {
  body: string;
  authorLabel?: string | null;
  /** `YYYY-MM-DD`（东京日期）。 */
  occurredAt?: string | null;
  eventId?: string | null;
  kind?: "memo" | null;
}
