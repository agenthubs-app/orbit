import assert from "node:assert/strict";
import test from "node:test";

import type {
  AiReadPermission,
  CanonicalRow,
  ReadAdapter,
  ReadDependencies,
  ReadInput,
  ReadScope,
} from "../../features/orbit-ai/data-query/read-contract";
import {
  openReadCursor,
  sealReadCursor,
  type CursorBinding,
} from "../../features/orbit-ai/data-query/query-cursor";
import { executeAiRead } from "../../features/orbit-ai/data-query/query-result";

const key = new Uint8Array(32).fill(7);
const now = "2026-09-16T00:00:00.000Z";
const scope: ReadScope = { actorId: "a", workspaceId: "w", authorizationEpoch: "e1" };

function row(index: number, fields: Readonly<Record<string, unknown>> = { title: `Note ${index}` }): CanonicalRow {
  return {
    id: `note:${index}`,
    revision: `revision:${index}`,
    updatedAt: `2026-09-15T${String(index).padStart(2, "0")}:00:00.000Z`,
    fields,
    evidenceIds: [`evidence:${index}`],
    position: `position:${index}`,
  };
}

function fixture(initialRows = Array.from({ length: 11 }, (_, index) => row(index + 1))) {
  let activeScope = scope;
  let authorized = true;
  let rows = [...initialRows];
  const snapshots = new Map<string, readonly CanonicalRow[]>();
  const adapter: ReadAdapter = {
    authorize: async () => authorized,
    authorizeEvidence: async (_scope, ids) => authorized ? ids : [],
    page: async (_scope, input, position, snapshot) => {
      const snapshotId = snapshot ?? "snapshot:1";
      if (!snapshots.has(snapshotId)) snapshots.set(snapshotId, [...rows]);
      const stableRows = snapshots.get(snapshotId)!;
      const start = position ? stableRows.findIndex((item) => item.position === position) + 1 : 0;
      const pageRows = stableRows.slice(start, start + 11);
      return {
        rows: input.operation === "get" ? pageRows.filter((item) => item.id === input.id) : pageRows,
        snapshot: snapshotId,
        partialReasons: [],
      };
    },
  };
  const permission: AiReadPermission = {
    tool: "notes.query",
    domain: "notes",
    schemaVersion: 1,
    fields: ["title", "body"],
    maxItems: 10,
    enabled: async () => true,
  };
  const deps: ReadDependencies = {
    adapter: () => adapter,
    permission: () => permission,
    currentScope: async () => activeScope,
    readAuthorityExpiresAt: async () => "2026-09-16T01:00:00.000Z",
    cursorKey: key,
    now: () => now,
  };
  return {
    deps,
    insert(value: CanonicalRow) { rows = [value, ...rows]; },
    remove(id: string) { rows = rows.filter((item) => item.id !== id); },
    revoke() { authorized = false; },
    setScope(value: ReadScope) { activeScope = value; },
  };
}

test("cursor is authenticated, scope bound, version bound, filter bound, and expires", () => {
  const binding: CursorBinding = {
    scope,
    tool: "notes.query",
    schemaVersion: 1,
    registryVersion: 1,
    filterHash: "filter:1",
  };
  const token = sealReadCursor({
    ...binding,
    snapshot: "snapshot:1",
    position: "position:10",
    expiresAt: "2026-09-16T01:00:00.000Z",
  }, key);
  assert.equal(openReadCursor(token, key, binding, now).position, "position:10");

  const mismatches: CursorBinding[] = [
    { ...binding, scope: { ...scope, actorId: "b" } },
    { ...binding, scope: { ...scope, workspaceId: "other" } },
    { ...binding, scope: { ...scope, authorizationEpoch: "e2" } },
    { ...binding, tool: "tasks.query" },
    { ...binding, filterHash: "filter:2" },
    { ...binding, schemaVersion: 2 as 1 },
    { ...binding, registryVersion: 2 as 1 },
  ];
  for (const mismatch of mismatches) {
    assert.throws(() => openReadCursor(token, key, mismatch, now), /INVALID_CURSOR/);
  }
  assert.throws(() => openReadCursor(`${token}x`, key, binding, now), /INVALID_CURSOR/);
  assert.throws(() => openReadCursor(token, key, binding, "2026-09-16T02:00:00.000Z"), /INVALID_CURSOR/);
});

