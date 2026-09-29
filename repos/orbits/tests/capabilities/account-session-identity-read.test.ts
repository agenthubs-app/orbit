/**
 * W0030：账号解析只读判定所需字段（`readAccountSessionIdentity`）。
 *
 * SC-01 等价：本机 PostgreSQL 临时 schema 造数，每个场景分别用旧路径（`readAccountSessionGraph`）
 *   和新路径（`readAccountSessionIdentity`）取图，经同一个 `resolveAuthenticatedApiActorIdentity`
 *   判定，结果（含 null 与 reject）深相等，语句数相同；SQL 形状只含投影 payload 和一列可读性布尔值。
 * SC-02 闸门（集合名序列、打开时放行）、in-flight 去重、失败不缓存、写入失效、配置层计量、SQL 失败 reject。
 * SC-03 配置的 PG 下 `resolveAuthenticatedApiActorFromSession` 只走轻量读取；未配置库／mock 行为不变。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { resolveAuthenticatedApiActorFromSession, resolveAuthenticatedApiActorIdentity } from "../../app/api/_shared/authenticated-actor";
import {
  createConfiguredStorageAccountSessionProvider,
  createStorageAccountSessionProvider,
  type LiveAccountSessionProvider,
} from "../../features/account/storage/account-live-record-provider";
import {
  createReadBudgetGate,
  createReadBudgetGatedLiveRecordStore,
  resolveSharedReadBudgetGate,
  type ReadBudgetGate,
} from "../../features/sync/read-budget-gate";
import {
  createConfiguredPostgresLiveRecordStore,
  createGatedDedupedCustomRead,
  createInflightReadDeduper,
} from "../../shared/storage/configured-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:w0030-identity";
const T = "2026-09-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface SqlCall { text: string; values: readonly unknown[] }
type Payload = Record<string, unknown>;

/** In-memory answers for the identity SQL: routes by the looked-up field, value and collection. */
function fakeIdentityClient(data: { accounts?: Payload[]; profiles?: Payload[] }, options: { failFirst?: number; hold?: Promise<void> } = {}) {
  const calls: SqlCall[] = [];
  let failures = options.failFirst ?? 0;
  return {
    calls,
    client: {
      async query<TRow>(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        if (options.hold) await options.hold;
        if (failures > 0) {
          failures -= 1;
          throw new Error("identity sql failed");
        }
        const collection = values.includes("accounts") ? "accounts" : "profiles";
        const field = /payload ->> 'accountId' =/u.test(text) ? "accountId" : "id";
        const lookup = values[1];
        const rows = (data[collection] ?? []).filter((payload) => payload[field] === lookup).map((payload) => ({ payload, readable: true }));
        return { rows: rows as TRow[] };
      },
    },
  };
}

function spyGate() {
  const checks: Array<string | undefined> = [];
  const gate: ReadBudgetGate = {
    assertAllowed(input) { checks.push(input.collectionName); },
    observe() {},
    snapshot() { return { bytes: 0, maxBytes: null, maxRows: null, open: false, rows: 0, windowMs: 60_000 }; },
  };
  return { checks, gate };
}

function identityProvider(client: { query: ReturnType<typeof fakeIdentityClient>["client"]["query"] }, gate: ReadBudgetGate | null = null) {
  return createStorageAccountSessionProvider({
    identitySql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), gate) },
    requireIdentity: true,
    store: { listRecords() { throw new Error("the full graph must not be read"); } } as never,
    workspaceId: WORKSPACE,
  });
}

function readIdentity(provider: LiveAccountSessionProvider, userId: string) {
  assert.ok(provider.readAccountSessionIdentity, "the provider exposes the lightweight identity read");
  return Promise.resolve(provider.readAccountSessionIdentity({ userId }));
}

/** Column list between the outer `select` and its `from orbit_records`. */
function selectedColumns(text: string): string {
  const match = /^\s*select([\s\S]*?)\bfrom orbit_records\b/iu.exec(text);
  assert.ok(match, "a select statement on orbit_records");
  return match[1]!;
}

// Timestamps may appear inside the readability predicate; nothing else from the record row is selected.
const METADATA_COLUMNS = [
  "workspace_id", "collection_name", "record_id", "user_id", "source_type", "source_id", "source_label", "provider",
  "provider_record_id", "evidence_ids", "target_type", "target_id", "lifecycle_state", "search_text",
];

