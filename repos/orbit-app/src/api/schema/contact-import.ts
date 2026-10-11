import { z } from "zod";

import { ingestContactCandidateObject } from "./business-card-batch";
import { knownValues, readableItems, tolerantEnum } from "./tolerant";
import type {
  ContactImportBatchListResponse,
  ContactImportBatchResponse,
  ContactImportBatchResult,
  ContactImportBatchView,
  ContactImportCommitInput,
  ContactImportDecisionsResult,
  ContactImportEventInput,
  ContactImportEventListResponse,
  ContactImportEventSummary,
  ContactImportMappingInput,
  ContactImportRowDecisionInput,
  ContactImportRowView,
  ContactImportRowsPage,
  ContactImportUploadHeaders,
} from "../contract/contact-import";

// R16 契约（DESIGN add-and-invite §4.3）。Owner: 甲 (R16). Used by: App 連絡先・LinkedIn 导入、Web 导入新界面。
// 响应宽进（不 strict、枚举 tolerantEnum / knownValues、列表 readableItems），请求体严格。
// 宽进的兜底：kind → csv；format → generic；批次 status → expired（不可再操作、不会无限轮询）；行 status → pending；
// 行 decision → skip（不认识的决定绝不当成新建 / 合并）；followUp.state → pending；解析问题未知值跳过。

/** 上传请求头（请求体是文件原文，不是 JSON / multipart）。 */
export const CONTACT_IMPORT_UPLOAD_HEADERS: Readonly<ContactImportUploadHeaders> = {
  fileName: "x-orbit-import-file-name",
  idempotencyKey: "idempotency-key",
  kind: "x-orbit-import-kind",
};

export const CONTACT_IMPORT_MAPPABLE_FIELD_KEYS = [
  "name", "firstName", "lastName", "organization", "role", "email", "phone", "location", "country", "linkedinUrl", "connectedOn", "notes",
] as const;
export const CONTACT_IMPORT_PARSE_ISSUES = ["missing_name", "invalid_email", "field_truncated", "unknown_country", "decode_failed", "malformed_row"] as const;
/** 服务端一次接受的决定 / 合并确认上限（与 handlers 一致）。 */
export const CONTACT_IMPORT_MAX_DECISIONS = 2000;

const column = z.number().int().nonnegative().nullable();
const contactImportMappingObject = z.object({
  name: column, firstName: column, lastName: column, organization: column, role: column, email: column,
  phone: column, location: column, country: column, linkedinUrl: column, connectedOn: column, notes: column,
});

export const contactImportFieldsObject = z.object({
  displayName: z.string(),
  organization: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  linkedinUrl: z.string(),
  connectedOn: z.string(),
  notes: z.string(),
  countryCode: z.string().optional(),
  city: z.string().optional(),
  metEventId: z.string().optional(),
  metEventTitle: z.string().optional(),
});

const mergeConfirmationObject = z.object({ seq: z.number().int().positive(), contactId: z.string().min(1) });
const count = z.number().int().nonnegative();

export const contactImportReviewObject = z.object({
  create: count,
  merge: count,
  skip: count,
  undecided: count,
  blocked: count,
  inFileDuplicates: count,
  candidates: count,
  issues: count,
  mergeConfirmations: z.array(mergeConfirmationObject),
});

export const contactImportBatchViewObject = z.object({
  id: z.string().min(1),
  kind: tolerantEnum(["csv", "vcard", "event"], "csv"),
  format: tolerantEnum(["linkedin", "generic", "vcard", "event"], "generic"),
  status: tolerantEnum(["parsed", "reviewing", "committing", "completed", "cancelled", "expired", "failed"], "expired"),
  failureReason: z.string().nullable(),
  fileName: z.string(),
  sourceEventId: z.string().nullable(),
  rowCount: count,
  headers: z.array(z.string()),
  mapping: contactImportMappingObject.nullable(),
  counts: z.object({ created: count, merged: count, skipped: count, failed: count }),
  review: contactImportReviewObject.nullable(),
  followUp: z.object({
    state: tolerantEnum(["none", "pending", "retry", "done"], "pending"),
    enrichmentDeferredUntil: z.string().nullable(),
  }),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  expiresAt: z.string(),
});
export const contactImportBatchViewSchema = contactImportBatchViewObject as z.ZodType<ContactImportBatchView>;

