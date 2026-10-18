import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { NoteMentionContract } from "../../shared/contract/notes";
import type { NoteDTO, NoteOperationKind, NoteOperationReceipt, NoteRecordPayload } from "./contract";
import type { NoteRepository } from "./repository";

export type NoteServiceErrorCode =
  | "NOTE_NOT_FOUND"
  | "NOTE_VERSION_CONFLICT"
  | "NOTE_IDEMPOTENCY_CONFLICT"
  | "NOTE_INVALID_INPUT";

export class NoteServiceError extends Error {
  constructor(readonly code: NoteServiceErrorCode, message: string) {
    super(message);
    this.name = "NoteServiceError";
  }
}

export interface NoteService {
  list(input: { actorId: string; contactId?: string }): Promise<readonly NoteDTO[]>;
  search(input: NoteSearchInput): Promise<NoteSearchResult>;
  get(input: { actorId: string; noteId: string }): Promise<NoteDTO | null>;
  create(input: NoteCreateInput): Promise<NoteDTO>;
  update(input: NoteUpdateInput): Promise<NoteDTO>;
  unlinkContact(input: { actorId: string; noteId: string; contactId: string; expectedVersion: number; idempotencyKey: string; now: string }): Promise<NoteDTO>;
}

export interface NoteAssociationReader {
  accessibleContactIds(input: { actorId: string; ids: readonly string[] }): Promise<readonly string[]>;
  accessibleEventIds(input: { actorId: string; ids: readonly string[] }): Promise<readonly string[]>;
  searchContactIds(input: { actorId: string; query: string }): Promise<readonly string[]>;
}

export type NoteAssociationFilter = "all" | "contacts" | "events" | "unlinked";
export type NoteSort = "updated_desc" | "updated_asc";

export interface NoteSearchInput {
  actorId: string;
  q?: string;
  contactId?: string;
  association?: NoteAssociationFilter;
  noteKind?: "all" | "meeting" | "free";
  sort?: NoteSort;
  cursor?: string;
  limit?: number;
}

export interface NoteSearchResult {
  notes: readonly NoteDTO[];
  total: number;
  nextCursor?: string;
}

export interface NoteCreateInput {
  actorId: string;
  title?: string;
  body: string;
  contactIds?: readonly string[];
  manualContactIds?: readonly string[];
  mentions?: readonly NoteMentionContract[];
  eventIds?: readonly string[];
  noteKind?: "free" | "meeting" | "voice";
  usedForPlan?: boolean;
  idempotencyKey: string;
  now: string;
  /** Called only after a new write commits; derived work must not affect the note response. */
  onPersisted?: (note: NoteDTO) => void;
}

export interface NoteUpdateInput {
  actorId: string;
  noteId: string;
  title?: string;
  body?: string;
  contactIds?: readonly string[];
  manualContactIds?: readonly string[];
  mentions?: readonly NoteMentionContract[];
  eventIds?: readonly string[];
  noteKind?: "free" | "meeting" | "voice";
  usedForPlan?: boolean;
  expectedVersion: number;
  idempotencyKey: string;
  now: string;
  onPersisted?: (note: NoteDTO) => void;
}

const mutationTails = new Map<string, Promise<void>>();

async function withMutationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationTails.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  mutationTails.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (mutationTails.get(key) === current) mutationTails.delete(key);
  }
}

function stableId(actorId: string, idempotencyKey: string): string {
  return `note:${createHash("sha256").update(`${actorId}\u0000${idempotencyKey}`).digest("hex").slice(0, 24)}`;
}

function normalizedBody(value: string): string {
  const body = value.trim();
  if (!body) throw new NoteServiceError("NOTE_INVALID_INPUT", "Note body is required");
  return body;
}

function normalizedTitle(value: string | undefined, body: string): string {
  const title = value?.trim() || body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "未命名笔记";
  return title.slice(0, 200);
}

function normalizedIds(values: readonly string[] | undefined): string[] {
  const ids = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if ((values ?? []).some((value) => !value.trim())) {
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Contact ids cannot be empty");
  }
  return ids;
}

function canonicalContactIds(manualContactIds: readonly string[], mentions: readonly NoteMentionContract[]): string[] {
  return [...new Set([...manualContactIds, ...mentions.filter((item) => (item.entityType ?? "contact") === "contact").map((item) => item.contactId!).filter(Boolean)])].sort();
}

