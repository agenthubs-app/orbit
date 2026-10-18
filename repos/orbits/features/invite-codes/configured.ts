/**
 * R15 招待コード的装配（DESIGN add-and-invite §3.2、§6）。Owner: 甲 (R15).
 * Used by: `handlers.ts`（live 路由）、维护任务（`configured-tasks.ts`）、R11（`inviteLinkedContactIds`）。
 *
 * - live：与联系人同一个 PostgreSQL（`createConfiguredTransactionalPostgresRuntime`）；迁移「invite-codes-core」在
 *   首次使用时以 advisory lock 幂等执行（同 ingest-v2；也可用 `scripts/migrate-web-runtime.ts` 预跑），失败后下次再试。
 *   写操作是一个 read committed 事务：仓储、联系人存储、资料读取、计划候补入队都用同一个事务连接。
 * - 邀请人的站内通知：用现有收件箱写入入口 `createConfiguredInboxRuntime().service.upsert`（`sourceKind = 'contact'`、
 *   `kind = 'update'`、`target.kind = 'source'`，href 指向联系人详情）。推送不在这里发：收件箱记录由现有的投递管线
 *   （typed delivery）按每日频控转成推送。
 * - mock / 测试：进程内存储（写操作串行；失败时码与连接表回滚到写之前）。
 */
import { resolveModuleMode } from "../../shared/services/module-mode";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
  type TransactionalSqlExecutor,
} from "../../shared/storage/transactional-postgres";
import { cancelPendingPlanMatchForContact, enqueuePlanMatchJob } from "../plans/matching-repository";
import { inviteConnectedNotification, inviteRedeemerNotification } from "./notification";
import { runInviteCodeMigrations } from "./migrations";
import { createMemoryInviteProfileReader, createPostgresInviteProfileReader } from "./profile-reader";
import { createPostgresInviteAttemptStore, resolveInviteRateSecret, createInviteRateLimiter, type InviteAttemptStore, type InviteRateLimiter } from "./rate-limit";
import {
  createMemoryInviteCodeRepository,
  createMemoryInviteCodeTables,
  createPostgresInviteCodeRepository,
  type MemoryInviteCodeTables,
} from "./repository";
import {
  createInviteCodeService,
  DEFAULT_INVITE_LINK_ORIGIN,
  type InviteCodeNotifier,
  type InviteCodeService,
  type InviteCodeStorage,
  type InviteCodeUnit,
  type InvitePlanMatchPort,
} from "./service";
import type { InviteProfile } from "./contract";

/** 计划候补任务的来源 id（与名片 / 手入力的「当天」任务并在一起）。 */
export function invitePlanMatchSource(contactId: string): string {
  return `invite-code:${contactId}`;
}

function planMatchPort(tx: TransactionalSqlExecutor, workspaceId: string): InvitePlanMatchPort {
  const client = { query: (sql: string, values?: readonly unknown[]) => tx.query(sql, values) as Promise<{ rows: Array<Record<string, unknown>> }> };
  return {
    async cancel({ actorId, contactId }) {
      await cancelPendingPlanMatchForContact(client, { actorId, batchId: invitePlanMatchSource(contactId), contactId, workspaceId });
    },
    async enqueue({ actorId, contactId }) {
      await enqueuePlanMatchJob(client, { actorId, batchId: invitePlanMatchSource(contactId), contactIds: [contactId], singleCard: true, workspaceId });
    },
  };
}

function postgresUnit(tx: TransactionalSqlExecutor, workspaceId: string): InviteCodeUnit {
  return {
    contacts: createPostgresLiveRecordStore<Record<string, unknown>>({ client: tx }),
    planMatch: planMatchPort(tx, workspaceId),
    profiles: createPostgresInviteProfileReader(tx, workspaceId),
    repo: createPostgresInviteCodeRepository(tx, workspaceId),
  };
}

/** live 存储：每次读 / 写都先等迁移完成。 */
export function createPostgresInviteCodeStorage(input: { client: TransactionalPostgresClient; workspaceId: string; ready?: () => Promise<void> }): InviteCodeStorage {
  const ready = input.ready ?? (async () => undefined);
  return {
    async read(fn) {
      await ready();
      return fn(postgresUnit(input.client, input.workspaceId));
    },
    async write(fn) {
      await ready();
      return input.client.transaction((tx) => fn(postgresUnit(tx, input.workspaceId)), { isolation: "read committed" });
    },
    workspaceId: input.workspaceId,
  };
}