// 候选与名片同一种（matchedOn 宽进）；外层不 strict（名片的候选对象是 strictObject，这里放宽成普通对象）。
const importCandidateObject = z.object(ingestContactCandidateObject.shape);

export const contactImportRowViewObject = z.object({
  seq: z.number().int().positive(),
  fields: contactImportFieldsObject,
  issues: knownValues(CONTACT_IMPORT_PARSE_ISSUES),
  inFileDuplicateOf: z.number().int().positive().nullable(),
  candidate: importCandidateObject.nullable(),
  decision: tolerantEnum(["create", "merge", "skip"], "skip").nullable(),
  mergeIntoContactId: z.string().nullable(),
  status: tolerantEnum(["pending", "created", "merged", "skipped", "failed"], "pending"),
  contactId: z.string().nullable(),
});
export const contactImportRowViewSchema = contactImportRowViewObject as z.ZodType<ContactImportRowView>;

export const contactImportBatchResultObject = z.object({ batch: contactImportBatchViewObject, replayed: z.boolean() });
export const contactImportBatchResultSchema = contactImportBatchResultObject as z.ZodType<ContactImportBatchResult>;

export const contactImportBatchResponseObject = z.object({ batch: contactImportBatchViewObject });
export const contactImportBatchResponseSchema = contactImportBatchResponseObject as z.ZodType<ContactImportBatchResponse>;

export const contactImportBatchListResponseObject = z.object({ batches: readableItems(contactImportBatchViewObject) });
export const contactImportBatchListResponseSchema = contactImportBatchListResponseObject as z.ZodType<ContactImportBatchListResponse>;

export const contactImportRowsPageObject = z.object({ rows: readableItems(contactImportRowViewObject), nextCursor: z.number().int().positive().nullable() });
export const contactImportRowsPageSchema = contactImportRowsPageObject as z.ZodType<ContactImportRowsPage>;

export const contactImportDecisionsResultObject = z.object({ batch: contactImportBatchViewObject, updated: z.array(z.number().int().positive()) });
export const contactImportDecisionsResultSchema = contactImportDecisionsResultObject as z.ZodType<ContactImportDecisionsResult>;

export const contactImportEventSummaryObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  startsAt: z.string().nullable(),
  lastExchangeAt: z.string(),
  exchanged: count,
  inNetwork: count,
  syncing: count,
  alreadyMarked: count,
});
export const contactImportEventSummarySchema = contactImportEventSummaryObject as z.ZodType<ContactImportEventSummary>;
export const contactImportEventListResponseObject = z.object({ events: readableItems(contactImportEventSummaryObject) });
export const contactImportEventListResponseSchema = contactImportEventListResponseObject as z.ZodType<ContactImportEventListResponse>;

// ---- 请求体（严格） ----
const requestColumn = z.number().int().min(0).max(999).nullable().optional();
export const contactImportMappingInputObject = z.object({
  mapping: z.object({
    name: requestColumn, firstName: requestColumn, lastName: requestColumn, organization: requestColumn, role: requestColumn, email: requestColumn,
    phone: requestColumn, location: requestColumn, country: requestColumn, linkedinUrl: requestColumn, connectedOn: requestColumn, notes: requestColumn,
  }).strict(),
}).strict();
export const contactImportMappingInputSchema = contactImportMappingInputObject as z.ZodType<ContactImportMappingInput>;

export const contactImportRowDecisionInputObject = z.object({
  decisions: z.array(z.object({ seq: z.number().int().positive(), decision: z.enum(["create", "merge", "skip"]) }).strict()).max(CONTACT_IMPORT_MAX_DECISIONS),
}).strict();
export const contactImportRowDecisionInputSchema = contactImportRowDecisionInputObject as z.ZodType<ContactImportRowDecisionInput>;

const requestId = (max: number) => z.string().max(max).refine((value) => value.trim().length > 0, { message: "required" });
export const contactImportCommitInputObject = z.object({
  confirmationIntentId: requestId(200),
  mergeConfirmations: z.array(z.object({ seq: z.number().int().positive(), contactId: requestId(512) }).strict()).max(CONTACT_IMPORT_MAX_DECISIONS),
}).strict();
export const contactImportCommitInputSchema = contactImportCommitInputObject as z.ZodType<ContactImportCommitInput>;

export const contactImportEventInputObject = z.object({ eventId: requestId(200), idempotencyKey: requestId(200) }).strict();
export const contactImportEventInputSchema = contactImportEventInputObject as z.ZodType<ContactImportEventInput>;
