import type { LiveRecord } from "../../shared/storage/live-record-store";
import type { NoteMentionContract } from "../../shared/contract/notes";
import type { NoteDTO, NoteOperationReceipt, NoteRecordPayload } from "./contract";

export const NOTE_COLLECTION = "notes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function fallbackTitle(body: string): string {
  return body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "未命名笔记";
}

function readMentions(value: unknown, body: string): readonly NoteMentionContract[] | null {
  if (!Array.isArray(value)) return null;
  const mentions: NoteMentionContract[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !nonEmpty(item.contactId) ||
      !Number.isSafeInteger(item.start) ||
      !Number.isSafeInteger(item.end) ||
      Number(item.start) < 0 ||
      Number(item.end) <= Number(item.start) ||
      Number(item.end) > body.length ||
      !nonEmpty(item.displayText) ||
      body.slice(Number(item.start), Number(item.end)) !== item.displayText
    ) return null;
    mentions.push({
      contactId: item.contactId,
      start: Number(item.start),
      end: Number(item.end),
      displayText: item.displayText,
    });
  }
  return mentions;
}

export function isOwnedNoteIdentity(value: unknown, actorId: string): value is Record<string, unknown> {
  return isRecord(value) && nonEmpty(value.id) && value.accountId === actorId && value.ownerUserId === actorId;
}

function readNote(value: unknown, actorId: string, schemaVersion: 1 | 2): NoteDTO | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmpty(value.id) ||
    !isOwnedNoteIdentity(value, actorId) ||
    !nonEmpty(value.body) ||
    !Array.isArray(value.contactIds) ||
    !value.contactIds.every(nonEmpty) ||
    new Set(value.contactIds).size !== value.contactIds.length ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !isoDate(value.createdAt) ||
    !isoDate(value.updatedAt)
  ) return null;
  const contactIds = [...new Set(value.contactIds as string[])].sort();
  if (schemaVersion === 1) {
    return {
      ...(value as unknown as Omit<NoteDTO, "title" | "manualContactIds" | "mentions" | "eventIds">),
      title: fallbackTitle(value.body as string),
      manualContactIds: contactIds,
      mentions: [],
      contactIds,
      eventIds: [],
    };
  }
  if (
    !nonEmpty(value.title) ||
    !Array.isArray(value.manualContactIds) ||
    !value.manualContactIds.every(nonEmpty) ||
    !Array.isArray(value.eventIds) ||
    !value.eventIds.every(nonEmpty)
  ) return null;
  const body = value.body as string;
  const mentions = readMentions(value.mentions, body);
  if (!mentions) return null;
  const manualContactIds = [...new Set(value.manualContactIds as string[])].sort();
  const eventIds = [...new Set(value.eventIds as string[])].sort();
  const canonical = [...new Set([...manualContactIds, ...mentions.map((item) => item.contactId)])].sort();
  if (canonical.length !== contactIds.length || canonical.some((id, index) => id !== contactIds[index])) return null;
  return {
    ...(value as unknown as NoteDTO),
    title: value.title.trim(),
    manualContactIds,
    mentions,
    contactIds,
    eventIds,
  };
}

function readReceipt(value: unknown): NoteOperationReceipt | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmpty(value.idempotencyKey) ||
    !["create", "update", "unlink_contact"].includes(String(value.kind)) ||
    !nonEmpty(value.fingerprint) ||
    !Number.isSafeInteger(value.resultVersion) ||
    Number(value.resultVersion) < 1
  ) return null;
  return value as unknown as NoteOperationReceipt;
}

/** Payload keys a note list needs; the operations log stays in storage. */
export const NOTE_LIST_PAYLOAD_FIELDS = ["schemaVersion", "note"] as const;

function decodeNoteRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
  operationsProjectedAway: boolean,
): NoteRecordPayload | null {
  if (
    record.collectionName !== NOTE_COLLECTION ||
    record.lifecycleState === "deleted" ||
    record.userId !== actorId ||
    !isRecord(record.payload) ||
    ![1, 2].includes(Number(record.payload.schemaVersion))
  ) return null;
  const schemaVersion = Number(record.payload.schemaVersion) as 1 | 2;
  const note = readNote(record.payload.note, actorId, schemaVersion);
  if (!note) return null;
  if (operationsProjectedAway && record.payload.operations === undefined) {
    return { schemaVersion, note, operations: [] };
  }
  if (!Array.isArray(record.payload.operations)) return null;
  const operations = record.payload.operations.map(readReceipt);
  if (operations.some((item) => item === null)) return null;
  const receipts = operations as NoteOperationReceipt[];
  if (new Set(receipts.map((item) => item.idempotencyKey)).size !== receipts.length) return null;
  return { schemaVersion, note, operations: receipts };
}

export function noteRecordFromLiveRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): NoteRecordPayload | null {
  return decodeNoteRecord(record, actorId, false);
}

/**
 * List-path decoder for records read with NOTE_LIST_PAYLOAD_FIELDS: the
 * operations log is absent by projection, never consulted, and reported empty.
 */
export function noteListRecordFromLiveRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): NoteRecordPayload | null {
  return decodeNoteRecord(record, actorId, true);
}

export function noteLiveRecordFromPayload(input: {
  workspaceId: string;
  payload: NoteRecordPayload;
}): LiveRecord<Record<string, unknown>> {
  const actorId = input.payload.note.ownerUserId;
  const checked = noteRecordFromLiveRecord({
    workspaceId: input.workspaceId,
    collectionName: NOTE_COLLECTION,
    recordId: input.payload.note.id,
    userId: actorId,
    sourceType: "note",
    sourceId: input.payload.note.id,
    evidenceIds: [],
    targetType: "note",
    targetId: input.payload.note.id,
    occurredAt: input.payload.note.updatedAt,
    createdAt: input.payload.note.createdAt,
    updatedAt: input.payload.note.updatedAt,
    lifecycleState: "active",
    payload: {
      schemaVersion: input.payload.schemaVersion,
      note: {
        ...input.payload.note,
        manualContactIds: [...input.payload.note.manualContactIds],
        mentions: input.payload.note.mentions.map((item) => ({ ...item })),
        contactIds: [...input.payload.note.contactIds],
        eventIds: [...input.payload.note.eventIds],
      },
      operations: input.payload.operations.map((item) => ({ ...item })),
    },
  }, actorId);
  if (!checked) throw new Error("Note payload is invalid");
  return {
    workspaceId: input.workspaceId,
    collectionName: NOTE_COLLECTION,
    recordId: checked.note.id,
    userId: actorId,
    sourceType: "note",
    sourceId: checked.note.id,
    sourceLabel: "Orbit private note",
    evidenceIds: [],
    targetType: "note",
    targetId: checked.note.id,
    occurredAt: checked.note.updatedAt,
    createdAt: checked.note.createdAt,
    updatedAt: checked.note.updatedAt,
    lifecycleState: "active",
    searchText: `${checked.note.title}\n${checked.note.body}`,
    payload: {
      schemaVersion: checked.schemaVersion,
      note: {
        ...checked.note,
        manualContactIds: [...checked.note.manualContactIds],
        mentions: checked.note.mentions.map((item) => ({ ...item })),
        contactIds: [...checked.note.contactIds],
        eventIds: [...checked.note.eventIds],
      },
      operations: checked.operations.map((item) => ({ ...item })),
    },
  };
}