/** 内存存储：写操作全局串行；写失败时码与连接表回滚（联系人存储不回滚——服务把所有校验放在第一笔写之前）。 */
export function createMemoryInviteCodeStorage(input: {
  workspaceId?: string;
  contacts?: LiveRecordStoreLike<Record<string, unknown>>;
  profiles?: Map<string, InviteProfile>;
  tables?: MemoryInviteCodeTables;
  planMatch?: InvitePlanMatchPort | null;
} = {}): InviteCodeStorage & { contacts: LiveRecordStoreLike<Record<string, unknown>>; profiles: Map<string, InviteProfile>; tables: MemoryInviteCodeTables } {
  const contacts = input.contacts ?? createMemoryLiveRecordStore<Record<string, unknown>>();
  const profiles = input.profiles ?? new Map<string, InviteProfile>();
  const tables = input.tables ?? createMemoryInviteCodeTables();
  const unit = (): InviteCodeUnit => ({ contacts, planMatch: input.planMatch ?? null, profiles: createMemoryInviteProfileReader(profiles), repo: createMemoryInviteCodeRepository(tables) });
  let queue: Promise<unknown> = Promise.resolve();
  return {
    contacts,
    profiles,
    read: (fn) => fn(unit()),
    tables,
    workspaceId: input.workspaceId ?? "workspace:invite-codes-mock",
    write(fn) {
      const run = queue.catch(() => undefined).then(async () => {
        const snapshot = structuredClone(tables);
        try {
          return await fn(unit());
        } catch (error) {
          tables.codes.splice(0, tables.codes.length, ...snapshot.codes);
          tables.connections.splice(0, tables.connections.length, ...snapshot.connections);
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

/** 收件箱写入：连接双方各有一条本人联系人通知。 */
export function createInboxInviteNotifier(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  upsert(notification: ReturnType<typeof inviteConnectedNotification>): Promise<unknown>;
}): InviteCodeNotifier {
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: input.client });
  return {
    async connected(notice) {
      const rows=await input.client.query<{inviter_actor_id:string;inviter_contact_id:string;redeemer_actor_id:string;redeemer_contact_id:string}>(`select inviter_actor_id,inviter_contact_id,redeemer_actor_id,redeemer_contact_id from invite_connections where workspace_id=$1 and id=$2 and unlinked_at is null`,[input.workspaceId,notice.connectionId]);
      const link=rows.rows[0];if(!link||link.inviter_actor_id!==notice.inviterActorId||link.inviter_contact_id!==notice.inviterContactId)throw Error('INVITE_NOTICE_CONNECTION_UNAVAILABLE');
      const [inviterContact,redeemerContact]=await Promise.all([
        store.getRecord({collectionName:'contacts',recordId:link.inviter_contact_id,workspaceId:input.workspaceId}),
        store.getRecord({collectionName:'contacts',recordId:link.redeemer_contact_id,workspaceId:input.workspaceId}),
      ]);
      if(!inviterContact||inviterContact.lifecycleState!=='active'||inviterContact.userId!==link.inviter_actor_id||!redeemerContact||redeemerContact.lifecycleState!=='active'||redeemerContact.userId!==link.redeemer_actor_id)throw Error('INVITE_NOTICE_CONTACT_UNAVAILABLE');
      const inviterName=String(redeemerContact.payload.displayName??'').trim();if(!inviterName)throw Error('INVITE_NOTICE_NAME_UNAVAILABLE');
      // Each source revision belongs to the recipient's own contact.
      await input.upsert(inviteConnectedNotification({...notice,contactRevision:String(inviterContact.payload.version??inviterContact.payload.updatedAt??inviterContact.updatedAt)}));
      await input.upsert(inviteRedeemerNotification({at:notice.at,connectionId:notice.connectionId,redeemerActorId:link.redeemer_actor_id,redeemerContactId:link.redeemer_contact_id,inviterDisplayName:inviterName,contactRevision:String(redeemerContact.payload.version??redeemerContact.payload.updatedAt??redeemerContact.updatedAt)}));
    },
  };
}

/** 链接站点：`ORBIT_PUBLIC_ORIGIN`（只认干净的 https 源，本机可 http），否则默认域名。 */
export function inviteLinkOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.ORBIT_PUBLIC_ORIGIN?.trim();
  if (!raw) return DEFAULT_INVITE_LINK_ORIGIN;
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol === "https:" || (local && url.protocol === "http:")) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch {
    // 配置不对就用默认域名。
  }
  return DEFAULT_INVITE_LINK_ORIGIN;
}

interface ConfiguredInviteRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
  storage: InviteCodeStorage;
  service: InviteCodeService;
  attempts: InviteAttemptStore;
}

