import type { NoteContract } from "../api/contract/notes";

export type NoteView = NoteContract;

type NoteRequestResult<TBody> =
  | { success: true; body: TBody }
  | { success: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validNote(value: unknown, actorId: string): value is NoteView {
  if (!isRecord(value)) return false;
  return nonEmpty(value.id)
    && value.accountId === actorId
    && value.ownerUserId === actorId
    && nonEmpty(value.body)
    && Array.isArray(value.contactIds)
    && value.contactIds.every(nonEmpty)
    && new Set(value.contactIds).size === value.contactIds.length
    && Number.isSafeInteger(value.version)
    && Number(value.version) >= 1
    && nonEmpty(value.createdAt)
    && Number.isFinite(Date.parse(value.createdAt))
    && nonEmpty(value.updatedAt)
    && Number.isFinite(Date.parse(value.updatedAt));
}

function contactIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const a = contactIds(left);
  const b = contactIds(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function notesFromPayload(data: unknown, actorId: string): NoteView[] | null {
  if (!isRecord(data) || !Array.isArray(data.notes) || !data.notes.every((item) => validNote(item, actorId))) return null;
  return [...data.notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function noteFromPayload(data: unknown, actorId: string, noteId: string): NoteView | null {
  if (!isRecord(data) || !validNote(data.note, actorId) || data.note.id !== noteId) return null;
  return data.note;
}

export function buildNoteCreateRequest(
  draft: string,
  selectedContactIds: readonly string[],
  idempotencyKey: string,
): NoteRequestResult<{ body: string; contactIds: string[]; idempotencyKey: string }> {
  const body = draft.trim();
  if (!body) return { success: false, error: "请输入笔记内容。" };
  return { success: true, body: { body, contactIds: contactIds(selectedContactIds), idempotencyKey } };
}

export function buildNoteUpdateRequest(
  draft: string,
  selectedContactIds: readonly string[],
  expectedVersion: number,
  idempotencyKey: string,
): NoteRequestResult<{ body: string; contactIds: string[]; expectedVersion: number; idempotencyKey: string }> {
  const body = draft.trim();
  if (!body) return { success: false, error: "请输入笔记内容。" };
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { success: false, error: "笔记版本无效，请重新读取。" };
  return { success: true, body: { body, contactIds: contactIds(selectedContactIds), expectedVersion, idempotencyKey } };
}

export function confirmedNote(data: unknown, expected: {
  actorId: string;
  body: string;
  contactIds: readonly string[];
  noteId?: string;
}): NoteView | null {
  if (!isRecord(data) || !validNote(data.note, expected.actorId)) return null;
  const note = data.note;
  if (expected.noteId && note.id !== expected.noteId) return null;
  return note.body === expected.body && sameIds(note.contactIds, expected.contactIds) ? note : null;
}
