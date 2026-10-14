/**
 * R26（真实 PostgreSQL，只连回环库）：迁移「event-assessments-core」从零、重跑、checksum 守卫；仓储的幂等插入、按人隔离、
 * 认领租约、限速计数、海报短期资产。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { EVENT_ASSESSMENT_MIGRATIONS, runEventAssessmentMigrations } from "../../features/events/assessment/migrations";
import { createPostgresEventAssessmentRepository, type AssessmentRow } from "../../features/events/assessment/repository";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:event-assessments-test";

async function withDb(run: (input: { pool: Pool; repo: ReturnType<typeof createPostgresEventAssessmentRepository> }) => Promise<void>) {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `event_assessments_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema}` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, max: 6, pool: pool as never });
  try {
    await admin.query(`create schema ${schema}`);
    await runEventAssessmentMigrations(pool);
    await run({ pool, repo: createPostgresEventAssessmentRepository({ client, workspaceId: WS }) });
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

const row = (overrides: Partial<AssessmentRow> = {}): AssessmentRow => ({
  actorId: "actor:a", aiOperationId: null, attempts: 0, attendeeSignature: null, createdAt: "2026-10-07T01:00:00.000Z", eventId: null, factBasis: {}, facts: { startsAt: "2026-10-16T10:00:00+09:00", title: "Summit" },
  factsRefreshedAt: null, failureReason: null, id: `evas_${randomUUID()}`, idempotencyKey: "k1", leaseUntil: null, missingFields: [], pageCandidates: null, planItemId: null, posterAssetIds: [], promptVersion: null,
  readMs: null, rubricVersion: "event-score-v2", scoreBreakdown: [], sourceDigest: "url:abc", sourceHost: "x.jp", sourceKind: "url", sourceUrl: "https://x.jp/e", status: "reading", total: 0, totalMax: null,
  totalMin: null, updatedAt: "2026-10-07T01:00:00.000Z", userDecision: null, userFilledFields: [], verdict: "conditional", view: {}, ...overrides,
});

test("event-assessments-core：从零迁移、记录 checksum、重跑不变；改过的迁移被拒", databaseTest, async () => {
  await withDb(async ({ pool }) => {
    const applied = async () => (await pool.query("select version, name, checksum from event_assessments_schema_migrations order by version")).rows;
    assert.deepEqual(await applied(), EVENT_ASSESSMENT_MIGRATIONS.map(({ checksum, name, version }) => ({ checksum, name, version })));
    await runEventAssessmentMigrations(pool);
    assert.equal((await applied()).length, 1);
    await pool.query("update event_assessments_schema_migrations set checksum = 'tampered'");
    await assert.rejects(runEventAssessmentMigrations(pool), /checksum mismatch/u);
  });
});

test("仓储：幂等键 / 同一来源冲突返回已有行；按人隔离；认领租约；限速计数；海报资产", databaseTest, async () => {
  await withDb(async ({ repo }) => {
    const first = await repo.insert(row());
    assert.equal(first.created, true);
    const sameKey = await repo.insert(row({ id: "evas_other", sourceDigest: "url:zzz" }));
    assert.equal(sameKey.created, false);
    assert.equal(sameKey.row.id, first.row.id);
    const sameSource = await repo.insert(row({ id: "evas_other2", idempotencyKey: "k2" }));
    assert.equal(sameSource.row.id, first.row.id);
    assert.equal(await repo.get("actor:b", first.row.id), null);
    assert.deepEqual(await repo.list("actor:b", 10), []);
    const claimed = await repo.claimReading({ leaseMs: 60_000, limit: 5, now: "2026-10-07T01:00:10.000Z" });
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]!.attempts, 1);
    assert.equal((await repo.claimReading({ leaseMs: 60_000, limit: 5, now: "2026-10-07T01:00:20.000Z" })).length, 0, "leased");
    const reclaimed = await repo.claimReading({ leaseMs: 60_000, limit: 5, now: "2026-10-07T01:02:00.000Z" });
    assert.equal(reclaimed.length, 1, "lease expired");
    // 复核 S2：旧租约的执行者不能再写；新租约的可以。
    assert.equal(await repo.update("actor:a", first.row.id, { readMs: 1 }, { leaseUntil: claimed[0]!.leaseUntil }), null);
    assert.equal((await repo.update("actor:a", first.row.id, { readMs: 2 }, { leaseUntil: reclaimed[0]!.leaseUntil }))?.readMs, 2);
    assert.equal((await repo.listStaleReading({ limit: 5, olderThan: "2026-10-07T01:02:30.000Z" })).length, 0, "lease still live → not stale");
    assert.equal(await repo.countUrlFetchesSince({ actorId: "actor:a", since: "2026-10-07T00:59:00.000Z" }), 1);
    assert.equal(await repo.countUrlFetchesSince({ host: "x.jp", since: "2026-10-07T00:59:00.000Z" }), 1);
    const updated = await repo.update("actor:a", first.row.id, { facts: { title: "Summit 2" }, status: "ready", total: 82, userDecision: "added", verdict: "recommend" });
    assert.equal(updated?.total, 82);
    assert.equal(await repo.update("actor:b", first.row.id, { total: 1 }), null);
    assert.equal((await repo.listAddedExternal("actor:a", { from: "2026-10-01", limit: 20, until: "2026-12-01" })).length, 0, "facts.startsAt removed by the update");
    await repo.putPoster({ actorId: "actor:a", byteSize: 3, bytes: Buffer.from("abc"), createdAt: "2026-10-07T01:00:00.000Z", digest: "a".repeat(64), id: "p1", mimeType: "image/png" });
    assert.equal((await repo.getPosters("actor:b", ["p1"])).length, 0);
    assert.equal((await repo.getPosters("actor:a", ["p1"]))[0]?.bytes.toString(), "abc");
    assert.equal(await repo.purgePostersBefore("2026-10-08T00:00:00.000Z"), 1);
  });
});
