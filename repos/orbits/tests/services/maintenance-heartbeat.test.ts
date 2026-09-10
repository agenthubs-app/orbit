import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import {
  ensureMaintenanceHeartbeat,
  ensureMaintenanceHeartbeatSchema,
  isMaintenanceHeartbeatMessage,
  processMaintenanceHeartbeat,
  resolveMaintenanceIntervalSeconds,
  type MaintenanceHeartbeatMessage,
} from "../../features/operations/maintenance/heartbeat";
import type { MaintenancePassResult } from "../../features/operations/maintenance/pass";

test("heartbeat message guard accepts only the exact shape", () => {
  const chainId = randomUUID();
  assert.ok(isMaintenanceHeartbeatMessage({ version: 1, kind: "maintenance-heartbeat", chainId, seq: 0 }));
  assert.ok(!isMaintenanceHeartbeatMessage({ version: 1, kind: "maintenance-heartbeat", chainId, seq: -1 }));
  assert.ok(!isMaintenanceHeartbeatMessage({ version: 1, kind: "maintenance-heartbeat", chainId, seq: 1.5 }));
  assert.ok(!isMaintenanceHeartbeatMessage({ version: 1, kind: "maintenance-heartbeat", chainId: "x", seq: 0 }));
  assert.ok(!isMaintenanceHeartbeatMessage({ version: 1, kind: "maintenance-heartbeat", chainId, seq: 0, extra: 1 }));
  assert.ok(!isMaintenanceHeartbeatMessage({ version: 1, pipeline: "v1" }));
  assert.ok(!isMaintenanceHeartbeatMessage(null));
});

test("maintenance interval is clamped to one minute .. one hour", () => {
  assert.equal(resolveMaintenanceIntervalSeconds({}), 600);
  assert.equal(resolveMaintenanceIntervalSeconds({ ORBIT_MAINTENANCE_INTERVAL_SECONDS: "5" }), 60);
  assert.equal(resolveMaintenanceIntervalSeconds({ ORBIT_MAINTENANCE_INTERVAL_SECONDS: "99999" }), 3600);
  assert.equal(resolveMaintenanceIntervalSeconds({ ORBIT_MAINTENANCE_INTERVAL_SECONDS: "300" }), 300);
  assert.equal(resolveMaintenanceIntervalSeconds({ ORBIT_MAINTENANCE_INTERVAL_SECONDS: "abc" }), 600);
});

const pass = (): MaintenancePassResult => ({
  startedAt: "2026-09-08T00:00:00.000Z", durationMs: 1, budgetMs: 240_000, ok: 0, failed: 0, skipped: 0, tasks: [],
});

