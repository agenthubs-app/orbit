import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { createLifecycleTaskPagesReader, type LifecycleCursors, type LifecycleTaskCard } from "../../features/followups/storage/lifecycle-task-pages";
import { createLifecycleHomeSummaryReader } from "../../features/followups/storage/lifecycle-home-summary";
import { createRelationshipTaskPageReader } from "../../features/connections/lifecycle/task-page";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

// SC-W0034-02: the reviewed probe matrix (tests/fixtures/sort-runtime-unicode-probe.json) is asserted row by row.
// Expectations come only from the fixture; this file never regenerates them.
interface ProbeFixture {
  pgRuntimes: Record<string, Record<string, unknown>>;
  lower: { rows: readonly { cp: string; char: string; js: string; pg: Record<string, string> }[] };
  sort: {
    fields: readonly string[]; pageSize: number; rowsPerChar: number; batchSize: number;
    cps: readonly number[]; pgBatchRank: Record<string, readonly number[]>; jsBatchRank: readonly number[];
    orderSha256: { js: string; pg: Record<string, string> };
  };
  summary: { lowerDiffs: Record<string, number>; sortDiffs: Record<string, number>; assignedCompared: number; lowerCompared: number };
}
const fixture = JSON.parse(readFileSync(new URL("../fixtures/sort-runtime-unicode-probe.json", import.meta.url), "utf8")) as ProbeFixture;
const DATABASE_URL = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const at = "2026-09-25T00:00:00.000Z";
const secret = "local-test-only-".repeat(4);
const dueInstant = "2026-09-24T00:00:00.000Z";
const WALK_SLICE = 10;
const window = { snapshotAt: "2026-09-25T00:00:00.000Z", from: "2026-09-18T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" };

async function database(run: (pool: Pool, collversion: string) => Promise<void>) {
  const url = new URL(DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.search, ""); assert.equal(url.hash, "");
  assert.equal(url.pathname, "/orbit_neon_audit_20260925");
  const schema = `unicode_probe_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=120000` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const runtime = (await pool.query<{ actual: string; catalog: string }>(
      `select c.collversion as catalog, pg_catalog.pg_collation_actual_version(c.oid) as actual from pg_catalog.pg_collation c where c.oid = 'pg_catalog."und-x-icu"'::regcollation`,
    )).rows[0]!;
    assert.equal(runtime.catalog, runtime.actual);
    assert.ok(fixture.pgRuntimes[runtime.actual], `probe matrix has no reviewed expectations for und-x-icu ${runtime.actual}`);
    await run(pool, runtime.actual);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
}

function assignedStrings(): string[] {
  const out: string[] = [];
  for (let cp = 1; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const s = String.fromCodePoint(cp);
    if (/\p{Assigned}/u.test(s) && !/\p{Co}/u.test(s)) out.push(s);
  }
  return out;
}
const sha = (values: readonly string[]) => createHash("sha256").update(values.join("\u0000")).digest("hex");
/** Elements of `order` outside one longest subsequence that is increasing in `rank` (same procedure as the generator). */
function outsideLongestAgreement(order: readonly string[], rank: ReadonlyMap<string, number>): string[] {
  const seq = order.map(value => rank.get(value)!);
  const tails: number[] = [], tailIdx: number[] = [], prev = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid]! < seq[i]!) lo = mid + 1; else hi = mid; }
    tails[lo] = seq[i]!; tailIdx[lo] = i; prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  }
  const keep = new Set<string>();
  for (let i = tailIdx[tails.length - 1]!; i >= 0; i = prev[i]!) keep.add(order[i]!);
  return order.filter(value => !keep.has(value));
}

