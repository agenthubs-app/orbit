import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createLifecycleTaskPagesReader, lifecycleGroups, type LifecycleCursors } from "../../features/followups/storage/lifecycle-task-pages";
import { createLifecycleHomeSummaryReader } from "../../features/followups/storage/lifecycle-home-summary";
import { createRelationshipTaskPageReader } from "../../features/connections/lifecycle/task-page";
import { createRelationshipLifecycleFactsReader } from "../../features/followups/storage/relationship-lifecycle-facts-reader";
import { loadHomeFacts } from "../../app/(app)/app/agent/home-facts-route-service";
import { seedSortFixture, SORT_FIXTURE_AT } from "../support/lifecycle-sort-fixture";

// Sprint 0126: the lifecycle readers used to refuse every Node runtime except
// 25.6.0 / ICU 78.2 (LIFECYCLE_SORT_RUNTIME_UNVERIFIED), which silently emptied the
// home follow-ups and broke the relationship task pages on Node 24 (Vercel LTS) and
// 25.8.1. Their order is computed entirely by PostgreSQL (und-x-icu); Node never
// sorts these rows. These orders were recorded from the legacy localeCompare oracle
// on Node 25.6.0 / ICU 78.2 in a server locale (en-US or C) and are identical on
// 24.21.0 / ICU 78.3 and 25.8.1. The oracle does move with the host locale (ja-JP and
// zh-CN order Han and Greek differently) on every Node version, which the old Node pin
// never covered; the SQL order does not depend on either.
// Run this file under any Node version and locale: the SQL order must equal this order.
const LEGACY_CURRENT: readonly string[] = ["😀","9","a-2","A2","æ","é","I","İ","l","ñ","pad:001","pad:004","pad:006","pad:011","pad:014","pad:019","pad:021","pad:024","pad:026","pad:029","pad:031","pad:034","pad:036","pad:039","ss","task:0010","ｚ","トウキョウ","东京","09","a2","Ł","pad:000","pad:005","pad:010","pad:015","pad:020","pad:025","pad:035","SS","Z","도쿄","🧑‍💻","10","a 2","e","ı","o","pad:003","pad:008","pad:013","pad:018","pad:028","pad:033","pad:038","ß","とうきょう","🙂","É","i","ø","pad:007","pad:012","pad:017","pad:022","pad:027","pad:032","task:0009","Ｚ","ω","東京"];
const LEGACY_HISTORY: readonly string[] = ["pad:009","pad:016","z","Ω","ae","E","pad:030","pad:023","Task:0009","a_2","pad:002","pad:037"];
const secret = "local-test-only-".repeat(4);

async function database(t: TestContext, run: (pool: Pool) => Promise<void>) {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.search, ""); assert.equal(url.hash, "");
  const schema = `lifecycle_sort_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=60000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await seedSortFixture(pool);
    t.diagnostic(`node ${process.versions.node} icu ${process.versions.icu}`);
    await run(pool);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
}

/** Rewrites the runtime tuple PostgreSQL reports, to prove drift still fails closed. */
function driftedClient(pool: Pool, drift: Record<string, unknown>): LiveRecordSqlClient {
  return { async query(text, values) {
    const result = await pool.query(text, values as unknown[]);
    for (const row of result.rows as { result?: { runtime?: Record<string, unknown> } }[]) {
      if (row.result?.runtime) row.result.runtime = { ...row.result.runtime, ...drift };
    }
    return result as never;
  } };
}

const skip = !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;

test("lifecycle task pages return the frozen legacy order across every cursor on this Node runtime", { skip }, async (t) => database(t, async pool => {
  const reader = createLifecycleTaskPagesReader({ client: pool, workspaceId: "w", secret });
  const first = await reader.read("a");
  assert.deepEqual(first.counts, { current: LEGACY_CURRENT.length, history: LEGACY_HISTORY.length, orphan: 0 });
  const expected = { current: LEGACY_CURRENT, history: LEGACY_HISTORY, orphan: [] as string[] };
  for (const group of lifecycleGroups) {
    const ids: string[] = []; const cursors: LifecycleCursors = {}; let page = first;
    for (;;) {
      ids.push(...page.pages[group].items.map(item => item.id));
      const next = page.pages[group].nextCursor;
      if (!next) break;
      cursors[group] = next; page = await reader.read("a", cursors);
    }
    assert.deepEqual(ids, expected[group], group);
  }
  assert.ok(first.pages.current.nextCursor, "the fixture spans several 30-item pages");
}));

test("relationship task page returns the frozen legacy order for both modes on this Node runtime", { skip }, async (t) => database(t, async pool => {
  const reader = createRelationshipTaskPageReader({ client: pool, workspaceId: "w", secret, now: () => SORT_FIXTURE_AT });
  for (const [mode, expected] of [["open", LEGACY_CURRENT], ["completed", LEGACY_HISTORY]] as const) {
    const ids: string[] = []; let cursor: string | undefined;
    do {
      const page = await reader.read("a", { mode, limit: 7, cursor });
      assert.equal(page.total, expected.length);
      ids.push(...page.items.map(item => item.taskId)); cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.deepEqual(ids, expected, mode);
  }
}));

test("home follow-ups come from the bounded summary and equal the legacy facts path on this Node runtime", { skip }, async (t) => database(t, async pool => {
  const common = { taskService: null, personalScheduleService: null, appointmentService: null };
  for (const snapshotAt of [SORT_FIXTURE_AT, "2026-09-25T01:00:00.000Z", "2026-09-27T00:00:00.000Z"]) {
    const legacy = await loadHomeFacts({ actorId: "a", snapshotAt, dependencies: { ...common, followupReaderFactory: () => createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w", sourceLabel: "关系跟进" }) } });
    const bounded = await loadHomeFacts({ actorId: "a", snapshotAt, dependencies: { ...common, followupSummaryReaderFactory: () => createLifecycleHomeSummaryReader({ client: pool, workspaceId: "w" }) } });
    assert.equal(bounded.followups.state, "ready", snapshotAt);
    assert.equal(bounded.followups.count, LEGACY_CURRENT.length);
    assert.ok(bounded.followups.items.length > 0);
    assert.deepEqual(bounded.followups, legacy.followups, snapshotAt);
  }
}));

test("a drifted database collation still fails closed in all three readers", { skip }, async (t) => database(t, async pool => {
  for (const drift of [{ actual: "154.1" }, { catalog: "153.120" }, { provider: "c" }, { deterministic: false }, { encoding: "SQL_ASCII" }]) {
    const client = driftedClient(pool, drift);
    await assert.rejects(createLifecycleTaskPagesReader({ client, workspaceId: "w", secret }).read("a"), undefined, JSON.stringify(drift));
    await assert.rejects(createRelationshipTaskPageReader({ client, workspaceId: "w", secret }).read("a", { mode: "open" }), undefined, JSON.stringify(drift));
    await assert.rejects(createLifecycleHomeSummaryReader({ client, workspaceId: "w" }).read("a", { snapshotAt: SORT_FIXTURE_AT, from: SORT_FIXTURE_AT, to: "2026-10-02T00:00:00.000Z" }), undefined, JSON.stringify(drift));
    const home = await loadHomeFacts({ actorId: "a", snapshotAt: SORT_FIXTURE_AT, dependencies: { taskService: null, personalScheduleService: null, appointmentService: null, followupSummaryReaderFactory: () => createLifecycleHomeSummaryReader({ client, workspaceId: "w" }) } });
    assert.equal(home.followups.state, "unavailable");
  }
}));