function assertIdentitySqlShape(call: SqlCall) {
  const columns = selectedColumns(call.text);
  for (const column of METADATA_COLUMNS) {
    assert.doesNotMatch(columns, new RegExp(`\\b${column}\\b`, "u"), `does not select ${column}`);
  }
  assert.deepEqual(columns.match(/\bas \w+\b/gu), ["as payload", "as readable"], "exactly payload and readable are returned");
  assert.match(call.text, /lifecycle_state <> 'deleted'/u);
  assert.doesNotMatch(call.text, /lifecycle_state = 'active'/u);
  assert.match(call.text, /order by coalesce\(occurred_at, updated_at\) desc, updated_at desc/u);
  assert.doesNotMatch(call.text, /\blimit\b/iu);
  const fields = call.values.find(Array.isArray) as string[] | undefined;
  assert.ok(fields, "payload fields are a parameter");
  for (const wide of ["headline", "relationshipGoal", "role", "timezone", "homeMarket", "preferredFollowUpWindow", "preferredLanguage", "avatarDataUrl", "importedDocuments"]) {
    assert.ok(!fields.includes(wide), `payload projection excludes ${wide}`);
  }
}

async function settle<T>(read: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

const profileP = { id: "profile:p", accountId: "account:a", displayName: "Actor P", createdAt: T, updatedAt: T, headline: "wide" };
const accountA = { id: "account:a", name: "Account A", createdAt: T, updatedAt: T };

// ---------------------------------------------------------------------------
// SC-01 SQL shape / statement count (no database)
// ---------------------------------------------------------------------------

test("SC-01 identity read: account-id subject issues profile-by-id, profile-by-accountId, account statements with narrow columns", async () => {
  const fake = fakeIdentityClient({ accounts: [accountA], profiles: [{ ...profileP, id: "profile:account:a" }] });
  const identity = await readIdentity(identityProvider(fake.client), "account:a");
  assert.deepEqual(identity, {
    accounts: [{ id: "account:a" }],
    profiles: [{ accountId: "account:a", displayName: "Actor P", id: "profile:account:a" }],
  });
  assert.equal(fake.calls.length, 3);
  for (const call of fake.calls) assertIdentitySqlShape(call);
  assert.match(fake.calls[0]!.text, /payload ->> 'id' = \$2/u);
  assert.match(fake.calls[1]!.text, /payload ->> 'accountId' = \$2/u);
  assert.deepEqual(fake.calls.map((call) => call.values.slice(0, 3)), [
    [WORKSPACE, "account:a", "profiles"],
    [WORKSPACE, "account:a", "profiles"],
    [WORKSPACE, "account:a", "accounts"],
  ]);
});

test("SC-01 identity read: profile-id subject issues two statements; blank subject issues none", async () => {
  const fake = fakeIdentityClient({ accounts: [accountA], profiles: [profileP] });
  const provider = identityProvider(fake.client);
  assert.deepEqual(await readIdentity(provider, "profile:p"), {
    accounts: [{ id: "account:a" }],
    profiles: [{ accountId: "account:a", displayName: "Actor P", id: "profile:p" }],
  });
  assert.equal(fake.calls.length, 2);
  assert.deepEqual(await readIdentity(provider, "   "), { accounts: [], profiles: [] });
  assert.equal(fake.calls.length, 2, "a blank subject issues no statement");
});

// ---------------------------------------------------------------------------
// SC-02 gate / dedupe / write eviction / failure (no database)
// ---------------------------------------------------------------------------

test("SC-02 (b) an open read-budget gate still lets identity reads through (critical collections) and SQL is issued", async () => {
  const gate = createReadBudgetGate({ maxBytes: null, maxRows: 0, windowMs: 60_000 });
  gate.observe({ approximateSerializedRowBytes: 10, elapsedMs: 1, failed: false, queryCount: 1, queryFingerprint: "x", queryKind: "select", returnedRows: 5 });
  assert.throws(() => gate.assertAllowed({ collectionName: "contacts" }), "gate is open for ordinary collections");
  assert.equal(gate.snapshot().open, true);
  const fake = fakeIdentityClient({ accounts: [accountA], profiles: [profileP] });
  const identity = await readIdentity(identityProvider(fake.client, gate), "profile:p");
  assert.equal(identity.accounts[0]?.id, "account:a");
  assert.equal(fake.calls.length, 2);
});

test("SC-02 (c) concurrent identical resolutions share each statement; a failure is not cached", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const fake = fakeIdentityClient({ accounts: [accountA], profiles: [profileP] }, { hold });
  const { checks, gate } = spyGate();
  const provider = identityProvider(fake.client, gate);
  const first = readIdentity(provider, "profile:p");
  const second = readIdentity(provider, "profile:p");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.calls.length, 1, "one profile statement for two concurrent reads");
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.equal(fake.calls.length, 2, "one account statement for two concurrent reads");
  assert.deepEqual(checks, ["profiles", "profiles", "accounts", "accounts"], "gate checked per logical call");

  const failing = fakeIdentityClient({ accounts: [accountA], profiles: [profileP] }, { failFirst: 1 });
  const failingProvider = identityProvider(failing.client);
  const [x, y] = await Promise.all([settle(() => readIdentity(failingProvider, "profile:p")), settle(() => readIdentity(failingProvider, "profile:p"))]);
  assert.deepEqual([x.ok, y.ok], [false, false], "joined reads share the failure");
  assert.equal(failing.calls.length, 1);
  const retried = await readIdentity(failingProvider, "profile:p");
  assert.equal(retried.accounts[0]?.id, "account:a");
  assert.equal(failing.calls.length, 3, "the failure was not cached: profile and account statements run again");
});