test("executeAiRead returns one canonical page without duplicates or snapshot drift", async () => {
  const f = fixture();
  const first = await executeAiRead("notes.query", { operation: "list", query: "notes" }, f.deps);
  assert.equal(first.items.length, 10);
  assert.equal(first.readAt, now);
  assert.equal(first.authority, "cloud_canonical");
  assert.equal(first.records[0]?.revision, "revision:1");
  assert.equal(first.truncated, true);
  assert.ok(first.nextCursor);
  assert.equal(first.partialReasons.includes("byte_limit"), false);
  assert.equal(JSON.stringify(first).includes("position:"), false);

  f.insert(row(99));
  const second = await executeAiRead(
    "notes.query",
    { operation: "list", query: "notes", cursor: first.nextCursor },
    f.deps,
  );
  assert.deepEqual(second.records.map((record) => record.id), ["note:11"]);
  assert.equal(second.truncated, false);
  assert.equal(second.nextCursor, undefined);
  assert.equal(new Set([...first.records, ...second.records].map((record) => record.id)).size, 11);
});

test("cursor TTL is capped by current read authority and empty pages retain authority metadata", async () => {
  const empty = fixture([]);
  const emptyResult = await executeAiRead("notes.query", { operation: "list", query: "notes" }, empty.deps);
  assert.equal(emptyResult.authority, "cloud_canonical");
  assert.equal(emptyResult.readAt, now);
  assert.deepEqual(emptyResult.items, []);

  const bounded = fixture();
  bounded.deps.readAuthorityExpiresAt = async () => "2026-09-16T00:05:00.000Z";
  const first = await executeAiRead("notes.query", { operation: "list", query: "notes" }, bounded.deps);
  assert.ok(first.nextCursor);
  bounded.deps.now = () => "2026-09-16T00:06:00.000Z";
  await assert.rejects(
    executeAiRead("notes.query", { operation: "list", query: "notes", cursor: first.nextCursor }, bounded.deps),
    /INVALID_CURSOR/,
  );
});

test("byte truncation resumes after the last returned source position", async () => {
  const hugeRows = [row(1, { title: "First", body: "a".repeat(20_000) }), row(2, { title: "Second", body: "b".repeat(20_000) })];
  const f = fixture(hugeRows);
  const first = await executeAiRead("notes.query", { operation: "list", query: "notes" }, f.deps);
  assert.equal(first.records[0]?.id, "note:1");
  assert.equal(first.records.some((record) => record.id === "note:2"), false);
  assert.equal(first.partialReasons.includes("byte_limit"), true);
  assert.ok(first.nextCursor);
  const second = await executeAiRead("notes.query", { operation: "list", query: "notes", cursor: first.nextCursor }, f.deps);
  assert.equal(second.records[0]?.id, "note:2");
});

test("missing canonical revision and authorization changes fail instead of returning stale text", async () => {
  const missingRevision = fixture([{ ...row(1), revision: "" }]);
  await assert.rejects(
    executeAiRead("notes.query", { operation: "list", query: "notes" }, missingRevision.deps),
    /REVISION_UNAVAILABLE/,
  );

  const revoked = fixture([row(1, { title: "Secret" })]);
  revoked.revoke();
  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, revoked.deps),
    /AI_NOT_AUTHORIZED/,
  );

  const changed = fixture([row(1)]);
  const originalAdapter = changed.deps.adapter;
  changed.deps.adapter = (tool) => {
    const source = originalAdapter(tool);
    return {
      ...source,
      page: async (...args: Parameters<ReadAdapter["page"]>) => {
        const result = await source.page(...args);
        changed.setScope({ ...scope, authorizationEpoch: "e2" });
        return result;
      },
    };
  };
  await assert.rejects(
    executeAiRead("notes.query", { operation: "list", query: "notes" }, changed.deps),
    /AUTHORIZATION_CHANGED/,
  );
});

test("deleted get and revoked evidence never return the former body", async () => {
  const deleted = fixture([row(1, { title: "Secret", body: "former body" })]);
  deleted.remove("note:1");
  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, deleted.deps),
    /READ_NOT_FOUND/,
  );

  const evidenceRevoked = fixture([row(1, { title: "Secret", body: "former body" })]);
  const source = evidenceRevoked.deps.adapter("notes.query");
  evidenceRevoked.deps.adapter = () => ({ ...source, authorizeEvidence: async () => [] });
  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, evidenceRevoked.deps),
    /EVIDENCE_NOT_AUTHORIZED/,
  );
});
