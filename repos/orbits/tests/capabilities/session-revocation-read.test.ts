/**
 * W0032：会话有效性检查（`isPasswordSessionCurrent`）改为一条只返回判定所需列的 SQL，且不参加进程内 in-flight 去重（D31）。
 *
 * SC-02 (a) 等价矩阵：本机 PostgreSQL 临时 schema 造数，同一数据分别走旧路径（替身 `{ store, workspaceId }` → `getRecord`）
 *   与新路径（`client` + `customRead`），结果相同（同 true／false／同样的 reject），坏数据在四个会话时区对照。
 * SC-02 (b) 每个场景新路径恰好 1 条 SQL、`customRead` 1 次、`store.getRecord` 0 次。
 * SC-02 (c) 真实「注册 → 申请重设 → consume」：重设前 true，consume 返回后第一次 false，新登录 true，相继两次各发 SQL。
 * SC-02 (d) 不共享与重设竞态：同进程、跨实例、同时 5 次；旧路径反证。
 * SC-03 (a)～(d) SQL 形状、闸门（每次 1 次、关键集合超预算仍放行）、唯一 key、配置层计量。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createAuthUserService } from "../../features/auth/auth-user-service";
import { openPasswordResetToken } from "../../features/auth/password-reset-crypto";
import { createPasswordResetService } from "../../features/auth/password-reset-service";
import { createPasswordResetStore } from "../../features/auth/password-reset-store";
import { isPasswordSessionCurrent } from "../../features/auth/session-revocation";
import { authUserRecordId, createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createReadBudgetGate, resolveSharedReadBudgetGate, type ReadBudgetGate } from "../../features/sync/read-budget-gate";
import {
  createConfiguredPostgresLiveRecordStore,
  createGatedDedupedCustomRead,
  createInflightReadDeduper,
  type LiveRecordCustomRead,
} from "../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
  type ClosableLiveRecordSqlClient,
  type LiveRecordSqlClient,
} from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WS = "workspace:w0032-session-revocation";
const EMAIL = "member@example.com";
const RECORD_ID = authUserRecordId(EMAIL);
const USER = "user:w0032";
const AUTH_AT = Date.parse("2026-09-10T00:00:00.000Z");
const TIME_ZONES = ["UTC", "Asia/Shanghai", "America/Los_Angeles", "Pacific/Kiritimati"];
const SECRET = "password-recovery-test-secret-with-32-bytes";
const KEY_PREFIX = "auth-session-revocation:v1:unshared";
const FORBIDDEN_ROW_TEXT = ["passwordHash", "passwordReset", "record_id", "source_", "provider", "search_text", "evidence_ids", "$2a$", "sealedToken"];

type Records = LiveRecordStoreLike<Record<string, unknown>>;
type Database = { client?: LiveRecordSqlClient; customRead?: LiveRecordCustomRead; store: Records; workspaceId: string };
type Outcome = { value: boolean } | { error: { name: string; message: string } };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function schemaUrlFor(schema: string, timeZone?: string, extra?: Record<string, string>): string {
  assert.ok(databaseUrl);
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}${timeZone ? ` -c TimeZone=${timeZone}` : ""}`);
  for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

async function withSchema(run: (input: { pool: Pool; schema: string }) => Promise<void>, timeZone?: string) {
  assert.ok(databaseUrl);
  const schema = `w0032_rev_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}${timeZone ? ` -c TimeZone=${timeZone}` : ""}` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    // Unknown lifecycle values must map like `rowToRecord` (to "active"); the fixture needs them in the table.
    await pool.query("alter table orbit_records drop constraint if exists orbit_records_lifecycle_state_check");
    await run({ pool, schema });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

function poolClient(pool: Pool): LiveRecordSqlClient & { calls: Array<{ text: string; rows: readonly Record<string, unknown>[] }> } {
  const calls: Array<{ text: string; rows: readonly Record<string, unknown>[] }> = [];
  return {
    calls,
    async query<TRow>(text: string, values?: readonly unknown[]) {
      const rows = (await pool.query(text, values as unknown[])).rows as TRow[];
      calls.push({ text, rows: rows as Record<string, unknown>[] });
      return { rows };
    },
  };
}

interface AuthRow {
  workspaceId?: string;
  recordId?: string;
  lifecycle?: string;
  /** SQL text of the jsonb literal, e.g. `'{"id":"x"}'`. */
  payloadSql: string;
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string | null;
  deletedAt?: string | null;
}

