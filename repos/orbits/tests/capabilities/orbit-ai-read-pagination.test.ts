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
  let capabilityEnabled = true;
  let rows = [...initialRows];
  const snapshots = new Map<string, readonly CanonicalRow[]>();
  const adapter: ReadAdapter = {
    authorize: async () => authorized,
    authorizeEvidence: async (_scope, ids) => authorized ? ids : [],
    page: async (_scope, input, position, snapshot) => {
      if (input.operation === "get") {
        return {
          rows: rows.filter((item) => item.id === input.id),
          snapshot: "canonical:current",
          partialReasons: [],
        };
      }
      const snapshotId = snapshot ?? "snapshot:1";
      if (!snapshots.has(snapshotId)) snapshots.set(snapshotId, [...rows]);
      const stableRows = snapshots.get(snapshotId)!;
      const start = position ? stableRows.findIndex((item) => item.position === position) + 1 : 0;
      const pageRows = stableRows.slice(start, start + 11);
      return {
        rows: pageRows,
        snapshot: snapshotId,
        partialReasons: [],
      };
    },
    readCurrentAtRevision: async (_scope, expected) => expected.flatMap((fence) => {
      const current = rows.find((item) => item.id === fence.id && item.revision === fence.revision);
      return current ? [current] : [];
    }),
  };
  const permission: AiReadPermission = {
    tool: "notes.query",
    domain: "notes",
    schemaVersion: 1,
    fields: ["title", "body"],
    maxItems: 10,
    enabled: async () => capabilityEnabled,
  };
  const deps: ReadDependencies = {
    adapter: () => adapter,
    permission: () => permission,
    currentScope: async () => activeScope,
    readAuthorityExpiresAt: async () => "2026-09-16T01:00:00.000Z",
    assertCurrentAuthorization: (expectedScope, expectedTool) => {
      if (expectedTool !== "notes.query" || !capabilityEnabled || !authorized) throw new Error("AI_NOT_AUTHORIZED");
      if (
        activeScope.actorId !== expectedScope.actorId ||
        activeScope.workspaceId !== expectedScope.workspaceId ||
        activeScope.authorizationEpoch !== expectedScope.authorizationEpoch
      ) throw new Error("AUTHORIZATION_CHANGED");
    },
    cursorKey: key,
    now: () => now,
  };
  return {
    deps,
    insert(value: CanonicalRow) { rows = [value, ...rows]; },
    remove(id: string) { rows = rows.filter((item) => item.id !== id); },
    revoke() { authorized = false; },
    disableCapability() { capabilityEnabled = false; },
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

test("cursor continuation rejects a row deleted after the snapshot even without evidence ids", async () => {
  const rows = Array.from({ length: 11 }, (_, index) => row(index + 1));
  rows[10] = { ...rows[10], fields: { title: "Deleted secret" }, evidenceIds: [] };
  const f = fixture(rows);
  const first = await executeAiRead("notes.query", { operation: "list", query: "notes" }, f.deps);
  assert.ok(first.nextCursor);
  f.remove("note:11");
  await assert.rejects(
    executeAiRead("notes.query", { operation: "list", query: "notes", cursor: first.nextCursor }, f.deps),
    /CANONICAL_RECORD_UNAVAILABLE/,
  );
});

test("atomic revision fence rejects deletion during canonical consumption", async () => {
  const f = fixture([row(1, { title: "Secret", body: "must not escape" })]);
  const source = f.deps.adapter("notes.query");
  f.deps.adapter = () => ({
    ...source,
    page: async (...args: Parameters<ReadAdapter["page"]>) => {
      const copied = await source.page(...args);
      if (args[1].operation === "get") f.remove("note:1");
      return copied;
    },
    readCurrentAtRevision: async (readScope, expected) => {
      await source.readCurrentAtRevision(readScope, expected);
      f.remove("note:1");
      return [];
    },
  });
  await assert.rejects(
    executeAiRead("notes.query", { operation: "list", query: "notes" }, f.deps),
    /CANONICAL_RECORD_UNAVAILABLE/,
  );
});

test("final outbound guard rejects capability revoked inside the revision fence", async () => {
  const f = fixture([row(1, { title: "Secret", body: "must not escape" })]);
  const source = f.deps.adapter("notes.query");
  f.deps.adapter = () => ({
    ...source,
    readCurrentAtRevision: async (readScope, expected) => {
      const current = await source.readCurrentAtRevision(readScope, expected);
      f.disableCapability();
      return current;
    },
  });

  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, f.deps),
    /AI_NOT_AUTHORIZED/,
  );
});

test("final outbound guard rejects source permission revoked inside the revision fence", async () => {
  const f = fixture([row(1, { title: "Secret", body: "must not escape" })]);
  const source = f.deps.adapter("notes.query");
  f.deps.adapter = () => ({
    ...source,
    readCurrentAtRevision: async (readScope, expected) => {
      const current = await source.readCurrentAtRevision(readScope, expected);
      f.revoke();
      return current;
    },
  });

  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, f.deps),
    /AI_NOT_AUTHORIZED/,
  );
});

test("final outbound guard rejects scope epoch changed inside the revision fence", async () => {
  const f = fixture([row(1, { title: "Secret", body: "must not escape" })]);
  const source = f.deps.adapter("notes.query");
  f.deps.adapter = () => ({
    ...source,
    readCurrentAtRevision: async (readScope, expected) => {
      const current = await source.readCurrentAtRevision(readScope, expected);
      f.setScope({ ...scope, authorizationEpoch: "e2" });
      return current;
    },
  });

  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, f.deps),
    /AUTHORIZATION_CHANGED/,
  );
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

test("final serialized result including cursor stays within the byte budget", async () => {
  const boundaryBody = "a".repeat(31_400);
  const f = fixture([
    row(1, { title: "Boundary", body: boundaryBody }),
    row(2, { title: "After boundary" }),
    row(3, { title: "After boundary 3" }),
    row(4, { title: "After boundary 4" }),
    row(5, { title: "After boundary 5" }),
    row(6, { title: "After boundary 6" }),
  ]);
  const first = await executeAiRead("notes.query", { operation: "list", query: "notes" }, f.deps);
  assert.equal(first.records[0]?.id, "note:1");
  assert.ok(first.nextCursor);
  const legacyResult = { ...first, items: [{ title: "Boundary", body: boundaryBody }] };
  const legacySerializedBytes = Buffer.byteLength(JSON.stringify(legacyResult), "utf8");
  assert.ok(legacySerializedBytes > 32_000, `legacy result was only ${legacySerializedBytes} bytes`);
  const serializedBytes = Buffer.byteLength(JSON.stringify(first), "utf8");
  assert.ok(serializedBytes <= 32_000, `serialized result was ${serializedBytes} bytes`);
  const second = await executeAiRead("notes.query", { operation: "list", query: "notes", cursor: first.nextCursor }, f.deps);
  const secondSerializedBytes = Buffer.byteLength(JSON.stringify(second), "utf8");
  assert.ok(secondSerializedBytes <= 32_000, `second serialized result was ${secondSerializedBytes} bytes`);
  assert.deepEqual(
    [...first.records, ...second.records].map((record) => record.id),
    ["note:1", "note:2", "note:3", "note:4", "note:5", "note:6"],
  );
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
  evidenceRevoked.deps.adapter = () => ({
    ...source,
    authorizeEvidence: async () => [],
    readCurrentAtRevision: async () => [],
  });
  await assert.rejects(
    executeAiRead("notes.query", { operation: "get", query: "note:1", id: "note:1" }, evidenceRevoked.deps),
    /CANONICAL_RECORD_UNAVAILABLE/,
  );
});
