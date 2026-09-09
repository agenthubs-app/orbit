import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { compare } from "bcryptjs";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { passwordResetDigest, openPasswordResetToken, sealPasswordResetToken } from "../../features/auth/password-reset-crypto";
import { createPasswordResetStore } from "../../features/auth/password-reset-store";
import { createPasswordResetService, deliverPasswordResetMail } from "../../features/auth/password-reset-service";
import { createResendPasswordResetMailer, passwordResetConfig } from "../../features/auth/password-reset-factory";
import { handlePasswordResetRequest } from "../../features/auth/password-reset-http";
import { isPasswordSessionCurrent } from "../../features/auth/session-revocation";
import { createSmtpPasswordResetMailer, passwordResetSmtpConfig } from "../../features/auth/password-reset-smtp";
import type { PasswordResetResponse } from "../../shared/contract/password-reset";

const secret = "password-recovery-test-secret-with-32-bytes";

test("SMTP recovery reuses party-app config, verifies acceptance and suppresses credential-bearing errors", async () => {
  const config = passwordResetSmtpConfig({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "sender", SMTP_PASS: "private-password", ACCESS_EMAIL_FROM: "Orbit <sender@example.com>" });
  assert.ok(config);
  let sent: Record<string, unknown> | undefined;
  const transport = { sendMail: async (message: Record<string, unknown>) => { sent = message; return { accepted: ["member@example.com"] }; } } as never;
  const mailer = createSmtpPasswordResetMailer(config, transport);
  await mailer.send("member@example.com", "https://orbit.example.com/app/account/reset-password#token=secret", "reset/key");
  assert.equal(sent?.to, "member@example.com");
  assert.equal(sent?.messageId, "<reset-key@orbit.example.com>");
  assert.match(String(sent?.text), /30/);
  const rejected = createSmtpPasswordResetMailer(config, { sendMail: async () => { throw new Error("SMTP password private-password rejected"); } } as never);
  await assert.rejects(rejected.send("member@example.com", "https://orbit.example.com", "key"), { message: "Password reset delivery failed" });
  assert.equal(passwordResetSmtpConfig({ SMTP_PORT: "0" }), null);
  assert.ok(passwordResetConfig({ NODE_ENV: "test", AUTH_SECRET: secret, ORBIT_PUBLIC_ORIGIN: "https://orbit.example.com", SMTP_HOST: "smtp.example.com", SMTP_USER: "user", SMTP_PASS: "secret", ACCESS_EMAIL_FROM: "sender@example.com" })?.smtp);
});

test("reset mail configuration pins an HTTPS origin and authenticated encryption detects tampering", () => {
  const env = { NODE_ENV: "test" as const, AUTH_SECRET: secret, ORBIT_AUTH_RESEND_API_KEY: "test", ORBIT_AUTH_MAIL_FROM: "noreply@example.com", ORBIT_PUBLIC_ORIGIN: "https://orbit.example.com" };
  assert.equal(passwordResetConfig(env)?.origin, "https://orbit.example.com");
  for (const origin of ["http://orbit.example.com", "https://u:p@orbit.example.com", "https://orbit.example.com/path", "https://orbit.example.com/?x=1"]) assert.equal(passwordResetConfig({ ...env, ORBIT_PUBLIC_ORIGIN: origin }), null);
  assert.equal(passwordResetConfig({ ...env, AUTH_SECRET: "short" }), null);
  assert.equal(passwordResetConfig({ ...env, NODE_ENV: "production", ORBIT_PUBLIC_ORIGIN: "http://localhost:3000" }), null);
  const sealed = sealPasswordResetToken("private-token", secret);
  assert.equal(openPasswordResetToken(sealed, secret), "private-token");
  assert.throws(() => openPasswordResetToken(sealed, "wrong-key"));
  const data = Buffer.from(sealed, "base64url"); data[30] ^= 1;
  assert.throws(() => openPasswordResetToken(data.toString("base64url"), secret));
});

test("mail adapter requires a provider receipt and uses stable idempotency without exposing provider errors", async () => {
  let captured: RequestInit | undefined;
  const mailer = createResendPasswordResetMailer({ apiKey: "private-key", from: "Orbit <noreply@example.com>" }, async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails"); captured = init;
    return Response.json({ id: "mail-1" });
  });
  await mailer.send("member@example.com", "https://orbit.example.com/app/account/reset-password#token=secret", "reset/123");
  assert.equal(new Headers(captured?.headers).get("idempotency-key"), "reset/123");
  assert.deepEqual(JSON.parse(String(captured?.body)).to, ["member@example.com"]);
  const failing = createResendPasswordResetMailer({ apiKey: "private-key", from: "from" }, async () => Response.json({ message: "sensitive-provider-body" }, { status: 429 }));
  await assert.rejects(failing.send("member@example.com", "secret", "key"), { message: "Password reset delivery failed" });
});

