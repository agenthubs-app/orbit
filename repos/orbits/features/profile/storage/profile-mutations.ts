import { createHash } from "node:crypto";
import type { ManualProfileUpdateInput, ProfileResult, ProfileSuccess } from "../contract";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";

export class ProfileMutationError extends Error {
  constructor(readonly code: "PROFILE_MUTATION_ID_REUSED" | "PROFILE_SAVE_UNAVAILABLE") {
    super(code);
  }
}

export function validateProfileMutation(input: ManualProfileUpdateInput): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  if (input.expectedUpdatedAt === undefined && input.mutationId === undefined) return true;
  return typeof input.mutationId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.mutationId)
    && (input.expectedUpdatedAt === null || (typeof input.expectedUpdatedAt === "string"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.expectedUpdatedAt)
      && Number.isFinite(Date.parse(input.expectedUpdatedAt))));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

// Profile reads, merge, write and the private receipt all use one connection.
// A process-local request lock cannot protect two API instances.
export async function runProfileMutation({ client, workspaceId, actorId, input, operation }: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  input: ManualProfileUpdateInput;
  operation: (store: LiveRecordStoreLike<Record<string, unknown>>) => Promise<ProfileResult>;
}): Promise<ProfileResult> {
  const mutationId = input.mutationId;
  const fingerprint = mutationId ? createHash("sha256").update(JSON.stringify(canonicalValue(input))).digest("hex") : null;
  const recordId = createHash("sha256").update(JSON.stringify([actorId, mutationId])).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.transaction(async tx => {
        await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["profile", workspaceId, actorId])]);
        const store = createPostgresLiveRecordStore({ client: tx });
        if (mutationId) {
          const receipt = await store.getRecord({ workspaceId, collectionName: "profile_mutations", recordId, includeDeleted: true });
          if (receipt) {
            if (receipt.userId !== actorId || receipt.payload.actorId !== actorId || receipt.lifecycleState !== "active") {
              throw new ProfileMutationError("PROFILE_SAVE_UNAVAILABLE");
            }
            if (receipt.payload.fingerprint !== fingerprint) throw new ProfileMutationError("PROFILE_MUTATION_ID_REUSED");
            const result = receipt.payload.result as ProfileSuccess | undefined;
            if (result?.success !== true || result.data?.mutationId !== mutationId || !result.data.profile) {
              throw new ProfileMutationError("PROFILE_SAVE_UNAVAILABLE");
            }
            return result;
          }
        }
        const result = await operation(store);
        if (mutationId && result.success && result.data.profile) {
          const at = result.data.profile.updatedAt;
          const acknowledged: ProfileSuccess = { ...result, data: { ...result.data, mutationId } };
          await store.upsertRecord({
            workspaceId, collectionName: "profile_mutations", recordId, userId: actorId,
            sourceType: "manual", sourceId: `profile-mutation:${recordId}`, evidenceIds: [],
            createdAt: at, updatedAt: at, lifecycleState: "active", searchText: "",
            payload: { actorId, fingerprint, result: acknowledged },
          });
          return acknowledged;
        }
        return result;
      });
    } catch (error) {
      if (error instanceof ProfileMutationError) throw error;
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      // PostgreSQL has rolled the entire transaction back before this retry.
      if ((code === "40001" || code === "40P01") && attempt < 2) continue;
      throw new ProfileMutationError("PROFILE_SAVE_UNAVAILABLE");
    }
  }
  throw new ProfileMutationError("PROFILE_SAVE_UNAVAILABLE");
}