test("Postgres heartbeat keeps exactly one live chain per workspace across duplicates, lost sends and restarts", { timeout: 60_000 }, async (t) => {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) {
    t.skip("live database not configured");
    return;
  }
  const schema = `maintenance_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: config.connectionString, max: 1 });
  const url = new URL(config.connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: url.toString(), max: 3 });
  const workspaceId = "workspace:maintenance%_";
  const other = "workspace:other";
  let clock = Date.parse("2026-09-08T00:00:00.000Z");
  const now = () => new Date(clock);
  const sent: Array<{ message: MaintenanceHeartbeatMessage; delaySeconds: number }> = [];
  const send = async (message: MaintenanceHeartbeatMessage, delaySeconds: number) => { sent.push({ message, delaySeconds }); };
  const failingSend = async () => { throw new Error("queue offline"); };
  let passes = 0;
  const runPass = async () => { passes++; return pass(); };
  const row = async (workspace = workspaceId) => {
    const result = await pool.query("SELECT chain_id, seq::int, dispatched_seq::int, next_due_at, last_result FROM orbit_maintenance_heartbeat WHERE workspace_id = $1", [workspace]);
    return result.rows[0] as { chain_id: string; seq: number; dispatched_seq: number; next_due_at: Date; last_result: unknown } | undefined;
  };
  try {
    await admin.query(`create schema ${schema}`);
    await ensureMaintenanceHeartbeatSchema(pool);
    await ensureMaintenanceHeartbeatSchema(pool); // idempotent under the advisory lock

    // Start: one chain, one delayed seq-0 message.
    const started = await ensureMaintenanceHeartbeat({ pool, workspaceId, send, intervalSeconds: 600, now });
    assert.equal(started.outcome, "started");
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { message: { version: 1, kind: "maintenance-heartbeat", chainId: started.chainId, seq: 0 }, delaySeconds: 600 });
    assert.equal((await row())?.dispatched_seq, 0);

    // A live chain is left alone; another workspace gets its own chain.
    clock += 300_000;
    assert.equal((await ensureMaintenanceHeartbeat({ pool, workspaceId, send, intervalSeconds: 600, now })).outcome, "alive");
    assert.equal(sent.length, 1);
    const otherChain = await ensureMaintenanceHeartbeat({ pool, workspaceId: other, send, intervalSeconds: 600, now });
    assert.equal(otherChain.outcome, "started");
    assert.notEqual(otherChain.chainId, started.chainId);
    assert.equal(sent.length, 2);

    // Tick seq 0 runs a pass and enqueues seq 1.
    clock += 300_000;
    const tick0 = sent[0].message;
    const ran = await processMaintenanceHeartbeat(tick0, { pool, workspaceId, runPass, send, intervalSeconds: 600, now });
    assert.equal(ran.outcome, "ran");
    assert.equal(passes, 1);
    assert.equal(sent.length, 3);
    assert.equal(sent[2].message.seq, 1);
    assert.equal(sent[2].message.chainId, started.chainId);
    const afterRun = await row();
    assert.equal(afterRun?.seq, 1);
    assert.equal(afterRun?.dispatched_seq, 1);
    assert.equal(afterRun?.next_due_at.toISOString(), new Date(clock + 600_000).toISOString());
    assert.ok(afterRun?.last_result);

    // Duplicate delivery of seq 0 after a confirmed send: dropped, no pass, no send.
    const duplicate = await processMaintenanceHeartbeat(tick0, { pool, workspaceId, runPass, send, intervalSeconds: 600, now });
    assert.equal(duplicate.outcome, "superseded");
    assert.equal(passes, 1);
    assert.equal(sent.length, 3);

    // Tick seq 1 whose send fails: the pass ran once, the row advanced, and the
    // queue retry of the same message only re-sends without a second pass.
    clock += 600_000;
    const tick1 = sent[2].message;
    await assert.rejects(processMaintenanceHeartbeat(tick1, { pool, workspaceId, runPass, send: failingSend, intervalSeconds: 600, now }), /queue offline/);
    assert.equal(passes, 2);
    assert.equal((await row())?.seq, 2);
    assert.equal((await row())?.dispatched_seq, 1);
    const resent = await processMaintenanceHeartbeat(tick1, { pool, workspaceId, runPass, send, intervalSeconds: 600, now });
    assert.equal(resent.outcome, "resent");
    assert.equal(passes, 2);
    assert.equal(sent.length, 4);
    assert.equal(sent[3].message.seq, 2);
    assert.equal((await row())?.dispatched_seq, 2);
    // And a further redelivery is now a plain duplicate.
    assert.equal((await processMaintenanceHeartbeat(tick1, { pool, workspaceId, runPass, send, intervalSeconds: 600, now })).outcome, "superseded");
    assert.equal(sent.length, 4);

    // Not overdue yet (one interval late is within the two-interval grace).
    clock += 600_000 + 300_000;
    assert.equal((await ensureMaintenanceHeartbeat({ pool, workspaceId, send, intervalSeconds: 600, now })).outcome, "alive");

    // Dead chain: overdue by more than two intervals → restarted with a new
    // chain, and the old chain's pending tick is rejected.
    clock += 2 * 600_000;
    const restarted = await ensureMaintenanceHeartbeat({ pool, workspaceId, send, intervalSeconds: 600, now });
    assert.equal(restarted.outcome, "restarted");
    assert.notEqual(restarted.chainId, started.chainId);
    assert.equal(sent.at(-1)?.message.chainId, restarted.chainId);
    assert.equal(sent.at(-1)?.message.seq, 0);
    const stale = await processMaintenanceHeartbeat(sent[3].message, { pool, workspaceId, runPass, send, intervalSeconds: 600, now });
    assert.equal(stale.outcome, "superseded");
    assert.equal(passes, 2);
    assert.equal((await row())?.chain_id, restarted.chainId);

    // A tick for an unknown workspace never runs or re-enqueues.
    const unknown = await processMaintenanceHeartbeat(sent.at(-1)!.message, { pool, workspaceId: "workspace:missing", runPass, send, intervalSeconds: 600, now });
    assert.equal(unknown.outcome, "superseded");
    assert.equal(passes, 2);

    // The other workspace's chain is untouched throughout.
    assert.equal((await row(other))?.chain_id, otherChain.chainId);
    assert.equal((await row(other))?.seq, 0);

    // Concurrent duplicate ticks: only one runs.
    const fresh = sent.at(-1)!.message;
    const before = passes;
    const results = await Promise.all([0, 1, 2].map(() =>
      processMaintenanceHeartbeat(fresh, { pool, workspaceId, runPass, send, intervalSeconds: 600, now })));
    assert.equal(passes, before + 1);
    assert.deepEqual(results.map((result) => result.outcome).sort(), ["ran", "superseded", "superseded"]);
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
