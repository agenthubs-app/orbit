// R12 契约（DESIGN §2.3、§3.1、§4.1）— 手入力で人脈を追加。Owner: 甲 (R12). Used by: 人脈を追加 · 手入力（两端）。
// 响应宽进、请求体严格（shared/api-schema/manual-contact.ts）。候选与名片共用 IngestContactCandidateContract：查重一种口径。
import type { IngestContactCandidateContract } from "./business-card-batch";

/** 统合时冲突字段逐个选：保留已有的值，或用这次输入的值覆盖（只列不同的字段）。 */
export type ManualContactMergeField = "displayName" | "organization" | "role" | "email" | "phone";
export type ManualContactFieldChoice = "existing" | "incoming";

/** 「出会った場所」：参加予定 / 最近参加过的活动、紹介、その他。 */
export interface ManualContactMetContext {
  kind: "event" | "intro" | "other";
  /** kind = event 时的活动 id。 */
  eventId?: string;
  /** 紹介者名、その他 的自由文字等（显示用）。 */
  label?: string;
}

/** POST /api/contacts/manual — 手入力保存（请求体严格）。 */
export interface ManualContactCreateInput {
  /** 必填（去掉首尾空白后非空）。 */
  displayName: string;
  organization?: string;
  role?: string;
  email?: string;
  phone?: string;
  metContext?: ManualContactMetContext;
  /** 保存为这个人的联系人备注（不进 Task › メモ）。 */
  note?: string;
  /** 用户选了「統合する」：并入这个联系人，不新建。 */
  mergeIntoContactId?: string;
  /** 统合时逐字段的选择；没列的字段按「已有为空才补」处理。 */
  fieldChoices?: Partial<Record<ManualContactMergeField, ManualContactFieldChoice>>;
  /** 用户选了「別の人として保存」：有候选也新建。 */
  allowDuplicate?: boolean;
  /** 同一个键重放返回第一次的结果。 */
  idempotencyKey: string;
}

/**
 * 保存结果。`duplicate_review`：查到可能是同一个人（手入力不自动统合），带候选让用户选。
 * 读取端：不认识的 outcome 读成 `duplicate_review`——界面再问一次，而不是当成功（复核 m10）。
 */
export interface ManualContactCreateResult {
  outcome: "created" | "merged" | "duplicate_review";
  /** created / merged 时的联系人 id。 */
  contactId?: string;
  /** duplicate_review 时的候选（≤3）。 */
  candidates?: readonly IngestContactCandidateContract[];
  /** created 时：这个时刻之前可撤销（新建后 10 分钟）。 */
  undoUntil?: string;
}

/** POST /api/contacts/manual/duplicates — 即时查重（只读，请求体严格）。只有名字也能查（同名规则）。 */
export interface ManualContactDuplicateCheckInput {
  displayName: string;
  organization?: string;
  email?: string;
  phone?: string;
}

export interface ManualContactDuplicateCheckResult {
  /** ≤3 条。 */
  candidates: readonly IngestContactCandidateContract[];
}

/** GET /api/contacts/manual/organizations?q= — 本人人脈里按前缀的公司名（≤5），带人数。 */
export interface ManualContactOrganizationSuggestion {
  name: string;
  contactCount: number;
}

export interface ManualContactOrganizationSuggestionsResult {
  organizations: readonly ManualContactOrganizationSuggestion[];
}

/** POST /api/contacts/manual/[contactId]/undo — 10 分钟内、本接口新建、未被改过的联系人墓碑删除；否则 409 UNDO_EXPIRED。 */
export interface ManualContactUndoResult {
  outcome: "undone";
}
