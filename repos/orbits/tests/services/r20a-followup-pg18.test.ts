import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createLifecycleTaskPagesReader, LIFECYCLE_TASK_PAGES_SQL } from "../../features/followups/storage/lifecycle-task-pages";
import { createRelationshipLifecycleFactsReader } from "../../features/followups/storage/relationship-lifecycle-facts-reader";
import { relationshipLifecycleTasksFromGraph } from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import { loadLifecycleTaskPages } from "../../app/(app)/app/tasks/lifecycle-pages-route-service";
import { createRelationshipTaskPageReader } from "../../features/connections/lifecycle/task-page";
import { createRelationshipTaskPageGetHandler } from "../../app/api/relationship-tasks/page/handler";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const at = "2026-10-18T00:00:00.000Z";
const secret = "r20a-local-differential-only-".repeat(2);
const probe = JSON.parse(readFileSync(new URL("../fixtures/sort-runtime-unicode-probe.json", import.meta.url), "utf8")) as {
  sort: { cps: number[]; batchSize: number; pgBatchRank: Record<string, number[]> };
};

async function database(run: (pool: Pool) => Promise<void>) {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.search, "");
  const schema = `r20a_followup_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=30000` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const insert = (collectionName: string, id: string, payload: Record<string, unknown>, userId = "a") => store.upsertRecord({
      workspaceId: "w", collectionName, recordId: id, userId, sourceType: "manual", sourceId: "s", evidenceIds: ["e"],
      lifecycleState: "active", createdAt: at, updatedAt: at,
      payload: { id, source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: at, updatedAt: at, ...payload },
    });
    await insert("contacts", "c", { displayName: "Contact", stage: "active", privateNotes: "PRIVATE_NOTE" });
    await insert("connections", "cn", { accountId: "a", contactId: "c", stage: "active", summary: "PRIVATE_SUMMARY" });
    const ids = ["É", "e", "é", "E", "东京", "東京", "a-2", "a_2", "😀", "👩‍💻", "ａ", "a", "Å", "A\u030a", ...Array.from({ length: 70 }, (_, i) => `task:${i}`)];
    for (const [i, id] of ids.entries()) await insert("tasks", id, {
      title: `Task ${id}`, status: i % 4 === 0 ? "completed" : i % 3 === 0 ? "scheduled" : "open",
      connectionId: "cn", dueAt: i % 5 === 0 ? null : i % 2 === 0 ? at : "2026-10-19T00:00:00.000Z",
    });
    await insert("tasks", "orphan", { title: "Orphan", status: "open", contactId: "missing" });
    await insert("tasks", "foreign", { title: "PRIVATE_FOREIGN", status: "open", connectionId: "cn" }, "b");
    await run(pool);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
}

test("R20a candidate runtime: actual SQL classification and ordering match the legacy reader before runtime admission", { skip: !databaseUrl }, async () => database(async pool => {
  const baseline = relationshipLifecycleTasksFromGraph(await createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w" }).readRelationshipLifecycleFacts("a"));
  const { rows } = await pool.query(LIFECYCLE_TASK_PAGES_SQL, ["w", "a", JSON.stringify(["current", "history", "orphan"].map(category => ({ category }))), 200]);
  const result = rows[0].result;
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { current: baseline.currentCount, history: baseline.historyCount, orphan: baseline.orphanCount });
  for (const group of ["current", "history", "orphan"] as const) {
    assert.deepEqual(result.pages[group].map((item: { id: string }) => item.id), baseline[`${group}Tasks`].map(item => item.id));
  }
  // The reviewed Unicode matrix is independent of these readers and covers
  // the collation-sensitive characters found by the full-codepoint probe.
  const ranks = probe.sort.pgBatchRank[result.runtime.actual];
  assert.ok(ranks, "the candidate collation has reviewed Unicode expectations");
  for (let start = 0; start < probe.sort.cps.length; start += probe.sort.batchSize) {
    const cps = probe.sort.cps.slice(start, start + probe.sort.batchSize);
    const ordered = await pool.query<{ cp: number }>(`select cp from unnest($1::int[]) cp order by chr(cp) collate pg_catalog."und-x-icu"`, [cps]);
    const expected = cps.map((cp, i) => ({ cp, rank: ranks[start + i] })).sort((a, b) => a.rank - b.rank).map(item => item.cp);
    assert.deepEqual(ordered.rows.map(item => item.cp), expected);
  }
  // Capture the API reader's real SQL result before its runtime admission check.
  // This verifies the candidate without disguising PG18 as a previously admitted runtime.
  let raw: { total: number; items: { taskId: string }[] } | undefined;
  const client: LiveRecordSqlClient = { async query(text, values) { const response = await pool.query(text, values as unknown[]); raw = response.rows[0].result; return response; } };
  for (const mode of ["open", "completed"] as const) {
    try { await createRelationshipTaskPageReader({ client, workspaceId: "w", secret }).read("a", { mode, limit: 50 }); }
    catch (error) { if (!(error instanceof Error) || error.message !== "LIFECYCLE_SORT_RUNTIME_UNVERIFIED") throw error; }
    assert.ok(raw);
    const expected = mode === "open" ? baseline.currentTasks : baseline.historyTasks;
    assert.equal(raw.total, expected.length);
    assert.deepEqual(raw.items.map((item: { taskId: string }) => item.taskId), expected.slice(0, 51).map(item => item.id));
    assert.ok(!JSON.stringify(raw).includes("PRIVATE"));
  }
  console.info(JSON.stringify({ metric: "r20a_pg18_differential", runtime: result.runtime, counts: result.counts }));
}));

test("R20a local runtime serves follow-ups through the App API", { skip: !databaseUrl }, async () => database(async pool => {
  const reader = createRelationshipTaskPageReader({ client: pool, workspaceId: "w", secret, now: () => at });
  const handler = createRelationshipTaskPageGetHandler({
    resolveActor: async () => ({ id: "a", accountId: "a", userId: "a", workspaceId: "w" }), reader: () => reader,
  });
  const response = await handler(new Request("http://localhost/api/relationship-tasks/page?mode=open&limit=20"));
  assert.equal(response.status, 200);
  const page = (await response.json()).data;
  assert.equal(page.total, 63);
  assert.equal(page.items.length, 20);
  assert.ok(page.nextCursor);
}));

test("R20a local runtime serves follow-ups through the Web loader", { skip: !databaseUrl }, async () => database(async pool => {
  const web = await loadLifecycleTaskPages({ actorId: "a", reader: createLifecycleTaskPagesReader({ client: pool, workspaceId: "w", secret }) });
  assert.equal(web.state, "success");
  assert.equal(web.currentCount, 63);
  assert.equal(web.currentTasks.length, 30);
  assert.ok(web.pagination?.current.nextHref);
  assert.equal((await loadLifecycleTaskPages({ actorId: "b", reader: createLifecycleTaskPagesReader({ client: pool, workspaceId: "w", secret }) })).currentCount, 0);
}));
