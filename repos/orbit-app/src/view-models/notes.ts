import type { NoteContract, NoteMentionContract } from "../api/contract/notes";

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

function normalizedNote(value: unknown, actorId: string): NoteView | null {
  if (!isRecord(value)) return null;
  const valid = nonEmpty(value.id)
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
  if (!valid) return null;
  const body = value.body as string;
  const canonicalIds = contactIds(value.contactIds as string[]);
  const manualContactIds = Array.isArray(value.manualContactIds) && value.manualContactIds.every(nonEmpty)
    ? contactIds(value.manualContactIds)
    : canonicalIds;
  const mentions = Array.isArray(value.mentions) ? value.mentions.filter((item): item is NoteMentionContract => {
    if (!isRecord(item) || !nonEmpty(item.contactId) || !nonEmpty(item.displayText)) return false;
    return Number.isSafeInteger(item.start) && Number.isSafeInteger(item.end)
      && Number(item.start) >= 0 && Number(item.end) > Number(item.start)
      && Number(item.end) <= body.length && body.slice(Number(item.start), Number(item.end)) === item.displayText;
  }) : [];
  const eventIds = Array.isArray(value.eventIds) && value.eventIds.every(nonEmpty) ? contactIds(value.eventIds) : [];
  const title = nonEmpty(value.title)
    ? value.title.trim()
    : body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "未命名笔记";
  const expectedCanonical = contactIds([...manualContactIds, ...mentions.map((item) => item.contactId)]);
  if (!sameIds(expectedCanonical, canonicalIds)) return null;
  return {
    ...(value as unknown as NoteContract),
    title,
    body,
    manualContactIds,
    mentions,
    contactIds: canonicalIds,
    eventIds,
  };
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
  if (!isRecord(data) || !Array.isArray(data.notes)) return null;
  const notes = data.notes.map((item) => normalizedNote(item, actorId));
  if (notes.some((item) => item === null)) return null;
  return (notes as NoteView[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export interface NotesPageView {
  notes: NoteView[];
  total: number;
  nextCursor: string | null;
}

export function notesPageFromPayload(data: unknown, actorId: string): NotesPageView | null {
  const notes = notesFromPayload(data, actorId);
  if (notes === null || !isRecord(data)) return null;
  const total = Number(data.total);
  if (!Number.isSafeInteger(total) || total < notes.length) return null;
  if (data.nextCursor !== undefined && !nonEmpty(data.nextCursor)) return null;
  return {
    notes,
    total,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
  };
}

export function noteFromPayload(data: unknown, actorId: string, noteId: string): NoteView | null {
  if (!isRecord(data)) return null;
  const note = normalizedNote(data.note, actorId);
  return note?.id === noteId ? note : null;
}

export interface RichNoteDraft {
  title: string;
  body: string;
  manualContactIds: readonly string[];
  mentions: readonly NoteMentionContract[];
  eventIds: readonly string[];
}

export function buildRichNoteCreateRequest(
  draft: RichNoteDraft,
  idempotencyKey: string,
): NoteRequestResult<RichNoteDraft & { idempotencyKey: string }> {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title) return { success: false, error: "请输入笔记标题。" };
  if (!body) return { success: false, error: "请输入笔记内容。" };
  return {
    success: true,
    body: {
      title,
      body,
      manualContactIds: contactIds(draft.manualContactIds),
      mentions: draft.mentions.map((mention) => ({ ...mention })),
      eventIds: contactIds(draft.eventIds),
      idempotencyKey,
    },
  };
}

export function buildRichNoteUpdateRequest(
  draft: RichNoteDraft,
  expectedVersion: number,
  idempotencyKey: string,
): NoteRequestResult<RichNoteDraft & { expectedVersion: number; idempotencyKey: string }> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { success: false, error: "笔记版本无效，请重新读取。" };
  const created = buildRichNoteCreateRequest(draft, idempotencyKey);
  return created.success
    ? { success: true, body: { ...created.body, expectedVersion } }
    : created;
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
  eventIds?: readonly string[];
  manualContactIds?: readonly string[];
  mentions?: readonly NoteMentionContract[];
  noteId?: string;
  title?: string;
}): NoteView | null {
  if (!isRecord(data)) return null;
  const note = normalizedNote(data.note, expected.actorId);
  if (!note) return null;
  if (expected.noteId && note.id !== expected.noteId) return null;
  const mentionsMatch = expected.mentions === undefined || (
    note.mentions.length === expected.mentions.length
    && note.mentions.every((mention, index) => {
      const wanted = expected.mentions![index];
      return wanted !== undefined
        && mention.contactId === wanted.contactId
        && mention.start === wanted.start
        && mention.end === wanted.end
        && mention.displayText === wanted.displayText;
    })
  );
  return note.body === expected.body
    && (expected.title === undefined || note.title === expected.title)
    && sameIds(note.contactIds, expected.contactIds)
    && (expected.manualContactIds === undefined || sameIds(note.manualContactIds, expected.manualContactIds))
    && (expected.eventIds === undefined || sameIds(note.eventIds, expected.eventIds))
    && mentionsMatch
    ? note
    : null;
}
