import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLifecycleNodeSortRuntimeFor,
  assertLifecycleSortRuntimeFor,
  createLifecycleTaskPagesReader,
  LIFECYCLE_TASK_PAGES_SQL,
  lifecycleSortRuntimeEntryFor,
  VERIFIED_LIFECYCLE_SORT_RUNTIMES,
} from "../../features/followups/storage/lifecycle-task-pages";
import { createLifecycleHomeSummaryReader, LIFECYCLE_HOME_SUMMARY_SQL } from "../../features/followups/storage/lifecycle-home-summary";
import { createRelationshipTaskPageReader } from "../../features/connections/lifecycle/task-page";
import { resetSortRuntimeRejectionLogForTest, SORT_RUNTIME_LOG_FIELDS } from "../../shared/storage/sort-runtime";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

// SC-W0034-01／04：组合表按 (Node 侧, PG 侧) 成对放行；版本号注入，不改 process.versions。
const node = (icu: unknown, unicode: unknown, collatorLocale: unknown, version = "24.21.0") =>
  ({ node: version, icu, unicode, cldr: "48.0", collatorLocale });
const pg = (serverVersion: string, catalog: string, actual = catalog, extra: Record<string, unknown> = {}) =>
  ({ pg: serverVersion, encoding: "UTF8", catalog, actual, provider: "i", deterministic: true, ...extra });

const ICU783 = node("78.3", "17.0", "en-US");
const ICU782 = node("78.2", "17.0", "en-US", "24.15.0");
const LOCAL_PG = pg("160012", "153.136");
const PROD_PG = pg("160015", "153.14");

function captureWarn(run: (lines: string[]) => void | Promise<void>) {
  return async () => {
    resetSortRuntimeRejectionLogForTest();
    const original = console.warn;
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try { await run(lines); } finally { console.warn = original; resetSortRuntimeRejectionLogForTest(); }
  };
}

test("the lifecycle whitelist holds exactly the differentially tested (Node side, PG side) pairs", () => {
  assert.deepEqual(
    VERIFIED_LIFECYCLE_SORT_RUNTIMES.map(({ node: n, pg: p }) =>
      `${n.icu}/${n.unicode}/${n.collatorLocale}|pg${p.pgMajor}/${p.encoding}/${p.catalog}/${p.actual}/${p.provider}/${p.deterministic}`),
    [
      "78.2/17.0/en-US|pg16/UTF8/153.136/153.136/i/true",
      "78.3/17.0/en-US|pg16/UTF8/153.136/153.136/i/true",
      "78.3/17.0/en-US|pg16/UTF8/153.14/153.14/i/true",
      "78.2/17.0/en-US|pg16/UTF8/153.14/153.14/i/true",
    ],
  );
  assert.ok(Object.isFrozen(VERIFIED_LIFECYCLE_SORT_RUNTIMES));
  for (const entry of VERIFIED_LIFECYCLE_SORT_RUNTIMES) {
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.node) && Object.isFrozen(entry.pg));
    assert.ok(entry.evidence.length > 0, `${entry.id} names its differential evidence`);
  }
});

test("verified pairs pass regardless of the Node patch and PG 16 minor", () => {
  for (const version of ["24.16.0", "24.21.0", "24.99.0", "26.10.0"]) {
    for (const serverVersion of ["160015", "160016", "160099"]) {
      assert.ok(lifecycleSortRuntimeEntryFor(node("78.3", "17.0", "en-US", version), pg(serverVersion, "153.14")), `${version} ${serverVersion}`);
    }
    assert.ok(lifecycleSortRuntimeEntryFor(node("78.3", "17.0", "en-US", version), LOCAL_PG), `${version} local PG`);
  }
  for (const version of ["24.13.1", "24.15.0", "25.6.0"]) {
    assert.ok(lifecycleSortRuntimeEntryFor(node("78.2", "17.0", "en-US", version), PROD_PG), version);
    assert.ok(lifecycleSortRuntimeEntryFor(node("78.2", "17.0", "en-US", version), LOCAL_PG), version);
  }
  assert.doesNotThrow(() => assertLifecycleNodeSortRuntimeFor(ICU783));
  assert.equal(assertLifecycleSortRuntimeFor(ICU783, PROD_PG, "lifecycle_pages").pg.catalog, "153.14");
});

