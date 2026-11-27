import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import {
  classifyRecipients, createRecordStoreNoticeLedger, loadMigratedAccounts, maskNoticeEmail, MIGRATED_FROM, NOTICE_FROM_NAME, NOTICE_SUBJECT,
  NOTICE_TEXT, runMigratedUserNotice, type MigratedAccountRow, type NoticeLedger, type NoticeLedgerEntry,
  noticeIntervalMs,
} from "../../features/account/announcements/migrated-user-notice";
import type { TransactionalMail, TransactionalMailer, TransactionalMailResult } from "../../features/mail/transactional";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const PROD = { NODE_ENV: "production", VERCEL_ENV: "production", SMTP_HOST: "smtp.test", SMTP_USER: "u", SMTP_PASS: "p", ORBIT_MAIL_FROM: "sender@orbit.test" };
const row = (id: string, email: string | null, extra: Partial<MigratedAccountRow> = {}): MigratedAccountRow =>
  ({ user_id: id, email, lifecycle_state: "active", deletion_requested: false, deletion_pending: false, ...extra });

function memoryLedger(): NoticeLedger & { rows: Map<string, NoticeLedgerEntry & { reason?: string | null }> } {
  const rows = new Map<string, NoticeLedgerEntry & { reason?: string | null }>();
  let tick = 0;
  return {
    rows,
    async load() { return new Map([...rows].map(([k, v]) => [k, { ...v }])); },
    async claim(_c, userId, previous) {
      const current = rows.get(userId) ?? null;
      if ((current?.version ?? null) !== (previous?.version ?? null)) return false;
      if (current && current.status !== "failed") return false;
      rows.set(userId, { status: "sending", attempts: (current?.attempts ?? 0) + 1, version: String(++tick), createdAt: current?.createdAt ?? "c" });
      return true;
    },
    async finish(_c, userId, status, reason, attempts) { rows.set(userId, { status, reason, attempts, version: String(++tick), createdAt: rows.get(userId)!.createdAt }); },
  };
}

function stubMailer(fail: (to: string) => TransactionalMailResult | "throw" | null = () => null) {
  const sent: TransactionalMail[] = [];
  const mailer: TransactionalMailer = {
    async send(mail) {
      const outcome = fail(mail.to);
      if (outcome === "throw") throw new Error(`boom ${mail.to}`);
      sent.push(mail);
      return outcome ?? { delivered: true, redirected: false };
    },
  };
  return { mailer, sent };
}

function collect() {
  const lines: string[] = [];
  return { lines, log: (label: string, value: unknown) => lines.push(`${label} ${JSON.stringify(value)}`) };
}

const fast = { sleep: async () => undefined, intervalMs: 0 };

test("recipients: only active, undeleted migrated accounts with a real address; duplicates and placeholders are counted", () => {
  const { recipients, excluded } = classifyRecipients([
    row("u1", " Alice@Gmail.com "), row("u2", "bob@qq.com"), row(null as never, "x@gmail.com"),
    row("u3", "c@gmail.com", { lifecycle_state: "deleted" }), row("u4", "d@gmail.com", { deletion_requested: true }),
    row("u5", "e@gmail.com", { deletion_pending: true }), row("u6", "not-an-email"), row("u7", null),
    row("u8", "f@example.com"), row("u9", "g@party.invalid"), row("u10", "alice@gmail.com"), row("u11", "noreply@foo.jp"),
  ]);
  assert.deepEqual(recipients, [{ userId: "u1", email: "alice@gmail.com" }, { userId: "u2", email: "bob@qq.com" }]);
  assert.deepEqual(excluded, { missing_id: 1, inactive: 1, deletion_in_progress: 2, invalid_email: 2, placeholder_domain: 3, duplicate: 1 });
  assert.equal(maskNoticeEmail("abcdef@gmail.com"), "ab***@gmail.com");
  assert.equal(maskNoticeEmail("ab@gmail.com"), "a***@gmail.com");
});

test("mode unset does nothing; dry prints counts, domains and masked samples only", async () => {
  const { mailer, sent } = stubMailer();
  const off = collect();
  let loaded = false;
  assert.deepEqual(await runMigratedUserNotice({ env: {}, mailer, log: off.log, loadRows: async () => { loaded = true; return []; }, ledger: memoryLedger() }), { mode: "off" });
  assert.equal(loaded, false);
  const dry = collect();
  const rows = Array.from({ length: 7 }, (_, i) => row(`u${i}`, `person${i}@${i % 2 ? "qq.com" : "gmail.com"}`)).concat(row("x", "y@example.com"));
  const summary = await runMigratedUserNotice({ env: { ORBIT_MIGRATION_NOTICE_MODE: "dry" }, mailer, log: dry.log, loadRows: async () => rows, ledger: memoryLedger() });
  assert.deepEqual(summary, { mode: "dry", recipients: 7 });
  assert.equal(sent.length, 0);
  const output = dry.lines.join("\n");
  assert.doesNotMatch(output, /person\d@/u);
  assert.match(output, /"pe\*\*\*@gmail\.com"/u);
  assert.match(output, /\["gmail\.com",4\],\["qq\.com",3\]/u);
  assert.match(output, /"placeholder_domain":1/u);
  assert.equal((output.match(/\*\*\*@/gu) ?? []).length, 5);
});

