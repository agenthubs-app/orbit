/**
 * R16 每天一问的读写（DESIGN add-and-invite §2.8、§3.3）。Owner: 甲 (R16). Used by: `service.ts`。
 *
 * - 问题存 `orbit_records` 的集合 `contactCompletionQuestions`（不建表）；记录 id 由「人 + 东京日」决定
 *   （`completionQuestionRecordId`），所以同一个人同一个东京日最多一条：并发生成时 `insertRecordIfAbsent` 只有一个成功。
 *   当天没有可问的人时也写一条 `status = 'none'` 的记录，当天不再重复读人脈。
 * - 出题事实从本人的联系人记录读（只取需要的字段，与名片查重同一个上限）；往来信号读候选人的 `contact_detail_states`
 *   （按 record id 精确读，只读候选人）。
 * - 内存与 PostgreSQL 都走 `LiveRecordStoreLike`（同一套代码，两种存储都有测试）。
 */
import { createHash } from "node:crypto";

import type { ContactCompletionQuestionKind } from "../../../shared/contract/contact-completion";
import type { CompletionOption } from "../../../shared/compute/completion-question-rules";
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { ownedByActor } from "../business-card-contact-match";

export const COMPLETION_QUESTION_COLLECTION = "contactCompletionQuestions";
/** 一个人的问题记录最多读这么多条（一天最多一条，约三年）。 */
export const COMPLETION_HISTORY_READ_LIMIT = 1000;
/** 读本人人脈的上限（与名片查重 `listActorContactRecords` 同一个数）。 */
export const COMPLETION_CONTACT_READ_LIMIT = 20_000;

export type CompletionQuestionStatus = "open" | "answered" | "skipped" | "none";

/** 问题记录的 payload（答案的写入结果也记在这里）。 */
export interface CompletionQuestionRecord extends Record<string, unknown> {
  id: string;
  actorId: string;
  /** 东京日（YYYY-MM-DD）。 */
  askedOn: string;
  status: CompletionQuestionStatus;
  contactId?: string;
  kind?: ContactCompletionQuestionKind;
  question?: string;
  options?: CompletionOption[];
  skipCount?: number;
  contactName?: string;
  contactSubtitle?: string;
  sourceChip?: "meishi" | "linkedin" | "phone" | "manual" | "self";
  answer?: string;
  answeredAt?: string;
  answerKey?: string;
  /** 答案实际写到了哪里：event / note / organization / forgot。 */
  answerEffect?: string;
  densityAfter?: 1 | 2 | 3;
  skippedAt?: string;
  skipKey?: string;
  createdAt: string;
  updatedAt: string;
}

export function completionQuestionRecordId(actorId: string, askedOn: string): string {
  return `contact-completion:${createHash("sha256").update(JSON.stringify([actorId, askedOn])).digest("hex").slice(0, 24)}`;
}

type Store = LiveRecordStoreLike<Record<string, unknown>>;

function asQuestion(record: LiveRecord<Record<string, unknown>> | null, actorId: string): CompletionQuestionRecord | null {
  if (!record || record.lifecycleState !== "active" || record.userId !== actorId) return null;
  const payload = record.payload as Partial<CompletionQuestionRecord>;
  return payload.actorId === actorId && typeof payload.id === "string" && typeof payload.askedOn === "string" ? (payload as CompletionQuestionRecord) : null;
}

export async function getCompletionQuestion(store: Store, workspaceId: string, actorId: string, recordId: string): Promise<CompletionQuestionRecord | null> {
  return asQuestion(await store.getRecord({ collectionName: COMPLETION_QUESTION_COLLECTION, recordId, userId: actorId, workspaceId }), actorId);
}

export async function listCompletionQuestions(store: Store, workspaceId: string, actorId: string): Promise<CompletionQuestionRecord[]> {
  const records = await store.listRecords({
    collectionName: COMPLETION_QUESTION_COLLECTION,
    lifecycleState: "active",
    limit: COMPLETION_HISTORY_READ_LIMIT,
    omitSearchText: true,
    userId: actorId,
    workspaceId,
  });
  return records.flatMap((record) => {
    const question = asQuestion(record, actorId);
    return question ? [question] : [];
  });
}

function toLiveRecord(workspaceId: string, question: CompletionQuestionRecord): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: COMPLETION_QUESTION_COLLECTION,
    createdAt: question.createdAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: question,
    recordId: question.id,
    sourceId: "contact-completion",
    sourceType: "system",
    targetId: question.contactId ?? null,
    targetType: question.contactId ? "contact" : null,
    updatedAt: question.updatedAt,
    userId: question.actorId,
    workspaceId,
  };
}