test("any pair outside the table throws LIFECYCLE_SORT_RUNTIME_UNVERIFIED", captureWarn(() => {
  const rejected: [string, unknown, unknown][] = [
    ["ICU 77.1 / Unicode 16.0 (Node 24.0–24.13.0)", node("77.1", "16.0", "en-US", "24.13.0"), PROD_PG],
    ["untested ICU with prod PG", node("78.4", "17.0", "en-US"), PROD_PG],
    ["untested ICU with local PG", node("79.1", "18.0", "en-US"), LOCAL_PG],
    ["untested PG collversion", ICU783, pg("160015", "153.120")],
    ["Unicode differs", node("78.3", "16.0", "en-US"), PROD_PG],
    ["collator locale differs", node("78.3", "17.0", "zh-CN"), PROD_PG],
    ["catalog != actual", ICU783, pg("160015", "153.14", "153.136")],
    ["catalog != actual (reverse)", ICU783, pg("160012", "153.136", "153.14")],
    ["provider c", ICU783, pg("160015", "153.14", "153.14", { provider: "c" })],
    ["nondeterministic", ICU783, pg("160015", "153.14", "153.14", { deterministic: false })],
    ["SQL_ASCII", ICU783, pg("160015", "153.14", "153.14", { encoding: "SQL_ASCII" })],
    ["PG 17", ICU783, pg("170004", "153.14")],
    ["PG 15", ICU783, pg("150013", "153.14")],
    ["server_version_num not numeric", ICU783, pg("16.15", "153.14")],
    ["no ICU build", node(undefined, "17.0", "en-US"), PROD_PG],
    ["missing locale", node("78.3", "17.0", undefined), PROD_PG],
    ["ICU major only", node("78", "17", "en-US"), PROD_PG],
    ["missing PG fields", ICU783, { pg: "160015" }],
    ["PG row is not an object", ICU783, "160015"],
    ["null PG row", ICU783, null],
  ];
  for (const [label, n, p] of rejected) {
    assert.equal(lifecycleSortRuntimeEntryFor(n as never, p), null, label);
    assert.throws(() => assertLifecycleSortRuntimeFor(n as never, p, "lifecycle_pages"), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/, label);
  }
  for (const n of [node("77.1", "16.0", "en-US"), node("78.3", "17.0", "zh-CN"), node(undefined, undefined, undefined)]) {
    assert.throws(() => assertLifecycleNodeSortRuntimeFor(n), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  }
}));

test("a rejection logs one fixed-field version line per tuple and nothing else", captureWarn(lines => {
  const prodNode77 = node("77.1", "16.0", "en-US", "24.12.0");
  assert.throws(() => assertLifecycleSortRuntimeFor(prodNode77, PROD_PG, "lifecycle_pages"), /LIFECYCLE_SORT_RUNTIME_UNVERIFIED/);
  assert.throws(() => assertLifecycleSortRuntimeFor(prodNode77, PROD_PG, "relationship_task_page"), /LIFECYCLE_SORT_RUNTIME_UNVERIFIED/);
  assert.equal(lines.length, 1, "the same tuple is logged once per process");
  const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(entry).sort(), [...SORT_RUNTIME_LOG_FIELDS].sort());
  assert.deepEqual(entry, {
    event: "sort_runtime_unverified", check: "lifecycle_pages", node: "24.12.0", icu: "77.1", unicode: "16.0",
    cldr: "48.0", collatorLocale: "en-US", server_version_num: "160015", server_encoding: "UTF8",
    catalog: "153.14", actual: "153.14", provider: "i", deterministic: true,
  });
  assert.throws(() => assertLifecycleNodeSortRuntimeFor(prodNode77), /LIFECYCLE_SORT_RUNTIME_UNVERIFIED/);
  assert.equal(lines.length, 2, "a Node-only precheck is a different tuple");
  const precheck = JSON.parse(lines[1]!) as Record<string, unknown>;
  assert.equal(precheck.check, "lifecycle_home");
  for (const key of ["server_version_num", "server_encoding", "catalog", "actual", "provider", "deterministic"]) assert.equal(precheck[key], null, key);
}));

