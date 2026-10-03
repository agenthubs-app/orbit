import type { OrbitApiClient } from "../../api/client";
import type { SyncRecord } from "../../api/contract/sync";
import { personalSchedulePath } from "../../api/personal-schedule";
import { offlineReadEnvelopeSchema } from "../../api/schema/universal-read";
import { localNoteIdsOfSchedule, parseOfflineScheduleRequest, SCHEDULE_DOMAIN } from "./schedule-outbox-mutation";
import type { OfflineScheduleMutationInput } from "./sync-coordinator";
import { createOutboxUploader, type OutboxUploadRepository } from "./outbox-uploader";
import { createLocalSyncRepository, type LocalSyncQueuedMutation } from "./local-sync-repository";
import type { SyncClient } from "./sync-client";

type LocalSyncRepository = ReturnType<typeof createLocalSyncRepository>;
const NOTES_DOMAIN = "notes";
const MAX_CANONICAL_PAGES = 100;
/** Reminder and repeat fields are accepted only by schedule API version 3 (the online editor sends the same header). */
const SCHEDULE_HEADERS = { "x-orbit-personal-schedule-version": "3" };
export const NOTE_DEPENDENCY_FAILED = "NOTE_DEPENDENCY_FAILED";

/**
 * Sprint 0134: uploads frozen personal-schedule requests. A schedule that links a
 * note created offline waits until that note has its formal id (the note ACK
 * rewrites the unsent schedule request); if the note create failed for good, the
 * schedule is marked failed and kept. Runs after the notes uploader.
 */
export function createScheduleOutboxUploader(input: {
  actorId: string;
  baseUrl: string;
  repository: LocalSyncRepository;
  syncClient: SyncClient;
  writeClient: Pick<OrbitApiClient, "post" | "patch" | "delete">;
  workspaceId: string;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const nowIso = () => new Date(now()).toISOString();
  const resolveNote = (localId: string) => input.repository.resolveAlias({ workspaceId: input.workspaceId, domainId: NOTES_DOMAIN, localId, now: nowIso() });

  async function readyRows(query: { workspaceId: string }): Promise<LocalSyncQueuedMutation[]> {
    const rows = await input.repository.listQueuedMutations({ ...query, domainId: SCHEDULE_DOMAIN });
    if (!rows.some(row => row.state === "queued" && localNoteIdsOfSchedule(row).length)) return rows;
    const noteRows = await input.repository.listQueuedMutations({ ...query, domainId: NOTES_DOMAIN });
    const ready: LocalSyncQueuedMutation[] = [];
    for (const row of rows) {
      const references = row.state === "queued" ? localNoteIdsOfSchedule(row) : [];
      let waiting = false, failed = false;
      for (const localId of references) {
        if (await resolveNote(localId)) continue;
        const create = noteRows.find(note => note.id === localId && note.operation === "create");
        if (!create || create.state === "failed") { failed = true; break; }
        waiting = true;
      }
      if (failed) {
        await input.repository.markOutboxMutationFailure({ mutationId: row.mutationId, state: "failed", nextRetryAt: null, errorCode: NOTE_DEPENDENCY_FAILED });
        continue;
      }
      if (!waiting) ready.push(row);
    }
    return ready;
  }

  const repository: OutboxUploadRepository = {
    listQueuedMutations: readyRows,
    beginOutboxMutationAttempt: value => input.repository.beginOutboxMutationAttempt(value),
    acknowledgeOutboxMutation: value => input.repository.acknowledgeOutboxMutation(value),
    markOutboxMutationFailure: value => input.repository.markOutboxMutationFailure(value),
  };
  return createOutboxUploader({
    repository,
    workspaceId: input.workspaceId,
    confirmOnline: async () => true, // The coordinator invokes this only after a successful online lease.
    now,
    uploadOne: async (mutation, signal) => {
      if (mutation.domainId !== SCHEDULE_DOMAIN || mutation.kind !== "personal_schedule" || !mutation.requestJson) return { status: 400 };
      let requestBody: Record<string, unknown>;
      try { requestBody = parseOfflineScheduleRequest(mutation as OfflineScheduleMutationInput).requestBody; } catch { return { status: 400 }; }
      // The ACK of a linked note rewrites this request before its first attempt; a temporary id is never sent.
      if (localNoteIdsOfSchedule(mutation).length) return { status: 0 };
      let targetId = mutation.id;
      if (targetId.startsWith("local:")) {
        const alias = await input.repository.resolveAlias({ workspaceId: input.workspaceId, domainId: SCHEDULE_DOMAIN, localId: targetId, now: nowIso() });
        if (alias) targetId = alias;
        else if (mutation.operation !== "create") return { status: 0 };
      }
      const options = { body: requestBody, headers: SCHEDULE_HEADERS, signal };
      const response = mutation.operation === "create"
        ? await input.writeClient.post<unknown>(personalSchedulePath(), options)
        : mutation.operation === "delete"
          ? await input.writeClient.delete<unknown>(personalSchedulePath(targetId), options)
          : await input.writeClient.patch<unknown>(personalSchedulePath(targetId), options);
      if (response.status >= 200 && response.status < 300) {
        const item = canonicalScheduleItem(response.success ? response.data : null);
        if (!item || (mutation.operation !== "create" && item.id !== targetId)) return { status: 0 };
        const record = await readCanonicalSchedule(input, item.id, signal, now, mutation.operation === "delete" ? null : item);
        return record ? { status: response.status, record } : { status: 0 };
      }
      if (response.status === 409 || response.status === 404) {
        if (targetId.startsWith("local:")) return { status: response.status };
        const current = await readCanonicalSchedule(input, targetId, signal, now, undefined);
        return { status: response.status, ...(current && !current.deletedAt ? { snapshot: current.payload } : {}) };
      }
      return { status: response.status, ...(!response.success && response.error.context ? { snapshot: response.error.context } : {}) };
    },
    pull: async () => {}, // The coordinator pulls all accepted mirror domains after the upload round.
  });
}

type CanonicalItem = Record<string, unknown> & { id: string };

function canonicalScheduleItem(value: unknown): CanonicalItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = (value as Record<string, unknown>).scheduleItem;
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  return typeof record.id === "string" && record.id.trim() && !record.id.startsWith("local:") && record.kind === "personal" ? record as CanonicalItem : null;
}

