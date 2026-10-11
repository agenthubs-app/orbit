// R16 契约（DESIGN add-and-invite §2.7、§3.3、§4.3）— 人脈を追加 · その他（連絡先 / LinkedIn / CSV / イベントから）。
// Owner: 甲 (R16). Used by: App 連絡先・LinkedIn 导入（新接这套接口）、Web 导入新界面。
// 只描述现有 `/api/contacts/import/**`（W0053）的 HTTP 形状；服务端类型仍在 `features/contacts/import/types.ts`。
// 响应宽进、请求体严格（shared/api-schema/contact-import.ts）。成功响应都包在通用信封 `{ success: true, data }` 里，
// 下面写的是 `data` 的形状。
//
// 上传不是 JSON：`POST /api/contacts/import` 的请求体是文件原文（CSV 或 vCard 文本），三个头见
// `ContactImportUploadHeaders`（常量 `CONTACT_IMPORT_UPLOAD_HEADERS` 在 shared/api-schema/contact-import.ts）。
// 服务端不解 ZIP；超过 5 MB 或 2,000 条在读完前 413。
import type { IngestContactCandidateContract } from "./business-card-batch";

/** `csv`（LinkedIn / 汎用 CSV）、`vcard`（連絡先）、`event`（イベントから）。上传只接受 csv / vcard。 */
export type ContactImportKind = "csv" | "vcard" | "event";
/** 服务端判断出的文件格式。 */
export type ContactImportFormat = "linkedin" | "generic" | "vcard" | "event";
export type ContactImportBatchStatus = "parsed" | "reviewing" | "committing" | "completed" | "cancelled" | "expired" | "failed";
export type ContactImportRowStatus = "pending" | "created" | "merged" | "skipped" | "failed";
/** 写入后的「三层更新」（含计划候补入队）进度。 */
export type ContactImportFollowUpState = "none" | "pending" | "retry" | "done";
/** 这一行怎么处理：新建 / 并入已有联系人 / 不导入。 */
export type ContactImportDecision = "create" | "merge" | "skip";
export type ContactImportParseIssue = "missing_name" | "invalid_email" | "field_truncated" | "unknown_country" | "decode_failed" | "malformed_row";
/** CSV 可对应的目标字段（列の対応）。 */
export type ContactImportMappableField =
  | "name"
  | "firstName"
  | "lastName"
  | "organization"
  | "role"
  | "email"
  | "phone"
  | "location"
  | "country"
  | "linkedinUrl"
  | "connectedOn"
  | "notes";
/** 字段 → 表头列号（0 起）；null = 不导入。服务端总是给齐全部字段。 */
export type ContactImportMapping = Record<ContactImportMappableField, number | null>;

/** 归一后的一行。空字段是空字符串。 */
export interface ContactImportFieldsView {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  connectedOn: string;
  notes: string;
  /** 文件里明确写出的国家（ISO alpha-2）。 */
  countryCode?: string;
  city?: string;
  /** イベントから：在哪场活动认识。 */
  metEventId?: string;
  metEventTitle?: string;
}

/** 写入结果计数（提交后才有值）。 */
export interface ContactImportCounts {
  created: number;
  merged: number;
  skipped: number;
  failed: number;
}

/** まとめて確認的统计（行还没清理时才有）。 */
export interface ContactImportReview {
  create: number;
  merge: number;
  skip: number;
  /** 可能是同一个人、还没决定的行（提交前必须为 0，否则 409 UNDECIDED_ROWS）。 */
  undecided: number;
  /** 解析问题导致不能导入的行。 */
  blocked: number;
  inFileDuplicates: number;
  /** 有查重候选的行。 */
  candidates: number;
  /** 有解析问题（含提示类）的行。 */
  issues: number;
  /** 本次提交必须原样带回的合并清单（逐条确认，否则 409 MERGE_NOT_CONFIRMED）。 */
  mergeConfirmations: readonly ContactImportMergeConfirmation[];
}

export interface ContactImportMergeConfirmation {
  seq: number;
  contactId: string;
}

