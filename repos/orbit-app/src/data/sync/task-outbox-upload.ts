import type { OrbitApiClient } from "../../api/client";
import { ORBIT_API_ENDPOINTS, taskPath } from "../../api/endpoints";
import type { SyncRecord } from "../../api/contract/sync";
import { offlineReadEnvelopeSchema } from "../../api/schema/universal-read";
import { parseOfflineTaskRequest } from "./task-outbox-mutation";
import type { OfflineTaskMutationInput } from "./sync-coordinator";
import { createOutboxUploader, type OutboxUploadRepository } from "./outbox-uploader";
import { createLocalSyncRepository } from "./local-sync-repository";
import type { SyncClient } from "./sync-client";

type LocalSyncRepository = ReturnType<typeof createLocalSyncRepository>;
const TASK_DOMAIN = "tasks";
const MAX_CANONICAL_PAGES = 100;

/** Uploads only frozen personal-task requests and acknowledges the leased canonical task row. */
export function createTaskOutboxUploader(input: {
  actorId: string;
  baseUrl: string;
  repository: LocalSyncRepository;
  syncClient: SyncClient;
  writeClient: Pick<OrbitApiClient, "post" | "patch" | "delete">;
  workspaceId: string;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const repository: OutboxUploadRepository = {
    listQueuedMutations: query => input.repository.listQueuedMutations({ ...query, domainId: TASK_DOMAIN }),
    beginOutboxMutationAttempt: value => input.repository.beginOutboxMutationAttempt(value),
    acknowledgeOutboxMutation: value => input.repository.acknowledgeOutboxMutation(value),
    markOutboxMutationFailure: value => input.repository.markOutboxMutationFailure(value),
  };
  return createOutboxUploader({
    repository,
    workspaceId: input.workspaceId,
    confirmOnline: async () => true,
    now,
    uploadOne: async (mutation, signal) => {
      if (mutation.domainId !== TASK_DOMAIN || mutation.kind !== "task" || !mutation.requestJson) return { status: 400 };
      let parsed: ReturnType<typeof parseOfflineTaskRequest>;
      try { parsed = parseOfflineTaskRequest(mutation as OfflineTaskMutationInput); } catch { return { status: 400 }; }
      const request = parsed.mutation;
      const requestBody = parsed.requestBody;
      if (request.kind !== "task" || request.mutationId !== mutation.mutationId || request.entityId !== mutation.id || request.operation !== mutation.operation) return { status: 400 };
      let targetId = mutation.id;
      if (targetId.startsWith("local:")) {
        const alias = await input.repository.resolveAlias({ workspaceId: input.workspaceId, domainId: TASK_DOMAIN, localId: targetId, now: new Date(now()).toISOString() });
        if (alias) targetId = alias;
      }
      if (request.operation === "create") {
        const response = await input.writeClient.post<unknown>(ORBIT_API_ENDPOINTS.tasks, { body: requestBody, signal });
        if (response.status >= 200 && response.status < 300) {
          const task = canonicalTask(response.success ? response.data : null);
          if (!task) return { status: 0 };
          targetId = task.id;
          const record = await readCanonicalTask(input, targetId, signal, now, task);
          return record ? { status: response.status, record } : { status: 0 };
        }
        if (response.status === 409 || response.status === 404) return { status: response.status, snapshot: await readCanonicalTaskPayload(input, targetId, signal, now) };
        return { status: response.status };
      }
      const response = request.operation === "delete"
        ? await input.writeClient.delete<unknown>(taskPath(targetId), { body: requestBody, signal })
        : await input.writeClient.patch<unknown>(taskPath(targetId), { body: requestBody, signal });
      if (response.status >= 200 && response.status < 300) {
        const task = canonicalTask(response.success ? response.data : null);
        if (!task || task.id !== targetId) return { status: 0 };
        const record = await readCanonicalTask(input, targetId, signal, now, task, request.operation === "delete");
        return record ? { status: response.status, record } : { status: 0 };
      }
      if (response.status === 409 || response.status === 404) return { status: response.status, snapshot: await readCanonicalTaskPayload(input, targetId, signal, now) };
      return { status: response.status, ...(!response.success && response.error.context ? { snapshot: response.error.context } : {}) };
    },
    pull: async () => {}, // Coordinator advances all accepted domains after this upload round.
  });
}

type CanonicalTask = Record<string, unknown> & { id: string };

function canonicalTask(value: unknown): CanonicalTask | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const task = (value as Record<string, unknown>).task;
  if (typeof task !== "object" || task === null || Array.isArray(task)) return null;
  const record = task as Record<string, unknown>;
  return typeof record.id === "string" && record.id.trim() && !record.id.startsWith("local:") ? record as CanonicalTask : null;
}

