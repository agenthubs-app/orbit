import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  contactSearchRuntimeEntryFor,
  createPostgresContactCardReader,
  createPostgresContactListPageReader,
  VERIFIED_CONTACT_SEARCH_RUNTIMES,
} from "../../features/contacts/storage/contact-list-postgres-reader";
import { resetSortRuntimeRejectionLogForTest, SORT_RUNTIME_LOG_FIELDS } from "../../shared/storage/sort-runtime";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

// SC-W0034-01／03／04（联系人侧）：组合表、日志、匹配路径绑定进游标。版本号注入，不改 process.versions。
const node = (icu: unknown, unicode: unknown = "17.0", collatorLocale: unknown = "en-US", version = "24.21.0") =>
  ({ node: version, icu, unicode, cldr: "48.0", collatorLocale });
const tuple = (serverVersion: string, collversion: string, extra: Record<string, unknown> = {}) => ({
  server_version_num: serverVersion, server_encoding: "UTF8", collation: "und-x-icu", collprovider: "i",
  collisdeterministic: true, catalog_collversion: collversion, actual_collversion: collversion,
  matcher_policy_version: "ecmascript-lower-substring-v1", ...extra,
});
const LOCAL = tuple("160012", "153.136");
const PROD = tuple("160015", "153.14");
const ICU783 = node("78.3");
const ICU782 = node("78.2", "17.0", "en-US", "24.15.0");

function captureWarn(run: (lines: string[]) => void | Promise<void>) {
  return async () => {
    resetSortRuntimeRejectionLogForTest();
    const original = console.warn;
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try { await run(lines); } finally { console.warn = original; resetSortRuntimeRejectionLogForTest(); }
  };
}

test("the contact search whitelist holds exactly the differentially tested pairs", () => {
  assert.deepEqual(
    VERIFIED_CONTACT_SEARCH_RUNTIMES.map(({ node: n, pg }) =>
      `${n.icu}/${n.unicode}/${n.collatorLocale}|pg${pg.pgMajor}/${pg.server_encoding}/${pg.catalog_collversion}/${pg.actual_collversion}/${pg.collprovider}/${pg.collisdeterministic}/${pg.collation}/${pg.matcher_policy_version}`),
    [
      "78.2/17.0/en-US|pg16/UTF8/153.136/153.136/i/true/und-x-icu/ecmascript-lower-substring-v1",
      "78.3/17.0/en-US|pg16/UTF8/153.136/153.136/i/true/und-x-icu/ecmascript-lower-substring-v1",
      "78.3/17.0/en-US|pg16/UTF8/153.14/153.14/i/true/und-x-icu/ecmascript-lower-substring-v1",
      "78.2/17.0/en-US|pg16/UTF8/153.14/153.14/i/true/und-x-icu/ecmascript-lower-substring-v1",
    ],
  );
  assert.ok(Object.isFrozen(VERIFIED_CONTACT_SEARCH_RUNTIMES));
  assert.equal(new Set(VERIFIED_CONTACT_SEARCH_RUNTIMES.map(entry => entry.id)).size, VERIFIED_CONTACT_SEARCH_RUNTIMES.length);
});