test("SC-02 (d) configured store: a write evicts in-flight identity reads", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let identityReads = 0;
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({
      close: async () => undefined,
      async query<TRow>(text: string) {
        if (/update orbit_records/iu.test(text)) return { rows: [] as TRow[] };
        identityReads += 1;
        await hold;
        return { rows: [] as TRow[] };
      },
    }),
    env: { ORBIT_DATABASE_URL: "postgresql://unused.invalid/w0030-identity-dedupe", ORBIT_WORKSPACE_ID: "workspace:w0030-dedupe" },
  })!;
  const provider = createStorageAccountSessionProvider({
    identitySql: { client: configured.client, read: configured.customRead },
    requireIdentity: true,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  const before = readIdentity(provider, "profile:p");
  const joined = readIdentity(provider, "profile:p");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(identityReads, 1, "identical in-flight reads share one statement");
  await configured.store.deleteRecord({ collectionName: "profiles", deletedAt: T, recordId: "r", workspaceId: configured.workspaceId });
  const after = readIdentity(provider, "profile:p");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(identityReads, 2, "a read started after a store write does not reuse the older in-flight read");
  release();
  await Promise.all([before, joined, after]);
});

test("SC-02 (f) a failing identity statement rejects the read instead of resolving to no account", async () => {
  const fake = fakeIdentityClient({ accounts: [accountA], profiles: [profileP] }, { failFirst: 1 });
  await assert.rejects(readIdentity(identityProvider(fake.client), "profile:p"), /identity sql failed/u);
  const rows = { query: async () => ({ rows: [{ payload: profileP, readable: false }] }) };
  await assert.rejects(readIdentity(identityProvider(rows as never), "profile:p"), /orbit_records/u, "an unreadable timestamp row rejects");
});

test("SC-02 providers without identity SQL map the full graph (no new unbounded reads)", async () => {
  const provider = createStorageAccountSessionProvider({
    requireIdentity: true,
    store: {
      listRecords(query: { collectionName?: string; payloadId?: string }) {
        const payloads = query.collectionName === "accounts" ? [accountA] : [profileP];
        return payloads.filter((payload) => payload.id === query.payloadId).map((payload) => ({
          collectionName: query.collectionName, createdAt: T, evidenceIds: [], payload, updatedAt: T,
        }));
      },
    } as never,
    workspaceId: WORKSPACE,
  });
  assert.deepEqual(await readIdentity(provider, "profile:p"), {
    accounts: [{ id: "account:a" }],
    profiles: [{ accountId: "account:a", displayName: "Actor P", id: "profile:p" }],
  });
});