export interface ContactImportBatchView {
  id: string;
  kind: ContactImportKind;
  format: ContactImportFormat;
  status: ContactImportBatchStatus;
  /** status = failed 的原因（例：interrupted_expired）。 */
  failureReason: string | null;
  fileName: string;
  /** イベントから的活动 id。 */
  sourceEventId: string | null;
  rowCount: number;
  /** CSV 表头（列の対応用）；vCard / 活动为空。列表接口里也为空。 */
  headers: readonly string[];
  /** CSV 的列对应；vCard / 活动、列表接口里为 null。 */
  mapping: ContactImportMapping | null;
  counts: ContactImportCounts;
  review: ContactImportReview | null;
  followUp: {
    state: ContactImportFollowUpState;
    enrichmentDeferredUntil: string | null;
  };
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface ContactImportRowView {
  /** 行号（1 起）。 */
  seq: number;
  fields: ContactImportFieldsView;
  issues: readonly ContactImportParseIssue[];
  /** 文件里更早出现的同一个人（行号）。 */
  inFileDuplicateOf: number | null;
  /** 人脈里可能是同一个人的联系人（与名片同一种候选）。公司不同的同名人不会被预选合并（可能转职）。 */
  candidate: IngestContactCandidateContract | null;
  /** null = 还没决定（非完全一致的候选，必须由用户选）。 */
  decision: ContactImportDecision | null;
  mergeIntoContactId: string | null;
  status: ContactImportRowStatus;
  contactId: string | null;
}

/** `POST /api/contacts/import`、`POST …/events`、`POST …/[id]/commit` 的结果。 */
export interface ContactImportBatchResult {
  batch: ContactImportBatchView;
  /** 同一个幂等键 / 确认 id 的重放。 */
  replayed: boolean;
}

/** `GET /api/contacts/import/[id]`、`PATCH /[id]`、`POST /[id]/cancel`。 */
export interface ContactImportBatchResponse {
  batch: ContactImportBatchView;
}

/** `GET /api/contacts/import`：最近的导入记录（摘要，不含 headers / mapping / review）。 */
export interface ContactImportBatchListResponse {
  batches: readonly ContactImportBatchView[];
}

/** `GET /api/contacts/import/[id]/rows?cursor=&filter=all|new|duplicates|issues`，每页 50。 */
export type ContactImportRowFilter = "all" | "new" | "duplicates" | "issues";
export interface ContactImportRowsPage {
  rows: readonly ContactImportRowView[];
  /** 下一页的 cursor（最后一行的 seq）；没有下一页为 null。 */
  nextCursor: number | null;
}

/** `PATCH /api/contacts/import/[id]/rows` 的结果。 */
export interface ContactImportDecisionsResult {
  batch: ContactImportBatchView;
  /** 实际改了决定的行号。 */
  updated: readonly number[];
}

/** `GET /api/contacts/import/events`：可导入的活动（本人已互换的人，按活动分组）。 */
export interface ContactImportEventSummary {
  eventId: string;
  title: string;
  startsAt: string | null;
  lastExchangeAt: string;
  /** 已互换的人数。 */
  exchanged: number;
  /** 其中已在人脈的人数。 */
  inNetwork: number;
  /** 联系人还在同步中的人数。 */
  syncing: number;
  /** 已记为「在该活动认识」的人数。 */
  alreadyMarked: number;
}
export interface ContactImportEventListResponse {
  events: readonly ContactImportEventSummary[];
}

/** 上传的三个请求头（值见 CONTACT_IMPORT_UPLOAD_HEADERS）。 */
export interface ContactImportUploadHeaders {
  /** `csv` | `vcard`。 */
  kind: "x-orbit-import-kind";
  /** 文件名，URI 编码（encodeURIComponent）。 */
  fileName: "x-orbit-import-file-name";
  /** 必填；同一个键重放返回同一个批次。 */
  idempotencyKey: "idempotency-key";
}

/** `PATCH /api/contacts/import/[id]`（只限 CSV、核对中）：改列对应；没列的字段 = 不导入。 */
export interface ContactImportMappingInput {
  mapping: Partial<ContactImportMapping>;
}

/** `PATCH /api/contacts/import/[id]/rows`：逐行决定（≤2,000 条）。 */
export interface ContactImportRowDecisionInput {
  decisions: readonly { seq: number; decision: ContactImportDecision }[];
}

/** `POST /api/contacts/import/[id]/commit`：合并行必须全部逐条确认（= review.mergeConfirmations）。 */
export interface ContactImportCommitInput {
  /** 同一个 id 重放得同一结果；同一批次换了确认内容 409 INTENT_CONFLICT。 */
  confirmationIntentId: string;
  mergeConfirmations: readonly ContactImportMergeConfirmation[];
}

/** `POST /api/contacts/import/events`：导入一场活动里交换过的人。 */
export interface ContactImportEventInput {
  eventId: string;
  idempotencyKey: string;
}

/**
 * 失败响应 `error.context.reason` 的取值（读取端遇到不认识的值按一般错误处理）。
 * R16 复核 m7：`context` 里还会带的键（值都是十进制数字字符串）：
 * - `UNDECIDED_ROWS`（409）：`undecided` = 还没决定的「可能重复」行数（界面「あと N 件」）；
 * - `MERGE_NOT_CONFIRMED`（409）：`missing` = 本次提交漏确认的合并行数，`stray` = 确认了但不是合并的行数。
 * 503（库未配置 / 还没建表）只有 `error.code = SERVICE_UNAVAILABLE`，没有 `reason`。
 */
export type ContactImportFailureReason =
  | "NOT_FOUND"
  | "NOT_REVIEWABLE"
  | "INVALID_MAPPING"
  | "INVALID_DECISIONS"
  | "UNDECIDED_ROWS"
  | "MERGE_NOT_CONFIRMED"
  | "INTENT_CONFLICT"
  | "NOTHING_TO_IMPORT"
  | "too_large"
  | "too_many_rows"
  | "empty"
  | "undecodable"
  | "not_vcard"
  | "unsupported_type";
