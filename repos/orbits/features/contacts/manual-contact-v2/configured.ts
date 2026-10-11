/**
 * R12 手入力の装配。Owner: 甲 (R12). Used by: `app/api/contacts/manual/handler.ts`。
 *
 * - live：与联系人同一个 PostgreSQL（`createConfiguredTransactionalPostgresRuntime`）；写操作在一个 read committed 事务里，
 *   先拿「这个人 · 手入力」的 advisory 锁，联系人、统合、回执、计划候补的入队 / 撤销同事务提交。库未配置 → null（接口 503）。
 * - mock：进程内存储（不连库、不入队计划候补），返回符合契约的结果。
 */
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
  type TransactionalSqlExecutor,
} from "../../../shared/storage/transactional-postgres";
import { cancelPendingPlanMatchForContact, enqueuePlanMatchJob } from "../../plans/matching-repository";
import {
  createManualContactV2Service,
  type ManualContactPlanMatchPort,
  type ManualContactV2Service,
  type ManualContactV2Storage,
} from "./service";

/** 计划候补任务的来源 id（单张补录与同一天的其他补录并进同一条「当天」任务）。 */
export function manualContactPlanMatchSource(contactId: string): string {
  return `manual-contact:${contactId}`;
}

/** 在调用方的事务里入队 / 撤销计划候补。 */
export function createTransactionalPlanMatchPort(tx: TransactionalSqlExecutor, workspaceId: string): ManualContactPlanMatchPort {
  const client = { query: (sql: string, values?: readonly unknown[]) => tx.query(sql, values) as Promise<{ rows: Array<Record<string, unknown>> }> };
  return {
    async cancel({ actorId, contactId }) {
      await cancelPendingPlanMatchForContact(client, { actorId, batchId: manualContactPlanMatchSource(contactId), contactId, workspaceId });
    },
    async enqueue({ actorId, contactId }) {
      await enqueuePlanMatchJob(client, { actorId, batchId: manualContactPlanMatchSource(contactId), contactIds: [contactId], singleCard: true, workspaceId });
    },
  };
}

export function createPostgresManualContactV2Storage(input: { client: TransactionalPostgresClient; workspaceId: string }): ManualContactV2Storage {
  const { client, workspaceId } = input;
  return {
    read: (fn) => fn(createPostgresLiveRecordStore<Record<string, unknown>>({ client })),
    workspaceId,
    write: (actorId, fn) =>
      client.transaction(async (tx) => {
        await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["manual-contact-v2", workspaceId, actorId])]);
        return fn({ planMatch: createTransactionalPlanMatchPort(tx, workspaceId), store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: tx }) });
      }, { isolation: "read committed" }),
  };
}

/** 内存存储：同一个人的写操作串行。测试与 mock 模式用。 */
export function createMemoryManualContactV2Storage(input: {
  workspaceId?: string;
  store?: LiveRecordStoreLike<Record<string, unknown>>;
  planMatch?: ManualContactPlanMatchPort | null;
} = {}): ManualContactV2Storage & { store: LiveRecordStoreLike<Record<string, unknown>> } {
  const store = input.store ?? createMemoryLiveRecordStore<Record<string, unknown>>();
  const queues = new Map<string, Promise<unknown>>();
  return {
    read: (fn) => fn(store),
    store,
    workspaceId: input.workspaceId ?? "workspace:manual-contact-mock",
    write: (actorId, fn) => {
      const previous = queues.get(actorId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => fn({ planMatch: input.planMatch ?? null, store }));
      queues.set(actorId, next.catch(() => undefined));
      return next;
    },
  };
}

export function createConfiguredManualContactV2Service(): ManualContactV2Service | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  return createManualContactV2Service({ storage: createPostgresManualContactV2Storage(runtime) });
}

interface MockGlobal {
  __orbitManualContactV2Mock?: ManualContactV2Service;
}

/** mock 模式：进程内一份（开发 / 测试），不连库。 */
export function getMockManualContactV2Service(): ManualContactV2Service {
  const holder = globalThis as typeof globalThis & MockGlobal;
  holder.__orbitManualContactV2Mock ??= createManualContactV2Service({ storage: createMemoryManualContactV2Storage() });
  return holder.__orbitManualContactV2Mock;
}
