/**
 * W0057 SC-05：心跳链跟随新部署（rev 2 G-9）。
 * 构建 A 拥有链 → 构建 B（更新）`ensure` 原子换链并发首个 tick → A 收到旧链／新链 tick 都 superseded（不跑 pass、不续发）
 * → A 再 `ensure` 抢不回 → 删除链行后任一构建可重建；schema SQL 对已有旧表补列；`last_result` 记 deploymentId 与任务名单；
 * 本地（无构建标记）行为不变；`ORBIT_MAINTENANCE_HEARTBEAT=0` 不启用。
 * 连本机 `orbit_reminder_test`（与 maintenance-heartbeat.test.ts 同一约定），随机 schema。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { maintenanceHeartbeatEnabled } from "../../features/operations/maintenance/configured";
import {
  ensureMaintenanceHeartbeat,
  ensureMaintenanceHeartbeatSchema,
  processMaintenanceHeartbeat,
  type MaintenanceDeploymentIdentity,
  type MaintenanceHeartbeatMessage,
} from "../../features/operations/maintenance/heartbeat";
import type { MaintenancePassResult } from "../../features/operations/maintenance/pass";

const BUILD_A: MaintenanceDeploymentIdentity = { buildAt: "2026-10-03T09:00:00.000Z", deploymentId: "dpl_A" };
const BUILD_B: MaintenanceDeploymentIdentity = { buildAt: "2026-10-03T12:00:00.000Z", deploymentId: "dpl_B" };

const pass = (): MaintenancePassResult => ({
  budgetMs: 240_000, durationMs: 1, failed: 0, ok: 2, skipped: 0, startedAt: "2026-10-03T12:00:00.000Z",
  tasks: [{ durationMs: 1, name: "plan-matching", status: "ok" }, { durationMs: 1, name: "contact-insights", status: "ok" }],
});

test("heartbeat is disabled off Vercel and with ORBIT_MAINTENANCE_HEARTBEAT=0", () => {
  assert.equal(maintenanceHeartbeatEnabled({ VERCEL: "1" } as unknown as NodeJS.ProcessEnv), true);
  assert.equal(maintenanceHeartbeatEnabled({ ORBIT_MAINTENANCE_HEARTBEAT: "0", VERCEL: "1" } as unknown as NodeJS.ProcessEnv), false);
  assert.equal(maintenanceHeartbeatEnabled({} as unknown as NodeJS.ProcessEnv), false);
});

test("Postgres: a newer build takes the chain over, the older build is superseded and can never take it back", { timeout: 60_000 }, async (t) => {
  const databaseUrl = process.env.ORBIT_MAINTENANCE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip("explicit local maintenance test database not configured");
    return;
  }
  const url = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "maintenance tests require a local database");
  assert.equal(url.pathname, "/orbit_reminder_test", "maintenance tests require the dedicated orbit_reminder_test database");
  const schema = `maintenance_deploy_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: url.toString(), max: 3 });
  const workspaceId = "workspace:deploy";
  let clock = Date.parse("2026-10-03T12:00:00.000Z");
  const now = () => new Date(clock);
  const sent: MaintenanceHeartbeatMessage[] = [];
  const send = async (message: MaintenanceHeartbeatMessage) => { sent.push(message); };
  let passes = 0;
  const runPass = async () => { passes += 1; return pass(); };
  const row = async () => (await pool.query("SELECT chain_id, seq::int, owner_deployment_id, owner_build_at, last_result FROM orbit_maintenance_heartbeat WHERE workspace_id = $1", [workspaceId])).rows[0] as
    { chain_id: string; seq: number; owner_deployment_id: string | null; owner_build_at: Date | null; last_result: Record<string, unknown> | null } | undefined;
  try {
    await admin.query(`create schema ${schema}`);
    // 旧代码建的表（没有拥有者列）：schema SQL 必须补列（create table if not exists 对已有表不生效）。
    await pool.query(`create table orbit_maintenance_heartbeat (
      workspace_id text primary key, chain_id text not null, seq bigint not null default 0, dispatched_seq bigint not null default 0,
      interval_seconds integer not null, next_due_at timestamptz not null, last_run_at timestamptz, last_result jsonb,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
    await pool.query(`insert into orbit_maintenance_heartbeat (workspace_id, chain_id, interval_seconds, next_due_at) values ($1, $2, 600, $3)`,
      [workspaceId, randomUUID(), new Date(clock + 600_000)]);
    await ensureMaintenanceHeartbeatSchema(pool);
    await ensureMaintenanceHeartbeatSchema(pool);
    const columns = (await pool.query(`select column_name from information_schema.columns where table_schema = $1 and table_name = 'orbit_maintenance_heartbeat'`, [schema])).rows.map((entry) => entry.column_name);
    assert.ok(columns.includes("owner_deployment_id") && columns.includes("owner_build_at"));

    // 本地（无构建标记）：活链不动，行为与现状一致。
    assert.equal((await ensureMaintenanceHeartbeat({ now, pool, send, workspaceId })).outcome, "alive");
    assert.equal(sent.length, 0);
    // 旧代码的链（没有拥有者）→ 新部署 A 接管。
    const takenByA = await ensureMaintenanceHeartbeat({ identity: BUILD_A, now, pool, send, workspaceId });
    assert.equal(takenByA.outcome, "taken_over");
    assert.equal((await row())?.owner_deployment_id, "dpl_A");
    const tickA = sent.at(-1)!;
    assert.deepEqual([tickA.chainId, tickA.seq], [takenByA.chainId, 0]);
    assert.equal((await ensureMaintenanceHeartbeat({ identity: BUILD_A, now, pool, send, workspaceId })).outcome, "alive", "same build: no churn");

    // 构建 B（更新）调 ensure：原子换新 chain_id、seq 归零、发首个 tick。
    clock += 60_000;
    const takenByB = await ensureMaintenanceHeartbeat({ identity: BUILD_B, now, pool, send, workspaceId });
    assert.equal(takenByB.outcome, "taken_over");
    assert.notEqual(takenByB.chainId, takenByA.chainId);
    const current = await row();
    assert.deepEqual([current?.chain_id, current?.seq, current?.owner_deployment_id, current?.owner_build_at?.toISOString()], [takenByB.chainId, 0, "dpl_B", BUILD_B.buildAt]);
    const tickB = sent.at(-1)!;
    assert.deepEqual([tickB.chainId, tickB.seq], [takenByB.chainId, 0]);

    // A 收到旧链的 tick：superseded，不跑 pass、不续发。
    const sentBefore = sent.length;
    assert.equal((await processMaintenanceHeartbeat(tickA, { identity: BUILD_A, now, pool, runPass, send, workspaceId })).outcome, "superseded");
    // 新链的 tick 若落到 A（拥有者构建更新于 A）：同样 superseded。
    assert.equal((await processMaintenanceHeartbeat(tickB, { identity: BUILD_A, now, pool, runPass, send, workspaceId })).outcome, "superseded");
    assert.equal(passes, 0);
    assert.equal(sent.length, sentBefore);
    // A 再调 ensure：抢不回（防来回抢）。
    assert.equal((await ensureMaintenanceHeartbeat({ identity: BUILD_A, now, pool, send, workspaceId })).outcome, "alive");
    assert.equal((await row())?.chain_id, takenByB.chainId);
    assert.equal(sent.length, sentBefore);

    // B 处理自己的 tick：跑 pass、续发；last_result 记 deploymentId 与任务名单（含 contact-insights）。
    const ran = await processMaintenanceHeartbeat(tickB, { identity: BUILD_B, now, pool, runPass, send, workspaceId });
    assert.equal(ran.outcome, "ran");
    assert.equal(passes, 1);
    assert.deepEqual([sent.at(-1)!.chainId, sent.at(-1)!.seq], [takenByB.chainId, 1]);
    const lastResult = (await row())?.last_result;
    assert.equal(lastResult?.deploymentId, "dpl_B");
    assert.deepEqual(lastResult?.taskNames, ["plan-matching", "contact-insights"]);

    // 回滚运维步骤：删除链行后，任一构建（这里是更旧的 A）都能重建。
    await pool.query("delete from orbit_maintenance_heartbeat where workspace_id = $1", [workspaceId]);
    const rebuilt = await ensureMaintenanceHeartbeat({ identity: BUILD_A, now, pool, send, workspaceId });
    assert.equal(rebuilt.outcome, "started");
    assert.equal((await row())?.owner_deployment_id, "dpl_A");
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