/** 新建当天的问题；已经有了（并发的另一个请求先写了）返回 null。 */
export async function insertCompletionQuestion(store: Store, workspaceId: string, question: CompletionQuestionRecord): Promise<boolean> {
  if (store.insertRecordIfAbsent) return (await store.insertRecordIfAbsent(toLiveRecord(workspaceId, question))) !== null;
  const existing = await store.getRecord({ collectionName: COMPLETION_QUESTION_COLLECTION, includeDeleted: true, recordId: question.id, workspaceId });
  if (existing) return false;
  await store.upsertRecord(toLiveRecord(workspaceId, question));
  return true;
}

/** 回答 / 跳过后保存（调用方持有本人的写锁）。 */
export async function saveCompletionQuestion(store: Store, workspaceId: string, question: CompletionQuestionRecord): Promise<void> {
  await store.upsertRecord(toLiveRecord(workspaceId, question));
}

/** 出题需要的联系人字段（payload 投影）。 */
const CONTACT_FIELDS = [
  "id", "accountId", "displayName", "organization", "role", "primaryEmail", "primaryPhone", "notes", "metEventId", "metEventTitle", "source", "createdAt",
] as const;

export interface CompletionContactRow {
  contactId: string;
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  notes: string;
  metEventId: string;
  metEventTitle: string;
  sourceType: string;
  sourceLabel: string;
  createdAt: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toContactRow(record: LiveRecord<Record<string, unknown>>): CompletionContactRow {
  const payload = record.payload;
  const source = (typeof payload.source === "object" && payload.source !== null ? payload.source : {}) as Record<string, unknown>;
  return {
    contactId: record.recordId,
    createdAt: text(payload.createdAt) || record.createdAt,
    displayName: text(payload.displayName),
    email: text(payload.primaryEmail),
    metEventId: text(payload.metEventId),
    metEventTitle: text(payload.metEventTitle),
    notes: typeof payload.notes === "string" ? payload.notes : "",
    organization: text(payload.organization),
    phone: text(payload.primaryPhone),
    role: text(payload.role),
    sourceLabel: text(source.label),
    sourceType: text(source.type) || text(record.sourceType),
  };
}

/** 本人人脈里的联系人（活跃、归本人），只读出题需要的字段。 */
export async function listCompletionContacts(store: Store, workspaceId: string, actorId: string): Promise<CompletionContactRow[]> {
  const records = await store.listRecords({
    collectionName: "contacts",
    lifecycleState: "active",
    limit: COMPLETION_CONTACT_READ_LIMIT,
    omitSearchText: true,
    payloadFields: CONTACT_FIELDS,
    userId: actorId,
    workspaceId,
  });
  return records.filter((record) => ownedByActor(record, actorId)).map(toContactRow);
}

/** 一个联系人（活跃、归本人）；不在了返回 null。 */
export async function getCompletionContact(store: Store, workspaceId: string, actorId: string, contactId: string): Promise<CompletionContactRow | null> {
  const record = await store.getRecord({ collectionName: "contacts", recordId: contactId, userId: actorId, workspaceId });
  return record && record.lifecycleState === "active" && ownedByActor(record, actorId) ? toContactRow(record) : null;
}

function detailStateRecordId(actorId: string, contactId: string): string {
  return `contact-detail:${encodeURIComponent(actorId)}:${encodeURIComponent(contactId)}`;
}

/**
 * 有往来的人（D-10 的 ●●● 之一）：联系人详情里记过笔记或最近互动（`contact_detail_states`，与人物页同一份数据）。
 * 只按候选人的 record id 精确读。
 */
export async function listInteractedContactIds(store: Store, workspaceId: string, actorId: string, contactIds: readonly string[]): Promise<Set<string>> {
  if (!contactIds.length) return new Set();
  const byRecordId = new Map(contactIds.map((contactId) => [detailStateRecordId(actorId, contactId), contactId]));
  const records = await store.listRecords({
    collectionName: "contact_detail_states",
    limit: byRecordId.size,
    omitSearchText: true,
    payloadFields: ["actorId", "contactId", "notes", "lastInteraction"],
    recordIds: [...byRecordId.keys()],
    userId: actorId,
    workspaceId,
  });
  const interacted = new Set<string>();
  for (const record of records) {
    const contactId = byRecordId.get(record.recordId);
    if (!contactId || record.lifecycleState === "deleted" || record.payload.actorId !== actorId) continue;
    const notes = Array.isArray(record.payload.notes) ? record.payload.notes : [];
    if (notes.length > 0 || (typeof record.payload.lastInteraction === "object" && record.payload.lastInteraction !== null)) interacted.add(contactId);
  }
  return interacted;
}