test("test mode sends the final text once to the given address, unprefixed, and writes no ledger row", async () => {
  const { mailer, sent } = stubMailer();
  const ledger = memoryLedger();
  const out = collect();
  await runMigratedUserNotice({ env: { ...PROD, ORBIT_MIGRATION_NOTICE_MODE: "test", ORBIT_MIGRATION_NOTICE_TEST_TO: "Ops@Example.org" }, mailer, log: out.log, ledger });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, "ops@example.org");
  assert.equal(sent[0]!.subject, NOTICE_SUBJECT);
  assert.equal(sent[0]!.text, NOTICE_TEXT);
  assert.equal(sent[0]!.fromName, NOTICE_FROM_NAME);
  assert.equal(ledger.rows.size, 0);
  assert.doesNotMatch(out.lines.join("\n"), /ops@example\.org/u);
  await assert.rejects(runMigratedUserNotice({ env: { ORBIT_MIGRATION_NOTICE_MODE: "test", ORBIT_MIGRATION_NOTICE_TEST_TO: "a@b.co" }, mailer, log: out.log }), /NOT_PRODUCTION_MAIL_ENVIRONMENT/u);
  await assert.rejects(runMigratedUserNotice({ env: { ...PROD, ORBIT_MIGRATION_NOTICE_MODE: "test" }, mailer, log: out.log }), /TEST_TO required/u);
  await assert.rejects(runMigratedUserNotice({ env: { ...PROD, SMTP_HOST: "", ORBIT_MIGRATION_NOTICE_MODE: "test", ORBIT_MIGRATION_NOTICE_TEST_TO: "a@b.co" }, mailer, log: out.log }), /SMTP_UNCONFIGURED/u);
});

test("apply refuses outside production mail and when the expected count does not match", async () => {
  const { mailer, sent } = stubMailer();
  const rows = [row("u1", "a1@gmail.com"), row("u2", "a2@gmail.com")];
  const out = collect();
  await assert.rejects(runMigratedUserNotice({ env: { ORBIT_MIGRATION_NOTICE_MODE: "apply", ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT: "2" }, mailer, log: out.log, loadRows: async () => rows, ledger: memoryLedger() }), /NOT_PRODUCTION/u);
  for (const expected of [undefined, "3", "1", "two"]) {
    await assert.rejects(runMigratedUserNotice({ env: { ...PROD, ORBIT_MIGRATION_NOTICE_MODE: "apply", ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT: expected }, mailer, log: out.log, loadRows: async () => rows, ledger: memoryLedger(), ...fast }), /EXPECTED_COUNT_MISMATCH/u);
  }
  assert.equal(sent.length, 0);
});

test("apply: a failure is recorded and the run goes on; a rerun sends only the failed one; nothing is sent twice", async () => {
  const rows = [row("u1", "a1@gmail.com"), row("u2", "a2@gmail.com"), row("u3", "a3@gmail.com"), row("u4", "a4@gmail.com")];
  const ledger = memoryLedger();
  const env = { ...PROD, ORBIT_MIGRATION_NOTICE_MODE: "apply", ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT: "4" };
  let broken = new Set(["a2@gmail.com", "a3@gmail.com"]);
  const first = stubMailer((to) => (to === "a2@gmail.com" && broken.has(to) ? "throw" : broken.has(to) ? { delivered: false, redirected: false, reason: "rejected" } : null));
  const out = collect();
  const one = await runMigratedUserNotice({ env, mailer: first.mailer, log: out.log, loadRows: async () => rows, ledger, ...fast });
  assert.equal(one.sent, 2);
  assert.equal(one.failed, 2);
  assert.deepEqual(one.failureReasons, { failed: 1, rejected: 1 });
  assert.deepEqual(first.sent.map((m) => m.to), ["a1@gmail.com", "a3@gmail.com", "a4@gmail.com"]);
  assert.ok(first.sent.every((m) => m.subject === NOTICE_SUBJECT && m.fromName === NOTICE_FROM_NAME));
  assert.doesNotMatch(out.lines.join("\n"), /a\d@gmail/u);
  assert.doesNotMatch(out.lines.join("\n"), /Orbit。/u);

  // A crash between claim and finish leaves `sending`: never retried.
  ledger.rows.set("u4", { ...ledger.rows.get("u4")!, status: "sending" });
  broken = new Set();
  const second = stubMailer();
  const two = await runMigratedUserNotice({ env, mailer: second.mailer, log: out.log, loadRows: async () => rows, ledger, ...fast });
  assert.deepEqual(second.sent.map((m) => m.to).sort(), ["a2@gmail.com", "a3@gmail.com"]);
  assert.deepEqual(two.skipped, { alreadySent: 1, uncertain: 1, claimedElsewhere: 0, deferred: 0 });
  assert.equal(ledger.rows.get("u2")!.attempts, 2);
  const third = stubMailer();
  const three = await runMigratedUserNotice({ env, mailer: third.mailer, log: out.log, loadRows: async () => rows, ledger, ...fast });
  assert.equal(third.sent.length, 0);
  assert.equal(three.skipped!.alreadySent, 3);
});

