import type { ContactCardDTO, ContactCardPageDTO, ContactCardSummaryDTO } from "../api/contract/contact-card-page";
import type { ContactSyncPayload, LocalContactDirectoryQuery } from "../api/contract/contact-local-directory";
import { localContactDirectory, localContactDirectorySummary } from "../api/schema/contact-local-directory";
import { contactCardSchema } from "../api/schema/contact-card-page";
import { contactDensity } from "../api/compute/contact-density";
import { contactMetKind, contactSourceChip, meetingNoteValue } from "../api/compute/contact-source-chip";

/**
 * Sprint 0116 (offline 1b): the account's contacts from the device mirror
 * (sync domain "contacts"). Every row carries the server's own list card,
 * search text and detail read, so the list, the search and the detail are the
 * server's results for the same data (rules: api/schema/contact-local-directory).
 */
export const LOCAL_CONTACT_PAGE_SIZE = 30;

export interface LocalContactRecord { id: string; payload: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A mirror row the screens can use; malformed rows are ignored, never shown half-built. */
export function contactSyncPayload(record: LocalContactRecord): ContactSyncPayload | null {
  const payload = record.payload;
  if (!isRecord(payload) || payload.id !== record.id || !Array.isArray(payload.tags) || !isRecord(payload.search)) return null;
  const search = payload.search;
  if (typeof search.text !== "string" || typeof search.occurredAt !== "string" || typeof search.updatedAt !== "string" || (search.error !== null && typeof search.error !== "string")) return null;
  const card = payload.card === null ? null : contactCardSchema.safeParse(payload.card);
  if (card && !card.success) return null;
  return {
    id: record.id,
    card: card ? card.data as ContactCardDTO : null,
    tags: payload.tags.filter((tag): tag is string => typeof tag === "string"),
    search: { text: search.text, occurredAt: search.occurredAt, updatedAt: search.updatedAt, error: search.error as string | null },
    detail: isRecord(payload.detail) ? payload.detail : null,
  };
}

export function contactSyncPayloads(records: readonly LocalContactRecord[]): ContactSyncPayload[] {
  return records.flatMap((record) => {
    const row = contactSyncPayload(record);
    return row ? [row] : [];
  });
}

/** One page of the list (offset cursor), in the server's list order. */
export function localContactCardPage(rows: readonly ContactSyncPayload[], query: LocalContactDirectoryQuery, cursor: string | null, asOf: string): ContactCardPageDTO {
  const offset = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const matches = localContactDirectory(rows, query);
  const items = matches.slice(offset, offset + LOCAL_CONTACT_PAGE_SIZE).flatMap((row) => (row.card ? [row.card] : []));
  const hasMore = matches.length > offset + LOCAL_CONTACT_PAGE_SIZE;
  return { items, nextCursor: hasMore ? String(offset + LOCAL_CONTACT_PAGE_SIZE) : null, hasMore, asOf };
}

export function localContactCardSummary(rows: readonly ContactSyncPayload[], query: LocalContactDirectoryQuery, asOf: string): ContactCardSummaryDTO {
  return { ...localContactDirectorySummary(rows, query), asOf };
}

/** The detail read of a contact by its contact id (the id the list card and every route use). */
export function localContactDetail(rows: readonly ContactSyncPayload[], contactId: string): Record<string, unknown> | null {
  const row = rows.find((candidate) => candidate.card?.id === contactId) ?? rows.find((candidate) => candidate.id === contactId);
  return row?.detail ?? null;
}

/** Name and organization for a linked-contact chip (notes, tasks, schedule), without a network read. */
export function localContactLabel(rows: readonly ContactSyncPayload[], contactId: string): { id: string; name: string; organization: string } | null {
  const row = rows.find((candidate) => candidate.card?.id === contactId) ?? rows.find((candidate) => candidate.id === contactId);
  return row?.card ? { id: row.card.id, name: row.card.displayName, organization: row.card.organization } : null;
}

/**
 * R11a（代定 10）：旧镜像兜底。服务端在 R11a 之后才给卡片带 `density` / `sourceChip` / `metKind`；升级前同步下来的行没有，
 * 不强制重建镜像，按本机已有字段现算（与服务端同一组共享函数；不含计划，计划在读时合并）：
 * - 读同步详情的 `contact`（同步行是 `{ state, contact }`，`features/contacts/live-detail-service.ts`；裸形状兜底）；
 * - 浓度：详情里的邮箱 / 电话、名片备注（`note:business-card-notes:` 那条笔记）里的「出会い」行、用户写的笔记（往来，
 *   `note:live-contact-detail-update:`，与服务端「detail state 有 notes」同口径）；
 * - 出どころ：按 `sourceType`（名刺 / イベント / 連絡先 vCard 标签 / 其余 手入力）；
 * - 出会った場所：活动导入 → イベント、来源 referral / 「出会い：紹介」→ 紹介、商談 / 訪問 → 訪問・商談。
 */
export function withLegacyNetworkFields(row: ContactSyncPayload): ContactSyncPayload {
  const card = row.card;
  if (!card || (card.density !== undefined && card.sourceChip !== undefined && card.metKind !== undefined)) return row;
  const raw = row.detail ?? {};
  const detail = (isRecord(raw.contact) ? raw.contact : raw) as Record<string, unknown>;
  const notes = Array.isArray(detail.notes) ? detail.notes.filter(isRecord) : [];
  const noteId = (note: Record<string, unknown>) => (typeof note.noteId === "string" ? note.noteId : "");
  const cardNote = notes.find((note) => noteId(note).startsWith("note:business-card-notes:"));
  const text = (key: string) => (typeof detail[key] === "string" ? (detail[key] as string).trim() : "");
  const notesText = text("cardNotes") || (typeof cardNote?.body === "string" ? cardNote.body.trim() : "");
  const meetingNote = meetingNoteValue(notesText);
  const source = typeof detail.source === "object" && detail.source !== null ? detail.source as Record<string, unknown> : {};
  const sourceLabel = typeof source.label === "string" ? source.label : "";
  const interacted = notes.some((note) => noteId(note).startsWith("note:live-contact-detail-update:"));
  const density = card.density ?? contactDensity({
    hasIdentity: Boolean(card.displayName.trim()), hasContactPoint: Boolean(text("primaryEmail") || text("primaryPhone")),
    hasMetContext: meetingNote !== null, hasGoalRelation: false, hasInteraction: interacted, selfReported: false,
  }).level;
  return { ...row, card: {
    ...card,
    density,
    sourceChip: card.sourceChip ?? contactSourceChip({ sourceType: card.sourceType, sourceLabel, hasLinkedinNote: /^LinkedIn:/mu.test(notesText) }),
    metKind: card.metKind ?? contactMetKind({ sourceType: card.sourceType, meetingNote }),
  } };
}
