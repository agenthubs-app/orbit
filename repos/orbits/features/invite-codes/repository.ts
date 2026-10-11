/**
 * R15 招待コード的存储（DESIGN add-and-invite §3.2）。Owner: 甲 (R15). Used by: `service.ts`、`sync.ts`。
 *
 * 一个仓储实例绑定在一个写单元上（live：同一个 PostgreSQL 事务；mock / 测试：进程内存，写操作串行）。
 * 并发正确性靠数据库：用量是条件更新（`used_count < max_uses` 且未作废 / 未替换 / 未过期），
 * 「每人一个可用码」「同一对人一条生效连接」是部分唯一索引；锁只用来让同一个人 / 同一对人的写串行，读到一致的状态。
 */
import type { InviteSharedFieldKey } from "../../shared/contract/invite-codes";
import type { TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import type { InviteCodeRow, InviteConnectionRow, InviteSide, InviteSyncedState } from "./contract";

export interface InviteCodeInsert {
  id: string;
  actorId: string;
  code: string;
  sharedKeys: InviteSharedFieldKey[];
  maxUses: number;
  expiresAt: string;
  createdAt: string;
  idempotencyKey: string;
}

export type InviteConnectionInsert = Omit<InviteConnectionRow, "code" | "unlinkedAt" | "unlinkedBy" | "unlinkIdempotencyKey" | "unlinkKept">;

export interface InviteCodeRepository {
  /** 同一个人的发码 / 作废串行。 */
  lockActor(actorId: string): Promise<void>;
  /** 同一对人的兑换 / 同步 / 解除串行。 */
  lockPair(left: string, right: string): Promise<void>;
  /** 按规范码取（live：`for update`，同一个码的兑换串行）。 */
  findCodeByCode(code: string, options?: { forUpdate?: boolean }): Promise<InviteCodeRow | null>;
  findCodeByIdempotencyKey(actorId: string, key: string): Promise<InviteCodeRow | null>;
  /** 本人未作废、未替换的码（最多一个）。 */
  findUsableCode(actorId: string): Promise<InviteCodeRow | null>;
  /** 给本人所有未作废、未替换的码写 `superseded_at`。 */
  supersedeActorCodes(actorId: string, at: string): Promise<number>;
  /** 插入；码已存在（全局唯一冲突）返回 null。 */
  insertCode(input: InviteCodeInsert): Promise<InviteCodeRow | null>;
  /** 作废本人的码；不是本人的 / 不存在返回 null；已作废的原样返回。 */
  revokeCode(actorId: string, code: string, at: string): Promise<InviteCodeRow | null>;
  listActorCodes(actorId: string, limit: number): Promise<InviteCodeRow[]>;
  /** 占用一个名额：未作废、未替换、未过期、未满才 +1；否则 null。 */
  claimUse(codeId: string, now: string): Promise<InviteCodeRow | null>;

  findConnectionByRedeemKey(redeemerActorId: string, key: string): Promise<InviteConnectionRow | null>;
  findActiveConnectionBetween(left: string, right: string): Promise<InviteConnectionRow | null>;
  /** 我人脈里这条联系人所在的生效连接（我是邀请人或兑换人）。 */
  findActiveConnectionForContact(actorId: string, contactId: string): Promise<InviteConnectionRow | null>;
  findUnlinkedByKey(actorId: string, key: string): Promise<InviteConnectionRow | null>;
  findConnection(id: string): Promise<InviteConnectionRow | null>;
  insertConnection(input: InviteConnectionInsert): Promise<void>;
  listConnectionsForCodes(codeIds: readonly string[]): Promise<InviteConnectionRow[]>;
  updateSharedKeys(connectionId: string, side: InviteSide, keys: InviteSharedFieldKey[]): Promise<void>;
  updateSynced(connectionId: string, side: InviteSide, state: InviteSyncedState): Promise<void>;
  unlink(input: { connectionId: string; actorId: string; at: string; idempotencyKey: string; kept: boolean }): Promise<void>;
  /** 生效连接，按 id 顺序分页（同步任务用）。 */
  listActiveConnections(input: { afterId: string | null; limit: number }): Promise<InviteConnectionRow[]>;
  /** 我人脈里属于生效招待连接的联系人 id（R11「本人入力」）。 */
  listLinkedContactIds(actorId: string): Promise<string[]>;
}

const SHARED_KEYS: readonly InviteSharedFieldKey[] = ["organization", "offering", "seeking", "email", "phone"];

export function readSharedKeys(value: unknown): InviteSharedFieldKey[] {
  if (!Array.isArray(value)) return [];
  return SHARED_KEYS.filter((key) => value.includes(key));
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return new Date(value).toISOString();
  throw new Error("invite codes: timestamp expected");
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

export function readSyncedState(value: unknown): InviteSyncedState {
  const raw = (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown> | null;
  const values: InviteSyncedState["values"] = {};
  const rawValues = raw && typeof raw.values === "object" && raw.values !== null ? (raw.values as Record<string, unknown>) : {};
  for (const field of ["displayName", "organization", "role", "email", "phone", "offering", "seeking"] as const) {
    if (typeof rawValues[field] === "string") values[field] = rawValues[field] as string;
  }
  return {
    at: typeof raw?.at === "string" ? raw.at : new Date(0).toISOString(),
    keys: readSharedKeys(raw?.keys),
    profileUpdatedAt: typeof raw?.profileUpdatedAt === "string" ? raw.profileUpdatedAt : null,
    values,
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function codeFromRow(row: Row): InviteCodeRow {
  return {
    actorId: String(row.actor_id),
    code: String(row.code),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    id: String(row.id),
    idempotencyKey: row.idempotency_key === null || row.idempotency_key === undefined ? null : String(row.idempotency_key),
    maxUses: Number(row.max_uses),
    revokedAt: isoOrNull(row.revoked_at),
    sharedKeys: readSharedKeys(row.shared_keys),
    supersededAt: isoOrNull(row.superseded_at),
    usedCount: Number(row.used_count),
  };
}

function connectionFromRow(row: Row): InviteConnectionRow {
  return {
    code: String(row.code ?? ""),
    codeId: String(row.code_id),
    createdAt: iso(row.created_at),
    id: String(row.id),
    inviterActorId: String(row.inviter_actor_id),
    inviterContactCreated: row.inviter_contact_created === true,
    inviterContactId: String(row.inviter_contact_id),
    inviterSharedKeys: readSharedKeys(row.inviter_shared_keys),
    inviterSynced: readSyncedState(row.inviter_synced),
    outcome: row.outcome === "merged" ? "merged" : "connected",
    redeemerActorId: String(row.redeemer_actor_id),
    redeemerContactCreated: row.redeemer_contact_created === true,
    redeemerContactId: String(row.redeemer_contact_id),
    redeemerIdempotencyKey: String(row.redeemer_idempotency_key),
    redeemerSharedKeys: readSharedKeys(row.redeemer_shared_keys),
    redeemerSynced: readSyncedState(row.redeemer_synced),
    unlinkIdempotencyKey: row.unlink_idempotency_key === null || row.unlink_idempotency_key === undefined ? null : String(row.unlink_idempotency_key),
    unlinkKept: typeof row.unlink_kept === "boolean" ? row.unlink_kept : null,
    unlinkedAt: isoOrNull(row.unlinked_at),
    unlinkedBy: row.unlinked_by === null || row.unlinked_by === undefined ? null : String(row.unlinked_by),
  };
}

const CONNECTION_SELECT = `select c.*, k.code from invite_connections c
  join invite_codes k on k.workspace_id = c.workspace_id and k.id = c.code_id`;

export function createPostgresInviteCodeRepository(tx: TransactionalSqlExecutor, workspaceId: string): InviteCodeRepository {
  const lock = (parts: readonly string[]) =>
    tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["invite-codes", workspaceId, ...parts])]).then(() => undefined);
  const one = async (sql: string, values: readonly unknown[]) => (await tx.query<Row>(sql, values)).rows[0] ?? null;
  const many = async (sql: string, values: readonly unknown[]) => (await tx.query<Row>(sql, values)).rows;

  return {
    lockActor: (actorId) => lock(["actor", actorId]),
    lockPair: (left, right) => lock(["pair", ...[left, right].sort()]),

    async findCodeByCode(code, options) {
      const row = await one(`select * from invite_codes where code = $1 and workspace_id = $2${options?.forUpdate ? " for update" : ""}`, [code, workspaceId]);
      return row ? codeFromRow(row) : null;
    },
    async findCodeByIdempotencyKey(actorId, key) {
      const row = await one("select * from invite_codes where workspace_id = $1 and actor_id = $2 and idempotency_key = $3", [workspaceId, actorId, key]);
      return row ? codeFromRow(row) : null;
    },
    async findUsableCode(actorId) {
      const row = await one(
        "select * from invite_codes where workspace_id = $1 and actor_id = $2 and revoked_at is null and superseded_at is null",
        [workspaceId, actorId],
      );
      return row ? codeFromRow(row) : null;
    },
    async supersedeActorCodes(actorId, at) {
      const rows = await many(
        `update invite_codes set superseded_at = $3::timestamptz
         where workspace_id = $1 and actor_id = $2 and revoked_at is null and superseded_at is null returning id`,
        [workspaceId, actorId, at],
      );
      return rows.length;
    },
    async insertCode(input) {
      const row = await one(
        `insert into invite_codes (workspace_id, id, actor_id, code, shared_keys, max_uses, expires_at, created_at, idempotency_key)
         values ($1, $2, $3, $4, $5::text[], $6, $7::timestamptz, $8::timestamptz, $9)
         on conflict do nothing returning *`,
        [workspaceId, input.id, input.actorId, input.code, input.sharedKeys, input.maxUses, input.expiresAt, input.createdAt, input.idempotencyKey],
      );
      return row ? codeFromRow(row) : null;
    },
    async revokeCode(actorId, code, at) {
      const row = await one(
        `update invite_codes set revoked_at = coalesce(revoked_at, $4::timestamptz)
         where workspace_id = $1 and actor_id = $2 and code = $3 returning *`,
        [workspaceId, actorId, code, at],
      );
      return row ? codeFromRow(row) : null;
    },
    async listActorCodes(actorId, limit) {
      const rows = await many(
        "select * from invite_codes where workspace_id = $1 and actor_id = $2 order by created_at desc, id desc limit $3",
        [workspaceId, actorId, limit],
      );
      return rows.map(codeFromRow);
    },
    async claimUse(codeId, now) {
      const row = await one(
        `update invite_codes set used_count = used_count + 1
         where workspace_id = $1 and id = $2 and used_count < max_uses
           and revoked_at is null and superseded_at is null and expires_at > $3::timestamptz
         returning *`,
        [workspaceId, codeId, now],
      );
      return row ? codeFromRow(row) : null;
    },

    async findConnectionByRedeemKey(redeemerActorId, key) {
      const row = await one(`${CONNECTION_SELECT} where c.workspace_id = $1 and c.redeemer_actor_id = $2 and c.redeemer_idempotency_key = $3`, [workspaceId, redeemerActorId, key]);
      return row ? connectionFromRow(row) : null;
    },
    async findActiveConnectionBetween(left, right) {
      const row = await one(
        `${CONNECTION_SELECT} where c.workspace_id = $1 and c.unlinked_at is null
           and least(c.inviter_actor_id, c.redeemer_actor_id) = least($2::text, $3::text)
           and greatest(c.inviter_actor_id, c.redeemer_actor_id) = greatest($2::text, $3::text)`,
        [workspaceId, left, right],
      );
      return row ? connectionFromRow(row) : null;
    },
    async findActiveConnectionForContact(actorId, contactId) {
      const row = await one(
        `${CONNECTION_SELECT} where c.workspace_id = $1 and c.unlinked_at is null
           and ((c.inviter_actor_id = $2 and c.inviter_contact_id = $3) or (c.redeemer_actor_id = $2 and c.redeemer_contact_id = $3))
         order by c.created_at desc limit 1`,
        [workspaceId, actorId, contactId],
      );
      return row ? connectionFromRow(row) : null;
    },
    async findUnlinkedByKey(actorId, key) {
      const row = await one(`${CONNECTION_SELECT} where c.workspace_id = $1 and c.unlinked_by = $2 and c.unlink_idempotency_key = $3`, [workspaceId, actorId, key]);
      return row ? connectionFromRow(row) : null;
    },
    async findConnection(id) {
      const row = await one(`${CONNECTION_SELECT} where c.workspace_id = $1 and c.id = $2`, [workspaceId, id]);
      return row ? connectionFromRow(row) : null;
    },
    async insertConnection(input) {
      await tx.query(
        `insert into invite_connections (
           workspace_id, id, code_id, inviter_actor_id, redeemer_actor_id, outcome,
           inviter_contact_id, redeemer_contact_id, inviter_contact_created, redeemer_contact_created,
           inviter_shared_keys, redeemer_shared_keys, inviter_synced, redeemer_synced, redeemer_idempotency_key, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12::text[], $13::jsonb, $14::jsonb, $15, $16::timestamptz)`,
        [
          workspaceId, input.id, input.codeId, input.inviterActorId, input.redeemerActorId, input.outcome,
          input.inviterContactId, input.redeemerContactId, input.inviterContactCreated, input.redeemerContactCreated,
          input.inviterSharedKeys, input.redeemerSharedKeys, JSON.stringify(input.inviterSynced), JSON.stringify(input.redeemerSynced),
          input.redeemerIdempotencyKey, input.createdAt,
        ],
      );
    },
    async listConnectionsForCodes(codeIds) {
      if (!codeIds.length) return [];
      const rows = await many(`${CONNECTION_SELECT} where c.workspace_id = $1 and c.code_id = any($2::text[]) order by c.created_at, c.id`, [workspaceId, [...codeIds]]);
      return rows.map(connectionFromRow);
    },
    async updateSharedKeys(connectionId, side, keys) {
      const column = side === "inviter" ? "inviter_shared_keys" : "redeemer_shared_keys";
      await tx.query(`update invite_connections set ${column} = $3::text[] where workspace_id = $1 and id = $2`, [workspaceId, connectionId, keys]);
    },
    async updateSynced(connectionId, side, state) {
      const column = side === "inviter" ? "inviter_synced" : "redeemer_synced";
      await tx.query(`update invite_connections set ${column} = $3::jsonb where workspace_id = $1 and id = $2`, [workspaceId, connectionId, JSON.stringify(state)]);
    },
    async unlink(input) {
      await tx.query(
        `update invite_connections set unlinked_at = $3::timestamptz, unlinked_by = $4, unlink_idempotency_key = $5, unlink_kept = $6
         where workspace_id = $1 and id = $2 and unlinked_at is null`,
        [workspaceId, input.connectionId, input.at, input.actorId, input.idempotencyKey, input.kept],
      );
    },
    async listActiveConnections({ afterId, limit }) {
      const rows = await many(
        `${CONNECTION_SELECT} where c.workspace_id = $1 and c.unlinked_at is null and ($2::text is null or c.id > $2) order by c.id limit $3`,
        [workspaceId, afterId, limit],
      );
      return rows.map(connectionFromRow);
    },
    async listLinkedContactIds(actorId) {
      const rows = await many(
        `select inviter_contact_id as contact_id from invite_connections where workspace_id = $1 and unlinked_at is null and inviter_actor_id = $2
         union select redeemer_contact_id from invite_connections where workspace_id = $1 and unlinked_at is null and redeemer_actor_id = $2`,
        [workspaceId, actorId],
      );
      return rows.map((row) => String(row.contact_id)).sort();
    },
  };
}

// ── 内存（mock 模式与服务测试）──────────────────────────────────────────────

export interface MemoryInviteCodeTables {
  codes: InviteCodeRow[];
  connections: InviteConnectionRow[];
}

export function createMemoryInviteCodeTables(): MemoryInviteCodeTables {
  return { codes: [], connections: [] };
}

const clone = <T>(value: T): T => structuredClone(value);
const pairOf = (row: InviteConnectionRow) => [row.inviterActorId, row.redeemerActorId].sort().join("\u0000");

/** 与 PostgreSQL 版同样的约束（每人一个可用码、码全局唯一、同一对人一条生效连接、用量上限），写在内存里。 */
export function createMemoryInviteCodeRepository(tables: MemoryInviteCodeTables): InviteCodeRepository {
  const codeOf = (codeId: string) => tables.codes.find((row) => row.id === codeId)?.code ?? "";
  const withCode = (row: InviteConnectionRow) => clone({ ...row, code: codeOf(row.codeId) });
  const isUsable = (row: InviteCodeRow) => row.revokedAt === null && row.supersededAt === null;
  return {
    lockActor: async () => undefined,
    lockPair: async () => undefined,
    findCodeByCode: async (code) => clone(tables.codes.find((row) => row.code === code) ?? null),
    findCodeByIdempotencyKey: async (actorId, key) => clone(tables.codes.find((row) => row.actorId === actorId && row.idempotencyKey === key) ?? null),
    findUsableCode: async (actorId) => clone(tables.codes.find((row) => row.actorId === actorId && isUsable(row)) ?? null),
    async supersedeActorCodes(actorId, at) {
      const rows = tables.codes.filter((row) => row.actorId === actorId && isUsable(row));
      for (const row of rows) row.supersededAt = at;
      return rows.length;
    },
    async insertCode(input) {
      if (tables.codes.some((row) => row.code === input.code || row.id === input.id)) return null;
      if (tables.codes.some((row) => row.actorId === input.actorId && (isUsable(row) || row.idempotencyKey === input.idempotencyKey))) return null;
      const row: InviteCodeRow = { ...clone(input), revokedAt: null, supersededAt: null, usedCount: 0 };
      tables.codes.push(row);
      return clone(row);
    },
    async revokeCode(actorId, code, at) {
      const row = tables.codes.find((item) => item.actorId === actorId && item.code === code);
      if (!row) return null;
      row.revokedAt ??= at;
      return clone(row);
    },
    listActorCodes: async (actorId, limit) =>
      clone(tables.codes.filter((row) => row.actorId === actorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, limit)),
    async claimUse(codeId, now) {
      const row = tables.codes.find((item) => item.id === codeId);
      if (!row || !isUsable(row) || row.usedCount >= row.maxUses || Date.parse(row.expiresAt) <= Date.parse(now)) return null;
      row.usedCount += 1;
      return clone(row);
    },

    async findConnectionByRedeemKey(redeemerActorId, key) {
      const row = tables.connections.find((item) => item.redeemerActorId === redeemerActorId && item.redeemerIdempotencyKey === key);
      return row ? withCode(row) : null;
    },
    async findActiveConnectionBetween(left, right) {
      const pair = [left, right].sort().join("\u0000");
      const row = tables.connections.find((item) => item.unlinkedAt === null && pairOf(item) === pair);
      return row ? withCode(row) : null;
    },
    async findActiveConnectionForContact(actorId, contactId) {
      const row = [...tables.connections].reverse().find((item) => item.unlinkedAt === null && (
        (item.inviterActorId === actorId && item.inviterContactId === contactId) || (item.redeemerActorId === actorId && item.redeemerContactId === contactId)));
      return row ? withCode(row) : null;
    },
    async findUnlinkedByKey(actorId, key) {
      const row = tables.connections.find((item) => item.unlinkedBy === actorId && item.unlinkIdempotencyKey === key);
      return row ? withCode(row) : null;
    },
    async findConnection(id) {
      const row = tables.connections.find((item) => item.id === id);
      return row ? withCode(row) : null;
    },
    async insertConnection(input) {
      const row: InviteConnectionRow = { ...clone(input), code: codeOf(input.codeId), unlinkIdempotencyKey: null, unlinkKept: null, unlinkedAt: null, unlinkedBy: null };
      if (tables.connections.some((item) => item.unlinkedAt === null && pairOf(item) === pairOf(row))) throw new Error("invite_connections_one_live_pair");
      if (tables.connections.some((item) => item.redeemerActorId === row.redeemerActorId && item.redeemerIdempotencyKey === row.redeemerIdempotencyKey)) {
        throw new Error("invite_connections redeemer idempotency key");
      }
      tables.connections.push(row);
    },
    listConnectionsForCodes: async (codeIds) =>
      tables.connections.filter((row) => codeIds.includes(row.codeId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(withCode),
    async updateSharedKeys(connectionId, side, keys) {
      const row = tables.connections.find((item) => item.id === connectionId);
      if (!row) return;
      if (side === "inviter") row.inviterSharedKeys = [...keys];
      else row.redeemerSharedKeys = [...keys];
    },
    async updateSynced(connectionId, side, state) {
      const row = tables.connections.find((item) => item.id === connectionId);
      if (!row) return;
      if (side === "inviter") row.inviterSynced = clone(state);
      else row.redeemerSynced = clone(state);
    },
    async unlink(input) {
      const row = tables.connections.find((item) => item.id === input.connectionId && item.unlinkedAt === null);
      if (!row) return;
      Object.assign(row, { unlinkIdempotencyKey: input.idempotencyKey, unlinkKept: input.kept, unlinkedAt: input.at, unlinkedBy: input.actorId });
    },
    listActiveConnections: async ({ afterId, limit }) =>
      tables.connections.filter((row) => row.unlinkedAt === null && (afterId === null || row.id > afterId)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit).map(withCode),
    listLinkedContactIds: async (actorId) =>
      [...new Set(tables.connections.filter((row) => row.unlinkedAt === null).flatMap((row) => [
        ...(row.inviterActorId === actorId ? [row.inviterContactId] : []),
        ...(row.redeemerActorId === actorId ? [row.redeemerContactId] : []),
      ]))].sort(),
  };
}
