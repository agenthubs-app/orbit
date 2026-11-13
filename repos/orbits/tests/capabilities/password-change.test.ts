import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { compare, hash } from "bcryptjs";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createPasswordChangeService, createPasswordChangeStore, type PasswordChangeAccount, type PasswordChangeStore } from "../../features/auth/password-change";
import { handlePasswordChangeRequest, handlePasswordStatusRequest, type PasswordChangeHttpDeps } from "../../features/auth/password-change-http";
import { createPasswordResetStore } from "../../features/auth/password-reset-store";
import { createPasswordResetService } from "../../features/auth/password-reset-service";
import { openPasswordResetToken } from "../../features/auth/password-reset-crypto";
import { isPasswordSessionCurrent } from "../../features/auth/session-revocation";
import { trimPastedPassword } from "../../app/(app)/app/orbit-2026/auth-public/auth-model";
import { changePasswordPath, credentialsLandingPath } from "../../app/(app)/app/orbit-2026/auth-public/password-change-client";
import { validatePasswordChange } from "../../app/(app)/app/orbit-2026/auth-public/use-password-change";
import { profileContinuationPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

const account: PasswordChangeAccount = { email: "member@example.com", userId: "user_1" };

function memoryStore(initial: { passwordHash: string | null; mustChangePassword: boolean } | null) {
  let state = initial;
  const replaced: { expectedHash: string; nextHash: string; now: string }[] = [];
  const store: PasswordChangeStore = {
    async read(input) { assert.deepEqual(input, account); return state; },
    async replace(input, expectedHash, nextHash, now) {
      assert.deepEqual(input, account);
      replaced.push({ expectedHash, nextHash, now });
      if (!state || state.passwordHash !== expectedHash) return false;
      state = { passwordHash: nextHash, mustChangePassword: false };
      return true;
    },
  };
  return { store, replaced, get state() { return state; } };
}

test("password change service validates input, verifies the current password with bcrypt and swaps conditionally", async () => {
  const currentHash = await hash("Init-Pass-8x", 4);
  const memory = memoryStore({ passwordHash: currentHash, mustChangePassword: true });
  const service = createPasswordChangeService(memory.store, () => new Date("2026-11-13T00:00:00.000Z"));
  assert.deepEqual(await service.status(account), { mustChangePassword: true });
  assert.deepEqual(await service.change(account, "", "my-own-password"), { success: false, code: "WRONG_PASSWORD" });
  assert.deepEqual(await service.change(account, 42, "my-own-password"), { success: false, code: "WRONG_PASSWORD" });
  assert.deepEqual(await service.change(account, "Init-Pass-8x", "short"), { success: false, code: "INVALID_INPUT" });
  assert.deepEqual(await service.change(account, "Init-Pass-8x", "密".repeat(25)), { success: false, code: "INVALID_INPUT" }, "75 UTF-8 bytes is over 72");
  assert.deepEqual(await service.change(account, "Init-Pass-8x", null), { success: false, code: "INVALID_INPUT" });
  assert.deepEqual(await service.change(account, "Init-Pass-8x", "Init-Pass-8x"), { success: false, code: "SAME_PASSWORD" });
  assert.deepEqual(await service.change(account, "wrong-password", "my-own-password"), { success: false, code: "WRONG_PASSWORD" });
  assert.equal(memory.replaced.length, 0, "no write before the current password verifies");
  assert.deepEqual(await service.change(account, "Init-Pass-8x", "my-own-password"), { success: true });
  assert.equal(memory.replaced.length, 1);
  assert.equal(memory.replaced[0].expectedHash, currentHash);
  assert.equal(memory.replaced[0].now, "2026-11-13T00:00:00.000Z");
  assert.equal(await compare("my-own-password", memory.replaced[0].nextHash), true);
  assert.deepEqual(await service.status(account), { mustChangePassword: false });
});

test("password change service: OAuth-only, missing and concurrently changed accounts", async () => {
  assert.deepEqual(await createPasswordChangeService(memoryStore({ passwordHash: null, mustChangePassword: true }).store).change(account, "anything-1", "my-own-password"), { success: false, code: "NO_PASSWORD" });
  assert.deepEqual(await createPasswordChangeService(memoryStore({ passwordHash: null, mustChangePassword: true }).store).status(account), { mustChangePassword: false }, "no password, nothing to force");
  assert.deepEqual(await createPasswordChangeService(memoryStore(null).store).change(account, "anything-1", "my-own-password"), { success: false, code: "CONFLICT" });
  assert.deepEqual(await createPasswordChangeService(memoryStore(null).store).status(account), { mustChangePassword: false });
  const currentHash = await hash("Init-Pass-8x", 4);
  const racing: PasswordChangeStore = { read: async () => ({ passwordHash: currentHash, mustChangePassword: true }), replace: async () => false };
  assert.deepEqual(await createPasswordChangeService(racing).change(account, "Init-Pass-8x", "my-own-password"), { success: false, code: "CONFLICT" });
});

function deps(overrides: Partial<PasswordChangeHttpDeps> & { events?: string[] } = {}): PasswordChangeHttpDeps {
  const events = overrides.events ?? [];
  return {
    resolveAccount: overrides.resolveAccount ?? (async () => { events.push("account"); return account; }),
    resolveService: overrides.resolveService ?? (() => {
      events.push("service");
      return {
        change: async (input, current, next) => { events.push(`change:${String(current)}:${String(next)}`); assert.deepEqual(input, account); return { success: true }; },
        status: async () => { events.push("status"); return { mustChangePassword: true }; },
      };
    }),
  };
}

const request = (body: string, headers: Record<string, string> = {}) => new Request("https://orbit.example.com/api/auth/password/change", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://orbit.example.com", ...headers }, body,
});

