/**
 * W0031：`/api/account/me` 的账号会话服务改用轻量读取（`readAccountSessionView`）。
 *
 * SC-03 等价：本机 PostgreSQL 临时 schema 造数，每个场景分别用旧路径（`readAccountSessionGraph`）与新路径
 *   读取，图（accounts、profiles、evidenceIds、generatedAt）与 reject 深相等、语句数相同；再经
 *   `createLiveAccountSessionService` 生成 `/api/account/me` 的 data，深相等。SQL 只返回 payload、
 *   updated_at、evidence_ids、readable。闸门集合名、in-flight 去重、失败不缓存、写入驱逐、配置层计量同 W0030；
 *   与 W0030 身份读取同 identity 并发时去重 key 不相撞，各自计量，写入后两者都重新发 SQL。
 * 接线：配置的 PG provider 下 `/api/account/me` 只走轻量读取（身份 + 会话视图），完整图 0 次。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createAccountMeGetHandler } from "../../app/api/account/me/handler";
import { resolveAuthenticatedApiActorFromSession } from "../../app/api/_shared/authenticated-actor";
import { createLiveAccountSessionService } from "../../features/account/live-service";
import {
  createConfiguredStorageAccountSessionProvider,
  createStorageAccountSessionProvider,
  type LiveAccountSessionGraph,
  type LiveAccountSessionProvider,
} from "../../features/account/storage/account-live-record-provider";
import {
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
const WORKSPACE = "workspace:w0031-session-view";
const T = "2026-09-01T00:00:00.000Z";

interface SqlCall { text: string; values: readonly unknown[] }
type Payload = Record<string, unknown>;

const profileP = { id: "profile:p", accountId: "account:a", displayName: "Actor P", createdAt: T, updatedAt: T, headline: "Headline", role: "founder", timezone: "Asia/Tokyo", relationshipGoal: "goal", homeMarket: "Japan", preferredFollowUpWindow: "48h", preferredLanguage: "en" };
const accountA = { id: "account:a", name: "Account A", createdAt: T, updatedAt: T };

const isView = (text: string) => /\bevidence_ids\b/u.test(text) && /as readable/u.test(text);
const isIdentity = (text: string) => /as readable/u.test(text) && !/\bevidence_ids\b/u.test(text);

/** In-memory answers for the lightweight SQL (both identity and session view shapes). */
function fakeSqlClient(data: { accounts?: Payload[]; profiles?: Payload[] }, options: { failFirst?: number; hold?: Promise<void> } = {}) {
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
          throw new Error("session sql failed");
        }
        const collection = values.includes("accounts") ? "accounts" : "profiles";
        const field = /payload ->> 'accountId' =/u.test(text) ? "accountId" : "id";
        const rows = (data[collection] ?? []).filter((payload) => payload[field] === values[1]).map((payload) => isView(text)
          ? { evidence_ids: ["evidence:fake"], payload, readable: true, updated_at: new Date(T) }
          : { payload, readable: true });
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

function viewProvider(client: { query: ReturnType<typeof fakeSqlClient>["client"]["query"] }, gate: ReadBudgetGate | null = null) {
  return createStorageAccountSessionProvider({
    identitySql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), gate) },
    requireIdentity: true,
    store: { listRecords() { throw new Error("the full graph must not be read"); } } as never,
    workspaceId: WORKSPACE,
  });
}

function readView(provider: LiveAccountSessionProvider, identity: { userId?: string; accountId?: string; profileId?: string }) {
  assert.ok(provider.readAccountSessionView, "the provider exposes the session view read");
  return Promise.resolve(provider.readAccountSessionView(identity));
}

function selectedColumns(text: string): string {
  const match = /^\s*select([\s\S]*?)\bfrom orbit_records\b/iu.exec(text);
  assert.ok(match, "a select statement on orbit_records");
  return match[1]!;
}

