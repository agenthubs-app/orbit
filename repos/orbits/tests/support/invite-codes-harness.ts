/**
 * R15 招待コード测试的公共夹具：一个随机 schema 的本机 PostgreSQL（orbit_records + 计划 + 计划候补 + 招待迁移），
 * 资料种子，内存 / PostgreSQL 两套存储。只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { createMemoryInviteCodeStorage, createPostgresInviteCodeStorage } from "../../features/invite-codes/configured";
import type { InviteProfile } from "../../features/invite-codes/contract";
import { runInviteCodeMigrations } from "../../features/invite-codes/migrations";
import type { InviteCodeStorage } from "../../features/invite-codes/service";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { runPlanMigrations } from "../../features/plans/migrations";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseUrl } from "./plan-matching-harness";

export { databaseTest, databaseUrl } from "./plan-matching-harness";

export const INVITE_WS = "workspace:invite-codes-test";
export const ALICE = "actor:alice";
export const BOB = "actor:bob";
export const CAROL = "actor:carol";

export function profile(actorId: string, overrides: Partial<InviteProfile> = {}): InviteProfile {
  const name = actorId.replace("actor:", "");
  return {
    actorId,
    displayName: `${name[0]!.toUpperCase()}${name.slice(1)} Example`,
    email: `${name}@example.invalid`,
    offering: [`${name} offers advice`],
    organization: `${name} Inc`,
    phone: "090-1234-5678",
    role: "CEO",
    seeking: [`${name} seeks investors`],
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** 一个联系人的 payload（统合用例：A 的人脈里已有 B 的名刺）。 */
export async function seedContact(store: LiveRecordStoreLike<Record<string, unknown>>, input: { workspaceId: string; ownerId: string; contactId: string; payload: Record<string, unknown> }) {
  const at = "2026-09-18T00:00:00.000Z";
  await store.upsertRecord({
    collectionName: "contacts",
    createdAt: at,
    evidenceIds: [`evidence:${input.contactId}`],
    lifecycleState: "active",
    payload: { createdAt: at, evidenceIds: [`evidence:${input.contactId}`], id: input.contactId, source: { id: `card:${input.contactId}`, type: "business_card_ocr" }, stage: "captured", updatedAt: at, ...input.payload },
    recordId: input.contactId,
    searchText: "",
    sourceId: `card:${input.contactId}`,
    sourceType: "business_card_ocr",
    updatedAt: at,
    userId: input.ownerId,
    workspaceId: input.workspaceId,
  });
}

export interface InviteHarness {
  kind: "memory" | "postgres";
  storage: InviteCodeStorage;
  contacts: LiveRecordStoreLike<Record<string, unknown>>;
  setProfile(value: InviteProfile): Promise<void>;
  removeProfile(actorId: string): Promise<void>;
  /** 测试读表用（只有 PostgreSQL 版有）。 */
  pool: Pool | null;
  client: TransactionalPostgresClient | null;
}

/** 计划候补入队记录（内存版的替身；PostgreSQL 版直接查 plan_match_job_contacts）。 */
export type PlanMatchCall = { op: "enqueue" | "cancel"; actorId: string; contactId: string };

export function memoryHarness(planMatchCalls: PlanMatchCall[] = []): InviteHarness {
  const contacts = createMemoryLiveRecordStore<Record<string, unknown>>();
  const planMatch = {
    cancel: async (input: { actorId: string; contactId: string }) => void planMatchCalls.push({ op: "cancel", ...input }),
    enqueue: async (input: { actorId: string; contactId: string }) => void planMatchCalls.push({ op: "enqueue", ...input }),
  };
  const storage = createMemoryInviteCodeStorage({ contacts, planMatch, workspaceId: INVITE_WS });
  return {
    client: null,
    contacts,
    kind: "memory",
    pool: null,
    removeProfile: async (actorId) => void storage.profiles.delete(actorId),
    setProfile: async (value) => void storage.profiles.set(value.actorId, value),
    storage,
  };
}

/** 资料写进 `orbit_records`（profiles 集合），与资料模块同一个形状。 */
async function upsertProfileRecord(store: LiveRecordStoreLike<Record<string, unknown>>, value: InviteProfile) {
  const id = `profile:${value.actorId}`;
  await store.upsertRecord({
    collectionName: "profiles",
    createdAt: "2026-09-01T00:00:00.000Z",
    evidenceIds: [`evidence:${id}`],
    lifecycleState: "active",
    payload: {
      accountId: value.actorId,
      createdAt: "2026-09-01T00:00:00.000Z",
      displayName: value.displayName,
      handles: { ...(value.email ? { email: value.email } : {}), ...(value.phone ? { phone: value.phone } : {}) },
      id,
      ...(value.organization ? { organization: value.organization } : {}),
      publicProfile: { offering: value.offering, seeking: value.seeking },
      ...(value.publicFields ? { publicFields: value.publicFields } : {}),
      ...(value.role ? { role: value.role } : {}),
      updatedAt: value.updatedAt,
    },
    recordId: id,
    searchText: "",
    sourceId: `source:${id}`,
    sourceType: "manual",
    targetId: id,
    targetType: "profile",
    updatedAt: value.updatedAt,
    userId: value.actorId,
    workspaceId: INVITE_WS,
  });
}

export async function withInviteDatabase(run: (harness: InviteHarness) => Promise<void>, options: { migrate?: boolean } = {}): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `invite_codes_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 12, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, max: 12, pool: pool as never });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runPlanMigrations(pool);
    await runPlanMatchingMigrations(pool);
    if (options.migrate !== false) await runInviteCodeMigrations(pool);
    const contacts = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
    await run({
      client,
      contacts,
      kind: "postgres",
      pool,
      removeProfile: async (actorId) => void (await pool.query("delete from orbit_records where collection_name = 'profiles' and user_id = $1", [actorId])),
      setProfile: (value) => upsertProfileRecord(contacts, value),
      storage: createPostgresInviteCodeStorage({ client, workspaceId: INVITE_WS }),
    });
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}
