import { createHash } from "node:crypto";

import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../shared/api-schema/home-layout";
import type { HomeLayoutContract, HomeLayoutUpdateInput } from "../../shared/contract/home-layout";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const LAYOUTS = "homeLayouts";
const MUTATIONS = "homeLayoutMutations";

export type HomeLayoutPutResult =
  | { kind: "saved"; layout: HomeLayoutContract }
  | { kind: "conflict"; current: HomeLayoutContract }
  | { kind: "mutation_reused" };

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mutationRecordId(actorId: string, mutationId: string): string {
  return digest(["home-layout", actorId, mutationId]);
}

function record(collectionName: string, recordId: string, actorId: string, workspaceId: string,
  payload: Record<string, unknown>, at: string, createdAt = at): LiveRecord<Record<string, unknown>> {
  return {
    collectionName, createdAt, evidenceIds: [], lifecycleState: "active", payload,
    recordId, searchText: "", sourceId: `home-layout:${actorId}`, sourceType: "system",
    updatedAt: at, userId: actorId, workspaceId,
  };
}

async function readLayout(store: LiveRecordStoreLike<Record<string, unknown>>, workspaceId: string, actorId: string): Promise<HomeLayoutContract> {
  const stored = await store.getRecord({ collectionName: LAYOUTS, includeDeleted: true, recordId: actorId, userId: actorId, workspaceId });
  if (!stored) return DEFAULT_HOME_LAYOUT;
  if (stored.lifecycleState !== "active" || stored.userId !== actorId || stored.payload.actorId !== actorId) {
    throw new Error("Home layout storage record is invalid.");
  }
  const parsed = homeLayoutSchema.safeParse(stored.payload.layout);
  if (!parsed.success) throw new Error("Home layout storage record is invalid.");
  return parsed.data;
}

/** A layout is one actor-owned orbit_record; receipts are separate durable records. */
export function createHomeLayoutService({ client, workspaceId }: { client: TransactionalPostgresClient; workspaceId: string }) {
  const readStore = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  return {
    get: (actorId: string) => readLayout(readStore, workspaceId, actorId),
    put: (actorId: string, input: HomeLayoutUpdateInput): Promise<HomeLayoutPutResult> =>
      client.transaction(async (tx) => {
        // All writes for one actor serialize, including the receipt check. Read committed
        // lets a waiter see the committed winner before checking expectedRevision.
        await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["home-layout", workspaceId, actorId])]);
        const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: tx });
        const receiptId = mutationRecordId(actorId, input.mutationId);
        const fingerprint = digest(input);
        const prior = await store.getRecord({ collectionName: MUTATIONS, includeDeleted: true, recordId: receiptId, userId: actorId, workspaceId });
        if (prior) {
          if (prior.lifecycleState !== "active" || prior.userId !== actorId || prior.payload.actorId !== actorId || prior.payload.fingerprint !== fingerprint) {
            return { kind: "mutation_reused" };
          }
          const result = prior.payload.result;
          if (result && typeof result === "object" && "kind" in result) {
            const candidate = result as HomeLayoutPutResult;
            if (candidate.kind === "saved" && homeLayoutSchema.safeParse(candidate.layout).success) return candidate;
            if (candidate.kind === "conflict" && homeLayoutSchema.safeParse(candidate.current).success) return candidate;
          }
          throw new Error("Home layout mutation receipt is invalid.");
        }

        const current = await readLayout(store, workspaceId, actorId);
        const result: HomeLayoutPutResult = input.expectedRevision !== current.revision
          ? { kind: "conflict", current }
          : { kind: "saved", layout: {
            revision: current.revision + 1, app: input.app, web: input.web,
            ...(input.hintDismissedAt ? { hintDismissedAt: input.hintDismissedAt } : {}),
          } };
        const at = new Date().toISOString();
        if (result.kind === "saved") {
          const existing = await store.getRecord({ collectionName: LAYOUTS, includeDeleted: true, recordId: actorId, userId: actorId, workspaceId });
          await store.upsertRecord(record(LAYOUTS, actorId, actorId, workspaceId, { actorId, layout: result.layout }, at, existing?.createdAt ?? at));
        }
        await store.upsertRecord(record(MUTATIONS, receiptId, actorId, workspaceId, { actorId, fingerprint, result }, at));
        return result;
      }, { isolation: "read committed" }),
  };
}
