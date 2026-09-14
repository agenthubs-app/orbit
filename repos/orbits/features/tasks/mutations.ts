import { createHash } from "node:crypto";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { TaskServiceError, type TaskMutationResult } from "./service";

export interface TaskMutationCommand { actorId: string; idempotencyKey: string; now: string; }
const locks = new WeakMap<object, Map<string, Promise<void>>>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => [k, canonical(v)]));
  return value;
}

export async function runTaskMutation(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  client?: TransactionalPostgresClient;
  action: string;
  command: TaskMutationCommand;
  operation: (store: LiveRecordStoreLike<Record<string, unknown>>) => Promise<TaskMutationResult>;
}): Promise<TaskMutationResult> {
  const { now: _now, ...intent } = input.command;
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical({ action: input.action, ...intent }))).digest("hex");
  const recordId = createHash("sha256").update(JSON.stringify([input.command.actorId, input.command.idempotencyKey])).digest("hex");
  const execute = async (store: LiveRecordStoreLike<Record<string, unknown>>) => {
    const query = { workspaceId: input.workspaceId, collectionName: "task_mutations", recordId };
    const receipt = await store.getRecord({ ...query, includeDeleted: true });
    if (receipt) {
      if (receipt.userId !== input.command.actorId || receipt.payload.fingerprint !== fingerprint) {
        throw new TaskServiceError("TASK_VERSION_CONFLICT", "The idempotency key has different content");
      }
      const result = receipt.payload.result as TaskMutationResult;
      if (!result?.task || result.task.ownerUserId !== input.command.actorId || !result.activity) throw new Error("Invalid task mutation receipt");
      return result;
    }
    const result = await input.operation(store);
    await store.upsertRecord({ ...query, userId: input.command.actorId, sourceType: "manual", sourceId: `task-mutation:${recordId}`,
      evidenceIds: [], createdAt: input.command.now, updatedAt: input.command.now, lifecycleState: "active", searchText: "",
      payload: { fingerprint, result } });
    return result;
  };
  if (input.client) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await input.client.transaction(async tx => {
          await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["task", input.workspaceId, input.command.actorId])]);
          return execute(createPostgresLiveRecordStore({ client: tx }));
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if ((code === "40001" || code === "40P01") && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Task transaction retry limit reached");
  }
  // The in-memory adapter serializes callers sharing its store. Production
  // factories always supply the PostgreSQL client for cross-process atomicity.
  let queue = locks.get(input.store);
  if (!queue) { queue = new Map(); locks.set(input.store, queue); }
  const key = JSON.stringify([input.workspaceId, input.command.actorId]);
  const previous = queue.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  queue.set(key, held);
  await previous;
  try { return await execute(input.store); }
  finally { release(); if (queue.get(key) === held) queue.delete(key); }
}