test("full code point lower() and sort comparisons equal the reviewed probe matrix", { skip: !DATABASE_URL, timeout: 300_000 }, async () => database(async (pool, collversion) => {
  // lower(): every Unicode scalar value except NUL.
  const lowered = (await pool.query<{ cp: number; l: string }>(
    `select cp, lower(chr(cp) collate pg_catalog."und-x-icu") as l from generate_series(1, 1114111) cp where cp not between 55296 and 57343`,
  )).rows;
  assert.equal(lowered.length, fixture.summary.lowerCompared);
  const observedDiffs = new Map(lowered.filter(({ cp, l }) => String.fromCodePoint(cp).toLowerCase() !== l).map(({ cp, l }) => [cp, l]));
  const expectedDiffRows = fixture.lower.rows.filter(row => row.pg[collversion] !== row.js);
  assert.equal(observedDiffs.size, fixture.summary.lowerDiffs[collversion]);
  assert.deepEqual([...observedDiffs.keys()].sort((a, b) => a - b), expectedDiffRows.map(row => row.char.codePointAt(0)));
  const pgLower = new Map(lowered.map(({ cp, l }) => [cp, l]));
  for (const row of fixture.lower.rows) {
    const cp = row.char.codePointAt(0)!;
    assert.equal(row.cp, `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
    assert.equal(pgLower.get(cp), row.pg[collversion], `${row.cp} PG lower`);
    assert.equal(row.char.toLowerCase(), row.js, `${row.cp} JS lower`);
  }

  // sort: all assigned single characters, PG und-x-icu vs JS default collator (+ byte tie-break = PG deterministic tie-break).
  const strings = assignedStrings();
  assert.equal(strings.length, fixture.summary.assignedCompared);
  const collator = new Intl.Collator();
  const jsOrder = [...strings].sort((a, b) => collator.compare(a, b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const pgOrder = (await pool.query<{ s: string }>(`select s from unnest($1::text[]) s order by s collate pg_catalog."und-x-icu"`, [strings])).rows.map(row => row.s);
  assert.equal(sha(jsOrder), fixture.sort.orderSha256.js, "JS order equals the reviewed JS order");
  assert.equal(sha(pgOrder), fixture.sort.orderSha256.pg[collversion], "PG order equals the reviewed PG order");
  const differing = outsideLongestAgreement(jsOrder, new Map(pgOrder.map((value, index) => [value, index])))
    .map(value => value.codePointAt(0)!).sort((a, b) => a - b);
  assert.equal(differing.length, fixture.summary.sortDiffs[collversion]);
  if (differing.length) assert.deepEqual(differing, [...fixture.sort.cps]);
}));

type Walked = { record: string; due: string; id: string };
async function monotonicViolations(pool: Pool, rows: readonly Walked[]): Promise<number> {
  const columns = [rows.map(row => row.due), rows.map(row => row.id), rows.map(row => row.record)];
  return Number((await pool.query<{ bad: string }>(
    `select count(*) filter (where not ((a.d collate pg_catalog."und-x-icu", a.i collate pg_catalog."und-x-icu", a.r collate "C")
       < (b.d collate pg_catalog."und-x-icu", b.i collate pg_catalog."und-x-icu", b.r collate "C"))) as bad
     from unnest($1::text[], $2::text[], $3::text[]) with ordinality a(d, i, r, n)
     join unnest($1::text[], $2::text[], $3::text[]) with ordinality b(d, i, r, n) on b.n = a.n + 1`, columns,
  )).rows[0]!.bad);
}

test("follow-up pages, relationship task pages and the home summary keep every probe character exactly once in reviewed PG order across page boundaries", {
  skip: !DATABASE_URL, timeout: 14_400_000,
}, async () => database(async (pool, collversion) => {
  const { cps, batchSize, rowsPerChar, pageSize } = fixture.sort;
  const pgRank = fixture.sort.pgBatchRank[collversion]!;
  assert.equal(pgRank.length, cps.length);
  assert.ok(rowsPerChar > pageSize, "every character's rows must span a page boundary");
  assert.equal(batchSize % WALK_SLICE, 0);
  const store = createPostgresLiveRecordStore({ client: pool });
  const common = { source: { type: "manual", id: "s", label: "probe" }, evidenceIds: ["e"], createdAt: at, updatedAt: at };
  for (const [collectionName, id, payload] of [
    ["contacts", "c", { displayName: "Contact", stage: "active" }],
    ["connections", "cn", { accountId: "a", contactId: "c", stage: "active", summary: "Probe" }],
  ] as const) {
    await store.upsertRecord({ workspaceId: "w", collectionName, recordId: id, userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"],
      lifecycleState: "active", createdAt: at, updatedAt: at, searchText: "", payload: { ...common, id, ...payload } });
  }
  const pages = createLifecycleTaskPagesReader({ client: pool, workspaceId: "w", secret });
  const relationship = createRelationshipTaskPageReader({ client: pool, workspaceId: "w", secret, now: () => at });
  const home = createLifecycleHomeSummaryReader({ client: pool, workspaceId: "w" });
  const suffix = (k: number) => (k === 0 ? "" : `-${String(k).padStart(2, "0")}`);
  let assertedRows = 0;

  // Walk each reviewed batch in consecutive slices of WALK_SLICE characters: the reviewed within-batch
  // ranks order any slice of it, and smaller slices keep every page query cheap on the reproduced PG.
  for (let start = 0; start < cps.length; start += WALK_SLICE) {
    const batch = cps.slice(start, Math.min(start + WALK_SLICE, (Math.floor(start / batchSize) + 1) * batchSize));
    const label = `batch ${Math.floor(start / batchSize)} slice ${(start % batchSize) / WALK_SLICE} (U+${batch[0]!.toString(16).toUpperCase()}…)`;
    const expectedAnchorOrder = batch.map((cp, i) => ({ cp, rank: pgRank[start + i]! })).sort((a, b) => a.rank - b.rank).map(({ cp }) => cp);
    await pool.query("delete from orbit_records where collection_name = 'tasks'");
    const tasks = batch.flatMap(cp => {
      const char = String.fromCodePoint(cp);
      return Array.from({ length: rowsPerChar }, (_, k) => [
        // "id" rows (current group): the character is in the task id, due is one fixed instant.
        { record_id: `a:${cp}:${k}`, payload: { ...common, id: `t${char}${suffix(k)}`, title: "Probe", status: "open", connectionId: "cn", dueAt: dueInstant } },
        // "due" rows (history group): the character is in the due key, ids are ASCII.
        { record_id: `h:${cp}:${k}`, payload: { ...common, id: `h:${cp}:${String(k).padStart(2, "0")}`, title: "Probe", status: "completed", connectionId: "cn", dueAt: `d${char}${suffix(k)}` } },
      ]).flat();
    });
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at)
       select 'w', 'tasks', r.record_id, 'a', 'manual', 's', '{e}', 'active', '', r.payload, $2::timestamptz, $2::timestamptz
       from jsonb_to_recordset($1::jsonb) as r(record_id text, payload jsonb)`, [JSON.stringify(tasks), at]);
    const perGroup = rowsPerChar * batch.length;
    const anchorsOf = (records: readonly string[], prefix: string) =>
      records.filter(record => record.startsWith(prefix) && record.endsWith(":0")).map(record => Number(record.split(":")[1]));

    // 1) /app/tasks pages: current (id key) and history (due key) walked together, 30 per page.
    const walked: Record<"current" | "history", LifecycleTaskCard[]> = { current: [], history: [] };
    const cursors: LifecycleCursors = {};
    let reads = 0;
    for (;;) {
      const result = await pages.read("a", cursors); reads += 1;
      assert.deepEqual(result.counts, { current: perGroup, history: perGroup, orphan: 0 }, label);
      for (const group of ["current", "history"] as const) {
        if (reads > 1 && !cursors[group]) continue;
        assert.ok(result.pages[group].items.length <= pageSize);
        walked[group].push(...result.pages[group].items);
        const next = result.pages[group].nextCursor;
        if (next) cursors[group] = next; else delete cursors[group];
      }
      if (!cursors.current && !cursors.history) break;
      assert.ok(reads < 200, `${label}: pages terminate`);
    }
    assert.ok(reads > batch.length, `${label}: the walk crossed page boundaries`);
    for (const [group, prefix, field] of [["current", "a:", "id"], ["history", "h:", "due"]] as const) {
      const records = walked[group].map(item => item.recordId);
      assert.equal(records.length, perGroup, `${label} ${field}: count`);
      assert.equal(new Set(records).size, perGroup, `${label} ${field}: no duplicates`);
      assert.deepEqual(new Set(records), new Set(tasks.filter(task => task.record_id.startsWith(prefix)).map(task => task.record_id)), `${label} ${field}: no omissions`);
      assert.equal(await monotonicViolations(pool, walked[group].map(item => ({ record: item.recordId, due: item.dueKey, id: item.id }))), 0, `${label} ${field}: PG-monotonic`);
      assert.deepEqual(anchorsOf(records, prefix), expectedAnchorOrder, `${label} ${field}: every character at its reviewed PG position`);
      assertedRows += batch.length;
    }

    // 2) /api/relationship-tasks/page: id key, 30 per page. (Its due key only admits ISO datetimes —
    // the response schema rejects anything else — so the probe characters can only reach it through ids.)
    for (const [mode, prefix, field] of [["open", "a:", "id"]] as const) {
      const items: { itemKey: string; taskId: string; dueAt: string | null }[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 200; page += 1) {
        const result = await relationship.read("a", { mode, limit: pageSize, cursor });
        assert.equal(result.total, perGroup, `${label} relationship ${field}: total`);
        assert.ok(result.items.length <= pageSize);
        items.push(...result.items.map(item => ({ itemKey: item.itemKey, taskId: item.taskId, dueAt: item.dueAt ?? null })));
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      assert.equal(cursor, null, `${label} relationship ${field}: terminates`);
      const records = items.map(item => item.itemKey);
      assert.equal(new Set(records).size, perGroup, `${label} relationship ${field}: no duplicates`);
      assert.equal(records.length, perGroup, `${label} relationship ${field}: no omissions`);
      assert.equal(await monotonicViolations(pool, items.map(item => ({ record: item.itemKey, due: item.dueAt ?? "9999", id: item.taskId }))), 0, `${label} relationship ${field}: PG-monotonic`);
      assert.deepEqual(anchorsOf(records, prefix), expectedAnchorOrder, `${label} relationship ${field}: reviewed PG position`);
      assertedRows += batch.length;
    }

    // 3) Home summary ('followups:'||id key, top 3): slide over the anchors, 3 at a time.
    await pool.query("delete from orbit_records where collection_name = 'tasks' and (record_id like 'h:%' or record_id not like '%:0')");
    const remaining = [...expectedAnchorOrder];
    while (remaining.length) {
      const summary = await home.read("a", window);
      assert.equal(summary.counts.current, remaining.length, `${label} home: count`);
      const expected = remaining.splice(0, 3);
      assert.deepEqual(summary.items.map(item => Number(item.recordId.split(":")[1])), expected, `${label} home: reviewed PG position`);
      assert.ok(summary.items.every(item => item.group === "overdue"));
      await pool.query("delete from orbit_records where collection_name = 'tasks' and record_id = any($1::text[])", [summary.items.map(item => item.recordId)]);
    }
    assertedRows += batch.length;
  }
  assert.equal(assertedRows, cps.length * 4, "every probe character asserted for id/due pages, id relationship pages and home");
}));
