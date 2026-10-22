/**
 * R27 SC-R27-10（A5）：账本迁移 v4「ai-usage-event-purposes」——两个现有活动 AI 调用（报名访谈 / 会後まとめ）可记账、
 * max_calls 按用途、不设月上限；未知用途仍被 CHECK 拒绝；重跑幂等。真实 PostgreSQL（本机回环库，随机 schema）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { AI_QUOTA_MAX_CALLS, AI_QUOTA_MONTHLY_LIMITS } from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { NETWORK_ANALYSIS_MIGRATIONS, runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:r27-ledger";

test("ledger v4 accepts the event registration / post-event purposes (record only) and still rejects unknown purposes", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `r27_ledger_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runNetworkAnalysisMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    const applied = (await pool.query("select name from network_analysis_schema_migrations order by version")).rows.map((row) => row.name);
    assert.equal(applied.length, NETWORK_ANALYSIS_MIGRATIONS.length);
    assert.ok(applied.includes("ai-usage-event-purposes"));

    const ledger = createPostgresAiUsageLedger({ client: createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never }), workspaceId: WS });
    const now = new Date("2026-10-15T03:00:00.000Z");
    // LF4 / LF13: the self-introduction has a monthly limit of 30 and interview questions a daily limit of 40 — both above
    // the 12 reservations below; the post-event summary and matching stay record-only.
    assert.equal(AI_QUOTA_MONTHLY_LIMITS.event_registration_interview, 30);
    for (const purpose of ["event_registration_interview", "event_registration_question", "event_post_summary", "event_matching"] as const) {
      if (purpose === "event_post_summary" || purpose === "event_matching") assert.equal(AI_QUOTA_MONTHLY_LIMITS[purpose], undefined, `${purpose} has no monthly limit`);
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const reserved = await ledger.reserve({ actorId: "actor:a", idempotencyKey: `${purpose}:${n}`, now, pool: "system", purpose, trigger: "auto" });
        assert.equal(reserved.ok, true, `${purpose} #${n}`);
      }
      const stored = (await pool.query("select max_calls from ai_usage_ledger where idempotency_key = $1", [`${purpose}:1`])).rows[0];
      assert.equal(stored.max_calls, AI_QUOTA_MAX_CALLS[purpose]);
    }
    await assert.rejects(pool.query(`insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, max_calls) values ($1, 'x', 'a', '2026-10-15', 'user', 'event_bogus', 'manual', 'k', 1)`, [WS]));
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