/**
 * Reads the uploaded row back from the personal-schedule domain page so the ACK
 * stores the server's canonical mirror row. `receipt === null` marks a delete:
 * the 2xx receipt is authoritative and is acknowledged with an explicit
 * tombstone, because applying a delete change removes the mirrored row. With
 * `receipt === undefined` (a 409/404 snapshot) the latest mirrored row is returned.
 */
async function readCanonicalSchedule(
  input: { actorId: string; baseUrl: string; repository: LocalSyncRepository; syncClient: SyncClient; workspaceId: string },
  id: string,
  signal: AbortSignal,
  now: () => number,
  receipt: Record<string, unknown> | null | undefined,
): Promise<SyncRecord | null> {
  const lease = offlineReadEnvelopeSchema.safeParse(await input.repository.getLease());
  if (!lease.success) return null;
  const grant = lease.data.grants.find(item => item.workspaceId === input.workspaceId && item.domainId === SCHEDULE_DOMAIN);
  if (!grant || lease.data.actorId !== input.actorId || lease.data.baseUrl !== input.baseUrl) return null;
  const scope = { actorId: input.actorId, baseUrl: input.baseUrl, workspaceId: input.workspaceId, domainId: SCHEDULE_DOMAIN, authorizationEpoch: grant.authorizationEpoch };
  const prior = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "personal_schedule", id });
  let cursor = (await input.repository.getScopeCursor(scope))?.cursor;
  for (let pageNo = 0; pageNo < MAX_CANONICAL_PAGES; pageNo += 1) {
    const page = await input.syncClient.getDomainPage({ domainId: SCHEDULE_DOMAIN, ...(cursor ? { cursor } : {}), limit: 100, signal });
    if (page.authorizationEpoch !== grant.authorizationEpoch) return null;
    await input.repository.applyDomainPage(scope, page);
    const change = page.changes.find(item => item.id === id);
    if (receipt && change?.operation === "upsert" && change.payload) {
      if (!sameScheduleReceipt(change.payload, receipt)) return null;
      return await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "personal_schedule", id });
    }
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  const latest = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "personal_schedule", id });
  if (receipt === null) {
    if (latest?.deletedAt) return latest;
    const base = latest ?? prior;
    const at = new Date(now()).toISOString();
    return { actorId: input.actorId, workspaceId: input.workspaceId, kind: "personal_schedule", id, revision: base?.revision ?? "deleted",
      updatedAt: at, deletedAt: at, payload: null, syncState: "synced", aiVisibility: base?.aiVisibility ?? "excluded" };
  }
  if (receipt) {
    // Another round may already have pulled this row and advanced the shared cursor.
    return latest?.syncState === "synced" && latest.deletedAt === null && latest.payload && sameScheduleReceipt(latest.payload, receipt) ? latest : null;
  }
  return latest?.syncState === "synced" ? latest : null;
}

function sameScheduleReceipt(mirrored: unknown, receipt: Record<string, unknown>): boolean {
  if (typeof mirrored !== "object" || mirrored === null || Array.isArray(mirrored)) return false;
  const server = mirrored as Record<string, unknown>;
  return ["id", "accountId", "ownerUserId", "title", "startsAt", "updatedAt"].every(key => JSON.stringify(server[key]) === JSON.stringify(receipt[key]));
}