// ---------------------------------------------------------------------------
// SC-03 resolver wiring: unconfigured / mock
// ---------------------------------------------------------------------------

const DB_ENV_KEYS = ["ORBIT_DATABASE_TARGET", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_WORKSPACE_ID", "ORBIT_MODULE_MODE", "ORBIT_FEATURE_MODE", "ORBIT_EXPECTED_DATABASE_HOST", "ORBIT_EXPECTED_WORKSPACE_ID", "VERCEL_ENV"];

async function withProcessEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(DB_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of DB_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) if (value !== undefined) process.env[key] = value;
  try {
    return await run();
  } finally {
    for (const key of DB_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("SC-03 unconfigured database: mock mode keeps the session actor, live mode resolves to null", async () => {
  const session = { email: "a@example.test", name: null, userId: "profile:p" };
  assert.deepEqual(await withProcessEnv({ ORBIT_MODULE_MODE: "mock" }, () => resolveAuthenticatedApiActorFromSession(session)), {
    accountId: "profile:p", email: "a@example.test", id: "profile:p", name: null, profileId: "profile:p", userId: "profile:p", workspaceId: "workspace:mock-auth",
  });
  assert.equal(await withProcessEnv({ ORBIT_MODULE_MODE: "live" }, () => resolveAuthenticatedApiActorFromSession(session)), null);
});

// ---------------------------------------------------------------------------
// PostgreSQL (orbit_test, temporary schema)
// ---------------------------------------------------------------------------

async function withSchema(run: (input: { pool: Pool; schema: string; schemaUrl: string }) => Promise<void>, timeZone?: string) {
  assert.ok(databaseUrl);
  const schema = `w0030_identity_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}${timeZone ? ` -c TimeZone=${timeZone}` : ""}` });
  const schemaUrl = new URL(databaseUrl);
  schemaUrl.searchParams.set("options", `-c search_path=${schema}`);
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await run({ pool, schema, schemaUrl: schemaUrl.toString() });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

function countingSqlClient(pool: Pool) {
  const calls: SqlCall[] = [];
  return {
    calls,
    client: {
      async query<TRow>(text: string, values?: readonly unknown[]) {
        calls.push({ text, values: values ?? [] });
        return { rows: (await pool.query(text, values as unknown[])).rows as TRow[] };
      },
    },
  };
}

interface Row {
  collection: "accounts" | "profiles";
  createdAt?: string;
  deletedAt?: string | null;
  lifecycle?: "active" | "archived" | "deleted";
  occurredAt?: string | null;
  payload: unknown;
  recordId?: string;
  updatedAt?: string;
  workspaceId?: string;
}

async function insertRows(pool: Pool, workspaceId: string, rows: readonly Row[]) {
  for (const [index, row] of rows.entries()) {
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider,
         provider_record_id, evidence_ids, payload, search_text, created_at, updated_at, occurred_at, lifecycle_state, deleted_at)
       values ($1, $2, $3, 'user:w0030', 'manual', $4, 'W0030 fixture', 'credentials', 'provider:w0030', array['evidence:w0030'],
         $5::jsonb, 'search text', $6::timestamptz, $7::timestamptz, $8::timestamptz, $9, $10::timestamptz)`,
      [row.workspaceId ?? workspaceId, row.collection, row.recordId ?? `${row.collection}:${index}:${randomUUID()}`, `source:${index}`,
        JSON.stringify(row.payload), row.createdAt ?? T, row.updatedAt ?? T, row.occurredAt === undefined ? T : row.occurredAt, row.lifecycle ?? "active", row.deletedAt ?? null],
    );
  }
}

interface Scenario {
  name: string;
  rows: (ws: string) => Row[];
  session: { email?: string | null; name?: string | null; userId: string };
  /** Expected outcome: an account id, null, or "reject"; undefined = equivalence only (depends on the session time zone). */
  expect: string | null | "reject" | undefined;
  expectProfile?: string;
  expectName?: string;
}

const P = (overrides: Payload = {}) => ({ ...profileP, ...overrides });
const A = (overrides: Payload = {}) => ({ ...accountA, ...overrides });

const SCENARIOS: Scenario[] = [
  { name: "session id = profile id", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "session id = account id (fallback by accountId)", session: { userId: "account:a" }, expect: "account:a", expectProfile: "profile:account:a", rows: () => [{ collection: "profiles", payload: P({ id: "profile:account:a" }) }, { collection: "accounts", payload: A() }] },
  { name: "neither profile nor account id", session: { userId: "nobody" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  ...([
    ["missing displayName", { displayName: undefined }],
    ["blank createdAt", { createdAt: "  " }],
    ["numeric accountId", { accountId: 5 }],
  ] as const).map(([label, override]) => ({
    name: `invalid profile hit by id (${label}) does not fall back`,
    session: { userId: "account:a" }, expect: null,
    rows: (): Row[] => [
      { collection: "profiles", payload: P({ id: "account:a", ...override }) },
      { collection: "profiles", payload: P({ id: "profile:valid" }) },
      { collection: "accounts", payload: A() },
    ],
  } satisfies Scenario)),
  { name: "valid profile, account missing", session: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }] },
  { name: "valid profile, account deleted", session: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", lifecycle: "deleted", payload: A() }] },
  { name: "valid profile, account name blank", session: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A({ name: " \t" }) }] },
  {
    name: "duplicate profile ids pick the same (newest) row", session: { userId: "profile:p" }, expect: "account:b", expectName: "Newest",
    rows: () => [
      { collection: "profiles", occurredAt: "2026-01-01T00:00:00Z", payload: P({ displayName: "Older" }) },
      { collection: "profiles", occurredAt: null, updatedAt: "2026-03-01T00:00:00Z", payload: P({ accountId: "account:b", displayName: "Newest" }) },
      { collection: "profiles", occurredAt: "2026-02-01T00:00:00Z", payload: P({ displayName: "Middle" }) },
      { collection: "accounts", payload: A() }, { collection: "accounts", payload: A({ id: "account:b" }) },
    ],
  },
  {
    name: "duplicate profiles on the accountId fallback pick the same row", session: { userId: "account:a" }, expect: "account:a", expectProfile: "profile:second",
    rows: () => [
      { collection: "profiles", occurredAt: "2026-01-01T00:00:00Z", payload: P({ id: "profile:first" }) },
      { collection: "profiles", occurredAt: "2026-02-01T00:00:00Z", payload: P({ id: "profile:second" }) },
      { collection: "profiles", occurredAt: "2026-02-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", payload: P({ id: "profile:tie-older-update" }) },
      { collection: "accounts", payload: A() },
    ],
  },
  { name: "deleted profile is not returned", session: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", lifecycle: "deleted", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "other workspace profile is not returned", session: { userId: "profile:p" }, expect: null, rows: (ws) => [{ collection: "profiles", payload: P(), workspaceId: `${ws}:other` }, { collection: "accounts", payload: A() }] },
  {
    name: "archived invalid profile hit by id still blocks the fallback", session: { userId: "account:a" }, expect: null,
    rows: () => [
      { collection: "profiles", lifecycle: "archived", payload: P({ id: "account:a", displayName: "" }) },
      { collection: "profiles", payload: P({ id: "profile:valid" }) },
      { collection: "accounts", payload: A() },
    ],
  },
  { name: "archived valid profile resolves", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", lifecycle: "archived", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "archived account resolves", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", lifecycle: "archived", payload: A() }] },
  { name: "session name null uses displayName", session: { email: "p@example.test", name: null, userId: "profile:p" }, expect: "account:a", expectName: "Actor P", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "session name wins over displayName", session: { name: "Session Name", userId: "profile:p" }, expect: "account:a", expectName: "Session Name", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "session id with surrounding spaces", session: { userId: " profile:p " }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "whitespace-only session id", session: { userId: "  " }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "profile created_at infinity rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", createdAt: "infinity", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "profile updated_at -infinity rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P(), updatedAt: "-infinity" }, { collection: "accounts", payload: A() }] },
  { name: "account created_at -infinity rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", createdAt: "-infinity", payload: A() }] },
  { name: "account updated_at infinity rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A(), updatedAt: "infinity" }] },
  { name: "invalid profile row with infinite created_at still rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", createdAt: "infinity", payload: P({ displayName: "" }) }] },
  { name: "profile occurred_at infinity does not reject", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", occurredAt: "infinity", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "account occurred_at -infinity does not reject", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", occurredAt: "-infinity", payload: A() }] },
  { name: "profile occurred_at beyond the JS Date range rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", occurredAt: "275760-09-14T00:00:00Z", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "account created_at beyond the JS Date range rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", createdAt: "290000-01-01T00:00:00Z", payload: A() }] },
  { name: "archived profile deleted_at beyond the JS Date range rejects", session: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", deletedAt: "290000-01-01T00:00:00Z", lifecycle: "archived", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "profile deleted_at infinity does not reject", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", deletedAt: "infinity", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "occurred_at at the JS Date maximum (time-zone dependent)", session: { userId: "profile:p" }, expect: undefined, rows: () => [{ collection: "profiles", occurredAt: "275760-09-13T00:00:00Z", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "updated_at at the JS Date maximum (time-zone dependent)", session: { userId: "profile:p" }, expect: undefined, rows: () => [{ collection: "profiles", payload: P(), updatedAt: "275760-09-13T00:00:00Z" }, { collection: "accounts", payload: A() }] },
  { name: "deleted profile with infinite created_at is ignored", session: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", createdAt: "infinity", lifecycle: "deleted", payload: P() }, { collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "account id listed in an invalid fallback profile is still read", session: { userId: "account:a" }, expect: null, rows: () => [{ collection: "profiles", payload: P({ id: "profile:x", displayName: 7 }) }, { collection: "accounts", payload: A() }] },
];

async function assertEquivalent(pool: Pool, scenarios: readonly Scenario[], prefix: string) {
    for (const [index, scenario] of scenarios.entries()) {
      const ws = `${WORKSPACE}:${prefix}:${index}`;
      await insertRows(pool, ws, scenario.rows(ws));
      const oldSql = countingSqlClient(pool);
      const newSql = countingSqlClient(pool);
      const oldProvider = createStorageAccountSessionProvider({ requireIdentity: true, store: createPostgresLiveRecordStore({ client: oldSql.client }), workspaceId: ws });
      const newProvider = createStorageAccountSessionProvider({
        identitySql: { client: newSql.client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
        requireIdentity: true,
        store: createPostgresLiveRecordStore({ client: { query: () => { throw new Error("full read on the new path"); } } }),
        workspaceId: ws,
      });
      const resolve = (graph: Parameters<typeof resolveAuthenticatedApiActorIdentity>[0]["graph"]) =>
        resolveAuthenticatedApiActorIdentity({ graph, mode: "live", session: scenario.session, workspaceId: ws });
      const before = await settle(async () => resolve(await oldProvider.readAccountSessionGraph({ userId: scenario.session.userId })));
      const after = await settle(async () => resolve(await readIdentity(newProvider, scenario.session.userId)));
      assert.deepEqual(after, before, scenario.name);
      assert.equal(newSql.calls.length, oldSql.calls.length, `${scenario.name}: same statement count`);
      for (const call of newSql.calls) assertIdentitySqlShape(call);
      if (scenario.expect === undefined) {
        continue;
      } else if (scenario.expect === "reject") {
        assert.equal(before.ok, false, `${scenario.name}: old read rejects`);
      } else {
        assert.ok(before.ok, `${scenario.name}: old read resolves`);
        assert.equal(before.value?.id ?? null, scenario.expect, scenario.name);
        if (scenario.expectProfile) assert.equal(before.value?.profileId, scenario.expectProfile, scenario.name);
        if (scenario.expectName) assert.equal(before.value?.name, scenario.expectName, scenario.name);
      }
    }
}

test("SC-01 PG equivalence: old graph and new identity resolve to the same actor (incl. null and reject) with the same statement count", pgSkip, async () => {
  await withSchema(async ({ pool }) => assertEquivalent(pool, SCENARIOS, "default"));
});

test("SC-01 PG equivalence at the JS Date range boundary in several session time zones", pgSkip, async () => {
  const boundary = SCENARIOS.filter((scenario) => /JS Date|infinity/u.test(scenario.name)).map((scenario) => ({ ...scenario, expect: undefined }));
  assert.ok(boundary.length >= 5);
  for (const timeZone of ["UTC", "Asia/Shanghai", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    await withSchema(async ({ pool }) => assertEquivalent(pool, boundary, timeZone), timeZone);
  }
});

test("SC-01/SC-03 PG: identity SQL drops metadata columns and wide payload fields; the full graph read is unchanged", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await insertRows(pool, WORKSPACE, [
      { collection: "profiles", payload: P({ avatarDataUrl: `data:image/png;base64,${"A".repeat(2000)}`, importedDocuments: [{ body: "doc" }], relationshipGoal: "goal", role: "founder" }) },
      { collection: "accounts", payload: A() },
    ]);
    const sql = countingSqlClient(pool);
    const client = sql.client;
    const plain = createStorageAccountSessionProvider({ requireIdentity: true, store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE });
    const withIdentity = createStorageAccountSessionProvider({
      identitySql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      requireIdentity: true,
      store: createPostgresLiveRecordStore({ client }),
      workspaceId: WORKSPACE,
    });
    const graph = await plain.readAccountSessionGraph({ userId: "profile:p" });
    assert.deepEqual(await withIdentity.readAccountSessionGraph({ userId: "profile:p" }), graph, "readAccountSessionGraph output is unchanged");
    assert.deepEqual(graph.evidenceIds, ["evidence:w0030"]);
    assert.equal(graph.profiles[0]?.relationshipGoal, "goal");
    sql.calls.length = 0;
    const raw = await pool.query(
      `select payload from orbit_records where workspace_id = $1 and collection_name = 'profiles'`, [WORKSPACE],
    );
    assert.ok(raw.rows[0].payload.avatarDataUrl, "fixture has wide fields");
    const captured: unknown[] = [];
    const capturing = createStorageAccountSessionProvider({
      identitySql: {
        client: { async query<TRow>(text: string, values?: readonly unknown[]) {
          const rows = (await pool.query(text, values as unknown[])).rows as TRow[];
          captured.push(...rows);
          return { rows };
        } },
        read: createGatedDedupedCustomRead(createInflightReadDeduper(), null),
      },
      requireIdentity: true,
      store: createPostgresLiveRecordStore({ client }),
      workspaceId: WORKSPACE,
    });
    await readIdentity(capturing, "profile:p");
    assert.equal(captured.length, 2);
    for (const row of captured as Array<Record<string, unknown>>) {
      assert.deepEqual(Object.keys(row).sort(), ["payload", "readable"]);
      assert.equal(row.readable, true);
    }
    const [profileRow, accountRow] = captured as Array<{ payload: Payload }>;
    assert.deepEqual(Object.keys(profileRow!.payload).sort(), ["accountId", "createdAt", "displayName", "id", "updatedAt"]);
    assert.deepEqual(Object.keys(accountRow!.payload).sort(), ["createdAt", "id", "name", "updatedAt"]);
  });
});

test("SC-02 (a) PG: gate checks per statement carry the same collection names as the old path", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await insertRows(pool, WORKSPACE, [
      { collection: "profiles", payload: P() },
      { collection: "profiles", payload: P({ id: "profile:account:b", accountId: "account:b" }) },
      { collection: "accounts", payload: A() },
      { collection: "accounts", payload: A({ id: "account:b" }) },
    ]);
    const client = countingSqlClient(pool).client;
    for (const [userId, expected] of [["account:b", ["profiles", "profiles", "accounts"]], ["profile:p", ["profiles", "accounts"]]] as const) {
      const oldGate = spyGate();
      const newGate = spyGate();
      const oldProvider = createStorageAccountSessionProvider({
        requireIdentity: true, store: createReadBudgetGatedLiveRecordStore(createPostgresLiveRecordStore({ client }), oldGate.gate), workspaceId: WORKSPACE,
      });
      const newProvider = createStorageAccountSessionProvider({
        identitySql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), newGate.gate) },
        requireIdentity: true, store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE,
      });
      await oldProvider.readAccountSessionGraph({ userId });
      await readIdentity(newProvider, userId);
      assert.deepEqual(oldGate.checks, expected, `old path (${userId})`);
      assert.deepEqual(newGate.checks, oldGate.checks, `new path (${userId})`);
    }
  });
});

/** Captures every pg Pool query (text, rows) issued while `run` executes. */
async function capturePoolQueries<T>(run: () => Promise<T>) {
  const calls: Array<{ text: string; rows: readonly unknown[] }> = [];
  const original = Pool.prototype.query;
  Pool.prototype.query = async function patched(this: Pool, ...args: unknown[]) {
    const result = await (original as (...input: unknown[]) => Promise<{ rows: unknown[] }>).apply(this, args);
    calls.push({ rows: result.rows, text: String(args[0]) });
    return result;
  } as typeof Pool.prototype.query;
  try {
    return { calls, value: await run() };
  } finally {
    Pool.prototype.query = original;
  }
}

test("SC-02 (e) PG configured provider: identity SQL goes through configured.client and the shared gate meters its rows and bytes", pgSkip, async () => {
  await withSchema(async ({ pool, schemaUrl }) => {
    const ws = `${WORKSPACE}:metered`;
    await insertRows(pool, ws, [{ collection: "profiles", payload: P({ id: "profile:account:a" }) }, { collection: "accounts", payload: A() }]);
    const env = { ORBIT_EVENT_DATABASE_URL: schemaUrl, ORBIT_READ_BUDGET_BYTES_PER_MINUTE: "1000000000", ORBIT_WORKSPACE_ID: ws };
    const configured = createConfiguredPostgresLiveRecordStore({ env })!;
    let configuredClientQueries = 0;
    const query = configured.client.query.bind(configured.client);
    configured.client.query = ((text: string, values?: readonly unknown[]) => {
      configuredClientQueries += 1;
      return query(text, values);
    }) as typeof configured.client.query;
    try {
      const provider = createConfiguredStorageAccountSessionProvider({ env })!;
      const gate = resolveSharedReadBudgetGate(env)!;
      assert.ok(gate, "gate configured by env");
      const before = gate.snapshot();
      const { calls, value } = await capturePoolQueries(() => readIdentity(provider, "account:a"));
      const after = gate.snapshot();
      assert.equal(value.accounts[0]?.id, "account:a");
      assert.equal(calls.length, 3, "three identity statements");
      assert.equal(configuredClientQueries, 3, "every statement went through configured.client");
      const rows = calls.reduce((sum, call) => sum + call.rows.length, 0);
      const bytes = calls.reduce((sum, call) => sum + call.rows.reduce<number>((total, row) => total + Buffer.byteLength(JSON.stringify(row), "utf8"), 0), 0);
      assert.equal(rows, 2);
      assert.ok(bytes > 0);
      assert.equal(after.rows - before.rows, rows, "gate observed the returned rows");
      assert.equal(after.bytes - before.bytes, bytes, "gate observed the returned bytes");
      for (const call of calls) assertIdentitySqlShape({ text: call.text, values: [WORKSPACE, "x", "profiles", ["id"]] });
    } finally {
      await configured.client.close();
    }
  });
});

test("SC-03 PG configured database: resolveAuthenticatedApiActorFromSession uses only the identity read", pgSkip, async () => {
  await withSchema(async ({ pool, schemaUrl }) => {
    const ws = `${WORKSPACE}:resolver`;
    await insertRows(pool, ws, [{ collection: "profiles", payload: P({ id: "profile:account:a" }) }, { collection: "accounts", payload: A() }]);
    await withProcessEnv({ ORBIT_EVENT_DATABASE_URL: schemaUrl, ORBIT_MODULE_MODE: "live", ORBIT_WORKSPACE_ID: ws }, async () => {
      try {
        const { calls, value } = await capturePoolQueries(() => resolveAuthenticatedApiActorFromSession({ email: null, name: null, userId: "account:a" }));
        assert.deepEqual(value, {
          accountId: "account:a", email: null, id: "account:a", name: "Actor P", profileId: "profile:account:a", userId: "account:a", workspaceId: ws,
        });
        assert.equal(calls.length, 3);
        for (const call of calls) {
          assert.doesNotMatch(call.text, /evidence_ids|record_id|search_text/u, "no full-graph statement");
          assert.match(call.text, /as readable/u, "identity statement");
        }
      } finally {
        await createConfiguredPostgresLiveRecordStore()?.client.close();
      }
    });
  });
});
