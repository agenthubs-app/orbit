import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createLifecycleTaskPagesReader, lifecycleGroups, LIFECYCLE_TASK_PAGES_SQL, type LifecycleCursors } from "../../features/followups/storage/lifecycle-task-pages";
import { createRelationshipLifecycleFactsReader } from "../../features/followups/storage/relationship-lifecycle-facts-reader";
import { relationshipLifecycleTasksFromGraph } from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import { loadLifecycleTaskPages } from "../../app/(app)/app/tasks/lifecycle-pages-route-service";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createLifecycleHomeSummaryReader } from "../../features/followups/storage/lifecycle-home-summary";
import { loadHomeFacts } from "../../app/(app)/app/agent/home-facts-route-service";

const at = "2026-09-25T00:00:00.000Z", secret = "local-test-only-".repeat(4);
const common = { source: { type: "manual", id: "s", label: "\t" }, evidenceIds: [null, "", "\uFEFF", "e"], createdAt: at, updatedAt: at };
async function database(run: (pool: Pool) => Promise<void>) {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.search, ""); assert.equal(url.hash, "");
  assert.equal(url.pathname, "/orbit_neon_audit_20260925");
  const schema = `lifecycle_pages_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=60000` });
  try { await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await run(pool); }
  finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
}
async function insert(pool: Pool, collectionName: string, id: string, payload: Record<string, unknown>, userId: string | null = "a") {
  await createPostgresLiveRecordStore({ client: pool }).upsertRecord({
    workspaceId: "w", collectionName, recordId: id, userId, sourceType: "manual", sourceId: "s", evidenceIds: ["e"],
    lifecycleState: "active", createdAt: at, updatedAt: at, searchText: "PRIVATE_SEARCH", payload: { ...common, id, ...payload },
  });
}
async function seed(pool: Pool) {
  await insert(pool, "contacts", "c", { displayName: "Contact", organization: "Org", stage: "active", privateNotes: "PRIVATE_NOTES" }, "b");
  await insert(pool, "contacts", "other", { displayName: "Other", stage: "active" });
  await insert(pool, "connections", "cn", { accountId: "a", contactId: "c", stage: "active", summary: "PRIVATE_SUMMARY" });
}

