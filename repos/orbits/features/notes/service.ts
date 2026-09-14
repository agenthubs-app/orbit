import { createHash } from "node:crypto";

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
  get(input: { actorId: string; noteId: string }): Promise<NoteDTO | null>;
  create(input: { actorId: string; body: string; contactIds?: readonly string[]; idempotencyKey: string; now: string }): Promise<NoteDTO>;
  update(input: { actorId: string; noteId: string; body?: string; contactIds?: readonly string[]; expectedVersion: number; idempotencyKey: string; now: string }): Promise<NoteDTO>;
  unlinkContact(input: { actorId: string; noteId: string; contactId: string; expectedVersion: number; idempotencyKey: string; now: string }): Promise<NoteDTO>;
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

function normalizedIds(values: readonly string[] | undefined): string[] {
  const ids = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if ((values ?? []).some((value) => !value.trim())) {
    throw new NoteServiceError("NOTE_INVALID_INPUT", "Contact ids cannot be empty");
  }
  return ids;
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

export function createNoteService(input: { repository: NoteRepository }): NoteService {
  return {
    async list(query) {
      const records = await input.repository.list(query.actorId);
      return records
        .map((record) => record.note)
        .filter((note) => !query.contactId || note.contactIds.includes(query.contactId))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async get(query) {
      return (await input.repository.get(query.actorId, query.noteId))?.note ?? null;
    },
    async create(createInput) {
      const body = normalizedBody(createInput.body);
      const contactIds = normalizedIds(createInput.contactIds);
      const noteId = stableId(createInput.actorId, createInput.idempotencyKey);
      const operationFingerprint = fingerprint({ body, contactIds });
      return withMutationLock(`${createInput.actorId}\u0000${noteId}`, async () => {
        const existing = await input.repository.get(createInput.actorId, noteId);
        if (existing) {
          const replay = checkReplay(existing, { idempotencyKey: createInput.idempotencyKey, kind: "create", fingerprint: operationFingerprint });
          if (replay) return replay;
          throw new NoteServiceError("NOTE_IDEMPOTENCY_CONFLICT", "The idempotency key is already in use");
        }
        const note: NoteDTO = {
          id: noteId,
          accountId: createInput.actorId,
          ownerUserId: createInput.actorId,
          body,
          contactIds,
          version: 1,
          createdAt: createInput.now,
          updatedAt: createInput.now,
        };
        const saved = await input.repository.save({
          schemaVersion: 1,
          note,
          operations: [receipt({ idempotencyKey: createInput.idempotencyKey, kind: "create", fingerprint: operationFingerprint, resultVersion: 1 })],
        });
        return saved.note;
      });
    },
    async update(updateInput) {
      const body = updateInput.body === undefined ? undefined : normalizedBody(updateInput.body);
      const contactIds = updateInput.contactIds === undefined ? undefined : normalizedIds(updateInput.contactIds);
      if (body === undefined && contactIds === undefined) throw new NoteServiceError("NOTE_INVALID_INPUT", "At least one note field is required");
      const operationFingerprint = fingerprint({ body, contactIds, expectedVersion: updateInput.expectedVersion });
      return withMutationLock(`${updateInput.actorId}\u0000${updateInput.noteId}`, async () => {
        const stored = requirePayload(await input.repository.get(updateInput.actorId, updateInput.noteId), updateInput.noteId);
        const replay = checkReplay(stored, { idempotencyKey: updateInput.idempotencyKey, kind: "update", fingerprint: operationFingerprint });
        if (replay) return replay;
        if (stored.note.version !== updateInput.expectedVersion) {
          throw new NoteServiceError("NOTE_VERSION_CONFLICT", "Note has changed since it was loaded");
        }
        const note: NoteDTO = {
          ...stored.note,
          ...(body === undefined ? {} : { body }),
          ...(contactIds === undefined ? {} : { contactIds }),
          version: stored.note.version + 1,
          updatedAt: updateInput.now,
        };
        return (await input.repository.save({
          schemaVersion: 1,
          note,
          operations: [...stored.operations, receipt({ idempotencyKey: updateInput.idempotencyKey, kind: "update", fingerprint: operationFingerprint, resultVersion: note.version })],
        })).note;
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
        const note: NoteDTO = {
          ...stored.note,
          contactIds: stored.note.contactIds.filter((id) => id !== contactId),
          version: stored.note.version + 1,
          updatedAt: unlinkInput.now,
        };
        return (await input.repository.save({
          schemaVersion: 1,
          note,
          operations: [...stored.operations, receipt({ idempotencyKey: unlinkInput.idempotencyKey, kind: "unlink_contact", fingerprint: operationFingerprint, resultVersion: note.version })],
        })).note;
      });
    },
  };
}
