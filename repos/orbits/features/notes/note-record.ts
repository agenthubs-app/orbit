import type { LiveRecord } from "../../shared/storage/live-record-store";
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

function readNote(value: unknown, actorId: string): NoteDTO | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmpty(value.id) ||
    value.accountId !== actorId ||
    value.ownerUserId !== actorId ||
    !nonEmpty(value.body) ||
    !Array.isArray(value.contactIds) ||
    !value.contactIds.every(nonEmpty) ||
    new Set(value.contactIds).size !== value.contactIds.length ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !isoDate(value.createdAt) ||
    !isoDate(value.updatedAt)
  ) return null;
  return value as unknown as NoteDTO;
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

export function noteRecordFromLiveRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): NoteRecordPayload | null {
  if (
    record.collectionName !== NOTE_COLLECTION ||
    record.lifecycleState === "deleted" ||
    record.userId !== actorId ||
    !isRecord(record.payload) ||
    record.payload.schemaVersion !== 1 ||
    !Array.isArray(record.payload.operations)
  ) return null;
  const note = readNote(record.payload.note, actorId);
  const operations = record.payload.operations.map(readReceipt);
  if (!note || operations.some((item) => item === null)) return null;
  const receipts = operations as NoteOperationReceipt[];
  if (new Set(receipts.map((item) => item.idempotencyKey)).size !== receipts.length) return null;
  return { schemaVersion: 1, note, operations: receipts };
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
      schemaVersion: 1,
      note: { ...input.payload.note, contactIds: [...input.payload.note.contactIds] },
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
    searchText: checked.note.body,
    payload: {
      schemaVersion: 1,
      note: { ...checked.note, contactIds: [...checked.note.contactIds] },
      operations: checked.operations.map((item) => ({ ...item })),
    },
  };
}