test("reset HTTP rejects unconfigured, malformed and cross-origin requests without secret payloads", async () => {
  const req = (body: string, origin = "https://orbit.example.com") => new Request("https://orbit.example.com/api/auth/password-reset/request", { method: "POST", headers: { "content-type": "application/json", origin }, body });
  assert.equal((await handlePasswordResetRequest(req("{}"), "request", () => null)).status, 503);
  assert.equal((await handlePasswordResetRequest(req("null"), "request", () => null)).status, 400);
  assert.equal((await handlePasswordResetRequest(req("{"), "request", () => null)).status, 400);
  const runtime = { origin: "https://orbit.example.com", service: { request: () => { throw new Error("must not run"); } } } as never;
  const blocked = await handlePasswordResetRequest(req("{}", "https://attacker.example"), "request", () => runtime);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("cache-control"), "no-store");
});

type HttpResetRuntime = NonNullable<ReturnType<NonNullable<Parameters<typeof handlePasswordResetRequest>[2]>>>;

function httpResetRuntime(service: HttpResetRuntime["service"]): HttpResetRuntime {
  return {
    origin: "https://orbit.example.com", secret, apiKey: undefined, from: undefined, smtp: null,
    store: createPasswordResetStore({ query: async () => { throw new Error("HTTP fixture must not access storage"); } }, "test:remote-sync-20260907"),
    mailer: { send: async () => { throw new Error("HTTP fixture must not send mail"); } },
    service,
  };
}

