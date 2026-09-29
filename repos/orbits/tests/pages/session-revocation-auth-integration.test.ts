/**
 * W0032 SC-03 (e)：会话有效性检查失败即登出（W32-5 保持现状），用项目实际安装的 Auth.js
 * （next-auth 5.0.0-beta.32 / @auth/core 0.41.3）驱动：
 *   ① 正常 cookie → `/api/auth/session` 有效，`proxy` 放行（不跳登录、API 不 401）；
 *   ② 检查 SQL 出错（临时把测试 schema 的 `orbit_records` 改名）→ `/api/auth/session` 空会话并清除
 *      `authjs.session-token`，`proxy` 对 `/app/agent` 跳 `/app/account/login?next=…`，对 `/api/account/me` 401；
 *   ③ 共享读取闸门已超预算 → 与 ① 相同（`auth_users` 是关键集合，闸门只记量不拒绝），同时非关键集合被拒。
 * 该文件先在改前代码上运行，改后结果须相同（证据目录 03-auth-integration-*.txt）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { NextRequest } from "next/server";
import { Pool } from "pg";

import { createAuthUserService } from "../../features/auth/auth-user-service";
import { issueAuthJsCookie } from "../../features/auth/mobile-crypto";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { resolveSharedReadBudgetGate } from "../../features/sync/read-budget-gate";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const secret = "w0032-auth-integration-secret-with-32-bytes";
const ORIGIN = "http://127.0.0.1:3999";
const WORKSPACE = "workspace:w0032-auth-integration";
const EMAIL = "w0032-member@example.com";
const ENV_KEYS = ["AUTH_SECRET", "AUTH_TRUST_HOST", "ORBIT_DATABASE_TARGET", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_WORKSPACE_ID", "ORBIT_MODULE_MODE", "ORBIT_FEATURE_MODE", "ORBIT_EXPECTED_DATABASE_HOST", "ORBIT_EXPECTED_WORKSPACE_ID", "VERCEL_ENV", "ORBIT_READ_BUDGET_BYTES_PER_MINUTE", "ORBIT_READ_BUDGET_ROWS_PER_MINUTE"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const schema = `w0032_auth_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;
let schemaUrl = "";
let cookie = "";
let userId = "";

before(async () => {
  if (!databaseUrl) return;
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  schemaUrl = url.toString();
  await admin.query(`create schema ${schema}`);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const client = { query: async <T>(sql: string, values?: readonly unknown[]) => pool.query(sql, values ? [...values] : undefined) as Promise<{ rows: T[] }> };
  const provider = createStorageAuthUserProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE });
  const registered = await createAuthUserService({ provider }).registerUser({ email: EMAIL, password: "correct-password" });
  assert.equal(registered.state, "success");
  if (registered.state !== "success") return;
  userId = registered.data.user.id;
  // Issued after registration: iat (= authentication time) is later than any password change.
  await new Promise((resolve) => setTimeout(resolve, 5));
  cookie = (await issueAuthJsCookie({ now: new Date(), origin: ORIGIN, secret, user: { email: EMAIL, id: userId, name: "W0032" } as never })).cookieHeader;

  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, { AUTH_SECRET: secret, AUTH_TRUST_HOST: "true", ORBIT_EVENT_DATABASE_URL: schemaUrl, ORBIT_MODULE_MODE: "live", ORBIT_WORKSPACE_ID: WORKSPACE });
});

after(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (!databaseUrl) return;
  const { createConfiguredPostgresLiveRecordStore } = await import("../../shared/storage/configured-live-record-store");
  for (const url of [schemaUrl, gateSchemaUrl()]) {
    await createConfiguredPostgresLiveRecordStore({ env: { ORBIT_EVENT_DATABASE_URL: url, ORBIT_WORKSPACE_ID: WORKSPACE } })?.client.close().catch(() => {});
  }
  await pool.end();
  try {
    await admin.query(`drop schema if exists ${schema} cascade`);
  } finally {
    await admin.end();
  }
});

/** A different connection string → a different configured store (and client) in the store cache. */
function gateSchemaUrl(): string {
  if (!schemaUrl) return "";
  const url = new URL(schemaUrl);
  url.searchParams.set("application_name", "w0032-gate");
  return url.toString();
}

async function session() {
  const { handlers } = await import("../../auth");
  const response = await handlers.GET(new NextRequest(`${ORIGIN}/api/auth/session`, { headers: { cookie } }));
  return { body: await response.json() as { user?: { id?: string } } | null, setCookie: response.headers.get("set-cookie") ?? "", status: response.status };
}

async function throughProxy(path: string) {
  const { proxy } = await import("../../proxy");
  const response = await (proxy as unknown as (request: NextRequest, context: unknown) => Promise<Response>)(new NextRequest(`${ORIGIN}${path}`, { headers: { cookie, host: new URL(ORIGIN).host, "x-forwarded-proto": "http" } }), {});
  return { location: response.headers.get("location"), status: response.status };
}

function assertSignedIn(result: Awaited<ReturnType<typeof session>>) {
  assert.equal(result.status, 200);
  assert.equal(result.body?.user?.id, userId);
  assert.match(result.setCookie, /authjs\.session-token=[^;]{20,}/u, "the session cookie is re-issued, not cleared");
}

async function assertProxyLetsThrough() {
  const page = await throughProxy("/app/agent");
  assert.ok(!page.location?.includes("/app/account/login"), `page must not bounce to login (got ${page.status} ${page.location})`);
  const api = await throughProxy("/api/account/me");
  assert.notEqual(api.status, 401);
}

test("① a valid session cookie stays signed in through Auth.js and the proxy", pgSkip, async () => {
  assertSignedIn(await session());
  await assertProxyLetsThrough();
});

test("② a failing check query signs the user out: cookie cleared, page → login, API → 401", pgSkip, async () => {
  await pool.query("alter table orbit_records rename to orbit_records_w0032_off");
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await session();
    assert.equal(result.status, 200);
    assert.equal(result.body?.user, undefined, "empty session");
    assert.match(result.setCookie, /authjs\.session-token=; Max-Age=0/u, "session cookie cleared");
    const page = await throughProxy("/app/agent");
    assert.equal(page.status, 307);
    assert.equal(new URL(page.location!).pathname + new URL(page.location!).search, "/app/account/login?next=%2Fapp%2Fagent");
    const api = await throughProxy("/api/account/me");
    assert.equal(api.status, 401);
  } finally {
    console.error = originalError;
    await pool.query("alter table orbit_records_w0032_off rename to orbit_records");
  }
  assertSignedIn(await session());
});

test("③ an over-budget shared read gate still lets the auth_users check through (critical collection)", pgSkip, async () => {
  Object.assign(process.env, { ORBIT_EVENT_DATABASE_URL: gateSchemaUrl(), ORBIT_READ_BUDGET_BYTES_PER_MINUTE: "1" });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const gate = resolveSharedReadBudgetGate();
    assert.ok(gate);
    assertSignedIn(await session()); // the check's own returned bytes push the gate over its 1-byte budget
    assert.equal(gate.snapshot().open, true, "gate is over budget");
    assert.throws(() => gate.assertAllowed({ collectionName: "contacts" }), /read budget exceeded/u, "non-critical reads are refused");
    assertSignedIn(await session());
    await assertProxyLetsThrough();
  } finally {
    console.warn = originalWarn;
    Object.assign(process.env, { ORBIT_EVENT_DATABASE_URL: schemaUrl });
    delete process.env.ORBIT_READ_BUDGET_BYTES_PER_MINUTE;
  }
});
