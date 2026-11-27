import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before, beforeEach } from "node:test";

import { Pool } from "pg";

import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createEmailVerificationService, emailVerificationDeliverable } from "../../features/auth/email-verification";
import { createEmailVerificationStore } from "../../features/auth/email-verification-store";
import { createPasswordResetService } from "../../features/auth/password-reset-service";
import { createPasswordResetStore } from "../../features/auth/password-reset-store";
import { passwordResetDigest } from "../../features/auth/password-reset-crypto";
import { readAuthSessionState } from "../../features/auth/session-revocation";
import { authUserRecordId, createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import type { TransactionalMail } from "../../features/mail/transactional";
import { runSignupFunnelMigrations } from "../../features/signup-funnel/migrations";
import { formatSignupFunnel, readSignupFunnel } from "../../features/signup-funnel/report";
import { createSignupFunnelStore } from "../../features/signup-funnel/store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const schema = `email_verification_${randomUUID().replaceAll("-", "")}`;
const W = "workspace:email-verification";
const CONSENT = { termsVersion: "2026-11-25", privacyVersion: "2026-11-25", client: "web" as const };
let admin: Pool;
let pool: Pool;
let at = new Date("2026-11-25T01:00:00.000Z");
let mails: TransactionalMail[] = [];
let delivered = true;

const client = { query: async <T>(sql: string, values?: readonly unknown[]) => pool.query(sql, values ? [...values] : undefined) as unknown as Promise<{ rows: T[] }> };
const database = () => ({ store: createPostgresLiveRecordStore({ client }) as never, workspaceId: W });
const users = () => createAuthUserService({ now: () => at, provider: createStorageAuthUserProvider({ client: client as never, store: createPostgresLiveRecordStore({ client }) as never, workspaceId: W }) });
const verification = () => createEmailVerificationService({
  mailer: { send: async (mail) => { mails.push(mail); return { delivered, redirected: false }; } },
  now: () => at, origin: "https://orbit.example", store: createEmailVerificationStore(client as never, W),
});
const tokenOf = (mail: TransactionalMail) => /token=([A-Za-z0-9_-]{43})/u.exec(mail.text)![1]!;
const later = (ms: number) => { at = new Date(at.getTime() + ms); };
const payload = async (email: string) => (await pool.query("select payload from orbit_records where record_id=$1", [authUserRecordId(email)])).rows[0].payload as Record<string, any>;

async function register(email: string) {
  const result = await users().registerUser({ consent: CONSENT, email, password: "password-one" });
  assert.equal(result.state, "success");
  return { email, userId: result.state === "success" ? result.data.user.id : "" };
}

before(async () => {
  if (!databaseUrl) return;
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await runSignupFunnelMigrations(pool);
  await runSignupFunnelMigrations(pool); // 第二次是空操作
});
after(async () => {
  if (!databaseUrl) return;
  await pool.end();
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
});
beforeEach(async () => {
  at = new Date("2026-11-25T01:00:00.000Z");
  mails = [];
  delivered = true;
  if (databaseUrl) await pool.query("truncate orbit_records, signup_funnel_events");
});

test("发信：语言跟随用户，链接在 # 之后，库里只有哈希；点一次完成，再点是「已完成」", pgSkip, async () => {
  const account = await register("ja@example.test");
  assert.equal((await verification().send(account, "ja")).state, "sent");
  assert.match(mails[0]!.subject, /メールアドレスの確認/u);
  assert.match(mails[0]!.text, /https:\/\/orbit\.example\/verify-email#token=/u);
  const token = tokenOf(mails[0]!);
  assert.ok(!JSON.stringify(await payload(account.email)).includes(token));
  assert.equal((await readAuthSessionState({ ...account, authenticatedAt: Date.now() + 1e9 }, database())).emailVerification?.verified, false);
  assert.deepEqual(await verification().confirm(token), { outcome: "verified", userId: account.userId });
  assert.equal((await readAuthSessionState({ ...account, authenticatedAt: Date.now() + 1e9 }, database())).emailVerification?.verified, true);
  assert.deepEqual(await verification().confirm(token), { outcome: "already" });
  assert.equal((await verification().send(account, "ja")).state, "verified");
  assert.equal(mails.length, 1);
});

test("两次同时点：只有一次是「这次完成」", pgSkip, async () => {
  const account = await register("twice@example.test");
  await verification().send(account, "en");
  const outcomes = await Promise.all([verification().confirm(tokenOf(mails[0]!)), verification().confirm(tokenOf(mails[0]!))]);
  assert.deepEqual(outcomes.map((item) => item.outcome).sort(), ["already", "verified"]);
});

test("七天过期；重新发送后旧链接作废，完成之后再点旧链接是「已完成」", pgSkip, async () => {
  const account = await register("expiry@example.test");
  await verification().send(account, "zh");
  later(7 * 86_400_000);
  assert.deepEqual(await verification().confirm(tokenOf(mails[0]!)), { outcome: "expired" });
  assert.equal((await verification().send(account, "zh")).state, "sent");
  assert.deepEqual(await verification().confirm(tokenOf(mails[0]!)), { outcome: "expired" });
  assert.equal((await verification().confirm(tokenOf(mails[1]!))).outcome, "verified");
  assert.deepEqual(await verification().confirm(tokenOf(mails[0]!)), { outcome: "already" });
  for (const bad of [undefined, "", "x".repeat(43), 7]) assert.equal((await verification().confirm(bad)).outcome, "expired");
});

test("一分钟一封、一天五封；发不出去不占当天的额度", pgSkip, async () => {
  const account = await register("limit@example.test");
  delivered = false;
  assert.equal((await verification().send(account, "ja")).state, "failed");
  delivered = true;
  assert.deepEqual(await verification().send(account, "ja"), { state: "too_soon", retryAfterSeconds: 60 });
  for (let i = 0; i < 5; i += 1) { later(60_000); assert.equal((await verification().send(account, "ja")).state, "sent"); }
  later(60_000);
  assert.equal((await verification().send(account, "ja")).state, "daily_limit");
  later(86_400_000);
  assert.equal((await verification().send(account, "ja")).state, "sent");
  const both = await Promise.all([(later(60_000), verification().send(account, "ja")), verification().send(account, "ja")]);
  assert.deepEqual(both.map((item) => item.state).sort(), ["sent", "too_soon"]);
  assert.equal((await verification().send({ ...account, userId: "someone-else" }, "ja")).state, "failed");
});

test("Google 账号算已验证，不发信", pgSkip, async () => {
  const result = await users().getOrCreateOAuthUser({ consent: CONSENT, email: "g@example.test", provider: "google", providerAccountId: "g1" });
  assert.ok(result.state === "success" && result.data.created);
  const account = { email: "g@example.test", userId: result.data.user.id };
  assert.equal((await readAuthSessionState({ ...account, authenticatedAt: Date.now() + 1e9 }, database())).emailVerification?.verified, true);
  assert.equal((await verification().send(account, "ja")).state, "verified");
});

test("堵抢注：未验证的密码账号第一次被同邮箱 Google 并入 → 已验证、原密码和旧会话作废，可走忘记密码重设", pgSkip, async () => {
  const account = await register("victim@example.test");
  const before = at.getTime();
  later(60_000);
  const google = await users().getOrCreateOAuthUser({ email: account.email, provider: "google", providerAccountId: "g2" });
  assert.ok(google.state === "success" && google.data.user.id === account.userId && !google.data.created);
  assert.equal((await users().verifyCredentials({ email: account.email, password: "password-one" })).state, "failure");
  assert.deepEqual(await readAuthSessionState({ ...account, authenticatedAt: before }, database()), { current: false, emailVerification: { sent: false, verified: true }, tier: "free" });
  assert.deepEqual(await readAuthSessionState({ ...account, authenticatedAt: at.getTime() + 1 }, database()), { current: true, emailVerification: { sent: false, verified: true }, tier: "free" });
  assert.equal((await payload(account.email)).consents.length, 1, "同意记录不动");
  // 忘记密码：发得出链接，重设后能用新密码登录，再用 Google 登录不再动它。
  const reset = createPasswordResetService(createPasswordResetStore(client as never, W), "s".repeat(32), () => at);
  await reset.request(account.email);
  const stored = (await payload(account.email)).passwordReset;
  assert.ok(stored?.tokenHash);
  const token = "a".repeat(43);
  await pool.query("update orbit_records set payload=jsonb_set(payload,'{passwordReset,tokenHash}',to_jsonb($2::text)) where record_id=$1", [authUserRecordId(account.email), passwordResetDigest(token)]);
  assert.deepEqual(await reset.reset(token, "password-two"), { success: true });
  later(60_000);
  await users().getOrCreateOAuthUser({ email: account.email, provider: "google", providerAccountId: "g2" });
  assert.equal((await users().verifyCredentials({ email: account.email, password: "password-two" })).state, "success");
});

test("已验证的账号被 Google 并入：密码不动", pgSkip, async () => {
  const account = await register("owner@example.test");
  await verification().send(account, "ja");
  await verification().confirm(tokenOf(mails[0]!));
  await users().getOrCreateOAuthUser({ email: account.email, provider: "google", providerAccountId: "g3" });
  assert.equal((await users().verifyCredentials({ email: account.email, password: "password-one" })).state, "success");
});

test("内存存储（mock）同一口径", async () => {
  const service = createAuthUserService({ provider: createStorageAuthUserProvider({ store: createMemoryLiveRecordStore() as never, workspaceId: "w" }) });
  await service.registerUser({ email: "m@example.test", password: "password-one" });
  await service.getOrCreateOAuthUser({ email: "m@example.test", provider: "google", providerAccountId: "g" });
  assert.equal((await service.verifyCredentials({ email: "m@example.test", password: "password-one" })).state, "failure");
});

test("同意记录：建号时写一条，登录与 Google 并入都不追加", pgSkip, async () => {
  const account = await register("consent@example.test");
  const google = await users().getOrCreateOAuthUser({ consent: { ...CONSENT, client: "app" }, email: "consent-g@example.test", provider: "google", providerAccountId: "g9" });
  assert.equal(google.state, "success");
  await users().getOrCreateOAuthUser({ consent: CONSENT, email: "consent-g@example.test", provider: "google", providerAccountId: "g9" });
  await users().getOrCreateOAuthUser({ consent: CONSENT, email: account.email, provider: "google", providerAccountId: "g8" });
  assert.deepEqual((await payload(account.email)).consents, [{ agreedAt: at.toISOString(), client: "web", method: "credentials", privacyVersion: "2026-11-25", termsVersion: "2026-11-25" }]);
  assert.deepEqual((await payload("consent-g@example.test")).consents, [{ agreedAt: at.toISOString(), client: "app", method: "google", privacyVersion: "2026-11-25", termsVersion: "2026-11-25" }]);
});

test("没有发信通道、或非生产又没有重定向地址：不算能发", () => {
  const smtp = { ACCESS_EMAIL_FROM: "o@example.test", ORBIT_PUBLIC_ORIGIN: "https://orbit.example", SMTP_HOST: "h", SMTP_PASS: "p", SMTP_USER: "u" };
  assert.equal(emailVerificationDeliverable({}), false);
  assert.equal(emailVerificationDeliverable(smtp), false);
  assert.equal(emailVerificationDeliverable({ ...smtp, ORBIT_MAIL_REDIRECT_TO: "qa@example.test" }), true);
  assert.equal(emailVerificationDeliverable({ ...smtp, NODE_ENV: "production", VERCEL_ENV: "production" }), true);
});

test("漏斗：每步每人一次，按第一天 × 端统计；没记过建号的老账号不进来", pgSkip, async () => {
  const funnel = createSignupFunnelStore(client as never, W);
  const visitor = randomUUID();
  await funnel.opened({ client: "web", source: "event", visitorId: visitor });
  await funnel.opened({ client: "web", source: "event", visitorId: visitor });
  await funnel.opened({ client: "web", source: "direct", visitorId: randomUUID() });
  await funnel.accountCreated({ client: "web", source: "event", userId: "u1", visitorId: visitor });
  for (const name of ["onboarding_step1", "onboarding_step1", "email_verified"] as const) await funnel.step({ client: null, name, userId: "u1" });
  await funnel.accountCreated({ client: "app", source: "direct", userId: "u2", visitorId: null });
  for (const name of ["onboarding_step1", "onboarding_step2", "onboarding_step3", "onboarding_finished"] as const) await funnel.step({ client: "app", name, userId: "u2" });
  await funnel.step({ client: "web", name: "onboarding_step1", userId: "old-account" });
  assert.equal((await pool.query("select count(*)::int as n from signup_funnel_events")).rows[0].n, 10);
  const rows = await readSignupFunnel(client as never, W, "2000-01-01", "2999-01-01");
  assert.deepEqual(rows.map(({ day: _day, ...row }) => row), [
    { client: "app", created: 1, finished: 1, fromEvent: 0, opened: 1, step1: 1, step2: 1, step3: 1, verified: 0 },
    { client: "web", created: 1, finished: 0, fromEvent: 1, opened: 2, step1: 1, step2: 0, step3: 0, verified: 1 },
  ]);
  assert.match(formatSignupFunnel(rows), /合计 {2,}web {2,}2 {2,}1 \(50%\)/u);
  await assert.rejects(pool.query("insert into signup_funnel_events (workspace_id,name,client,source,user_id) values ('w','something_else','web','direct','u')"));
});