const T = "2026-09-01T00:00:00.000Z";
const OUT_OF_RANGE = "275760-09-13 00:00:00.001+00";

async function insertAuthRow(pool: Pool, row: AuthRow) {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider,
       provider_record_id, evidence_ids, payload, search_text, created_at, updated_at, occurred_at, lifecycle_state, deleted_at)
     values ($1, 'auth_users', $2, null, 'auth', 'source:w0032', 'W0032 fixture', 'credentials', 'provider:w0032', array['evidence:w0032'],
       ${row.payloadSql}::jsonb, 'member example com search text', $3::timestamptz, $4::timestamptz, $5::timestamptz, $6, $7::timestamptz)`,
    [row.workspaceId ?? WS, row.recordId ?? RECORD_ID, row.createdAt ?? T, row.updatedAt ?? T, row.occurredAt === undefined ? T : row.occurredAt, row.lifecycle ?? "active", row.deletedAt ?? null],
  );
}

const json = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;
const userPayload = (overrides: Record<string, unknown> = {}) => ({ id: USER, email: EMAIL, displayName: "Member", passwordHash: "$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz0123", createdAt: T, updatedAt: T, ...overrides });

async function outcome(run: () => Promise<boolean>): Promise<Outcome> {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: { name: (error as Error).name, message: (error as Error).message } };
  }
}

function countingGate() {
  const checks: Array<string | undefined> = [];
  const gate: ReadBudgetGate = {
    assertAllowed: (input) => { checks.push(input.collectionName); },
    observe: () => {},
    snapshot: () => ({ bytes: 0, maxBytes: null, maxRows: null, open: false, rows: 0, windowMs: 60_000 }),
  };
  return { checks, gate };
}

/** New-path database with spies: SQL on `client`, custom reads (and their keys), getRecord calls, gate checks. */
function instrumented(pool: Pool, options: { gate?: ReadBudgetGate; workspaceId?: string } = {}) {
  const client = poolClient(pool);
  const plain = createPostgresLiveRecordStore<Record<string, unknown>>({ client: poolClient(pool) });
  const deduper = createInflightReadDeduper();
  const spyGate = countingGate();
  const gated = createGatedDedupedCustomRead(deduper, options.gate ?? spyGate.gate);
  const keys: string[] = [];
  let getRecords = 0;
  const customRead: LiveRecordCustomRead = (input) => { keys.push(input.key); return gated(input); };
  const store: Records = { ...plain, getRecord: (query) => { getRecords += 1; return plain.getRecord(query); } };
  const database: Database = { client, customRead, store, workspaceId: options.workspaceId ?? WS };
  return { client, database, deduper, gateChecks: spyGate.checks, getRecords: () => getRecords, keys };
}

function oldPath(pool: Pool, workspaceId = WS): Database {
  return { store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: poolClient(pool) }), workspaceId };
}

const input = (overrides: Partial<{ email: string; userId: string; authenticatedAt: number }> = {}) => ({ authenticatedAt: AUTH_AT, email: EMAIL, userId: USER, ...overrides });

// ---------------------------------------------------------------------------
// SC-02 (a)(b): equivalence matrix
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  rows: AuthRow[];
  input?: Partial<{ email: string; userId: string; authenticatedAt: number }>;
  /** Expected shared outcome: true / false / "reject" (both reject the same way). */
  expect: boolean | "reject";
  /** Rows the lightweight projection cannot evaluate (compat columns + real rowToRecord). */
  unreadable?: boolean;
}

const before = "2026-09-09T23:59:59.999Z";
const equal = "2026-09-10T00:00:00.000Z";
const later = "2026-09-10T00:00:00.001Z";

const SCENARIOS: Scenario[] = [
  { name: "no record", rows: [], expect: false },
  { name: "other workspace only", rows: [{ workspaceId: "workspace:other", payloadSql: json(userPayload()) }], expect: false },
  { name: "active, same id, no passwordChangedAt", rows: [{ payloadSql: json(userPayload()) }], expect: true },
  { name: "archived", rows: [{ lifecycle: "archived", payloadSql: json(userPayload()) }], expect: false },
  { name: "deleted", rows: [{ lifecycle: "deleted", payloadSql: json(userPayload()) }], expect: false },
  { name: "unknown lifecycle maps to active", rows: [{ lifecycle: "pending", payloadSql: json(userPayload()) }], expect: true },
  { name: "different id", rows: [{ payloadSql: json(userPayload({ id: "user:other" })) }], expect: false },
  { name: "numeric id with the same literal", rows: [{ payloadSql: json(userPayload({ id: 42 })) }], input: { userId: "42" }, expect: false },
  { name: "id missing", rows: [{ payloadSql: json({ email: EMAIL }) }], expect: false },
  { name: "id JSON null", rows: [{ payloadSql: json(userPayload({ id: null })) }], expect: false },
  { name: "passwordChangedAt JSON null", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: null })) }], expect: true },
  { name: "passwordChangedAt number", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: AUTH_AT + 10 })) }], expect: true },
  { name: "passwordChangedAt object", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: { at: later } })) }], expect: true },
  { name: "passwordChangedAt unparseable", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: "not a date" })) }], expect: false },
  { name: "passwordChangedAt before authentication", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: before })) }], expect: true },
  { name: "passwordChangedAt equal to authentication", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: equal })) }], expect: false },
  { name: "passwordChangedAt after authentication", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: later })) }], expect: false },
  { name: "passwordReset residue is irrelevant", rows: [{ payloadSql: json(userPayload({ passwordChangedAt: before, passwordReset: { tokenHash: "h".repeat(64), sealedToken: "s".repeat(120), attempts: 0 } })) }], expect: true },
  // bad data (rowToRecord semantics)
  { name: "created_at +infinity", rows: [{ createdAt: "infinity", payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "created_at -infinity", rows: [{ createdAt: "-infinity", payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "created_at out of JS range", rows: [{ createdAt: OUT_OF_RANGE, payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "updated_at +infinity", rows: [{ updatedAt: "infinity", payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "updated_at -infinity", rows: [{ updatedAt: "-infinity", payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "updated_at out of JS range", rows: [{ updatedAt: OUT_OF_RANGE, payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "occurred_at infinity (no throw)", rows: [{ occurredAt: "infinity", payloadSql: json(userPayload()) }], expect: true },
  { name: "occurred_at out of JS range", rows: [{ occurredAt: OUT_OF_RANGE, payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "deleted_at -infinity (no throw)", rows: [{ deletedAt: "-infinity", payloadSql: json(userPayload()) }], expect: true },
  { name: "deleted_at out of JS range", rows: [{ deletedAt: OUT_OF_RANGE, payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "archived with out-of-range created_at still rejects", rows: [{ lifecycle: "archived", createdAt: OUT_OF_RANGE, payloadSql: json(userPayload()) }], expect: "reject", unreadable: true },
  { name: "payload jsonb string, parseable", rows: [{ payloadSql: json(JSON.stringify(userPayload())) }], expect: true, unreadable: true },
  { name: "payload jsonb string, parseable, different id", rows: [{ payloadSql: json(JSON.stringify(userPayload({ id: "user:other" }))) }], expect: false, unreadable: true },
  { name: "payload jsonb string, unparseable", rows: [{ payloadSql: json("not json {") }], expect: "reject", unreadable: true },
  { name: "payload JSON null, active", rows: [{ payloadSql: "'null'" }], expect: "reject", unreadable: true },
  { name: "payload JSON null, archived", rows: [{ lifecycle: "archived", payloadSql: "'null'" }], expect: false, unreadable: true },
  { name: "payload array", rows: [{ payloadSql: json([USER]) }], expect: false, unreadable: true },
  { name: "payload number", rows: [{ payloadSql: "'42'" }], expect: false, unreadable: true },
];

for (const timeZone of TIME_ZONES) {
  test(`SC-02 (a)(b) PG equivalence matrix, one SQL / one customRead / zero getRecord per check (TimeZone=${timeZone})`, pgSkip, async () => {
    await withSchema(async ({ pool }) => {
      const onlyTimestamps = timeZone !== "UTC";
      for (const scenario of SCENARIOS) {
        // Non-UTC zones repeat only the timestamp cases (the zone only matters to timestamp parsing).
        if (onlyTimestamps && !/_at /u.test(scenario.name)) continue;
        await pool.query("delete from orbit_records");
        for (const row of scenario.rows) await insertAuthRow(pool, row);
        const args = input(scenario.input);
        const old = await outcome(() => isPasswordSessionCurrent(args, oldPath(pool)));
        const probe = instrumented(pool);
        const next = await outcome(() => isPasswordSessionCurrent(args, probe.database));
        assert.deepEqual(next, old, `${scenario.name}: new path equals old path`);
        if (scenario.expect === "reject") assert.ok("error" in old, `${scenario.name}: rejects`);
        else assert.deepEqual(old, { value: scenario.expect }, `${scenario.name}: expected ${scenario.expect}`);
        assert.equal(probe.client.calls.length, 1, `${scenario.name}: exactly one SQL`);
        assert.equal(probe.keys.length, 1, `${scenario.name}: exactly one customRead`);
        assert.equal(probe.getRecords(), 0, `${scenario.name}: no getRecord`);
        assert.deepEqual(probe.gateChecks, ["auth_users"], `${scenario.name}: one gate check`);
        const row = probe.client.calls[0]!.rows[0];
        if (scenario.rows.some((r) => (r.workspaceId ?? WS) === WS && r.lifecycle !== "deleted")) {
          assert.ok(row, `${scenario.name}: a row came back`);
          assert.equal(row.readable, !scenario.unreadable, `${scenario.name}: readable flag`);
        } else {
          assert.equal(row, undefined, `${scenario.name}: no row`);
        }
      }
    }, timeZone);
  });
}

test("SC-02 (a) no database: NODE_ENV production → false, otherwise → true", async () => {
  const saved = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;
  try {
    env.NODE_ENV = "production";
    assert.equal(await isPasswordSessionCurrent(input(), null), false);
    env.NODE_ENV = "test";
    assert.equal(await isPasswordSessionCurrent(input(), null), true);
    delete env.NODE_ENV;
    assert.equal(await isPasswordSessionCurrent(input(), null), true);
  } finally {
    if (saved === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = saved;
  }
});

// ---------------------------------------------------------------------------
// SC-02 (c): real reset flow
// ---------------------------------------------------------------------------

async function registerAndRequestReset(pool: Pool, workspaceId = WS) {
  const client = poolClient(pool);
  const provider = createStorageAuthUserProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId });
  const registered = await createAuthUserService({ provider }).registerUser({ email: EMAIL, password: "old-password" });
  assert.equal(registered.state, "success");
  if (registered.state !== "success") throw new Error("registration failed");
  let clock = new Date(Date.now() + 1_000);
  const service = createPasswordResetService(createPasswordResetStore(client, workspaceId), SECRET, () => clock);
  assert.ok((await service.request(EMAIL)).success);
  const payload = (await pool.query("select payload from orbit_records where workspace_id = $1 and record_id = $2", [workspaceId, RECORD_ID])).rows[0].payload;
  const token = openPasswordResetToken(payload.passwordReset.sealedToken, SECRET);
  return {
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); return clock; },
    clock: () => clock,
    reset: () => service.reset(token, "new-password"),
    userId: registered.data.user.id,
  };
}

test("SC-02 (c) real register → request → consume: first check after consume is false, a newer login is true, every check issues its own SQL", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    const flow = await registerAndRequestReset(pool);
    const probe = instrumented(pool);
    const loggedInAt = flow.clock().getTime() - 1;
    assert.equal(await isPasswordSessionCurrent(input({ authenticatedAt: loggedInAt, userId: flow.userId }), probe.database), true);
    flow.advance(1_000);
    assert.equal((await flow.reset()).success, true);
    assert.equal(await isPasswordSessionCurrent(input({ authenticatedAt: loggedInAt, userId: flow.userId }), probe.database), false, "first check after consume");
    assert.equal(await isPasswordSessionCurrent(input({ authenticatedAt: flow.clock().getTime() + 1, userId: flow.userId }), probe.database), true, "newer login");
    assert.equal(await isPasswordSessionCurrent(input({ authenticatedAt: loggedInAt, userId: flow.userId }), probe.database), false);
    assert.equal(probe.client.calls.length, 4, "each check issued its own SQL");
    assert.equal(new Set(probe.keys).size, 4);
    assert.ok(!JSON.stringify(probe.client.calls.map((call) => call.rows)).match(/passwordHash|passwordReset|\$2[aby]\$/u), "no hash or reset data read");
  });
});

// ---------------------------------------------------------------------------
// SC-02 (d): not shared; reset race (same process, cross-instance, 5 concurrent, old-path counter-proof)
// ---------------------------------------------------------------------------

const isCheckSql = (text: string) => /auth-session-revocation/u.test(text) || (/from orbit_records/u.test(text) && /record_id = \$3/u.test(text));

/** A configured store whose pg client can hold the next check statement's result (the statement runs, the answer waits). */
function holdingConfigured(schema: string, applicationName: string) {
  const state = { holdNext: false, release: () => {}, checkStatements: 0, started: null as Promise<void> | null };
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: (options) => {
      const real: ClosableLiveRecordSqlClient = createPgLiveRecordSqlClient(options);
      return {
        close: () => real.close(),
        async query<TRow>(text: string, values?: readonly unknown[]) {
          if (!isCheckSql(text)) return real.query<TRow>(text, values);
          state.checkStatements += 1;
          if (!state.holdNext) return real.query<TRow>(text, values);
          state.holdNext = false;
          const result = await real.query<TRow>(text, values);
          await new Promise<void>((resolve) => { state.release = resolve; });
          return result;
        },
      };
    },
    env: { ORBIT_EVENT_DATABASE_URL: schemaUrlFor(schema, undefined, { application_name: applicationName }), ORBIT_WORKSPACE_ID: WS },
  })!;
  assert.ok(configured);
  return { configured, state };
}

/** Resolves to "timeout" instead of hanging when a check has joined a held read (old behaviour). */
function within<T>(promise: Promise<T>, ms = 2_000): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 500 && !predicate(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(predicate(), "condition reached");
}

test("SC-02 (d) ① same process: a check issued after consume does not join the held pre-reset check", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    const flow = await registerAndRequestReset(pool);
    const { configured, state } = holdingConfigured(schema, `w0032-same-${randomUUID()}`);
    try {
      const args = input({ authenticatedAt: flow.clock().getTime() - 1, userId: flow.userId });
      state.holdNext = true;
      const x = isPasswordSessionCurrent(args, configured);
      await waitFor(() => state.checkStatements === 1 && !state.holdNext);
      await new Promise((resolve) => setTimeout(resolve, 20)); // X's statement has read the pre-reset row
      flow.advance(1_000);
      assert.equal((await flow.reset()).success, true);
      const y = await within(isPasswordSessionCurrent(args, configured));
      assert.equal(y, false, "Y sees the reset (and did not wait on X)");
      assert.equal(state.checkStatements, 2, "Y issued its own statement");
      state.release();
      assert.equal(await x, true, "X gets only its own (pre-reset) answer");
    } finally {
      state.release();
      await configured.client.close();
    }
  });
});

test("SC-02 (d) ② cross-instance: X on instance 1 held, consume, Y on instance 2 reads the reset", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    const flow = await registerAndRequestReset(pool);
    const one = holdingConfigured(schema, `w0032-one-${randomUUID()}`);
    const two = holdingConfigured(schema, `w0032-two-${randomUUID()}`);
    assert.notEqual(one.configured, two.configured, "two independent configured stores");
    try {
      const args = input({ authenticatedAt: flow.clock().getTime() - 1, userId: flow.userId });
      one.state.holdNext = true;
      const x = isPasswordSessionCurrent(args, one.configured);
      await waitFor(() => one.state.checkStatements === 1 && !one.state.holdNext);
      await new Promise((resolve) => setTimeout(resolve, 20));
      flow.advance(1_000);
      assert.equal((await flow.reset()).success, true);
      assert.equal(await within(isPasswordSessionCurrent(args, two.configured)), false);
      assert.equal(two.state.checkStatements, 1);
      one.state.release();
      assert.equal(await x, true);
    } finally {
      one.state.release();
      await one.configured.client.close();
      await two.configured.client.close();
    }
  });
});

test("SC-02 (d) ③ five concurrent checks for one user on one instance → five statements, five distinct keys", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await insertAuthRow(pool, { payloadSql: json(userPayload({ passwordChangedAt: before })) });
    const probe = instrumented(pool);
    const results = await Promise.all([0, 1, 2, 3, 4].map(() => isPasswordSessionCurrent(input(), probe.database)));
    assert.deepEqual(results, [true, true, true, true, true]);
    assert.equal(probe.client.calls.length, 5);
    assert.equal(new Set(probe.keys).size, 5);
  });
});

test("SC-02 (d) ④ counter-proof: the old getRecord path lets Y join the held pre-reset read", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    const flow = await registerAndRequestReset(pool);
    const { configured, state } = holdingConfigured(schema, `w0032-old-${randomUUID()}`);
    try {
      const oldDatabase = { store: configured.store, workspaceId: configured.workspaceId }; // no client/customRead → getRecord
      const args = input({ authenticatedAt: flow.clock().getTime() - 1, userId: flow.userId });
      state.holdNext = true;
      const x = isPasswordSessionCurrent(args, oldDatabase);
      await waitFor(() => state.checkStatements === 1 && !state.holdNext);
      await new Promise((resolve) => setTimeout(resolve, 20));
      flow.advance(1_000);
      assert.equal((await flow.reset()).success, true);
      const y = isPasswordSessionCurrent(args, oldDatabase);
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(state.checkStatements, 1, "Y joined X's in-flight getRecord");
      state.release();
      assert.equal(await y, true, "old path: Y reuses the pre-reset answer");
      assert.equal(await x, true);
    } finally {
      state.release();
      await configured.client.close();
    }
  });
});

// ---------------------------------------------------------------------------
// SC-03: SQL shape, gate, unshared keys, metering
// ---------------------------------------------------------------------------

test("SC-03 (a) SQL shape: regular rows carry only the decision columns (compat columns null); unreadable rows carry native compat columns; nothing secret", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await insertAuthRow(pool, { payloadSql: json(userPayload({ passwordChangedAt: before, passwordReset: { tokenHash: "h".repeat(64), sealedToken: "s".repeat(40) } })) });
    const regular = instrumented(pool);
    assert.equal(await isPasswordSessionCurrent(input(), regular.database), true);
    const [call] = regular.client.calls;
    assert.ok(call);
    assert.match(call.text, /lifecycle_state <> 'deleted'/u);
    assert.match(call.text, /limit 1/u);
    assert.doesNotMatch(call.text, /\bselect\s+\*|search_text|evidence_ids|source_|provider/u);
    const row = call.rows[0]!;
    assert.deepEqual(Object.keys(row).sort(), ["c1", "c2", "c3", "c4", "c5", "id", "lifecycle_state", "password_changed_at", "readable"]);
    assert.deepEqual([row.c1, row.c2, row.c3, row.c4, row.c5], [null, null, null, null, null]);
    assert.deepEqual([row.lifecycle_state, row.id, row.password_changed_at, row.readable], ["active", USER, before, true]);
    for (const text of FORBIDDEN_ROW_TEXT) assert.ok(!JSON.stringify(row).includes(text), `regular row has no ${text}`);

    await pool.query("delete from orbit_records");
    await insertAuthRow(pool, { createdAt: "infinity", payloadSql: json(userPayload()) });
    const bad = instrumented(pool);
    await assert.rejects(isPasswordSessionCurrent(input(), bad.database), /created_at is required/u);
    const badRow = bad.client.calls[0]!.rows[0]!;
    assert.equal(badRow.readable, false);
    assert.equal(badRow.id, null);
    assert.equal(badRow.password_changed_at, null);
    assert.equal(badRow.c2, Infinity, "created_at comes back natively (node-pg parses infinity as Infinity)");
    assert.ok(badRow.c3 instanceof Date);
    assert.equal(typeof badRow.c5, "object");
  });
});

test("SC-03 (b) gate: one assertAllowed(auth_users) per check, bad rows included; an over-budget gate still lets auth_users through while non-critical reads are refused", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await insertAuthRow(pool, { payloadSql: json(userPayload({ passwordChangedAt: before })) });
    const probe = instrumented(pool);
    for (let i = 0; i < 3; i += 1) await isPasswordSessionCurrent(input(), probe.database);
    assert.deepEqual(probe.gateChecks, ["auth_users", "auth_users", "auth_users"]);

    const gate = createReadBudgetGate({ maxBytes: 1, maxRows: null, windowMs: 60_000 });
    gate.observe({ approximateSerializedRowBytes: 10, failed: false, returnedRows: 1 } as never);
    assert.throws(() => gate.assertAllowed({ collectionName: "contacts" }), /read budget exceeded/u);
    const overBudget = instrumented(pool, { gate });
    assert.equal(await isPasswordSessionCurrent(input(), overBudget.database), true, "critical collection passes and the result is correct");
    assert.equal(await isPasswordSessionCurrent(input({ authenticatedAt: Date.parse(before) }), overBudget.database), false);
    assert.throws(() => gate.assertAllowed({ collectionName: "contacts" }), /read budget exceeded/u);
  });
});

test("SC-03 (c) unshared: unique increasing keys, no crosstalk with getRecord / other custom reads, failure then retry, no residue after 1,000 calls", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await insertAuthRow(pool, { payloadSql: json(userPayload({ passwordChangedAt: before })) });
    const probe = instrumented(pool);
    await isPasswordSessionCurrent(input(), probe.database);
    await isPasswordSessionCurrent(input(), probe.database);
    const parsed = probe.keys.map((key) => JSON.parse(key) as [string, string, string, number]);
    for (const [prefix, workspaceId, recordId, seq] of parsed) {
      assert.equal(prefix, KEY_PREFIX);
      assert.equal(workspaceId, WS);
      assert.equal(recordId, RECORD_ID);
      assert.ok(Number.isSafeInteger(seq));
    }
    assert.ok(parsed[1]![3] > parsed[0]![3], "sequence increases");

    // Concurrent with a getRecord of the same row and another custom read: each gets its own result.
    const other = await Promise.all([
      isPasswordSessionCurrent(input(), probe.database),
      probe.database.store.getRecord({ workspaceId: WS, collectionName: "auth_users", recordId: RECORD_ID }),
      probe.database.customRead!({ collectionName: "profiles", key: "other-read", read: async () => "other" }),
    ]);
    assert.equal(other[0], true);
    assert.equal((other[1] as unknown as { payload: { id: string } }).payload.id, USER);
    assert.equal(other[2], "other");

    // Failure is not remembered: the next call issues SQL again.
    let failNext = true;
    const flaky: LiveRecordSqlClient = { query: async (text, values) => {
      if (failNext) { failNext = false; throw new Error("connection reset"); }
      return probe.client.query(text, values);
    } };
    const flakyDatabase = { ...probe.database, client: flaky };
    const before1 = probe.client.calls.length;
    await assert.rejects(isPasswordSessionCurrent(input(), flakyDatabase), /connection reset/u);
    assert.equal(await isPasswordSessionCurrent(input(), flakyDatabase), true);
    assert.equal(probe.client.calls.length, before1 + 1);

    // 1,000 calls; afterwards no key is still registered in the deduper (a fresh read under any used key runs).
    const bulk = instrumented(pool);
    const stub: LiveRecordSqlClient = { query: async <TRow>() => ({ rows: [{ c1: null, c2: null, c3: null, c4: null, c5: null, id: USER, lifecycle_state: "active", password_changed_at: null, readable: true }] as TRow[] }) };
    const bulkDatabase = { ...bulk.database, client: stub };
    await Promise.all(Array.from({ length: 1_000 }, () => isPasswordSessionCurrent(input(), bulkDatabase)));
    assert.equal(new Set(bulk.keys).size, 1_000);
    let reruns = 0;
    for (const key of bulk.keys) await bulk.deduper.once(`customRead\u0000${key}`, () => { reruns += 1; });
    assert.equal(reruns, 1_000, "no in-flight entry left behind");
  });
});

test("SC-03 (d) configured layer: the check SQL goes through configured.client and the shared gate meters exactly its returned rows/bytes, once", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    await insertAuthRow(pool, { payloadSql: json(userPayload({ passwordChangedAt: before })) });
    const env = { ORBIT_EVENT_DATABASE_URL: schemaUrlFor(schema, undefined, { application_name: `w0032-meter-${randomUUID()}` }), ORBIT_READ_BUDGET_BYTES_PER_MINUTE: "1000000000", ORBIT_WORKSPACE_ID: WS };
    const configured = createConfiguredPostgresLiveRecordStore({ env })!;
    const gate = resolveSharedReadBudgetGate(env)!;
    const rows: unknown[][] = [];
    let getRecords = 0;
    const query: LiveRecordSqlClient["query"] = configured.client.query.bind(configured.client);
    try {
      const database = {
        client: { query: async <TRow>(text: string, values?: readonly unknown[]) => { const result = await query<TRow>(text, values); rows.push([...result.rows]); return result; } },
        customRead: configured.customRead,
        store: { ...configured.store, getRecord: (q: Parameters<Records["getRecord"]>[0]) => { getRecords += 1; return configured.store.getRecord(q); } },
        workspaceId: configured.workspaceId,
      };
      const snapshot = gate.snapshot();
      assert.equal(await isPasswordSessionCurrent(input(), database), true);
      const after = gate.snapshot();
      assert.equal(rows.length, 1, "one statement through configured.client");
      assert.equal(getRecords, 0);
      const bytes = rows[0]!.reduce<number>((sum, row) => sum + Buffer.byteLength(JSON.stringify(row), "utf8"), 0);
      assert.equal(after.rows - snapshot.rows, 1);
      assert.equal(after.bytes - snapshot.bytes, bytes, "gate observed the returned bytes once");
      assert.ok(bytes < 255, `lightweight row is small (${bytes} B)`);
    } finally {
      await configured.client.close();
    }
  });
});
