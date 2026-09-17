import { createHash } from "node:crypto";
import type { PortraitSaveResult, SavedPortrait } from "../../../../shared/contract/event-registration-portrait";
import { portraitGenerationSchema, portraitSaveInputSchema, portraitSaveResultSchema, savedPortraitSchema } from "../../../../shared/api-schema/event-registration-portrait";
import type { LiveRecord } from "../../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { canAccessEventCapability } from "../../event-access/capability-policy";
import { PortraitError, type PortraitRepository, type PortraitSnapshot, type PortraitSnapshotReader } from "./contract";
import { portraitFormalSourceVersion } from "./answer-proofs";

export const PORTRAIT_COLLECTIONS = { portraits: "event_registration_portraits", mutations: "event_registration_portrait_mutations" } as const;

function portraitRecordId(workspaceId: string, eventId: string, actorId: string, mutationId?: string): string {
  return createHash("sha256").update(JSON.stringify(["registration-portrait", workspaceId, eventId, actorId, mutationId ?? null])).digest("hex");
}

function requirePortraitReadAccess(snapshot: PortraitSnapshot, actorId: string, subjectId: string): void {
  if (!snapshot.eventExists) throw new PortraitError(404, "PORTRAIT_EVENT_NOT_FOUND", "A current event is required.");
  if (actorId !== subjectId && !canAccessEventCapability({ ...snapshot.access, capability: "operations.read_sensitive" })) throw new PortraitError(403, "PORTRAIT_FORBIDDEN", "Current sensitive event access is required.");
}

function decodeStoredPortrait(record: LiveRecord | null, id: string, eventId: string, actorId: string): SavedPortrait | null {
  if (!record) return null;
  const parsed = savedPortraitSchema.safeParse(record.payload.portrait);
  if (record.lifecycleState !== "active" || record.userId !== actorId || !parsed.success || parsed.data.id !== id || parsed.data.eventId !== eventId || parsed.data.actorId !== actorId) throw new PortraitError(503, "PORTRAIT_STORAGE_INVALID", "The portrait storage record is invalid.");
  return parsed.data as SavedPortrait;
}

