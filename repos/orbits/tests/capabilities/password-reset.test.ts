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