async function readCanonicalTaskPayload(input: { actorId: string; baseUrl: string; repository: LocalSyncRepository; syncClient: SyncClient; workspaceId: string }, taskId: string, signal: AbortSignal, now: () => number) {
  const record = await readCanonicalTask(input, taskId, signal, now);
  return record?.deletedAt ? null : record?.payload ?? null;
}

async function readCanonicalTask(
  input: { actorId: string; baseUrl: string; repository: LocalSyncRepository; syncClient: SyncClient; workspaceId: string },
  taskId: string,
  signal: AbortSignal,
  now: () => number,
  receiptTask?: Record<string, unknown>,
  deleted = false,
): Promise<SyncRecord | null> {
  const lease = offlineReadEnvelopeSchema.safeParse(await input.repository.getLease());
  if (!lease.success) return null;
  const grant = lease.data.grants.find(item => item.workspaceId === input.workspaceId && item.domainId === TASK_DOMAIN);
  if (!grant || lease.data.actorId !== input.actorId || lease.data.baseUrl !== input.baseUrl) return null;
  const scope = { actorId: input.actorId, baseUrl: input.baseUrl, workspaceId: input.workspaceId, domainId: TASK_DOMAIN, authorizationEpoch: grant.authorizationEpoch };
  const prior = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "task", id: taskId });
  const priorMatches = Boolean(prior?.syncState === "synced" && prior.payload && (!receiptTask || sameTaskReceipt(prior.payload, receiptTask)) &&
    (deleted ? prior.deletedAt !== null : prior.deletedAt === null));
  let cursor = (await input.repository.getScopeCursor(scope))?.cursor;
  for (let pageNo = 0; pageNo < MAX_CANONICAL_PAGES; pageNo += 1) {
    const page = await input.syncClient.getDomainPage({ domainId: TASK_DOMAIN, ...(cursor ? { cursor } : {}), limit: 100, signal });
    if (page.authorizationEpoch !== grant.authorizationEpoch) return null;
    await input.repository.applyDomainPage(scope, page);
    const change = page.changes.find(item => item.id === taskId);
    if (change?.operation === "upsert" && change.payload && !deleted) {
      if (receiptTask && !sameTaskReceipt(change.payload, receiptTask)) return null;
      return await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "task", id: taskId });
    }
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  if (deleted) {
    // The 2xx DELETE receipt is authoritative. Applying a delete change hard-removes the synced mirror row, so the
    // acknowledgement carries an explicit tombstone instead of waiting for a row that no longer exists.
    const latest = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "task", id: taskId });
    if (latest?.deletedAt) return latest;
    const base = latest ?? prior;
    const at = new Date(now()).toISOString();
    return { actorId: input.actorId, workspaceId: input.workspaceId, kind: "task", id: taskId, revision: base?.revision ?? "deleted",
      updatedAt: at, deletedAt: at, payload: null, syncState: "synced", aiVisibility: base?.aiVisibility ?? "excluded" };
  }
  if (priorMatches) return prior;
  const latest = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "task", id: taskId });
  return latest?.syncState === "synced" && (deleted ? latest.deletedAt !== null : latest.deletedAt === null) &&
    (!receiptTask || latest.payload && sameTaskReceipt(latest.payload, receiptTask)) ? latest : null;
}

function sameTaskReceipt(mirrored: unknown, receipt: Record<string, unknown>): boolean {
  if (typeof mirrored !== "object" || mirrored === null || Array.isArray(mirrored)) return false;
  const server = mirrored as Record<string, unknown>;
  return ["id", "accountId", "ownerUserId", "title", "status", "category", "updatedAt"]
    .every(key => JSON.stringify(server[key]) === JSON.stringify(receipt[key]));
}