test("logging is best-effort: a throwing console.warn or unserializable input keeps the original error code", async () => {
  resetSortRuntimeRejectionLogForTest();
  const original = console.warn;
  console.warn = () => { throw new Error("log sink down"); };
  try {
    assert.throws(() => assertLifecycleSortRuntimeFor(node("77.1", "16.0", "en-US"), PROD_PG, "lifecycle_pages"), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
    assert.throws(() => assertLifecycleNodeSortRuntimeFor(node("77.1", "16.0", "en-US", "24.1.0")), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  } finally { console.warn = original; }
  const hostile = { get pg() { throw new Error("getter"); }, encoding: BigInt(1), catalog: { toJSON() { throw new Error("json"); } }, actual: Symbol("x"), provider: "i", deterministic: true };
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    assert.throws(() => assertLifecycleSortRuntimeFor(node(BigInt(10), Symbol("u"), { locale: "x" }), hostile, "lifecycle_home"), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  } finally { console.warn = original; resetSortRuntimeRejectionLogForTest(); }
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(entry.icu, null); assert.equal(entry.server_version_num, null); assert.equal(entry.catalog, null);
});

function fakeClient(result: Record<string, unknown>) {
  const texts: string[] = [];
  const client: LiveRecordSqlClient = { async query<T>(text: string) { texts.push(text); return { rows: [{ result }] as T[] }; } };
  return { client, texts };
}
const empty = { current: [], history: [], orphan: [] };
const secret = "local-test-only-".repeat(4);

test("readers: PG mismatch rejects after the one existing query; the home Node precheck rejects before any query", captureWarn(async lines => {
  const pages = fakeClient({ ok: true, runtime: pg("170004", "153.14"), counts: { current: 0, history: 0, orphan: 0 }, pages: empty });
  await assert.rejects(createLifecycleTaskPagesReader({ client: pages.client, workspaceId: "w", secret, nodeRuntime: () => ICU783 }).read("actor:private"), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  assert.deepEqual(pages.texts, [LIFECYCLE_TASK_PAGES_SQL]);

  const relationship = fakeClient({ ok: true, runtime: pg("160015", "153.14", "153.136"), total: 0, items: [] });
  await assert.rejects(createRelationshipTaskPageReader({ client: relationship.client, workspaceId: "w", secret, nodeRuntime: () => ICU783 }).read("actor:private", { mode: "open" }), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  assert.equal(relationship.texts.length, 1);

  const window = { snapshotAt: "2026-09-25T00:00:00.000Z", from: "2026-09-18T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" };
  const homeRow = { ok: true, runtime: pg("160015", "153.14", "153.14", { provider: "c" }), counts: { current: 0, history: 0, orphan: 0 }, groups: { overdue: 0, recent: 0, undated: 0 }, items: [] };
  const homeBlocked = fakeClient(homeRow);
  await assert.rejects(createLifecycleHomeSummaryReader({ client: homeBlocked.client, workspaceId: "w", nodeRuntime: () => node("77.1", "16.0", "en-US") }).read("actor:private", window), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  assert.equal(homeBlocked.texts.length, 0, "Node precheck rejects before the database is read");
  const homePg = fakeClient(homeRow);
  await assert.rejects(createLifecycleHomeSummaryReader({ client: homePg.client, workspaceId: "w", nodeRuntime: () => ICU783 }).read("actor:private", window), /^Error: LIFECYCLE_SORT_RUNTIME_UNVERIFIED$/);
  assert.deepEqual(homePg.texts, [LIFECYCLE_HOME_SUMMARY_SQL]);

  const checks = lines.map(line => (JSON.parse(line) as { check: string }).check);
  assert.deepEqual(checks, ["lifecycle_pages", "relationship_task_page", "lifecycle_home", "lifecycle_home"]);
  for (const line of lines) {
    for (const marker of ["actor:private", "w\"", "select", "SELECT"]) assert.ok(!line.includes(marker), `${marker} must not be logged`);
  }
}));

test("readers: a verified pair keeps one query with the unchanged SQL text", captureWarn(async lines => {
  for (const runtime of [LOCAL_PG, PROD_PG]) {
    const pages = fakeClient({ ok: true, runtime, counts: { current: 0, history: 0, orphan: 0 }, pages: empty });
    const result = await createLifecycleTaskPagesReader({ client: pages.client, workspaceId: "w", secret, nodeRuntime: () => ICU782 }).read("a");
    assert.deepEqual(result.counts, { current: 0, history: 0, orphan: 0 });
    assert.deepEqual(pages.texts, [LIFECYCLE_TASK_PAGES_SQL]);
  }
  assert.deepEqual(lines, []);
}));