test("change HTTP: guards (media type, size, origin, session, body) answer before the service, all no-store", async () => {
  const cases: { name: string; req: Request; deps?: PasswordChangeHttpDeps; status: number; code: string }[] = [
    { name: "media type", req: request("{}", { "content-type": "text/plain" }), status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    { name: "declared size", req: request("{}", { "content-length": "4097" }), status: 413, code: "PAYLOAD_TOO_LARGE" },
    { name: "actual size", req: request(JSON.stringify({ currentPassword: "x".repeat(5000) }), { "content-length": "2" }), status: 413, code: "PAYLOAD_TOO_LARGE" },
    { name: "cross origin", req: request("{}", { origin: "https://attacker.example" }), status: 403, code: "FORBIDDEN" },
    { name: "signed out", req: request("{}"), deps: deps({ resolveAccount: async () => null }), status: 401, code: "UNAUTHORIZED" },
    { name: "session without email", req: request("{}"), deps: deps({ resolveAccount: async () => ({ userId: "user_1", email: "" }) }), status: 401, code: "UNAUTHORIZED" },
    { name: "session lookup throws", req: request("{}"), deps: deps({ resolveAccount: async () => { throw new Error("db down"); } }), status: 503, code: "SERVICE_UNAVAILABLE" },
    { name: "malformed JSON", req: request("{"), status: 400, code: "VALIDATION_ERROR" },
    { name: "array body", req: request("[]"), status: 400, code: "VALIDATION_ERROR" },
    { name: "no database", req: request("{}"), deps: deps({ resolveService: () => null }), status: 503, code: "SERVICE_UNAVAILABLE" },
  ];
  for (const scenario of cases) {
    const response = await handlePasswordChangeRequest(scenario.req, scenario.deps ?? deps());
    assert.equal(response.status, scenario.status, scenario.name);
    assert.equal(response.headers.get("cache-control"), "no-store", scenario.name);
    const body = await response.json() as { success: boolean; error: { code: string; message: string } };
    assert.equal(body.success, false, scenario.name);
    assert.equal(body.error.code, scenario.code, scenario.name);
    assert.ok(body.error.message, scenario.name);
  }
});

test("change HTTP: service failures map to 400/409 with Chinese copy; success is 200 and never echoes passwords", async () => {
  for (const [code, status, message] of [
    ["WRONG_PASSWORD", 400, "当前密码不正确。"], ["INVALID_INPUT", 400, "新密码至少 8 位，UTF-8 长度不超过 72 字节。"],
    ["SAME_PASSWORD", 400, "新密码不能与当前密码相同。"], ["NO_PASSWORD", 400, "该账号没有设置密码（通过 Google 登录），无需修改。"],
    ["CONFLICT", 409, "密码刚刚已被修改，请重新登录后再试。"],
  ] as const) {
    const response = await handlePasswordChangeRequest(request(JSON.stringify({ currentPassword: "Init-Pass-8x", newPassword: "my-own-password" })), deps({
      resolveService: () => ({ change: async () => ({ success: false, code }), status: async () => ({ mustChangePassword: false }) }),
    }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { success: false, error: { code, message } });
  }
  const events: string[] = [];
  const ok = await handlePasswordChangeRequest(request(JSON.stringify({ currentPassword: "Init-Pass-8x", newPassword: "my-own-password" }), { origin: "" }), deps({ events }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const text = await ok.text();
  assert.equal(text.includes("Init-Pass-8x") || text.includes("my-own-password"), false);
  assert.deepEqual(JSON.parse(text), { success: true, data: { message: "密码已更新。" } });
  assert.deepEqual(events, ["account", "service", "change:Init-Pass-8x:my-own-password"]);
  const thrown = await handlePasswordChangeRequest(request("{}"), deps({ resolveService: () => ({ change: async () => { throw new Error("member@example.com secret"); }, status: async () => ({ mustChangePassword: false }) }) }));
  assert.equal(thrown.status, 503);
  assert.equal((await thrown.text()).includes("secret"), false);
});

test("status HTTP: requires a session, is no-store and returns only the flag", async () => {
  const signedOut = await handlePasswordStatusRequest(deps({ resolveAccount: async () => null }));
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.headers.get("cache-control"), "no-store");
  const unavailable = await handlePasswordStatusRequest(deps({ resolveService: () => null }));
  assert.equal(unavailable.status, 503);
  const failing = await handlePasswordStatusRequest(deps({ resolveService: () => ({ change: async () => ({ success: true }), status: async () => { throw new Error("db"); } }) }));
  assert.equal(failing.status, 503);
  const ok = await handlePasswordStatusRequest(deps());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ok.json(), { mustChangePassword: true });
});

test("client helpers: paste trimming, local validation and the post-sign-in landing path", async () => {
  assert.equal(trimPastedPassword("", 0, 0, "abc", 72), null);
  assert.deepEqual(trimPastedPassword("", 0, 0, " \tInit-Pass-8x \r\n", 72), { value: "Init-Pass-8x", caret: 12 });
  assert.deepEqual(trimPastedPassword("ab", 2, 2, " x".repeat(1) + "y".repeat(80) + "\n", 72), { value: `abx${"y".repeat(69)}`, caret: 72 });
  assert.deepEqual(validatePasswordChange("", "my-own-password"), { en: "Enter your current password.", ja: "現在のパスワードを入力してください。", zh: "请输入当前密码。" });
  assert.equal(validatePasswordChange("Init-Pass-8x", "short")?.zh, "新密码至少 8 位。");
  assert.equal(validatePasswordChange("Init-Pass-8x", "密".repeat(25))?.zh, "密码不能超过 72 个 UTF-8 字节。");
  assert.equal(validatePasswordChange("same-password", "same-password")?.zh, "新密码不能与当前密码相同。");
  assert.equal(validatePasswordChange("Init-Pass-8x", "my-own-password"), null);
  assert.equal(changePasswordPath("/app/home"), "/app/account/change-password?next=%2Fapp%2Fhome");
  assert.equal(changePasswordPath("", true), "/app/account/change-password?first=1");
  const calls: string[] = [];
  const fetcher = (body: unknown, status = 200) => (async (url: RequestInfo | URL) => { calls.push(String(url)); return Response.json(body, { status }); }) as typeof fetch;
  assert.equal(await credentialsLandingPath("/app/home", fetcher({ mustChangePassword: true })), "/app/account/change-password?next=%2Fapp%2Fhome&first=1");
  assert.equal(await credentialsLandingPath("/app/home", fetcher({ mustChangePassword: false })), profileContinuationPath("/app/home"));
  assert.equal(await credentialsLandingPath("/app/home", fetcher({ mustChangePassword: true }, 503)), profileContinuationPath("/app/home"));
  assert.equal(await credentialsLandingPath("/app/home", (async () => { throw new Error("offline"); }) as typeof fetch), profileContinuationPath("/app/home"));
  assert.deepEqual(new Set(calls), new Set(["/api/auth/password/status"]));
});

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
test("password change and reset clear mustChangePassword and revoke prior sessions in real Postgres", { skip: !databaseUrl && "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  const schema = `password_change_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const client = { query: async <T>(sql: string, values?: readonly unknown[]) => pool.query(sql, values ? [...values] : undefined) as Promise<{ rows: T[] }> };
  const workspaceId = "workspace:password-change";
  const secret = "password-change-test-secret-with-32-bytes!";
  let clock = new Date("2026-11-13T09:00:00.000Z");
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const records = createPostgresLiveRecordStore({ client });
    const authService = createAuthUserService({ provider: createStorageAuthUserProvider({ store: records, workspaceId }) });
    const registered = await authService.registerUser({ email: account.email, password: "Init-Pass-8x" });
    assert.equal(registered.state, "success");
    if (registered.state !== "success") return;
    const me = { email: "Member@Example.com", userId: registered.data.user.id };
    const row = async (email = account.email) => (await pool.query("SELECT payload FROM orbit_records WHERE workspace_id=$1 AND record_id=$2", [workspaceId, `auth_user:${email}`])).rows[0].payload;
    // Bulk provisioning marks the account (done by the provisioning script in production).
    const flag = (email = account.email) => pool.query(`UPDATE orbit_records SET payload = payload || '{"mustChangePassword": true}'::jsonb WHERE workspace_id=$1 AND record_id=$2`, [workspaceId, `auth_user:${email}`]);
    await flag();
    const store = createPasswordChangeStore(client, workspaceId);
    const service = createPasswordChangeService(store, () => clock);
    assert.deepEqual(await service.status(me), { mustChangePassword: true });
    assert.deepEqual(await service.status({ ...me, userId: "someone-else" }), { mustChangePassword: false }, "bound to the session's user id");
    assert.deepEqual(await createPasswordChangeService(createPasswordChangeStore(client, "workspace:other")).status(me), { mustChangePassword: false });
    // A pending reset link is dropped together with the flag.
    const resetService = createPasswordResetService(createPasswordResetStore(client, workspaceId), secret, () => clock);
    await resetService.request(account.email);
    assert.ok((await row()).passwordReset);
    assert.deepEqual(await service.change({ ...me, userId: "someone-else" }, "Init-Pass-8x", "my-own-password"), { success: false, code: "CONFLICT" });
    assert.deepEqual(await service.change(me, "wrong-password", "my-own-password"), { success: false, code: "WRONG_PASSWORD" });
    assert.equal((await row()).mustChangePassword, true);
    const before = clock.getTime() - 1;
    assert.equal(await isPasswordSessionCurrent({ email: account.email, userId: me.userId, authenticatedAt: before }, { store: records, workspaceId }), true);
    const results = await Promise.all([service.change(me, "Init-Pass-8x", "my-own-password"), service.change(me, "Init-Pass-8x", "another-password")]);
    assert.equal(results.filter((result) => result.success).length, 1, "concurrent changes succeed at most once");
    const after = await row();
    assert.equal(after.mustChangePassword, undefined);
    assert.equal(after.passwordReset, undefined);
    assert.equal(after.passwordChangedAt, clock.toISOString());
    assert.equal(after.updatedAt, clock.toISOString());
    assert.equal(after.id, me.userId);
    assert.equal(after.email, account.email);
    const winner = await compare("my-own-password", after.passwordHash) ? "my-own-password" : "another-password";
    assert.equal((await authService.verifyCredentials({ email: account.email, password: "Init-Pass-8x" })).state, "failure");
    assert.equal((await authService.verifyCredentials({ email: account.email, password: winner })).state, "success");
    assert.deepEqual(await service.status(me), { mustChangePassword: false });
    assert.equal(await isPasswordSessionCurrent({ email: account.email, userId: me.userId, authenticatedAt: before }, { store: records, workspaceId }), false, "the old session is revoked");
    assert.equal(await isPasswordSessionCurrent({ email: account.email, userId: me.userId, authenticatedAt: clock.getTime() + 1 }, { store: records, workspaceId }), true, "re-sign-in after the change is current");
    // OAuth-only account: nothing to change, never forced.
    await authService.getOrCreateOAuthUser({ email: "oauth@example.com", provider: "google", providerAccountId: "oauth-1" });
    const oauthRow = await row("oauth@example.com");
    await flag("oauth@example.com");
    const oauth = { email: "oauth@example.com", userId: oauthRow.id as string };
    assert.deepEqual(await service.status(oauth), { mustChangePassword: false });
    assert.deepEqual(await service.change(oauth, "anything-1", "my-own-password"), { success: false, code: "NO_PASSWORD" });
    // A completed password reset also clears the flag.
    await flag();
    clock = new Date(clock.getTime() + 10 * 60_000);
    await resetService.request(account.email);
    const token = openPasswordResetToken((await row()).passwordReset.sealedToken, secret);
    assert.deepEqual(await resetService.reset(token, "reset-password-1"), { success: true });
    assert.equal((await row()).mustChangePassword, undefined);
    assert.deepEqual(await service.status(me), { mustChangePassword: false });
    // An archived account cannot change its password.
    await pool.query("UPDATE orbit_records SET lifecycle_state='archived' WHERE workspace_id=$1 AND record_id=$2", [workspaceId, `auth_user:${account.email}`]);
    assert.deepEqual(await service.change(me, "reset-password-1", "my-own-password"), { success: false, code: "CONFLICT" });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
