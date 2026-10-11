/**
 * R16 每天一问的装配（DESIGN add-and-invite §2.8、§3.3）。Owner: 甲 (R16). Used by: `handlers.ts`（live）。
 *
 * - live：与联系人同一个 PostgreSQL（`createConfiguredTransactionalPostgresRuntime`）；写操作是一个 read committed 事务，
 *   先拿「这个人 · 每天一问」的 advisory 锁（生成、回答、跳过对同一个人串行），联系人字段写入与问题记录同事务提交。
 *   库未配置 → null（接口 503）。不建表：问题在 `orbit_records`。
 * - 本人入力（D-10 的 ●●●）：R15 的 `inviteLinkedContactIds`（招待连接表；读不到时按没有算）。
 * - mock / hybrid 不走这里：R08 演示世界（`features/redesign-contracts/handlers.ts`）。
 * - 读联系人按需查询（复核 M4）：live 用 `createPostgresCompletionContactSource`（同一个连接 / 事务），内存用
 *   `createStoreCompletionContactSource`。
 * - 测试：内存存储（同一个人的写操作串行）。
 */
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import { createPostgresCompletionContactSource, createStoreCompletionContactSource } from "./repository";
import { createContactCompletionService, type ContactCompletionService, type ContactCompletionServiceOptions, type ContactCompletionStorage } from "./service";

export function createPostgresContactCompletionStorage(input: { client: TransactionalPostgresClient; workspaceId: string }): ContactCompletionStorage {
  const { client, workspaceId } = input;
  return {
    read: (fn) => fn(createPostgresLiveRecordStore<Record<string, unknown>>({ client }), createPostgresCompletionContactSource(client, workspaceId)),
    workspaceId,
    write: (actorId, fn) =>
      client.transaction(async (tx) => {
        await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["contact-completion", workspaceId, actorId])]);
        return fn(createPostgresLiveRecordStore<Record<string, unknown>>({ client: tx }), createPostgresCompletionContactSource(tx, workspaceId));
      }, { isolation: "read committed" }),
  };
}

/** 内存存储：同一个人的写操作串行（测试用）。 */
export function createMemoryContactCompletionStorage(input: { workspaceId?: string; store?: LiveRecordStoreLike<Record<string, unknown>> } = {}): ContactCompletionStorage & {
  store: LiveRecordStoreLike<Record<string, unknown>>;
} {
  const store = input.store ?? createMemoryLiveRecordStore<Record<string, unknown>>();
  const queues = new Map<string, Promise<unknown>>();
  const workspaceId = input.workspaceId ?? "workspace:contact-completion-memory";
  const source = createStoreCompletionContactSource(store, workspaceId);
  return {
    read: (fn) => fn(store, source),
    store,
    workspaceId,
    write: (actorId, fn) => {
      const previous = queues.get(actorId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => fn(store, source));
      queues.set(actorId, next.catch(() => undefined));
      return next;
    },
  };
}

async function liveSelfReportedContactIds(actorId: string): Promise<readonly string[]> {
  const { inviteLinkedContactIds } = await import("../../invite-codes/configured");
  return inviteLinkedContactIds(actorId);
}

/** live 装配；库未配置返回 null。 */
export function createConfiguredContactCompletionService(options: Omit<ContactCompletionServiceOptions, "storage"> = {}): ContactCompletionService | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  return createContactCompletionService({
    selfReportedContactIds: liveSelfReportedContactIds,
    ...options,
    storage: createPostgresContactCompletionStorage(runtime),
  });
}