for (const operation of ["request", "reset"] as const) {
  const input = { email: "member@example.com", token: "synthetic-bearer-token", password: "synthetic-password" };
  const unavailable = "密码恢复暂不可用，请稍后重试或联系管理员。";
  const invalidBody = "请检查输入后重试。";
  const invalidInput = "请检查邮箱；新密码至少 8 位，UTF-8 长度不超过 72 字节。";
  const cases: {
    name: string; body?: string; headers?: Record<string, string>; missingRuntime?: boolean;
    failure?: "INVALID_INPUT" | "INVALID_TOKEN"; throws?: "resolve" | "service" | "wake";
    status: number; code: string; message: string; events: string[];
  }[] = [
    { name: "unsupported content type precedes length and parsing", headers: { "content-type": "text/plain", "content-length": "4097" }, body: "{", status: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "请使用正确的表单重试。", events: [] },
    { name: "declared oversize precedes parsing", headers: { "content-length": "4097" }, body: "{", status: 413, code: "PAYLOAD_TOO_LARGE", message: "请求内容过长。", events: [] },
    { name: "actual oversize precedes parsing", headers: { "content-length": "2" }, body: "x".repeat(4097), status: 413, code: "PAYLOAD_TOO_LARGE", message: "请求内容过长。", events: [] },
    ...["null", "[]", "42", "true", '"text"', "{"].map((body) => ({ name: `invalid JSON body ${body}`, body, status: 400, code: "VALIDATION_ERROR", message: invalidBody, events: [] })),
    { name: "missing runtime precedes origin guard", missingRuntime: true, headers: { origin: "https://attacker.example" }, status: 503, code: "SERVICE_UNAVAILABLE", message: unavailable, events: ["resolve"] },
    { name: "disallowed origin precedes service", headers: { origin: "https://attacker.example" }, status: 403, code: "FORBIDDEN", message: "请在 Orbit 页面重新提交。", events: ["resolve"] },
    { name: "thrown runtime resolution", throws: "resolve", status: 503, code: "SERVICE_UNAVAILABLE", message: "暂时无法处理，请稍后重试。", events: ["resolve"] },
    { name: "thrown service error", throws: "service", status: 503, code: "SERVICE_UNAVAILABLE", message: "暂时无法处理，请稍后重试。", events: ["resolve", operation] },
    { name: "invalid input service result", failure: "INVALID_INPUT", status: 400, code: "INVALID_INPUT", message: invalidInput, events: ["resolve", operation] },
    ...(operation === "reset" ? [{ name: "invalid token service result", failure: "INVALID_TOKEN" as const, status: 400, code: "INVALID_TOKEN", message: "链接已失效或已使用，请重新申请。", events: ["resolve", operation] }] : [
      { name: "thrown delivery wake", throws: "wake" as const, status: 503, code: "SERVICE_UNAVAILABLE", message: "暂时无法处理，请稍后重试。", events: ["resolve", operation, "wake"] },
    ]),
  ];

  for (const scenario of cases) {
    test(`reset HTTP ${operation}: ${scenario.name}`, async () => {
      const events: string[] = [];
      const privateError = new Error(`${input.email} ${input.token} ${input.password}`);
      privateError.stack = "private-error-stack";
      const runService = async () => {
        if (scenario.throws === "service") throw privateError;
        return scenario.failure ? { success: false as const, code: scenario.failure } : { success: true as const };
      };
      const runtime = httpResetRuntime({
        request: async (email) => { events.push("request"); assert.equal(email, input.email); return runService(); },
        reset: async (token, password) => { events.push("reset"); assert.equal(token, input.token); assert.equal(password, input.password); return runService(); },
      });
      const request = new Request(`https://orbit.example.com/api/auth/password-reset/${operation === "request" ? "request" : "confirm"}`, {
        method: "POST", headers: { "content-type": "application/json", origin: runtime.origin, ...scenario.headers },
        body: scenario.body ?? JSON.stringify(input),
      });
      const result = await handlePasswordResetRequest(request, operation, () => {
        events.push("resolve");
        if (scenario.throws === "resolve") throw privateError;
        return scenario.missingRuntime ? null : runtime;
      }, async () => { events.push("wake"); if (scenario.throws === "wake") throw privateError; });
      assert.equal(result.status, scenario.status);
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.equal(result.headers.get("referrer-policy"), "no-referrer");
      assert.deepEqual(events, scenario.events);
      const text = await result.text();
      for (const value of [...Object.values(input), privateError.message, privateError.stack]) assert.equal(text.includes(value), false, "response must not echo private input or errors");
      assert.deepEqual(JSON.parse(text), { success: false, error: { code: scenario.code, message: scenario.message } });
    });
  }

  for (const origin of ["https://orbit.example.com", undefined]) {
    for (const withWake of [true, false]) {
      test(`reset HTTP ${operation}: success with ${origin ? "same" : "no"} origin and ${withWake ? "a" : "no"} wake callback`, async () => {
        const events: string[] = [];
        const runtime = httpResetRuntime({
          request: async (email) => { events.push("request"); assert.equal(email, input.email); return { success: true }; },
          reset: async (token, password) => { events.push("reset"); assert.equal(token, input.token); assert.equal(password, input.password); return { success: true }; },
        });
        const request = new Request(`https://orbit.example.com/api/auth/password-reset/${operation === "request" ? "request" : "confirm"}`, {
          method: "POST", headers: { "content-type": "application/json", "content-length": "4096", ...(origin ? { origin } : {}) },
          body: JSON.stringify(input).padEnd(4096, " "),
        });
        const result = await handlePasswordResetRequest(request, operation, () => { events.push("resolve"); return runtime; }, withWake ? async () => { events.push("wake"); } : undefined);
        assert.equal(result.status, operation === "request" ? 202 : 200);
        assert.equal(result.headers.get("cache-control"), "no-store");
        assert.equal(result.headers.get("referrer-policy"), "no-referrer");
        assert.deepEqual(events, operation === "request" && withWake ? ["resolve", "request", "wake"] : ["resolve", operation]);
        const expectedData: PasswordResetResponse = { message: operation === "request" ? "申请已受理。如果该邮箱支持密码恢复，你将收到重置链接；未收到时请稍后重试。" : "密码已更新，请使用新密码登录。" };
        assert.deepEqual(await result.json(), { success: true, data: expectedData });
      });
    }
  }
}

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
test("password recovery persists, retries, atomically consumes and revokes prior sessions in real Postgres", { skip: !databaseUrl && "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  const schema = `password_reset_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const client = { query: async <T>(sql: string, values?: readonly unknown[]) => pool.query(sql, values ? [...values] : undefined) as Promise<{ rows: T[] }> };
  const workspaceId = "workspace:recovery";
  const email = "member@example.com";
  let clock = new Date("2026-09-06T09:00:00.000Z");
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const records = createPostgresLiveRecordStore({ client });
    const provider = createStorageAuthUserProvider({ store: records, workspaceId });
    const authService = createAuthUserService({ provider });
    const registered = await authService.registerUser({ email, password: "old-password" });
    assert.equal(registered.state, "success");
    if (registered.state !== "success") return;
    await authService.getOrCreateOAuthUser({ email: "oauth@example.com", provider: "google", providerAccountId: "oauth-1" });
    const store = createPasswordResetStore(client, workspaceId);
    const service = createPasswordResetService(store, secret, () => clock);
    const row = async () => (await pool.query("SELECT payload FROM orbit_records WHERE workspace_id=$1 AND record_id=$2", [workspaceId, `auth_user:${email}`])).rows[0].payload;
    const firstResponses = await Promise.all([service.request(email), service.request(email.toUpperCase()), service.request("unknown@example.com"), service.request("oauth@example.com")]);
    assert.ok(firstResponses.every((result) => result.success));
    const first = (await row()).passwordReset;
    assert.equal(first.attempts, 0);
    const token = openPasswordResetToken(first.sealedToken, secret);
    assert.equal(first.tokenHash, passwordResetDigest(token));
    assert.ok(!JSON.stringify(await row()).includes(token));
    assert.equal((await pool.query("SELECT count(*) FROM orbit_records WHERE collection_name='auth_users'")).rows[0].count, "2");
    assert.equal(await createPasswordResetStore(client, "workspace:other").isValid(first.tokenHash, clock.toISOString()), false);
    // New service instance represents a restarted worker reading the same queue.
    let sends = 0;
    let resetUrl = "";
    const deliveryInput = { store: createPasswordResetStore(client, workspaceId), secret, origin: "https://orbit.example.com", now: () => clock,
      mailer: { send: async (_email: string, url: string) => { sends += 1; resetUrl = url; if (sends === 1) throw new Error("provider unavailable"); } } };
    assert.equal(await deliverPasswordResetMail(deliveryInput), "retry");
    assert.equal((await row()).passwordReset.delivery, "pending");
    assert.equal(await deliverPasswordResetMail(deliveryInput), "idle");
    clock = new Date(clock.getTime() + 20_000);
    const deliveries = await Promise.all([deliverPasswordResetMail(deliveryInput), deliverPasswordResetMail(deliveryInput)]);
    assert.deepEqual(deliveries.sort(), ["idle", "sent"]);
    assert.equal(sends, 2);
    assert.equal(new URL(resetUrl).search, "");
    assert.equal(new URLSearchParams(new URL(resetUrl).hash.slice(1)).get("token"), token);
    assert.equal((await row()).passwordReset.sealedToken, "");
    assert.equal(await isPasswordSessionCurrent({ email, userId: registered.data.user.id, authenticatedAt: clock.getTime() - 1 }, { store: records, workspaceId }), true);
    assert.equal((await service.reset(token, "short")).success, false);
    assert.equal((await service.reset(token, "密".repeat(25))).success, false);
    assert.equal((await service.reset("x".repeat(43), "new-password")).success, false);
    const results = await Promise.all([service.reset(token, "new-password"), service.reset(token, "new-password")]);
    assert.equal(results.filter((result) => result.success).length, 1);
    assert.equal((await row()).passwordReset, undefined);
    assert.equal(await compare("new-password", (await row()).passwordHash), true);
    assert.equal((await authService.verifyCredentials({ email, password: "old-password" })).state, "failure");
    assert.equal((await authService.verifyCredentials({ email, password: "new-password" })).state, "success");
    assert.equal((await service.reset(token, "another-password")).success, false);
    assert.equal(await isPasswordSessionCurrent({ email, userId: registered.data.user.id, authenticatedAt: clock.getTime() - 1 }, { store: records, workspaceId }), false);
    assert.equal(await isPasswordSessionCurrent({ email, userId: registered.data.user.id, authenticatedAt: clock.getTime() + 1 }, { store: records, workspaceId }), true);
    assert.equal(await isPasswordSessionCurrent({ email, userId: "different-user", authenticatedAt: clock.getTime() + 1 }, { store: records, workspaceId }), false);
    // Expiry and supersession leave credentials unchanged.
    await service.request(email);
    const expiring = openPasswordResetToken((await row()).passwordReset.sealedToken, secret);
    clock = new Date(clock.getTime() + 31 * 60_000);
    assert.equal((await service.reset(expiring, "expired-password")).success, false);
    await service.request(email);
    const oldJob = await store.claim(clock.toISOString(), new Date(clock.getTime() + 60_000).toISOString(), "crashed-lease");
    assert.ok(oldJob);
    clock = new Date(clock.getTime() + 61_000);
    const replacement = await store.claim(clock.toISOString(), new Date(clock.getTime() + 60_000).toISOString(), "new-lease");
    assert.ok(replacement);
    await store.finish(oldJob, true, clock.toISOString(), clock.toISOString());
    assert.equal((await row()).passwordReset.leaseId, "new-lease");
    await service.request(email);
    await store.finish(replacement, true, clock.toISOString(), clock.toISOString());
    assert.equal((await row()).passwordReset.delivery, "pending");
    assert.notEqual((await row()).passwordReset.tokenHash, replacement.reset.tokenHash);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
