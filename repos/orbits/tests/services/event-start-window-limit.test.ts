import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresEventStartWindowReader } from "../../features/events/core/start-window";

test("a limited published-event window is capped in SQL before rows reach the caller", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const reader = createPostgresEventStartWindowReader({ workspaceId: "w", client: {
    async query(sql: string, values: unknown[]) { calls.push({ sql, values }); return { rows: [] }; },
  } as never });
  await reader.listPublishedStartingBetween("2026-10-18T00:00:00.000Z", "2026-12-17T00:00:00.000Z", 21);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /limit \$4\s*$/i);
  assert.deepEqual(calls[0]!.values, ["w", "2026-10-18T00:00:00.000Z", "2026-12-17T00:00:00.000Z", 21]);
});

test("a published-event SQL limit must be a positive safe integer", async () => {
  let queries = 0;
  const reader = createPostgresEventStartWindowReader({ workspaceId: "w", client: {
    async query() { queries++; return { rows: [] }; },
  } as never });
  await assert.rejects(reader.listPublishedStartingBetween("2026-10-18T00:00:00.000Z", "2026-12-17T00:00:00.000Z", 0));
  assert.equal(queries, 0);
});