test("apply paces sends about a second apart and stops starting new ones when the time budget runs out", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => row(`u${i}`, `p${i}@gmail.com`));
  let clock = 0;
  const waits: number[] = [];
  const { mailer, sent } = stubMailer(() => { clock += 300; return null; });
  const summary = await runMigratedUserNotice({
    env: { ...PROD, ORBIT_MIGRATION_NOTICE_MODE: "apply", ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT: "5" }, mailer, log: () => undefined,
    loadRows: async () => rows, ledger: memoryLedger(), now: () => new Date(clock), sleep: async (ms) => { waits.push(ms); clock += ms; }, intervalMs: 1_000, budgetMs: 2_200,
  });
  assert.deepEqual(waits, [700, 700]);
  assert.equal(sent.length, 3);
  assert.equal(summary.skipped!.deferred, 2);
});

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
test("Postgres: recipient query reads current migrated sign-in rows; ledger claims once and retries only failures", { skip: !databaseUrl && "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  const schema = `migration_notice_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const client = { query: async <T>(sql: string, values?: readonly unknown[]) => pool.query(sql, values ? [...values] : undefined) as Promise<{ rows: T[] }> };
  const ws = "workspace:notice";
  const insert = (collection: string, id: string, payload: Record<string, unknown>, state = "active") => pool.query(`insert into orbit_records
    (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at,lifecycle_state)
    values ($1,$2,$3,null,'test',$3,$4::jsonb,now(),now(),$5)`, [ws, collection, id, JSON.stringify(payload), state]);
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await insert("auth_users", "auth_user:new@gmail.com", { id: "u1", email: "new@gmail.com", migratedFrom: MIGRATED_FROM, passwordHash: "h" });
    await insert("auth_users", "auth_user:leaving@gmail.com", { id: "u2", email: "leaving@gmail.com", migratedFrom: MIGRATED_FROM });
    await insert("account_deletion_requests", "del:u2", { userId: "u2", status: "pending" });
    await insert("auth_users", "auth_user:own@gmail.com", { id: "u3", email: "own@gmail.com" });
    await insert("auth_users", "auth_user:other@gmail.com", { id: "u4", email: "other@gmail.com", migratedFrom: "party-app:other" });
    const rows = await loadMigratedAccounts(client, ws);
    assert.deepEqual(rows.map((r) => [r.user_id, r.email, r.deletion_pending]).sort(), [["u1", "new@gmail.com", false], ["u2", "leaving@gmail.com", true]]);
    assert.deepEqual(Object.keys(rows[0]!).sort(), ["deletion_pending", "deletion_requested", "email", "lifecycle_state", "user_id"]);

    const ledger = createRecordStoreNoticeLedger(createPostgresLiveRecordStore({ client }) as never, ws);
    const at = new Date("2026-11-27T10:00:00.000Z");
    assert.equal(await ledger.claim("c", "u1", null, at), true);
    assert.equal(await ledger.claim("c", "u1", null, at), false, "a second run cannot claim the same recipient");
    await ledger.finish("c", "u1", "failed", "rejected", 1, at.toISOString(), at);
    const failed = (await ledger.load("c")).get("u1")!;
    assert.equal(failed.status, "failed");
    assert.equal(await ledger.claim("c", "u1", failed, at), true, "a failed row can be claimed again");
    assert.equal(await ledger.claim("c", "u1", failed, at), false, "but only once");
    await ledger.finish("c", "u1", "sent", null, 2, failed.createdAt, new Date(at.getTime() + 5_000));
    const sent = (await ledger.load("c")).get("u1")!;
    assert.deepEqual([sent.status, sent.attempts], ["sent", 2]);
    assert.equal(await ledger.claim("c", "u1", sent, new Date(at.getTime() + 9_000)), false);
    assert.equal((await ledger.load("other")).size, 0, "ledger rows are per campaign");
    const stored = (await pool.query("select payload::text as p from orbit_records where collection_name='announcement_deliveries'")).rows[0].p as string;
    assert.doesNotMatch(stored, /@/u, "the ledger stores no address");
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

test("send interval: 8 s by default (Gmail SMTP throttles bursts), ORBIT_MIGRATION_NOTICE_INTERVAL_MS within 1–60 s overrides", () => {
  assert.equal(noticeIntervalMs({}), 8_000);
  assert.equal(noticeIntervalMs({ ORBIT_MIGRATION_NOTICE_INTERVAL_MS: "12000" }), 12_000);
  assert.equal(noticeIntervalMs({ ORBIT_MIGRATION_NOTICE_INTERVAL_MS: "200" }), 8_000);
  assert.equal(noticeIntervalMs({ ORBIT_MIGRATION_NOTICE_INTERVAL_MS: "fast" }), 8_000);
});
