import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPasswordResetStore } from "../../features/auth/password-reset-store";
import { createPasswordResetService } from "../../features/auth/password-reset-service";
import { handlePasswordResetRequest } from "../../features/auth/password-reset-http";
import { PasswordResetDeliveryPending, processPasswordResetQueueWake } from "../../features/auth/password-reset-queue-worker";

test("password reset acceptance waits for durable publication and exposes no account-specific failure", async () => {
  const request = () => new Request("https://orbit.example/api/auth/password-reset/request", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "member@example.com" }),
  });
  const events: string[] = [];
  const resolve = () => ({ origin: "https://orbit.example", service: { request: async () => { events.push("persist"); return { success: true }; } } }) as never;
  let release!: () => void;
  const blocked = new Promise<void>((done) => { release = done; });
  let finished = false;
  const response = handlePasswordResetRequest(request(), "request", resolve, async () => { events.push("publish"); await blocked; }).then((value) => { finished = true; return value; });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(events, ["persist", "publish"]);
  assert.equal(finished, false);
  release();
  assert.equal((await response).status, 202);
  const failure = await handlePasswordResetRequest(request(), "request", resolve, async () => { throw new Error("private provider details"); });
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /member@example|private provider details/);
});

test("queued delivery survives future retries and a crashed lease, then stops at the durable attempt limit", async () => {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  assert.ok(config);
  const schema = `reset_queue_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: config.connectionString, max: 1 });
  const url = new URL(config.connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  const client = { async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
    const result = await pool.query(text, values ? [...values] : undefined);
    return { rows: result.rows as TRow[] };
  } };
  const secret = "test-only-password-reset-queue-secret";
  let clock = new Date();
  let rejectMail = true;
  let sends = 0;
  const now = () => clock;
  const store = () => createPasswordResetStore(client, "test:queue");
  const runtime = () => ({ store: store(), secret, origin: "https://orbit.example", mailer: { async send() {
    sends += 1;
    if (rejectMail) throw new Error("temporary delivery failure");
  } } });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,source_type,source_id,payload,created_at,updated_at)
      values ('test:queue','auth_users','auth_user:member@example.com','manual','test',
        '{"email":"member@example.com","passwordHash":"test-existing-password-hash"}',now(),now())`);
    const service = createPasswordResetService(store(), secret, now);
    await service.request("member@example.com");
    await assert.rejects(processPasswordResetQueueWake(runtime(), now), PasswordResetDeliveryPending);
    assert.equal(sends, 1);
    await assert.rejects(processPasswordResetQueueWake(runtime(), now), PasswordResetDeliveryPending);
    assert.equal(sends, 1, "a future retry must remain queued without sending early");
    assert.equal(await createPasswordResetStore(client, "other:workspace").hasPendingDelivery(now().toISOString()), false);

    clock = new Date(clock.getTime() + 11_000);
    assert.ok(await store().claim(clock.toISOString(), new Date(clock.getTime() + 60_000).toISOString(), "crashed-worker"));
    await assert.rejects(processPasswordResetQueueWake(runtime(), now), PasswordResetDeliveryPending);
    assert.equal(sends, 1);
    clock = new Date(clock.getTime() + 61_000);
    rejectMail = false;
    await processPasswordResetQueueWake(runtime(), now);
    assert.equal(sends, 2, "a reconstructed worker resumes after the old lease expires");
    assert.equal(await store().hasPendingDelivery(clock.toISOString()), false);
    await processPasswordResetQueueWake(runtime(), now);
    assert.equal(sends, 2);

    await service.request("member@example.com");
    rejectMail = true;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      if (attempt < 5) await assert.rejects(processPasswordResetQueueWake(runtime(), now), PasswordResetDeliveryPending);
      else await processPasswordResetQueueWake(runtime(), now);
      clock = new Date(clock.getTime() + 300_000);
    }
    const reset = (await pool.query("select payload->'passwordReset' as reset from orbit_records")).rows[0].reset;
    assert.equal(reset.delivery, "failed");
    assert.equal(reset.attempts, 5);
    assert.equal(reset.sealedToken, "");
    assert.equal(await store().hasPendingDelivery(clock.toISOString()), false);
    await service.request("unknown@example.com");
    await processPasswordResetQueueWake(runtime(), now);
    assert.equal(sends, 7);
  } finally {
    await pool.end();
    try { await admin.query(`drop schema if exists ${schema} cascade`); }
    finally { await admin.end(); }
  }
});
