/**
 * W0048a 人脉分析快照与 AI 配额账本的真实 PostgreSQL 夹具：每个用例一个随机 schema（orbit_records、计划、
 * 匹配、快照四组表），用完即删。只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库，非回环地址直接失败（不是 skip）。
 * `syncRevision: true` 时加装严格 sync_revision（0108），同步集合的写入在事务里先取提交顺序锁。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { runPlanMigrations } from "../../features/plans/migrations";
import { SYNC_COMMIT_ORDER_LOCK_SQL, isSyncCollection } from "../../features/sync/commit-order-lock";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "./plan-matching-harness";
import { STRICT_SYNC_REVISION_SQL } from "./sync-revision-fixture";

export { databaseTest };
export const WORKSPACE = "workspace:network-analysis-test";
export const ALICE = "actor:alice";
export const BOB = "actor:bob";

export interface StatementMeter {
  statements: string[];
  writes: string[];
  bytes: number;
  /** 每条语句返回的字节（标签 = SQL 开头的注释或前 60 个字符）。 */
  perStatement?: { label: string; bytes: number }[];
}

export interface NetworkHarness {
  pool: Pool;
  schema: string;
  client: TransactionalPostgresClient;
  meter: StatementMeter;
  insertRecord(input: { collection: string; id: string; userId: string; payload: Record<string, unknown>; at?: string; state?: string }): Promise<void>;
  updatePayload(collection: string, id: string, patch: Record<string, unknown>, at?: string): Promise<void>;
  deleteRecord(collection: string, id: string): Promise<void>;
  addContact(actorId: string, id: string, extra?: Record<string, unknown>): Promise<void>;
}

const WRITE = /^\s*(\/\*[^*]*\*\/\s*)?(insert|update|delete)\b/i;

export function meteredClient(base: TransactionalPostgresClient, meter: StatementMeter): TransactionalPostgresClient {
  const wrap = (executor: { query: TransactionalPostgresClient["query"] }) => ({
    async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      meter.statements.push(text);
      if (WRITE.test(text)) meter.writes.push(text);
      const result = await executor.query<TRow>(text, values);
      let bytes = 0;
      for (const row of result.rows) bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
      meter.bytes += bytes;
      meter.perStatement?.push({ bytes, label: (text.match(/\/\*\s*([^*]+?)\s*\*\//)?.[1] ?? text.trim().replace(/\s+/g, " ")).slice(0, 60) });
      return result;
    },
  });
  return {
    ...wrap(base),
    close: () => base.close(),
    transaction: (operation, options) => base.transaction((tx) => operation(wrap(tx)), options),
  };
}

export function contactPayload(id: string, actorId: string, extra: Record<string, unknown> = {}) {
  return { id, accountId: actorId, displayName: `Name ${id.split(":").pop()}`, organization: `Org ${id.split(":").pop()}`, role: "Manager", stage: "active", evidenceIds: [], ...extra };
}

export async function withNetworkDatabase(run: (harness: NetworkHarness) => Promise<void>, options: { syncRevision?: boolean } = {}): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `network_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 8,
    options: `-c search_path=${schema} -c statement_timeout=15000`,
  });
  const meter: StatementMeter = { bytes: 0, statements: [], writes: [] };
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    if (options.syncRevision) await pool.query(STRICT_SYNC_REVISION_SQL);
    await runPlanMigrations(pool);
    await runPlanMatchingMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    const client = meteredClient(createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never }), meter);
    let tick = Date.parse("2026-09-01T00:00:00.000Z");
    const stamp = () => new Date((tick += 1000)).toISOString();
    const locked = async (collection: string, statement: string, values: unknown[]) => {
      if (!options.syncRevision || !isSyncCollection(collection)) {
        await pool.query(statement, values);
        return;
      }
      const connection = await pool.connect();
      try {
        await connection.query("begin");
        await connection.query(SYNC_COMMIT_ORDER_LOCK_SQL);
        await connection.query(statement, values);
        await connection.query("commit");
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
    };
    const harness: NetworkHarness = {
      async addContact(actorId, id, extra = {}) {
        await harness.insertRecord({ collection: "contacts", id, payload: contactPayload(id, actorId, extra), userId: actorId });
      },
      client,
      async deleteRecord(collection, id) {
        await locked(collection, `update orbit_records set lifecycle_state = 'deleted', deleted_at = now(), updated_at = $3 where workspace_id = $1 and collection_name = $4 and record_id = $2`, [WORKSPACE, id, stamp(), collection]);
      },
      async insertRecord(input) {
        const at = input.at ?? stamp();
        await locked(
          input.collection,
          `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
           values ($1, $2, $3, $4, 'manual', $3, $6, $5::jsonb, $7, $7)`,
          [WORKSPACE, input.collection, input.id, input.userId, JSON.stringify(input.payload), input.state ?? "active", at],
        );
      },
      meter,
      pool,
      schema,
      async updatePayload(collection, id, patch, at) {
        await locked(collection, `update orbit_records set payload = payload || $3::jsonb, updated_at = $4 where workspace_id = $1 and collection_name = $5 and record_id = $2`, [WORKSPACE, id, JSON.stringify(patch), at ?? stamp(), collection]);
      },
    };
    await run(harness);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

/** 一份含 network_need 条目的生效计划（直接 SQL，只为版本与输入测试准备数据）。 */
export async function insertActivePlan(pool: Pool, actorId: string, input: { planId?: string; needs?: { id: string; title: string }[] } = {}) {
  const planId = input.planId ?? `plan:${actorId}`;
  await pool.query(
    `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on) values ($1, $2, $3, 1, 'active', 'g', 'month', '2026-09-01')`,
    [WORKSPACE, planId, actorId],
  );
  for (const [index, need] of (input.needs ?? []).entries()) {
    await pool.query(
      `insert into plan_items (workspace_id, id, actor_id, plan_id, kind, phase, title, status, sort_key)
       values ($1, $2, $3, $4, 'network_need', 'p1', $5, 'open', $6)`,
      [WORKSPACE, need.id, actorId, planId, need.title, index + 1],
    );
  }
  return planId;
}