function canonicalEventIds(manualEventIds: readonly string[], mentions: readonly NoteMentionContract[]): string[] {
  return [...new Set([...manualEventIds, ...mentions.filter((item) => item.entityType === "event").map((item) => item.eventId!).filter(Boolean)])].sort();
}

function normalizedMentions(values: readonly NoteMentionContract[] | undefined, body: string, existing: readonly NoteMentionContract[] = []): NoteMentionContract[] {
  const mentions = (values ?? []).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      !Number.isSafeInteger(item.start) ||
      !Number.isSafeInteger(item.end) ||
      item.start < 0 ||
      item.end <= item.start ||
      item.end > body.length ||
      typeof item.displayText !== "string" ||
      !item.displayText.trim() ||
      body.slice(item.start, item.end) !== item.displayText
    ) throw new NoteServiceError("NOTE_INVALID_INPUT", "Note mention range is invalid");
    if (item.entityType === undefined || item.entityType === "contact") {
      const contactId = typeof item.contactId === "string" ? item.contactId.trim() : undefined;
      if (!contactId || item.eventId !== undefined) throw new NoteServiceError("NOTE_INVALID_INPUT", "Contact mention is invalid");
      return { ...item, contactId };
    }
    if (item.entityType === "event") {
      const eventId = typeof item.eventId === "string" ? item.eventId.trim() : undefined;
      if (!eventId || item.contactId !== undefined) throw new NoteServiceError("NOTE_INVALID_INPUT", "Event mention is invalid");
      return { ...item, eventId };
    }
    if (existing.some((old) => isDeepStrictEqual(old, item))) return { ...item };
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Unknown mention must remain unchanged");
  });
  const ranges = [...mentions].sort((a, b) => a.start - b.start);
  if (ranges.some((item, index) => index > 0 && item.start < ranges[index - 1]!.end)) {
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Note mention ranges overlap");
  }
  if (existing.some((old) => old.entityType !== undefined && old.entityType !== "contact" && old.entityType !== "event" &&
    !mentions.some((item) => isDeepStrictEqual(item, old)))) {
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Unknown mention must remain unchanged");
  }
  return mentions;
}

function noteKind(value: unknown): "free" | "meeting" | "voice" | undefined {
  if (value === undefined || value === "free" || value === "meeting" || value === "voice") return value as "free" | "meeting" | "voice" | undefined;
  throw new NoteServiceError("NOTE_INVALID_INPUT", "Note kind is invalid");
}

function usedForPlan(value: unknown): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  throw new NoteServiceError("NOTE_INVALID_INPUT", "Plan use flag is invalid");
}

function requirePlanUseEligibility(kind: NoteDTO["noteKind"], enabled: boolean | undefined, contactIds: readonly string[]): void {
  if (enabled === true && (kind !== "meeting" || contactIds.length !== 1)) {
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Plan use requires a meeting memo with one contact");
  }
}

function notifyPersisted(note: NoteDTO, callback: ((note: NoteDTO) => void) | undefined): void {
  if (!callback) return;
  try { callback(note); }
  catch (error) {
    console.error(JSON.stringify({
      event: "memo_extraction_error", stage: "enqueue_failed", actorId: note.ownerUserId,
      contactId: note.contactIds[0] ?? null, noteId: note.id,
      error: error instanceof Error ? error.name : "unknown",
    }));
  }
}

async function requireAccessibleIds(
  requested: readonly string[],
  read: (ids: readonly string[]) => Promise<readonly string[]>,
  label: string,
): Promise<void> {
  if (requested.length === 0) return;
  const accessible = new Set(await read(requested));
  if (requested.some((id) => !accessible.has(id))) {
    throw new NoteServiceError("NOTE_INVALID_INPUT", `${label} contains an unavailable association`);
  }
}

function cursorScope(input: Omit<NoteSearchInput, "cursor" | "limit">): string {
  return fingerprint({
    actorId: input.actorId,
    q: input.q?.trim().toLocaleLowerCase() ?? "",
    contactId: input.contactId?.trim() ?? "",
    association: input.association ?? "all",
    noteKind: input.noteKind ?? "all",
    sort: input.sort ?? "updated_desc",
  }).slice(0, 20);
}

