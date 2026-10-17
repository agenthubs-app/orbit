import assert from "node:assert/strict";
import test from "node:test";
import { createTodoSuggestionReader } from "../../features/todo/suggestions";
import { createTodoPageService } from "../../features/todo/service";

test("To-do wraps native suggestion cursors without skipping a partially displayed native page", async () => {
  const ids = Array.from({ length: 73 }, (_, index) => `suggestion-${index}`);
  let largest = 0;
  const read = createTodoSuggestionReader({ async createdAt(_actorId, ids) { return Object.fromEntries(ids.map(id => [id, "2026-10-01T00:00:00Z"])); }, async read(actorId, query) {
    assert.equal(actorId, "a"); assert.equal(query.scope, "all");
    largest = Math.max(largest, query.limit!);
    const offset = Number(query.cursor ?? 0), end = Math.min(ids.length, offset + query.limit!);
    return { actorId, scope: "all", total: ids.length, hasMore: end < ids.length, nextCursor: end < ids.length ? String(end) : null,
      asOf: "2026-10-18T00:00:00Z", items: ids.slice(offset, end).map(id => ({ id, titlePreview: id, reasonPreview: "Reason", category: "relationship", updatedAt: "2026-10-18T00:00:00Z" })) };
  } });
  const live = createTodoPageService({ workspaceId: "w", secret: "local-secret-".repeat(4), readers: { task_suggestion: read } });
  const input = { actorId: "a", date: "2026-10-18", timeZone: "Asia/Tokyo" };
  const first = await live.read(input);
  assert.equal(first.counts.decisions, 73); assert.equal(first.countsCapped.decisions, false);
  assert.equal(first.decisions.items[0]?.createdAt, "2026-10-01T00:00:00Z");
  const seen = first.decisions.items.map(item => item.sourceId);
  let cursor = first.decisions.next.task_suggestion;
  for (let round = 0; cursor && round < 30; round++) {
    const page = await live.read({ ...input, section: "decisions", source: "task_suggestion", cursor, limit: 7 });
    seen.push(...page.decisions.items.map(item => item.sourceId)); cursor = page.decisions.next.task_suggestion;
  }
  assert.equal(cursor, undefined); assert.deepEqual(seen, ids); assert.equal(largest, 30);
});