test("contact search pairs pass for any Node patch / PG 16 minor and reject everything else", () => {
  for (const version of ["24.16.0", "24.21.0", "24.99.0", "26.10.0"]) {
    for (const serverVersion of ["160015", "160016", "160099"]) assert.ok(contactSearchRuntimeEntryFor(tuple(serverVersion, "153.14"), node("78.3", "17.0", "en-US", version)));
    assert.ok(contactSearchRuntimeEntryFor(LOCAL, node("78.3", "17.0", "en-US", version)));
  }
  assert.ok(contactSearchRuntimeEntryFor(PROD, ICU782));
  assert.ok(contactSearchRuntimeEntryFor(LOCAL, ICU782));
  const rejected: [string, unknown, unknown][] = [
    ["ICU 77.1", PROD, node("77.1", "16.0")],
    ["untested ICU", PROD, node("78.4")],
    ["untested collversion", tuple("160015", "153.120"), ICU783],
    ["locale", PROD, node("78.3", "17.0", "zh-CN")],
    ["unicode", PROD, node("78.3", "16.0")],
    ["catalog != actual", { ...PROD, actual_collversion: "153.136" }, ICU783],
    ["provider", { ...PROD, collprovider: "c" }, ICU783],
    ["nondeterministic", { ...PROD, collisdeterministic: false }, ICU783],
    ["encoding", { ...PROD, server_encoding: "SQL_ASCII" }, ICU783],
    ["PG 17", tuple("170004", "153.14"), ICU783],
    ["collation", { ...PROD, collation: "und-u-ks-level2" }, ICU783],
    ["matcher policy", { ...PROD, matcher_policy_version: "ecmascript-lower-substring-v2" }, ICU783],
    ["no ICU", PROD, node(undefined)],
    ["missing tuple fields", { server_version_num: "160015" }, ICU783],
    ["array", [PROD], ICU783],
    ["null", null, ICU783],
  ];
  for (const [label, t, n] of rejected) assert.equal(contactSearchRuntimeEntryFor(t, n as never), null, label);
});