const holder = globalThis as typeof globalThis & { __orbitInviteCodes?: { runtime: ConfiguredInviteRuntime; migrated: Promise<void> | null } };

/** live 装配（非 live 模式或库未配置 → null，接口 503）。迁移在第一次读写前跑一次；失败了下次再试。 */
export function getConfiguredInviteCodeRuntime(): ConfiguredInviteRuntime | null {
  // mock / hybrid 用演示世界，不碰库（维护任务在非 live 环境下也就 skipped）。
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const cached = holder.__orbitInviteCodes;
  if (cached && cached.runtime.client === runtime.client && cached.runtime.workspaceId === runtime.workspaceId) return cached.runtime;
  const entry = { migrated: null as Promise<void> | null, runtime: null as unknown as ConfiguredInviteRuntime };
  const ready = () => {
    entry.migrated ??= runInviteCodeMigrations(runtime.client).catch((error) => {
      entry.migrated = null;
      throw error;
    });
    return entry.migrated;
  };
  const storage = createPostgresInviteCodeStorage({ client: runtime.client, ready, workspaceId: runtime.workspaceId });
  const notifier: InviteCodeNotifier = {
    async connected(notice) {
      const { createConfiguredInboxRuntime } = await import("../notifications/inbox-record-service-factory");
      const inbox = createConfiguredInboxRuntime();
      if (!inbox || inbox.workspaceId !== runtime.workspaceId) throw new Error("Invite inbox storage unavailable.");
      await createInboxInviteNotifier({ client: runtime.client, upsert: (notification) => inbox.service.upsert(notification), workspaceId: runtime.workspaceId }).connected(notice);
    },
  };
  entry.runtime = {
    attempts: (() => {
      const store = createPostgresInviteAttemptStore(runtime.client);
      return {
        increment: async (bucket, start) => (await ready(), store.increment(bucket, start)),
        purgeBefore: async (cutoff) => (await ready(), store.purgeBefore(cutoff)),
        read: async (bucket, start) => (await ready(), store.read(bucket, start)),
      };
    })(),
    client: runtime.client,
    service: createInviteCodeService({ linkOrigin: inviteLinkOrigin(), notifier, storage }),
    storage,
    workspaceId: runtime.workspaceId,
  };
  holder.__orbitInviteCodes = entry;
  return entry.runtime;
}

/** live 限流器：密钥缺失 → null（接口 503，不退化为不限流）；库未配置 → null。 */
export function getConfiguredInviteRateLimiter(env: Record<string, string | undefined> = process.env): InviteRateLimiter | null {
  const secret = resolveInviteRateSecret(env);
  const runtime = getConfiguredInviteCodeRuntime();
  if (!secret || !runtime) return null;
  return createInviteRateLimiter({ secret, store: runtime.attempts });
}

/**
 * R11：我人脈里属于生效招待连接的联系人 id（这些联系人显示 `sourceChip = 'self'`，`sourceType` 仍是 `referral`）。
 * 库未配置时空列表。
 */
export async function inviteLinkedContactIds(actorId: string): Promise<string[]> {
  const runtime = getConfiguredInviteCodeRuntime();
  if (!runtime) return [];
  return runtime.service.linkedContactIds(actorId);
}

/** 测试用：内存实现（不连库）。 */
export function createMemoryInviteCodeRuntime(options: Parameters<typeof createMemoryInviteCodeStorage>[0] = {}) {
  const storage = createMemoryInviteCodeStorage(options);
  return { service: createInviteCodeService({ storage }), storage };
}