function encodeCursor(offset: number, scope: string): string {
  return Buffer.from(JSON.stringify({ offset, scope }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined, scope: string): number {
  if (!value) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { offset?: unknown; scope?: unknown };
    if (!Number.isSafeInteger(decoded.offset) || Number(decoded.offset) < 0 || decoded.scope !== scope) throw new Error("invalid");
    return Number(decoded.offset);
  } catch {
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Note cursor is invalid for this query");
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function receiptFor(payload: NoteRecordPayload, idempotencyKey: string): NoteOperationReceipt | undefined {
  return payload.operations.find((item) => item.idempotencyKey === idempotencyKey);
}

function checkReplay(payload: NoteRecordPayload, input: { idempotencyKey: string; kind: NoteOperationKind; fingerprint: string }): NoteDTO | null {
  const receipt = receiptFor(payload, input.idempotencyKey);
  if (!receipt) return null;
  if (receipt.kind !== input.kind || receipt.fingerprint !== input.fingerprint) {
    throw new NoteServiceError("NOTE_IDEMPOTENCY_CONFLICT", "The idempotency key is already in use");
  }
  return payload.note;
}

function requirePayload(payload: NoteRecordPayload | null, noteId: string): NoteRecordPayload {
  if (!payload) throw new NoteServiceError("NOTE_NOT_FOUND", `Note ${noteId} was not found`);
  return payload;
}

function receipt(input: { idempotencyKey: string; kind: NoteOperationKind; fingerprint: string; resultVersion: number }): NoteOperationReceipt {
  return { ...input };
}

export function createNoteService(input: { repository: NoteRepository; associationReader?: NoteAssociationReader }): NoteService {
  const associationReader: NoteAssociationReader = input.associationReader ?? {
    async accessibleContactIds({ ids }) { return ids; },
    async accessibleEventIds({ ids }) { return ids; },
    async searchContactIds() { return []; },
  };
  return {
    async list(query) {
      return (await this.search(query)).notes;
    },
    async search(query) {
      const limit = Math.min(50, Math.max(1, query.limit ?? 20));
      const search = query.q?.trim().toLocaleLowerCase() ?? "";
      const matchedContactIds = search
        ? new Set(await associationReader.searchContactIds({ actorId: query.actorId, query: query.q!.trim() }))
        : new Set<string>();
      const records = await input.repository.list(query.actorId);
      const notes = records
        .map((record) => record.note)
        .filter((note) => !query.contactId || note.contactIds.includes(query.contactId))
        .filter((note) => query.noteKind === undefined || query.noteKind === "all" ||
          (query.noteKind === "meeting" ? note.noteKind === "meeting" : note.noteKind !== "meeting"))
        .filter((note) => {
          const association = query.association ?? "all";
          if (association === "contacts" && note.contactIds.length === 0) return false;
          if (association === "events" && note.eventIds.length === 0) return false;
          if (association === "unlinked" && (note.contactIds.length > 0 || note.eventIds.length > 0)) return false;
          return true;
        })
        .filter((note) => !search || `${note.title}\n${note.body}`.toLocaleLowerCase().includes(search) || note.contactIds.some((id) => matchedContactIds.has(id)))
        .sort((left, right) => (query.sort === "updated_asc" ? left.updatedAt.localeCompare(right.updatedAt) : right.updatedAt.localeCompare(left.updatedAt)) || left.id.localeCompare(right.id));
      // An offset is valid only for this exact authorized source collection.
      // Until the canonical source exposes snapshots, reject changed history
      // rather than silently skipping records that moved between pages.
      const scope = fingerprint({ query: cursorScope(query), notes });
      const offset = decodeCursor(query.cursor, scope);
      const page = notes.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      return {
        notes: page,
        total: notes.length,
        ...(nextOffset < notes.length ? { nextCursor: encodeCursor(nextOffset, scope) } : {}),
      };
    },
    async get(query) {
      return (await input.repository.get(query.actorId, query.noteId))?.note ?? null;
    },
    async create(createInput) {
      const body = normalizedBody(createInput.body);
      const title = normalizedTitle(createInput.title, body);
      const manualContactIds = normalizedIds(createInput.manualContactIds ?? createInput.contactIds);
      const mentions = normalizedMentions(createInput.mentions, body);
      const eventIds = canonicalEventIds(normalizedIds(createInput.eventIds), mentions);
      const contactIds = canonicalContactIds(manualContactIds, mentions);
      const nextNoteKind = noteKind(createInput.noteKind);
      const nextUsedForPlan = usedForPlan(createInput.usedForPlan);
      requirePlanUseEligibility(nextNoteKind, nextUsedForPlan, contactIds);
      await requireAccessibleIds(contactIds, (ids) => associationReader.accessibleContactIds({ actorId: createInput.actorId, ids }), "contactIds");
      await requireAccessibleIds(eventIds, (ids) => associationReader.accessibleEventIds({ actorId: createInput.actorId, ids }), "eventIds");
      const noteId = stableId(createInput.actorId, createInput.idempotencyKey);
      const operationFingerprint = fingerprint({ title, body, manualContactIds, mentions, eventIds, noteKind: nextNoteKind, usedForPlan: nextUsedForPlan });
      return withMutationLock(`${createInput.actorId}\u0000${noteId}`, async () => {
        const note: NoteDTO = {
          id: noteId,
          accountId: createInput.actorId,
          ownerUserId: createInput.actorId,
          title,
          body,
          manualContactIds,
          mentions,
          contactIds,
          eventIds,
          ...(nextNoteKind === undefined ? {} : { noteKind: nextNoteKind }),
          ...(nextUsedForPlan === undefined ? {} : { usedForPlan: nextUsedForPlan }),
          version: 1,
          createdAt: createInput.now,
          updatedAt: createInput.now,
        };
        const payload: NoteRecordPayload = {
          schemaVersion: 2,
          note,
          operations: [receipt({ idempotencyKey: createInput.idempotencyKey, kind: "create", fingerprint: operationFingerprint, resultVersion: 1 })],
        };
        const inserted = await input.repository.saveIfAbsent(payload);
        if (inserted) {
          notifyPersisted(inserted.note, createInput.onPersisted);
          return inserted.note;
        }
        const existing = await input.repository.get(createInput.actorId, noteId);
        const replay = existing && checkReplay(existing, { idempotencyKey: createInput.idempotencyKey, kind: "create", fingerprint: operationFingerprint });
        if (replay) return replay;
        throw new NoteServiceError("NOTE_IDEMPOTENCY_CONFLICT", "The idempotency key is already in use");
      });
    },
    async update(updateInput) {
      const body = updateInput.body === undefined ? undefined : normalizedBody(updateInput.body);
      if (body === undefined && updateInput.title === undefined && updateInput.contactIds === undefined && updateInput.manualContactIds === undefined && updateInput.mentions === undefined && updateInput.eventIds === undefined && updateInput.noteKind === undefined && updateInput.usedForPlan === undefined) throw new NoteServiceError("NOTE_INVALID_INPUT", "At least one note field is required");
      return withMutationLock(`${updateInput.actorId}\u0000${updateInput.noteId}`, async () => {
        const stored = requirePayload(await input.repository.get(updateInput.actorId, updateInput.noteId), updateInput.noteId);
        const nextBody = body ?? stored.note.body;
        const title = updateInput.title === undefined ? stored.note.title : normalizedTitle(updateInput.title, nextBody);
        const manualContactIds = updateInput.manualContactIds !== undefined
          ? normalizedIds(updateInput.manualContactIds)
          : updateInput.contactIds !== undefined
            ? normalizedIds(updateInput.contactIds)
            : [...stored.note.manualContactIds];
        const mentions = normalizedMentions(updateInput.mentions ?? stored.note.mentions, nextBody, stored.note.mentions);
        const eventIds = canonicalEventIds(updateInput.eventIds === undefined ? stored.note.eventIds : normalizedIds(updateInput.eventIds), mentions);
        const contactIds = canonicalContactIds(manualContactIds, mentions);
        const nextNoteKind = noteKind(updateInput.noteKind);
        const nextUsedForPlan = usedForPlan(updateInput.usedForPlan);
        await requireAccessibleIds(contactIds, (ids) => associationReader.accessibleContactIds({ actorId: updateInput.actorId, ids }), "contactIds");
        await requireAccessibleIds(eventIds, (ids) => associationReader.accessibleEventIds({ actorId: updateInput.actorId, ids }), "eventIds");
        const operationFingerprint = fingerprint({ title: updateInput.title, body, contactIds: updateInput.contactIds, manualContactIds: updateInput.manualContactIds, mentions: updateInput.mentions, eventIds: updateInput.eventIds, noteKind: nextNoteKind, usedForPlan: nextUsedForPlan, expectedVersion: updateInput.expectedVersion });
        const replay = checkReplay(stored, { idempotencyKey: updateInput.idempotencyKey, kind: "update", fingerprint: operationFingerprint });
        if (replay) return replay;
        if (stored.note.version !== updateInput.expectedVersion) {
          throw new NoteServiceError("NOTE_VERSION_CONFLICT", "Note has changed since it was loaded");
        }
        requirePlanUseEligibility(nextNoteKind ?? stored.note.noteKind, nextUsedForPlan ?? stored.note.usedForPlan, contactIds);
        const note: NoteDTO = {
          ...stored.note,
          title,
          body: nextBody,
          manualContactIds,
          mentions,
          contactIds,
          eventIds,
          ...(nextNoteKind === undefined ? {} : { noteKind: nextNoteKind }),
          ...(nextUsedForPlan === undefined ? {} : { usedForPlan: nextUsedForPlan }),
          version: stored.note.version + 1,
          updatedAt: updateInput.now,
        };
        const saved = await input.repository.saveIfVersion({
          schemaVersion: 2,
          note,
          operations: [...stored.operations, receipt({ idempotencyKey: updateInput.idempotencyKey, kind: "update", fingerprint: operationFingerprint, resultVersion: note.version })],
        }, { version: stored.note.version, updatedAt: stored.note.updatedAt });
        if (!saved) {
          const current = await input.repository.get(updateInput.actorId, updateInput.noteId);
          const replay = current && checkReplay(current, { idempotencyKey: updateInput.idempotencyKey, kind: "update", fingerprint: operationFingerprint });
          if (replay) return replay;
          throw new NoteServiceError("NOTE_VERSION_CONFLICT", "Note has changed since it was loaded");
        }
        notifyPersisted(saved.note, updateInput.onPersisted);
        return saved.note;
      });
    },
    async unlinkContact(unlinkInput) {
      const contactId = unlinkInput.contactId.trim();
      if (!contactId) throw new NoteServiceError("NOTE_INVALID_INPUT", "Contact id is required");
      const operationFingerprint = fingerprint({ contactId, expectedVersion: unlinkInput.expectedVersion });
      return withMutationLock(`${unlinkInput.actorId}\u0000${unlinkInput.noteId}`, async () => {
        const stored = requirePayload(await input.repository.get(unlinkInput.actorId, unlinkInput.noteId), unlinkInput.noteId);
        const replay = checkReplay(stored, { idempotencyKey: unlinkInput.idempotencyKey, kind: "unlink_contact", fingerprint: operationFingerprint });
        if (replay) return replay;
        if (stored.note.version !== unlinkInput.expectedVersion) {
          throw new NoteServiceError("NOTE_VERSION_CONFLICT", "Note has changed since it was loaded");
        }
        if (!stored.note.contactIds.includes(contactId)) return stored.note;
        const nextContactIds = canonicalContactIds(
          stored.note.manualContactIds.filter((id) => id !== contactId),
          stored.note.mentions.filter((item) => item.contactId !== contactId),
        );
        requirePlanUseEligibility(stored.note.noteKind, stored.note.usedForPlan, nextContactIds);
        const note: NoteDTO = {
          ...stored.note,
          manualContactIds: stored.note.manualContactIds.filter((id) => id !== contactId),
          mentions: stored.note.mentions.filter((item) => item.contactId !== contactId),
          contactIds: nextContactIds,
          version: stored.note.version + 1,
          updatedAt: unlinkInput.now,
        };
        const saved = await input.repository.saveIfVersion({
          schemaVersion: 2,
          note,
          operations: [...stored.operations, receipt({ idempotencyKey: unlinkInput.idempotencyKey, kind: "unlink_contact", fingerprint: operationFingerprint, resultVersion: note.version })],
        }, { version: stored.note.version, updatedAt: stored.note.updatedAt });
        if (!saved) {
          const current = await input.repository.get(unlinkInput.actorId, unlinkInput.noteId);
          const replay = current && checkReplay(current, { idempotencyKey: unlinkInput.idempotencyKey, kind: "unlink_contact", fingerprint: operationFingerprint });
          if (replay) return replay;
          throw new NoteServiceError("NOTE_VERSION_CONFLICT", "Note has changed since it was loaded");
        }
        return saved.note;
      });
    },
  };
}