interface FakeOptions { probe: () => unknown; fingerprint?: () => unknown; hasMore?: boolean }
function fakeContactClient(options: FakeOptions) {
  const calls = { probe: 0, fast: 0, fallback: 0, fastValues: [] as (readonly unknown[])[] };
  const client: LiveRecordSqlClient = {
    async query<T>(text: string, values?: readonly unknown[]) {
      if (text.includes("as matcher_policy_version")) {
        calls.probe += 1;
        const row = options.probe();
        return { rows: (row ? [row] : []) as T[] };
      }
      if (text.includes('collate pg_catalog."und-x-icu"')) {
        calls.fast += 1;
        calls.fastValues.push(values ?? []);
        return { rows: [{
          total: "3", facet_tags: [], facet_sources: {}, facet_values: {}, facet_statuses: {}, has_more: options.hasMore ?? true,
          runtime_fingerprint: (options.fingerprint ?? options.probe)(),
          page: [{ record_id: "storage:one", sort_prefix_rank: 1, sort_occurred_at: "2026-09-17T00:00:01.000Z", sort_updated_at: "2026-09-17T00:00:01.000Z",
            card: { id: "contact:one", displayName: "One", organization: "", role: "", sourceType: "manual", status: "active",
              pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-17T00:00:01.000Z" } }],
        }] as T[] };
      }
      calls.fallback += 1;
      return { rows: [{ fallback_projection: { record_id: "storage:one", sort_occurred_at: "2026-09-17T00:00:01.000Z",
        sort_updated_at: "2026-09-17T00:00:01.000Z", storage_order: 1, storage_after: false } }] as T[] };
    },
  };
  return { client, calls };
}

const workspaceId = "workspace:path-binding";
const actorId = "actor:path-binding";
const query = { query: "ΟΣ", limit: 1 } as const;
function listReader(client: LiveRecordSqlClient, nodeRuntime = ICU783, now = () => 0) {
  return createPostgresContactListPageReader({ client, workspaceId, now, nodeRuntime: () => nodeRuntime });
}
function cursorWithScope(scope: string) {
  return Buffer.from(JSON.stringify({ version: 1, scope, last: { prefixRank: 1, occurredAt: "2026-09-17T00:00:01.000Z", updatedAt: "2026-09-17T00:00:01.000Z", recordId: "storage:one" } }), "utf8").toString("base64url");
}
function legacyScope(input: { query?: string | null }) {
  return createHash("sha256").update(JSON.stringify({
    actorId, workspaceId, query: input.query?.trim().toLowerCase() ?? "", sourceFilters: [], statusFilters: [],
    tagFilters: [], valueFilters: [], contextEventId: "", sortVersion: "contact-list-keyset-v1",
  })).digest("base64url");
}

test("list reader: a PG-path cursor is rejected once the request resolves to the JS path (PG→JS)", captureWarn(async () => {
  const pgSide = fakeContactClient({ probe: () => LOCAL });
  const first = await listReader(pgSide.client)(query, actorId);
  assert.equal(first?.mode ?? "fast", "fast");
  assert.ok(first?.nextCursor);

  // Second request: probe fails (tuple no longer approved) → JS path; the PG cursor must not be reused.
  const jsSide = fakeContactClient({ probe: () => ({ server_version_num: "0" }) });
  await assert.rejects(listReader(jsSide.client)({ ...query, cursor: first.nextCursor }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  assert.equal(jsSide.calls.fallback, 0, "no page is produced from a mixed-path cursor");

  // Probe throws (database hiccup) → backoff → JS path: still rejected.
  const failing: LiveRecordSqlClient = { async query() { throw new Error("probe failed"); } };
  await assert.rejects(listReader(failing)({ ...query, cursor: first.nextCursor }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);

  // Same client: fingerprint of the fast query no longer approved mid-request → cursor rejected, no fallback page.
  let approved = true;
  const flipping = fakeContactClient({ probe: () => LOCAL, fingerprint: () => (approved ? LOCAL : { server_version_num: "0" }) });
  const reader = listReader(flipping.client);
  const page = await reader(query, actorId);
  approved = false;
  await assert.rejects(reader({ ...query, cursor: page?.nextCursor }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  assert.equal(flipping.calls.fallback, 0);
  // Without a cursor the same situation still serves a first fallback page (unchanged behavior).
  const restarted = await reader(query, actorId);
  assert.equal(restarted?.mode, "fallback");
}));

test("list reader: a JS-path cursor is rejected once the probe recovers (JS→PG)", captureWarn(async () => {
  let now = 0;
  let approved = false;
  const fake = fakeContactClient({ probe: () => (approved ? LOCAL : { server_version_num: "0" }) });
  const reader = createPostgresContactListPageReader({ client: fake.client, workspaceId, now: () => now, nodeRuntime: () => ICU783 });
  const fallback = await reader(query, actorId);
  assert.equal(fallback?.mode, "fallback");
  assert.ok(fallback?.cursorScope);
  const jsCursor = cursorWithScope(fallback.cursorScope!);
  // Still inside the 30s backoff: the JS cursor stays valid on the JS path.
  now = 29_999;
  const stillJs = await reader({ ...query, cursor: jsCursor }, actorId);
  assert.equal(stillJs?.mode, "fallback");
  assert.equal(stillJs?.cursorScope, fallback.cursorScope);
  // Backoff over and probe recovers → PG path; the JS cursor is rejected instead of restarting silently.
  now = 30_000; approved = true;
  await assert.rejects(reader({ ...query, cursor: jsCursor }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  assert.equal(fake.calls.fast, 0, "the rejected request never reads a PG page");
  const pgFirst = await reader(query, actorId);
  assert.equal(pgFirst?.mode ?? "fast", "fast");
}));

test("list reader: pre-binding cursors are rejected; foreign-scope cursors still restart", captureWarn(async () => {
  const fake = fakeContactClient({ probe: () => LOCAL });
  const reader = listReader(fake.client);
  await assert.rejects(reader({ ...query, cursor: cursorWithScope(legacyScope(query)) }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  await assert.rejects(reader({ query: "", limit: 1, cursor: cursorWithScope(legacyScope({ query: "" })) }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  const page = await reader(query, actorId);
  // Another query / garbage: the existing "restart from page one" contract is unchanged.
  const foreign = await reader({ query: "other", limit: 1, cursor: page?.nextCursor }, actorId);
  assert.ok(foreign);
  const garbage = await reader({ ...query, cursor: "not-a-cursor" }, actorId);
  assert.ok(garbage);
  const lastValues = fake.calls.fastValues.at(-1)!;
  assert.deepEqual(lastValues.slice(9, 13), [null, null, null, null], "restart reads the first page");
}));

test("list reader: an unsupported tuple logs one fixed-field line and a failing log sink changes nothing", captureWarn(async lines => {
  const unsupported = tuple("170004", "153.14");
  const fake = fakeContactClient({ probe: () => unsupported });
  const page = await listReader(fake.client, node("77.1", "16.0", "en-US", "24.12.0"))(query, actorId);
  assert.equal(page?.mode, "fallback");
  await listReader(fakeContactClient({ probe: () => unsupported }).client, node("77.1", "16.0", "en-US", "24.12.0"))(query, actorId);
  assert.equal(lines.length, 1, "same tuple logged once per process");
  const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(entry).sort(), [...SORT_RUNTIME_LOG_FIELDS].sort());
  assert.deepEqual(entry, {
    event: "contact_search_runtime_unsupported", check: "contact_search", node: "24.12.0", icu: "77.1", unicode: "16.0",
    cldr: "48.0", collatorLocale: "en-US", server_version_num: "170004", server_encoding: "UTF8",
    catalog: "153.14", actual: "153.14", provider: "i", deterministic: true,
  });
  for (const marker of [actorId, workspaceId, "ΟΣ", "ος", "select"]) assert.ok(!lines[0]!.includes(marker), marker);

  const original = console.warn;
  console.warn = () => { throw new Error("sink down"); };
  try {
    resetSortRuntimeRejectionLogForTest();
    const again = await listReader(fakeContactClient({ probe: () => unsupported }).client, node("77.1"))(query, actorId);
    assert.equal(again?.mode, "fallback");
    await assert.rejects(
      createPostgresContactCardReader({ client: fakeContactClient({ probe: () => unsupported }).client, workspaceId, cursorSecret: "k".repeat(32), nodeRuntime: () => node("77.1") }).page(query, actorId),
      /^Error: CONTACT_SEARCH_RUNTIME_UNSUPPORTED$/,
    );
  } finally { console.warn = original; }
}));

test("card reader: a cursor issued under another verified pair is rejected; counts stay probe + one page query", captureWarn(async () => {
  const secret = "k".repeat(32);
  const first = fakeContactClient({ probe: () => LOCAL });
  const reader783 = createPostgresContactCardReader({ client: first.client, workspaceId, cursorSecret: secret, nodeRuntime: () => ICU783 });
  const page = await reader783.page(query, actorId);
  assert.ok(page.nextCursor);
  assert.equal(first.calls.probe, 1); assert.equal(first.calls.fast, 1); assert.equal(first.calls.fallback, 0);
  const next = await reader783.page({ ...query, cursor: page.nextCursor }, actorId);
  assert.equal(next.items.length, 1);
  assert.equal(first.calls.probe, 1, "positive probe stays cached"); assert.equal(first.calls.fast, 2);

  const second = fakeContactClient({ probe: () => LOCAL });
  const reader782 = createPostgresContactCardReader({ client: second.client, workspaceId, cursorSecret: secret, nodeRuntime: () => ICU782 });
  await assert.rejects(reader782.page({ ...query, cursor: page.nextCursor }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  assert.equal(second.calls.fast, 0);
  // Tampered and foreign-scope cursors are still rejected before any probe (unchanged ordering).
  const third = fakeContactClient({ probe: () => LOCAL });
  const reader = createPostgresContactCardReader({ client: third.client, workspaceId, cursorSecret: secret, nodeRuntime: () => ICU783 });
  await assert.rejects(reader.page({ ...query, cursor: `${page.nextCursor}x` }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  await assert.rejects(reader.page({ query: "other", limit: 1, cursor: page.nextCursor }, actorId), /^Error: CONTACT_CURSOR_INVALID$/);
  assert.equal(third.calls.probe, 0);
}));