// Everything `rowToRecord` reads that the session graph does not need. Timestamps may appear only
// inside the readability predicate (and updated_at as its own column).
const DROPPED_COLUMNS = [
  "workspace_id", "collection_name", "record_id", "user_id", "source_type", "source_id", "source_label", "provider",
  "provider_record_id", "target_type", "target_id", "lifecycle_state", "search_text",
];

function assertViewSqlShape(call: SqlCall) {
  const columns = selectedColumns(call.text);
  for (const column of DROPPED_COLUMNS) {
    assert.doesNotMatch(columns, new RegExp(`\\b${column}\\b`, "u"), `does not select ${column}`);
  }
  assert.deepEqual(columns.match(/\bas \w+\b/gu), ["as payload", "as readable"]);
  assert.match(columns, /^\s*\(select[\s\S]*as payload,\s*updated_at,\s*evidence_ids,/u, "payload, updated_at, evidence_ids, readable");
  assert.match(call.text, /lifecycle_state <> 'deleted'/u);
  assert.doesNotMatch(call.text, /lifecycle_state = 'active'/u);
  assert.match(call.text, /order by coalesce\(occurred_at, updated_at\) desc, updated_at desc/u);
  assert.doesNotMatch(call.text, /\blimit\b/iu);
  const fields = call.values.find(Array.isArray) as string[] | undefined;
  assert.ok(fields, "payload fields are a parameter");
  for (const wide of ["avatarDataUrl", "importedDocuments", "email", "searchText"]) assert.ok(!fields.includes(wide), `payload projection excludes ${wide}`);
}

async function settle<T>(read: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// statements, shape, fallbacks (no database)
// ---------------------------------------------------------------------------

test("session view: account-id subject issues profile-by-id, profile-by-accountId, account statements with narrow columns", async () => {
  const fake = fakeSqlClient({ accounts: [accountA], profiles: [{ ...profileP, id: "profile:account:a" }] });
  const graph = await readView(viewProvider(fake.client), { userId: "account:a" });
  assert.deepEqual(graph.accounts, [accountA]);
  assert.equal(graph.profiles[0]?.id, "profile:account:a");
  assert.equal(graph.profiles[0]?.relationshipGoal, "goal");
  assert.deepEqual(graph.evidenceIds, ["evidence:fake"]);
  assert.equal(graph.generatedAt, T);
  assert.equal(fake.calls.length, 3);
  for (const call of fake.calls) assertViewSqlShape(call);
  assert.deepEqual(fake.calls.map((call) => call.values.slice(0, 3)), [
    [WORKSPACE, "account:a", "profiles"],
    [WORKSPACE, "account:a", "profiles"],
    [WORKSPACE, "account:a", "accounts"],
  ]);
});

test("session view: blank subject (demoSignIn) and providers without SQL use the full read; no new unbounded read", async () => {
  const fake = fakeSqlClient({ accounts: [accountA], profiles: [profileP] });
  const provider = viewProvider(fake.client);
  assert.deepEqual(await readView(provider, { userId: "  " }), await provider.readAccountSessionGraph({ userId: "  " }));
  assert.deepEqual(await readView(provider, {}), { accounts: [], profiles: [], evidenceIds: ["evidence:account-identity-required"], generatedAt: new Date(0).toISOString() });
  assert.equal(fake.calls.length, 0);
  let listed = 0;
  const plain = createStorageAccountSessionProvider({
    requireIdentity: true,
    store: { listRecords(query: { collectionName?: string; payloadId?: string }) {
      listed += 1;
      const payloads = query.collectionName === "accounts" ? [accountA] : [profileP];
      return payloads.filter((payload) => payload.id === query.payloadId).map((payload) => ({ collectionName: query.collectionName, createdAt: T, evidenceIds: ["e"], payload, updatedAt: T }));
    } } as never,
    workspaceId: WORKSPACE,
  });
  const graph = await readView(plain, { userId: "profile:p" });
  assert.equal(graph.accounts[0]?.id, "account:a");
  assert.equal(listed, 2, "the full read decides without identity SQL");
});

test("session view: gate per logical call with the old collection names; concurrent identical reads share each statement; failures are not cached", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const fake = fakeSqlClient({ accounts: [accountA], profiles: [profileP] }, { hold });
  const { checks, gate } = spyGate();
  const provider = viewProvider(fake.client, gate);
  const first = readView(provider, { userId: "profile:p" });
  const second = readView(provider, { userId: "profile:p" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.calls.length, 1, "one profile statement for two concurrent reads");
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.equal(fake.calls.length, 2);
  assert.deepEqual(checks, ["profiles", "profiles", "accounts", "accounts"]);

  const failing = fakeSqlClient({ accounts: [accountA], profiles: [profileP] }, { failFirst: 1 });
  const failingProvider = viewProvider(failing.client);
  const [x, y] = await Promise.all([settle(() => readView(failingProvider, { userId: "profile:p" })), settle(() => readView(failingProvider, { userId: "profile:p" }))]);
  assert.deepEqual([x.ok, y.ok], [false, false]);
  assert.equal(failing.calls.length, 1);
  assert.equal((await readView(failingProvider, { userId: "profile:p" })).accounts[0]?.id, "account:a");
  assert.equal(failing.calls.length, 3, "the failure was not cached");
  const unreadable = { query: async () => ({ rows: [{ evidence_ids: [], payload: profileP, readable: false, updated_at: T }] }) };
  await assert.rejects(readView(viewProvider(unreadable as never), { userId: "profile:p" }), /orbit_records/u);
});

test("session view and W0030 identity read of the same subject on one configured store: separate statements, both evicted by a write", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const executed: string[] = [];
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({
      close: async () => undefined,
      async query<TRow>(text: string, values: readonly unknown[] = []) {
        if (/update orbit_records/iu.test(text)) return { rows: [] as TRow[] };
        executed.push(isView(text) ? "view" : isIdentity(text) ? "identity" : "other");
        await hold;
        const collection = values.includes("accounts") ? "accounts" : "profiles";
        const payload = collection === "accounts" ? accountA : profileP;
        if (values[1] !== payload.id) return { rows: [] as TRow[] };
        return { rows: [isView(text) ? { evidence_ids: ["evidence:x"], payload, readable: true, updated_at: new Date(T) } : { payload, readable: true }] as TRow[] };
      },
    }),
    env: { ORBIT_DATABASE_URL: "postgresql://unused.invalid/w0031-session-view", ORBIT_WORKSPACE_ID: "workspace:w0031-cross" },
  })!;
  const provider = createStorageAccountSessionProvider({
    identitySql: { client: configured.client, read: configured.customRead },
    requireIdentity: true,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  const identity = provider.readAccountSessionIdentity!({ userId: "profile:p" });
  const view = readView(provider, { userId: "profile:p" });
  const identityJoined = provider.readAccountSessionIdentity!({ userId: "profile:p" });
  const viewJoined = readView(provider, { userId: "profile:p" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(executed.sort(), ["identity", "view"], "the two purposes never share a statement; same purposes do");
  await configured.store.deleteRecord({ collectionName: "profiles", deletedAt: T, recordId: "r", workspaceId: configured.workspaceId });
  const identityAfter = provider.readAccountSessionIdentity!({ userId: "profile:p" });
  const viewAfter = readView(provider, { userId: "profile:p" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(executed.sort(), ["identity", "identity", "view", "view"], "reads started after the write issue their own statements");
  release();
  const [id1, v1, id2, v2, id3, v3] = await Promise.all([identity, view, identityJoined, viewJoined, identityAfter, viewAfter]);
  for (const result of [id1, id2, id3]) assert.deepEqual(result, { accounts: [{ id: "account:a" }], profiles: [{ accountId: "account:a", displayName: "Actor P", id: "profile:p" }] });
  for (const result of [v1, v2, v3]) {
    assert.deepEqual(result.evidenceIds, ["evidence:x"], "the view got its own rows (with evidence ids)");
    assert.equal(result.generatedAt, T);
    assert.equal(result.profiles[0]?.headline, "Headline");
  }
});

test("account session service prefers the session view and falls back to the full graph", async () => {
  const graph: LiveAccountSessionGraph = { accounts: [accountA], evidenceIds: ["e"], generatedAt: T, profiles: [{ ...profileP, preferredLanguage: "en" }] };
  let views = 0;
  let graphs = 0;
  const base = { source: "s", sourceLabel: "l", readAccountSessionGraph: () => { graphs += 1; return graph; } };
  const withView = createLiveAccountSessionService({ provider: { ...base, readAccountSessionView: () => { views += 1; return graph; } } });
  const withoutView = createLiveAccountSessionService({ provider: base });
  const identity = { accountId: "account:a", profileId: "profile:p", userId: "profile:p" };
  const a = await withView.getCurrentSession(identity);
  assert.deepEqual([views, graphs], [1, 0]);
  const b = await withoutView.getCurrentSession(identity);
  assert.deepEqual([views, graphs], [1, 1]);
  assert.deepEqual(a, b);
  await withView.demoSignIn();
  assert.deepEqual([views, graphs], [2, 1], "demoSignIn goes through the view too (it delegates without a subject)");
});

// ---------------------------------------------------------------------------
// PostgreSQL (orbit_test, temporary schema)
// ---------------------------------------------------------------------------

async function withSchema(run: (input: { pool: Pool; schema: string; schemaUrl: string }) => Promise<void>, timeZone?: string) {
  assert.ok(databaseUrl);
  const schema = `w0031_view_${randomUUID().replaceAll("-", "")}`;
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
  const calls: Array<SqlCall & { rows: readonly unknown[] }> = [];
  return {
    calls,
    client: {
      async query<TRow>(text: string, values?: readonly unknown[]) {
        const rows = (await pool.query(text, values as unknown[])).rows as TRow[];
        calls.push({ rows, text, values: values ?? [] });
        return { rows };
      },
    },
  };
}

interface Row {
  collection: "accounts" | "profiles";
  createdAt?: string;
  deletedAt?: string | null;
  evidence?: string[] | null;
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
       values ($1, $2, $3, 'user:w0031', 'manual', $4, 'W0031 fixture', 'credentials', 'provider:w0031', $11::text[],
         $5::jsonb, 'search text', $6::timestamptz, $7::timestamptz, $8::timestamptz, $9, $10::timestamptz)`,
      [row.workspaceId ?? workspaceId, row.collection, row.recordId ?? `${row.collection}:${index}:${randomUUID()}`, `source:${index}`,
        JSON.stringify(row.payload), row.createdAt ?? T, row.updatedAt ?? T, row.occurredAt === undefined ? T : row.occurredAt, row.lifecycle ?? "active", row.deletedAt ?? null,
        row.evidence === undefined ? ["evidence:w0031"] : row.evidence],
    );
  }
}

interface Scenario {
  name: string;
  rows: (ws: string) => Row[];
  subject: { userId?: string; accountId?: string; profileId?: string };
  /** "reject" = both reject; "account:x" = selected account; null = empty-store payload; undefined = equivalence only. */
  expect: string | null | "reject" | undefined;
}

const P = (overrides: Payload = {}) => ({ ...profileP, ...overrides });
const A = (overrides: Payload = {}) => ({ ...accountA, ...overrides });
const pa = (): Row[] => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A() }];

const SCENARIOS: Scenario[] = [
  { name: "by profile id", subject: { userId: "profile:p" }, expect: "account:a", rows: pa },
  // A bare account id as userId is also the requested profile id, so the service selects nothing (as before).
  { name: "by account id (fallback by accountId)", subject: { userId: "account:a" }, expect: null, rows: () => [{ collection: "profiles", payload: P({ id: "profile:account:a" }) }, { collection: "accounts", payload: A() }] },
  { name: "handler identity (accountId + profileId + userId)", subject: { accountId: "account:a", profileId: "profile:account:a", userId: "account:a" }, expect: "account:a", rows: () => [{ collection: "profiles", payload: P({ id: "profile:account:a" }) }, { collection: "accounts", payload: A() }] },
  { name: "no hit (empty-store payload)", subject: { userId: "nobody" }, expect: null, rows: pa },
  ...([
    ["missing displayName", { displayName: undefined }],
    ["blank createdAt", { createdAt: "  " }],
    ["numeric accountId", { accountId: 5 }],
  ] as const).map(([label, override]) => ({
    name: `invalid profile hit by id (${label}) blocks the fallback and still counts for generatedAt/evidenceIds`,
    subject: { userId: "account:a" }, expect: null,
    rows: (): Row[] => [
      { collection: "profiles", evidence: ["evidence:invalid"], payload: P({ id: "account:a", ...override }), updatedAt: "2026-09-20T00:00:00Z" },
      { collection: "profiles", payload: P({ id: "profile:valid" }) },
      { collection: "accounts", payload: A() },
    ],
  } satisfies Scenario)),
  { name: "account missing", subject: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }] },
  { name: "account deleted", subject: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", lifecycle: "deleted", payload: A() }] },
  { name: "account name blank (invalid account still counts)", subject: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", evidence: ["evidence:bad-account"], payload: A({ name: " " }), updatedAt: "2026-09-21T00:00:00Z" }] },
  {
    name: "duplicate profile ids", subject: { userId: "profile:p" }, expect: "account:b",
    rows: () => [
      { collection: "profiles", occurredAt: "2026-01-01T00:00:00Z", payload: P({ displayName: "Older" }) },
      { collection: "profiles", occurredAt: null, updatedAt: "2026-03-01T00:00:00Z", payload: P({ accountId: "account:b", displayName: "Newest" }) },
      { collection: "accounts", payload: A() }, { collection: "accounts", payload: A({ id: "account:b" }) },
    ],
  },
  { name: "deleted profile", subject: { userId: "profile:p" }, expect: null, rows: () => [{ collection: "profiles", lifecycle: "deleted", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "other workspace", subject: { userId: "profile:p" }, expect: null, rows: (ws) => [{ collection: "profiles", payload: P(), workspaceId: `${ws}:other` }, { collection: "accounts", payload: A() }] },
  { name: "archived profile and account", subject: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", lifecycle: "archived", payload: P() }, { collection: "accounts", lifecycle: "archived", payload: A() }] },
  {
    name: "display fields missing or not strings (optionalString, language fallback)", subject: { userId: "profile:p" }, expect: "account:a",
    rows: () => [{ collection: "profiles", payload: P({ headline: 5, role: undefined, timezone: " ", homeMarket: null, preferredFollowUpWindow: ["x"], preferredLanguage: "xx", relationshipGoal: {} }) }, { collection: "accounts", payload: A() }],
  },
  { name: "evidence_ids empty on every row", subject: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", evidence: [], payload: P() }, { collection: "accounts", evidence: [], payload: A() }] },
  {
    name: "evidence_ids several per row, duplicated across rows", subject: { userId: "profile:p" }, expect: "account:a",
    rows: () => [{ collection: "profiles", evidence: ["e:2", "e:1", "e:2"], payload: P() }, { collection: "accounts", evidence: ["e:1", "e:3"], payload: A() }],
  },
  { name: "latest updated_at across rows (account newer)", subject: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", payload: P(), updatedAt: "2026-09-02T03:04:05.678Z" }, { collection: "accounts", payload: A(), updatedAt: "2026-09-10T00:00:00.001Z" }] },
  { name: "profile created_at infinity rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", createdAt: "infinity", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "profile updated_at -infinity rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P(), updatedAt: "-infinity" }, { collection: "accounts", payload: A() }] },
  { name: "account created_at -infinity rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", createdAt: "-infinity", payload: A() }] },
  { name: "account updated_at infinity rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", payload: A(), updatedAt: "infinity" }] },
  { name: "profile occurred_at infinity does not reject", subject: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", occurredAt: "infinity", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "profile deleted_at infinity does not reject", subject: { userId: "profile:p" }, expect: "account:a", rows: () => [{ collection: "profiles", deletedAt: "infinity", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "profile occurred_at beyond the JS Date range rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", occurredAt: "275760-09-14T00:00:00Z", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "account created_at beyond the JS Date range rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", payload: P() }, { collection: "accounts", createdAt: "290000-01-01T00:00:00Z", payload: A() }] },
  { name: "archived profile deleted_at beyond the JS Date range rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", deletedAt: "290000-01-01T00:00:00Z", lifecycle: "archived", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "occurred_at at the JS Date maximum (time-zone dependent)", subject: { userId: "profile:p" }, expect: undefined, rows: () => [{ collection: "profiles", occurredAt: "275760-09-13T00:00:00Z", payload: P() }, { collection: "accounts", payload: A() }] },
  { name: "updated_at at the JS Date maximum (time-zone dependent)", subject: { userId: "profile:p" }, expect: undefined, rows: () => [{ collection: "profiles", payload: P(), updatedAt: "275760-09-13T00:00:00Z" }, { collection: "accounts", payload: A() }] },
  { name: "invalid row with infinite created_at rejects", subject: { userId: "profile:p" }, expect: "reject", rows: () => [{ collection: "profiles", createdAt: "infinity", payload: P({ displayName: "" }) }] },
];

async function assertEquivalent(pool: Pool, scenarios: readonly Scenario[], prefix: string) {
  for (const [index, scenario] of scenarios.entries()) {
    const ws = `${WORKSPACE}:${prefix}:${index}`;
    await insertRows(pool, ws, scenario.rows(ws));
    const oldSql = countingSqlClient(pool);
    const newSql = countingSqlClient(pool);
    const oldProvider = createStorageAccountSessionProvider({ requireIdentity: true, store: createPostgresLiveRecordStore({ client: oldSql.client }), workspaceId: ws, source: "src", sourceLabel: "label" });
    const newProvider = createStorageAccountSessionProvider({
      identitySql: { client: newSql.client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      requireIdentity: true,
      store: createPostgresLiveRecordStore({ client: { query: () => { throw new Error("full read on the new path"); } } }),
      workspaceId: ws, source: "src", sourceLabel: "label",
    });
    const before = await settle(() => oldProvider.readAccountSessionGraph(scenario.subject));
    const after = await settle(() => readView(newProvider, scenario.subject));
    assert.deepEqual(after, before, scenario.name);
    assert.equal(newSql.calls.length, oldSql.calls.length, `${scenario.name}: same statement count`);
    for (const call of newSql.calls) {
      assertViewSqlShape(call);
      for (const row of call.rows) assert.deepEqual(Object.keys(row as object).sort(), ["evidence_ids", "payload", "readable", "updated_at"]);
    }
    // `/api/account/me` data through the account session service (success and empty-store payloads).
    const oldService = createLiveAccountSessionService({ provider: { ...oldProvider, readAccountSessionView: undefined } });
    const newService = createLiveAccountSessionService({ provider: newProvider });
    const oldData = await settle(() => oldService.getCurrentSession(scenario.subject));
    const newData = await settle(() => newService.getCurrentSession(scenario.subject));
    assert.deepEqual(newData, oldData, `${scenario.name}: /api/account/me data`);
    if (scenario.expect === undefined) continue;
    if (scenario.expect === "reject") {
      assert.equal(before.ok, false, `${scenario.name}: old read rejects`);
      continue;
    }
    assert.ok(before.ok && oldData.ok && oldData.value.success, scenario.name);
    const data = oldData.ok && oldData.value.success ? oldData.value.data : null;
    assert.equal(data?.account?.id ?? null, scenario.expect, scenario.name);
  }
}

test("SC-03 PG equivalence: session view graph and /api/account/me data equal the full graph's (incl. rejects) with the same statement count", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await assertEquivalent(pool, SCENARIOS, "default");
    // Spot checks of what the matrix compares.
    const ws = `${WORKSPACE}:spot`;
    await insertRows(pool, ws, SCENARIOS.find((s) => s.name.startsWith("evidence_ids several"))!.rows(ws));
    const provider = createStorageAccountSessionProvider({
      identitySql: { client: countingSqlClient(pool).client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      requireIdentity: true, store: createPostgresLiveRecordStore({ client: countingSqlClient(pool).client }), workspaceId: ws,
    });
    assert.deepEqual((await readView(provider, { userId: "profile:p" })).evidenceIds, ["e:1", "e:3", "e:2"], "account rows first, then profiles, de-duplicated");
    const invalidWs = `${WORKSPACE}:spot-invalid`;
    await insertRows(pool, invalidWs, SCENARIOS.find((s) => s.name.includes("blank createdAt"))!.rows(invalidWs));
    const invalid = createStorageAccountSessionProvider({
      identitySql: { client: countingSqlClient(pool).client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      requireIdentity: true, store: createPostgresLiveRecordStore({ client: countingSqlClient(pool).client }), workspaceId: invalidWs,
    });
    const graph = await readView(invalid, { userId: "account:a" });
    assert.deepEqual(graph.profiles, [], "the invalid profile is skipped");
    assert.deepEqual(graph.evidenceIds, ["evidence:w0031", "evidence:invalid"], "…but its account is still read and its evidence counts");
    assert.equal(graph.generatedAt, "2026-09-20T00:00:00.000Z", "…and so does its updated_at");
  });
});

test("SC-03 PG equivalence at the JS Date range boundary in several session time zones", pgSkip, async () => {
  const boundary = SCENARIOS.filter((scenario) => /JS Date|infinity|latest updated_at/u.test(scenario.name)).map((scenario) => ({ ...scenario, expect: undefined }));
  assert.ok(boundary.length >= 5);
  for (const timeZone of ["UTC", "Asia/Shanghai", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    await withSchema(async ({ pool }) => assertEquivalent(pool, boundary, timeZone), timeZone);
  }
});

test("SC-03 PG: gate checks per statement carry the same collection names as the full read", pgSkip, async () => {
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
      await readView(newProvider, { userId });
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

const bytesOf = (calls: ReadonlyArray<{ rows: readonly unknown[] }>) =>
  calls.reduce((sum, call) => sum + call.rows.reduce<number>((total, row) => total + Buffer.byteLength(JSON.stringify(row), "utf8"), 0), 0);
const rowsOf = (calls: ReadonlyArray<{ rows: readonly unknown[] }>) => calls.reduce((sum, call) => sum + call.rows.length, 0);

test("SC-03 PG configured provider: view SQL goes through configured.client and the shared gate meters it, separately from and together with the identity read", pgSkip, async () => {
  await withSchema(async ({ pool, schemaUrl }) => {
    const ws = `${WORKSPACE}:metered`;
    await insertRows(pool, ws, [{ collection: "profiles", payload: P({ id: "profile:account:a", avatarDataUrl: `data:image/png;base64,${"A".repeat(4000)}` }) }, { collection: "accounts", payload: A() }]);
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
      const metered = async <T>(run: () => Promise<T>) => {
        const before = gate.snapshot();
        const captured = await capturePoolQueries(run);
        const after = gate.snapshot();
        return { ...captured, bytes: after.bytes - before.bytes, rows: after.rows - before.rows };
      };
      const view = await metered(() => readView(provider, { userId: "account:a" }));
      assert.equal(view.value.accounts[0]?.id, "account:a");
      assert.equal(view.calls.length, 3);
      assert.equal(configuredClientQueries, 3, "every view statement went through configured.client");
      assert.ok(view.calls.every((call) => isView(call.text)));
      assert.equal(view.rows, rowsOf(view.calls));
      assert.equal(view.bytes, bytesOf(view.calls), "gate observed the view's returned bytes");
      assert.ok(!JSON.stringify(view.calls.map((call) => call.rows)).includes("avatarDataUrl"));

      const identity = await metered(() => provider.readAccountSessionIdentity!({ userId: "account:a" }) as Promise<unknown>);
      assert.ok(identity.calls.every((call) => isIdentity(call.text)));
      assert.equal(identity.bytes, bytesOf(identity.calls));

      // Same subject, both reads concurrently on the same store: each runs its own statements and
      // the gate meters exactly the sum of what each returned.
      const both = await metered(() => Promise.all([readView(provider, { userId: "account:a" }), provider.readAccountSessionIdentity!({ userId: "account:a" })]));
      const viewCalls = both.calls.filter((call) => isView(call.text));
      const identityCalls = both.calls.filter((call) => isIdentity(call.text));
      assert.equal(viewCalls.length, 3);
      assert.equal(identityCalls.length, 3);
      assert.equal(bytesOf(viewCalls), view.bytes);
      assert.equal(bytesOf(identityCalls), identity.bytes);
      assert.equal(both.bytes, view.bytes + identity.bytes);
      assert.deepEqual(both.value[0], view.value, "the view result is the full session graph, not the identity projection");
      assert.deepEqual(both.value[1], identity.value);
      const plain = createStorageAccountSessionProvider({ requireIdentity: true, store: createPostgresLiveRecordStore({ client: countingSqlClient(pool).client }), workspaceId: ws });
      assert.deepEqual(both.value[0], await plain.readAccountSessionGraph({ userId: "account:a" }));
    } finally {
      await configured.client.close();
    }
  });
});

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

test("SC-03 PG wiring: /api/account/me reads the identity and the session view once each, the full graph never, and returns the same data", pgSkip, async () => {
  await withSchema(async ({ pool, schemaUrl }) => {
    const ws = `${WORKSPACE}:handler`;
    await insertRows(pool, ws, [{ collection: "profiles", evidence: ["e:p"], payload: P({ id: "profile:account:a", importedDocuments: [{ body: "x".repeat(3000) }] }) }, { collection: "accounts", evidence: ["e:a"], payload: A() }]);
    await withProcessEnv({ ORBIT_EVENT_DATABASE_URL: schemaUrl, ORBIT_MODULE_MODE: "live", ORBIT_WORKSPACE_ID: ws }, async () => {
      try {
        const session = { email: null, name: null, userId: "account:a" };
        const handler = createAccountMeGetHandler(() => resolveAuthenticatedApiActorFromSession(session));
        const { calls, value } = await capturePoolQueries(async () => (await handler(new Request("http://127.0.0.1/api/account/me"))).json());
        assert.equal(value.success, true);
        // Identity for session id = account id: profile by id (miss), by accountId, account (3).
        // The session view then looks up the resolved profile id: profile by id, account (2).
        assert.equal(calls.length, 5, "3 identity + 2 session view statements");
        assert.equal(calls.filter((call) => isIdentity(call.text)).length, 3);
        assert.equal(calls.filter((call) => isView(call.text)).length, 2);
        assert.ok(calls.every((call) => !/record_id|search_text/u.test(call.text)), "no full-graph statement");
        // Same data as the full graph through the same service.
        const old = createStorageAccountSessionProvider({ requireIdentity: true, source: `postgres-live-record-store:account-session:${ws}`, sourceLabel: "Account Postgres live storage", store: createPostgresLiveRecordStore({ client: countingSqlClient(pool).client }), workspaceId: ws });
        const actor = (await resolveAuthenticatedApiActorFromSession(session))!;
        const expected = await createLiveAccountSessionService({ provider: old }).getCurrentSession({ accountId: actor.accountId ?? actor.id, profileId: actor.profileId, userId: actor.userId });
        assert.ok(expected.success);
        assert.deepEqual(value.data, expected.data);
        assert.deepEqual(value.data.provenance.evidenceIds, ["e:a", "e:p"]);
        assert.equal(value.data.session.signedInAt, T);
      } finally {
        await createConfiguredPostgresLiveRecordStore()?.client.close();
      }
    });
  });
});