export function createTransactionalPortraitRepository({ client, workspaceId, readSnapshot }: { client: TransactionalPostgresClient; workspaceId: string; readSnapshot: PortraitSnapshotReader }): PortraitRepository {
  return {
    async readSources({ actorId, eventId }) {
      try {
        return await client.transaction(async (transaction) => {
          const snapshot = await readSnapshot(transaction, { workspaceId, eventId, actorId, subjectId: actorId });
          requirePortraitReadAccess(snapshot, actorId, actorId);
          const id = portraitRecordId(workspaceId, eventId, actorId);
          const record = await createPostgresLiveRecordStore({ client: transaction }).getRecord({ workspaceId, collectionName: PORTRAIT_COLLECTIONS.portraits, recordId: id, includeDeleted: true });
          return { snapshot, portrait: decodeStoredPortrait(record, id, eventId, actorId) };
        });
      } catch (error) {
        if (error instanceof PortraitError) throw error;
        throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Portrait sources are unavailable.");
      }
    },
    async read({ actorId, eventId, subjectId = actorId }) {
      try {
        return await client.transaction(async (transaction) => {
          const snapshot = await readSnapshot(transaction, { workspaceId, eventId, actorId, subjectId });
          requirePortraitReadAccess(snapshot, actorId, subjectId);
          const id = portraitRecordId(workspaceId, eventId, subjectId);
          const record = await createPostgresLiveRecordStore({ client: transaction }).getRecord({ workspaceId, collectionName: PORTRAIT_COLLECTIONS.portraits, recordId: id, includeDeleted: true });
          return decodeStoredPortrait(record, id, eventId, subjectId);
        });
      } catch (error) {
        if (error instanceof PortraitError) throw error;
        throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Portrait storage is unavailable.");
      }
    },
    async save(input) {
      const parsedMutation = portraitSaveInputSchema.safeParse(input.mutation);
      const parsedGeneration = portraitGenerationSchema.safeParse(input.generation);
      if (!parsedMutation.success || !parsedGeneration.success || !Number.isFinite(Date.parse(input.updatedAt))) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "The portrait save input is invalid.");
      const { actorId, eventId } = input;
      const mutation = parsedMutation.data;
      const generation = parsedGeneration.data;
      const id = portraitRecordId(workspaceId, eventId, actorId);
      const receiptId = portraitRecordId(workspaceId, eventId, actorId, mutation.mutationId);
      const fingerprint = createHash("sha256").update(JSON.stringify([mutation.mutationId, mutation.expectedPortraitVersion, mutation.generationToken])).digest("hex");
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await client.transaction(async (transaction) => {
            await transaction.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["registration-portrait", workspaceId, eventId, actorId])]);
            const snapshot = await readSnapshot(transaction, { workspaceId, eventId, actorId, subjectId: actorId });
            requirePortraitReadAccess(snapshot, actorId, actorId);
            const store = createPostgresLiveRecordStore({ client: transaction });
            const existing = await store.getRecord({ workspaceId, collectionName: PORTRAIT_COLLECTIONS.mutations, recordId: receiptId, includeDeleted: true });
            if (existing) {
              if (existing.lifecycleState !== "active" || existing.userId !== actorId || existing.payload.fingerprint !== fingerprint) throw new PortraitError(409, "PORTRAIT_MUTATION_REUSED", "The mutation ID has already been used for another request.");
              const replay = portraitSaveResultSchema.safeParse(existing.payload.result);
              if (!replay.success || replay.data.portrait.id !== id || replay.data.portrait.actorId !== actorId || replay.data.portrait.eventId !== eventId || replay.data.receipt.mutationId !== mutation.mutationId) throw new PortraitError(503, "PORTRAIT_STORAGE_INVALID", "The stored portrait receipt is invalid.");
              return replay.data as PortraitSaveResult;
            }
            const currentRecord = await store.getRecord({ workspaceId, collectionName: PORTRAIT_COLLECTIONS.portraits, recordId: id, includeDeleted: true });
            const current = decodeStoredPortrait(currentRecord, id, eventId, actorId);
            if ((current?.version ?? null) !== mutation.expectedPortraitVersion) throw new PortraitError(409, "PORTRAIT_VERSION_CONFLICT", "The portrait version changed. Read the current portrait before saving.");
            if ((generation.sourceRegistrationFingerprint ?? null) !== (snapshot.sourceRegistrationFingerprint ?? null) || generation.sourceEventVersion !== `event-core-postgres:${eventId}:v${snapshot.eventVersion}` || generation.sourceQuestionSetHash !== (snapshot.questionSetHash ?? null) || generation.sourceQuestionSetVersion !== (snapshot.questionSetVersion ?? null) || snapshot.sourceRegistrationVersion !== generation.sourceRegistrationVersion || generation.sourceAnswers.some((answer) =>
              (answer.source === "registration" && (!snapshot.sourceRegistrationFingerprint || answer.sourceVersion !== snapshot.sourceRegistrationFingerprint)) ||
              (answer.source === "portrait" && answer.sourceVersion !== String(current?.version)) ||
              (answer.source === "registration_question" && answer.sourceVersion !== portraitFormalSourceVersion(snapshot))
            )) throw new PortraitError(409, "PORTRAIT_SOURCE_CHANGED", "The source answers changed. Generate a new preview.");
            const updatedAt = new Date(Math.max(Date.parse(input.updatedAt), current ? Date.parse(current.updatedAt) + 1 : 0)).toISOString();
            const portrait: SavedPortrait = { ...generation, id, actorId, eventId, version: (current?.version ?? 0) + 1, updatedAt } as SavedPortrait;
            const result: PortraitSaveResult = { portrait, receipt: { mutationId: mutation.mutationId, portraitId: id, actorId, eventId, portraitVersion: portrait.version, answersVersion: portrait.answersVersion, updatedAt } };
            const common = { workspaceId, userId: actorId, evidenceIds: [], sourceType: "manual", targetType: "event", targetId: eventId, lifecycleState: "active" as const, searchText: "", updatedAt };
            await store.upsertRecord({ ...common, collectionName: PORTRAIT_COLLECTIONS.portraits, recordId: id, sourceId: `registration-portrait:${id}`, createdAt: currentRecord?.createdAt ?? updatedAt, payload: { portrait } });
            await store.upsertRecord({ ...common, collectionName: PORTRAIT_COLLECTIONS.mutations, recordId: receiptId, sourceId: `registration-portrait-mutation:${receiptId}`, createdAt: updatedAt, payload: { fingerprint, result, receipt: result.receipt } });
            return result;
          });
        } catch (error) {
          if (error instanceof PortraitError) throw error;
          const code = error && typeof error === "object" && "code" in error ? error.code : null;
          if ((code === "40001" || code === "40P01") && attempt < 2) continue;
          throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Portrait storage is unavailable.");
        }
      }
      throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Portrait storage is unavailable.");
    },
  };
}
