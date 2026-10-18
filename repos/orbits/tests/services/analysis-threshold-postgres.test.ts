/**
 * W0054 SC-03（真实 PostgreSQL，`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）：人脉分析门槛。
 *
 * - 门槛计数 = 引导第 1 步同一条语句（`createPostgresConfirmedContactCounter`／`CONFIRMED_CONTACT_COUNT_SQL`）、同一常量；
 * - 已确认联系人删到 2 位、计划正处阶段边界时打开结构／机会／概览：快照读取 0 次、快照生成 0 次、计划生成器（补细器）0 次、
 *   任何表 0 次 INSERT／UPDATE／DELETE（R-6、D46③）、付费 AI 0 次；返回的数据里没有旧快照句子，统计（高亮、覆盖度、待唤醒）照常；
 * - 补回到 3 位（W54-4）：按 W0048a 恢复规则排队重算，完成前结构标签是「正在更新分析」、不回显旧快照；后台池顺延时是「明天更新」。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildNetworkOverviewData } from "../../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import { createStorageGuideStateService, type GuideStatePayload } from "../../features/guide/guide-state";
import { CONFIRMED_CONTACT_COUNT_SQL, createPostgresConfirmedContactCounter, createPostgresConfirmedContactSampler, GUIDE_REQUIRED_CONTACTS, readGuideStatusForActor, readStartGuideForActor } from "../../features/guide/progress";
import { confirmedContactPredicate } from "../../features/contacts/confirmed-contact-predicate";
import { confirmedContactPredicate as snapshotPredicate } from "../../features/network-analysis/repository";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { NETWORK_ANALYSIS_MIN_CONTACTS } from "../../features/network-analysis/analysis-threshold";
import { readAnalysisThreshold } from "../../features/network-analysis/analysis-threshold-reader";
import { readEvidenceContactNames } from "../../features/network-analysis/evidence-contacts";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { buildMockSnapshotContent, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import type { PlanService } from "../../features/plans/contract";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { PAID_AI_HOSTS } from "../../scripts/test-paid-ai-boundary.mjs";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-02T03:00:00.000Z");

function countingGenerator(): NetworkSnapshotGenerator & { calls: number } {
  const generator = {
    billable: true, calls: 0, model: "fake-model", promptVersion: "test-v1", provider: "deepseek" as const,
    async generate(input: SnapshotInput) {
      generator.calls += 1;
      return { content: buildMockSnapshotContent(input), usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return generator;
}

async function installWriteCounter(harness: NetworkHarness) {
  await harness.pool.query(`create table w54_write_log (table_name text not null, op text not null)`);
  await harness.pool.query(`create function w54_count_write() returns trigger language plpgsql as $$ begin insert into w54_write_log values (TG_TABLE_NAME, TG_OP); return null; end $$`);
  const tables = (await harness.pool.query(`select tablename from pg_tables where schemaname = $1 and tablename <> 'w54_write_log'`, [harness.schema])).rows.map((row) => String(row.tablename));
  for (const table of tables) {
    await harness.pool.query(`create trigger w54_count after insert or update or delete on ${table} for each statement execute function w54_count_write()`);
  }
  return {
    tables,
    async reset() { await harness.pool.query(`truncate w54_write_log`); },
    async byTable() {
      return (await harness.pool.query(`select table_name, op, count(*)::int as n from w54_write_log group by 1, 2 order by 1, 2`)).rows;
    },
  };
}

function guardedPlanService(harness: NetworkHarness, refinements: { count: number }): { service: PlanService; raw: PlanService } {
  const raw = createPlanService({
    now: () => NOW.toISOString(),
    phaseRefiner: async () => { refinements.count += 1; return { inserts: [], weekUpdates: [] }; },
    references: createPostgresPlanReferenceValidator({ actorId: ALICE, client: harness.pool, eventCore: null, workspaceId: WORKSPACE }),
    repository: createPostgresPlanRepository({ pool: harness.pool }),
    scope: { actorId: ALICE, workspaceId: WORKSPACE },
  });
  return {
    raw,
    service: {
      ...raw,
      enterCurrentPhase: async () => { throw new Error("enterCurrentPhase must not be called"); },
      getCurrentView: async () => { throw new Error("getCurrentView must not be called"); },
    },
  };
}

function countPaidFetch(t: { after: (fn: () => void) => void }) {
  const original = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : (input as Request).url;
    if (PAID_AI_HOSTS.includes(new URL(url).hostname)) hits.push(url);
    return original(input as never, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  return hits;
}

test("W0054 SC-03 (review P2-1): guide count, threshold and snapshot share one confirmed-contact predicate (name required) and constant", () => {
  assert.equal(NETWORK_ANALYSIS_MIN_CONTACTS, GUIDE_REQUIRED_CONTACTS);
  assert.match(CONFIRMED_CONTACT_COUNT_SQL, /select count\(\*\)::integer as total/);
  assert.ok(CONFIRMED_CONTACT_COUNT_SQL.includes(confirmedContactPredicate("c")));
  assert.equal(snapshotPredicate, confirmedContactPredicate, "the snapshot repository re-exports the same predicate");
  assert.match(confirmedContactPredicate("c"), /displayName'\), ''\) <> ''/);
});