test("bounded lifecycle pages preserve classification/order/counts, duplicates, permissions and cursor boundaries", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => database(async pool => {
  await seed(pool);
  const ids = ["É", "e", "é", "E", "东京", "東京", "a-2", "a_2", "😀", "z", ...Array.from({ length: 110 }, (_, i) => `task:${String(i).padStart(4, "0")}`)];
  for (const [i, id] of ids.entries()) {
    await insert(pool, "tasks", id, { title: `Task ${id}`, status: i % 4 === 0 ? "completed" : "open", connectionId: "cn",
      dueAt: i % 5 === 0 ? null : i % 3 === 0 ? "2026-09-26" : "2026-09-25T01:00:00.000Z" });
  }
  const variants = [
    { contactId: "missing" }, { connectionId: "missing", contactId: "c" }, { contactId: "other", connectionId: "cn" },
    { connectionId: null }, { contactId: "c", connectionId: "cn" }, { contactId: "\uFEFF", connectionId: "cn" },
  ];
  for (const [i, fields] of variants.entries()) await insert(pool, "tasks", `variant:${i}`, { title: "Variant", status: "scheduled", ...fields });
  await insert(pool, "tasks", "invalid", { title: "\uFEFF", status: "open", connectionId: "cn" });
  for (const [id, userId, accountId] of [["unowned", null, "a"], ["foreign", "b", "a"], ["conflict", "a", "b"]] as const) {
    await insert(pool, "tasks", id, { title: "PRIVATE_FOREIGN", status: "open", connectionId: "cn", accountId }, userId);
  }
  // An identical domain task remains two rows, not a pagination omission.
  await insert(pool, "tasks", "dup-store", { id: ids[1], title: `Task ${ids[1]}`, status: "open", connectionId: "cn", dueAt: "2026-09-25T01:00:00.000Z" });
  const baseline = relationshipLifecycleTasksFromGraph(await createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w" }).readRelationshipLifecycleFacts("a"));
  const reader = createLifecycleTaskPagesReader({ client: pool, workspaceId: "w", secret });
  const first = await reader.read("a");
  assert.deepEqual(first.counts, { current: baseline.currentCount, history: baseline.historyCount, orphan: baseline.orphanCount });
  for (const group of lifecycleGroups) {
    const actual = []; let page = first; const cursors: LifecycleCursors = {};
    do {
      assert.ok(page.pages[group].items.length <= 30);
      actual.push(...page.pages[group].items);
      const next = page.pages[group].nextCursor;
      if (!next) break;
      cursors[group] = next; page = await reader.read("a", cursors);
    } while (actual.length < 200);
    const expected = baseline[`${group}Tasks`];
    assert.deepEqual(actual.map(item => item.id), expected.map(item => item.id));
    assert.deepEqual(actual.map(item => ({ id: item.id, contact: item.contactId, issue: item.issue })), expected.map(item => ({ id: item.id, contact: item.contactId, issue: item.issue ?? null })));
  }
  const cursor = first.pages.current.nextCursor!;
  assert.ok(cursor);
  await assert.rejects(reader.read("b", { current: cursor }), /CURSOR_INVALID/);
  await assert.rejects(reader.read("a", { history: cursor }), /CURSOR_INVALID/);
  await assert.rejects(reader.read("a", { current: `${cursor}x` }), /CURSOR_INVALID/);
  await assert.rejects(createLifecycleTaskPagesReader({ client: pool, workspaceId: "foreign", secret }).read("a", { current: cursor }), /CURSOR_INVALID/);
  const model = await loadLifecycleTaskPages({ actorId: "a", reader, params: { view: "completed", current: cursor } });
  assert.equal(model.state, "success"); assert.equal(model.currentTasks.length, 30);
  assert.equal(model.currentCount, baseline.currentCount);
  assert.match(model.pagination!.current.firstHref!, /view=completed/);
  const rendered = JSON.stringify(model);
  for (const marker of ["PRIVATE_SUMMARY", "PRIVATE_NOTES", "PRIVATE_SEARCH", "PRIVATE_FOREIGN", "evidenceIds"]) assert.ok(!rendered.includes(marker));
  // Revocation is rechecked even with a previously issued token (no cached grant).
  await pool.query("update orbit_records set user_id = 'b' where collection_name = 'tasks' and workspace_id = 'w'");
  assert.equal((await reader.read("a", { current: cursor })).counts.current, 0);
}));

test("a conflicting duplicate beyond the first page fails closed; malformed optional fields normalize equally", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => database(async pool => {
  await seed(pool);
  for (let i = 0; i < 40; i++) await insert(pool, "tasks", `t${String(i).padStart(2, "0")}`, { title: "Same", status: "open", connectionId: "cn", dueAt: 123 });
  const reader = createLifecycleTaskPagesReader({ client: pool, workspaceId: "w", secret });
  assert.equal((await reader.read("a")).counts.current, 40);
  await insert(pool, "tasks", "duplicate", { id: "t39", title: "Conflicting", status: "open", connectionId: "cn" });
  await assert.rejects(reader.read("a"));
  assert.equal((await loadLifecycleTaskPages({ actorId: "a", reader })).state, "unavailable");
}));

test("home summary matches full facts across time boundaries, all group counts, and rejects invalid dates outside the visible cards", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => database(async pool => {
  await seed(pool);
  const dates = [undefined, "2026-09-24T23:59:59.999999999Z", at, "2026-09-25T09:00:00+09:00", "2026-10-01T14:59:59.999Z", "2026-10-01T15:00:00Z", "2026-09-24T24:00:00Z", "2026-09-25T09:00:00.000001+09:00", "2026-09-25T23:59:00+23:59", "2026-09-24T00:01:00-23:59"];
  for (let i = 0; i < 64; i++) await insert(pool, "tasks", `home:${String(i).padStart(3, "0")}`, { title: "Follow-up", status: "open", connectionId: "cn", dueAt: dates[i % dates.length] });
  await insert(pool, "tasks", "history", { title: "History", status: "completed", connectionId: "cn", dueAt: "not a date" });
  await insert(pool, "tasks", "orphan", { title: "Orphan", status: "open", dueAt: "not a date" });
  const commonDeps = { taskService: null, personalScheduleService: null, appointmentService: null };
  let bytes = 0, queries = 0;
  const client: LiveRecordSqlClient = { async query(text, values) { const result = await pool.query(text, values as unknown[]); bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++; return result; } };
  const reader = createLifecycleHomeSummaryReader({ client, workspaceId: "w" });
  for (const snapshotAt of [at, "2026-09-25T00:00:00.001Z", "2026-10-01T15:00:00Z"]) {
    const old = await loadHomeFacts({ actorId: "a", snapshotAt, dependencies: { ...commonDeps, followupReaderFactory: () => createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w", sourceLabel: "关系跟进" }) } });
    bytes = 0; queries = 0;
    const actual = await loadHomeFacts({ actorId: "a", snapshotAt, dependencies: { ...commonDeps, followupSummaryReaderFactory: () => reader } });
    assert.equal(actual.followups.state, "ready");
    assert.deepEqual(actual.followups, old.followups);
    assert.equal(queries, 1); assert.ok(bytes < 4000);
  }
  await insert(pool, "tasks", "bad-future", { title: "Bad future", status: "open", connectionId: "cn", dueAt: "2099-02-30T00:00:00Z" });
  const invalid = await loadHomeFacts({ actorId: "a", snapshotAt: at, dependencies: { ...commonDeps, followupSummaryReaderFactory: () => reader } });
  assert.equal(invalid.followups.state, "unavailable"); assert.equal(invalid.followups.count, null);
}));

test("normalization matches the legacy decoder and large text remains a preview inside SQL", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => database(async pool => {
  await seed(pool);
  const fields = ["title", "status", "contactId", "connectionId", "dueAt", "createdAt", "updatedAt", "evidenceIds", "source"];
  const values = [null, 123, {}, [], "", "\t\uFEFF", "x", ["", null, "e", "e"], { type: "manual", id: "s", label: "\uFEFF" }];
  for (const [i, field] of fields.entries()) for (const [j, value] of values.entries()) {
    await insert(pool, "tasks", `matrix:${i}:${j}`, { title: "Task", status: "open", connectionId: "cn", [field]: value });
  }
  await insert(pool, "tasks", "huge", { title: "大".repeat(1_000_000), status: "open", connectionId: "cn", dueAt: "0000" });
  const old = relationshipLifecycleTasksFromGraph(await createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w" }).readRelationshipLifecycleFacts("a"));
  let bytes = 0;
  const client: LiveRecordSqlClient = { async query(text, values) { const result = await pool.query(text, values as unknown[]); bytes = Buffer.byteLength(JSON.stringify(result.rows)); return result; } };
  const reader = createLifecycleTaskPagesReader({ client, workspaceId: "w", secret });
  const actual = await reader.read("a");
  assert.deepEqual(actual.counts, { current: old.currentCount, history: old.historyCount, orphan: old.orphanCount });
  assert.equal(actual.pages.current.items[0].id, "huge");
  assert.equal(actual.pages.current.items[0].titlePreview, "大".repeat(240));
  assert.ok(bytes < 64_000);
}));

test("growing tasks and associated contacts/connections together stays bounded; unrelated actor growth does not change output", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL || process.env.ORBIT_FOLLOWUP_PAGE_GROWTH !== "1", timeout: 180_000 }, async () => database(async pool => {
  await seed(pool);
  await insert(pool, "tasks", "template", { title: "Task", status: "open", connectionId: "cn", dueAt: at });
  let bytes = 0;
  const client: LiveRecordSqlClient = { async query(text, values) { const result = await pool.query(text, values as unknown[]); bytes = Buffer.byteLength(JSON.stringify(result.rows)); return result; } };
  const reader = createLifecycleTaskPagesReader({ client, workspaceId: "w", secret });
  let previous = 0, firstBytes = 0;
  for (const size of [100, 10_000, 100_000]) {
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
      select workspace_id,collection_name,collection_name || ':' || lpad(n::text,6,'0'),'a',source_type,source_id,evidence_ids,lifecycle_state,
        payload || jsonb_build_object('id',collection_name || ':' || lpad(n::text,6,'0')) || case collection_name
          when 'tasks' then jsonb_build_object('connectionId','connections:' || lpad(n::text,6,'0'))
          when 'connections' then jsonb_build_object('contactId','contacts:' || lpad(n::text,6,'0')) else '{}'::jsonb end,created_at,updated_at
      from orbit_records cross join generate_series($1::int,$2::int) n where record_id in ('template','cn','c')`, [previous + 1, size]);
    await pool.query("analyze orbit_records");
    if (process.env.ORBIT_FOLLOWUP_EXPLAIN === "1") {
      const plan = await pool.query(`explain (${size === 10_000 ? "analyze, buffers, " : ""}format json) ${LIFECYCLE_TASK_PAGES_SQL}`, ["w", "a", JSON.stringify(lifecycleGroups.map(category => ({ category }))), 31]);
      const walk = (node: Record<string, any>) => {
        if (node["Join Type"] || node["Subplan Name"]?.startsWith("CTE")) console.info(JSON.stringify({ planSize: size, node: node["Node Type"], cte: node["Subplan Name"], rows: node["Plan Rows"], actualRows: node["Actual Rows"], loops: node["Actual Loops"], join: node["Join Type"], condition: node["Join Filter"] ?? node["Hash Cond"] }));
        for (const child of node.Plans ?? []) walk(child);
      };
      walk(plan.rows[0]["QUERY PLAN"][0].Plan);
    }
    const started = performance.now(); const result = await reader.read("a");
    assert.equal(result.counts.current, size + 1); assert.equal(result.counts.orphan, 0);
    firstBytes ||= bytes; assert.ok(bytes < firstBytes * 1.01);
    console.info(JSON.stringify({ metric: "lifecycle_related_growth", tasks: size + 1, contacts: size + 2, connections: size + 1, bytes, elapsedMs: Math.round(performance.now() - started) }));
    previous = size;
  }
  const before = await reader.read("a"); const beforeBytes = bytes;
  await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
    select workspace_id,collection_name,'foreign:' || record_id,'foreign',source_type,source_id,evidence_ids,lifecycle_state,
      payload || jsonb_build_object('id','foreign:' || record_id,'accountId','foreign'),created_at,updated_at from orbit_records`);
  assert.deepEqual(await reader.read("a"), before); assert.equal(bytes, beforeBytes);
}));

test("same-actor lifecycle growth keeps cold output bounded, measured against old facts", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL || process.env.ORBIT_FOLLOWUP_PAGE_GROWTH !== "1", timeout: 240_000 }, async () => database(async pool => {
  await seed(pool);
  await insert(pool, "tasks", "template", { title: "Task", status: "open", connectionId: "cn", dueAt: at });
  let bytes = 0, queries = 0;
  const client: LiveRecordSqlClient = { async query(text, values) {
    const result = await pool.query(text, values as unknown[]); bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++; return result;
  } };
  let previous = 0, firstBytes = 0;
  for (const size of [100, 10_000, 100_000]) {
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
      select workspace_id,collection_name,'task:' || lpad(n::text,6,'0'),user_id,source_type,source_id,evidence_ids,lifecycle_state,
        payload || jsonb_build_object('id','task:' || lpad(n::text,6,'0')),created_at,updated_at
      from orbit_records cross join generate_series($1::int,$2::int) n where record_id='template'`, [previous + 1, size]);
    bytes = 0; queries = 0; const started = performance.now();
    const page = await createLifecycleTaskPagesReader({ client, workspaceId: "w", secret }).read("a");
    assert.equal(page.counts.current, size + 1); assert.equal(page.pages.current.items.length, 30); assert.equal(queries, 1);
    firstBytes ||= bytes; assert.ok(bytes < firstBytes * 1.01);
    console.info(JSON.stringify({ metric: "lifecycle_pages_growth", actorTasks: size + 1, bytes, queries, elapsedMs: Math.round(performance.now() - started), cache: "off" }));
    bytes = 0; queries = 0; const homeStart = performance.now();
    const home = await createLifecycleHomeSummaryReader({ client, workspaceId: "w" }).read("a", { snapshotAt: at, from: "2026-09-24T15:00:00Z", to: "2026-10-01T15:00:00Z" });
    assert.equal(home.counts.current, size + 1); assert.equal(home.items.length, 3); assert.equal(queries, 1); assert.ok(bytes < 2000);
    console.info(JSON.stringify({ metric: "lifecycle_home_growth", actorTasks: size + 1, bytes, queries, elapsedMs: Math.round(performance.now() - homeStart) }));
    if (size === 10_000) {
      bytes = 0; queries = 0; const oldStart = performance.now();
      await createRelationshipLifecycleFactsReader({ client, workspaceId: "w" }).readRelationshipLifecycleFacts("a");
      console.info(JSON.stringify({ metric: "lifecycle_old_facts", actorTasks: size + 1, bytes, queries, elapsedMs: Math.round(performance.now() - oldStart) }));
    }
    previous = size;
  }
}));
