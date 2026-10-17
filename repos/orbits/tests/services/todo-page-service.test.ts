import assert from "node:assert/strict";
import test from "node:test";
import { createTodoPageService, type TodoReadInput, type TodoSourceReader } from "../../features/todo/service";
import type { TodoDecisionItem, TodoFollowupItem } from "../../shared/contract/todo-page";

const scope = { actorId: "actor-a", date: "2026-10-18", timeZone: "Asia/Tokyo" };
const secret = "r20a-test-secret-with-at-least-32-bytes";
const decision = (id: string): TodoDecisionItem => ({ key: `task_suggestion:${id}`, source: "task_suggestion", sourceId: id, titlePreview: id, createdAt: "2026-10-18T00:00:00Z", actions: ["accept"] });
const followup = (source: "task" | "relationship_task", id: string, dueAt: string): TodoFollowupItem => ({
  key: `${source}:${id}`, source, sourceId: id, taskId: id, titlePreview: id, createdAt: "2026-10-01T00:00:00Z",
  kind: source === "task" ? "task" : "lifecycle", status: "open", overdue: dueAt < "2026-10-18", dueAt,
});
function reader(items: readonly (TodoDecisionItem | TodoFollowupItem)[], extra: { total?: number; overdue?: number; capped?: boolean } = {}): TodoSourceReader {
  return async input => {
    const offset = Number(input.cursor ?? 0);
    return { entries: items.slice(offset, offset + input.limit).map((item, index) => ({ item, cursor: String(offset + index + 1) })),
      total: extra.total ?? items.length, hasMore: offset + input.limit < items.length, ...extra };
  };
}
function service(readers: Parameters<typeof createTodoPageService>[0]["readers"], onError?: Parameters<typeof createTodoPageService>[0]["onError"]) {
  return createTodoPageService({ workspaceId: "workspace-a", secret, readers, now: () => "2026-10-18T00:00:00Z", onError });
}

test("a failing To-do source does not hide healthy sources or log private error text", async () => {
  const errors: unknown[] = [];
  const page = await service({ task_suggestion: reader([decision("s1")], { total: 101, capped: true }), agent_action: async () => { throw new Error("private title actor-a"); },
    plan_today_chance: async () => ({ entries: [], total: 0, hasMore: false, notImplemented: true }) }, error => errors.push(error)).read(scope);
  assert.equal(page.decisions.items[0]?.key, "task_suggestion:s1");
  assert.equal(page.counts.decisions, 101);
  assert.equal(page.countsCapped.decisions, true);
  assert.equal(page.sources.agent_action, "unavailable");
  assert.equal(page.sources.plan_today_chance, "not_implemented");
  assert.deepEqual(errors, [{ event: "todo_source_read_failed", source: "agent_action", code: "SOURCE_READ_FAILED" }]);
  assert.equal(JSON.stringify(page).includes("private"), false);
});

test("merged first-page trimming leaves every unshown source row reachable without cross-kind deduplication", async () => {
  const tasks = Array.from({ length: 25 }, (_, index) => followup("task", `t${index}`, "2026-10-01T00:00:00Z"));
  const lifecycle = Array.from({ length: 25 }, (_, index) => followup("relationship_task", `t${index}`, "2026-10-19T00:00:00Z"));
  const live = service({ task: reader(tasks, { overdue: 25 }), relationship_task: reader(lifecycle, { overdue: 0 }) });
  const first = await live.read(scope);
  assert.equal(first.followups.items.length, 20);
  assert.deepEqual(first.counts, { decisions: 0, nextMoves: 0, followups: 50, overdue: 25 });
  assert.equal(first.followups.items.every(item => item.overdue), true);
  const seen = new Set(first.followups.items.map(item => item.key));
  for (const source of ["task", "relationship_task"] as const) {
    let cursor = first.followups.next[source];
    for (let round = 0; cursor && round < 20; round++) {
      const page = await live.read({ ...scope, section: "followups", source, cursor, limit: 7 });
      assert.equal(page.followups.items.every(item => item.source === source), true);
      assert.equal(page.decisions.items.length, 0);
      for (const item of page.followups.items) { assert.equal(seen.has(item.key), false, item.key); seen.add(item.key); }
      cursor = page.followups.next[source];
    }
    assert.equal(cursor, undefined, "source pagination must terminate within its bounded fixture");
  }
  assert.equal(seen.size, 50);
});

test("To-do cursors bind account, workspace, date, timezone, source and section before any source read", async () => {
  let reads = 0;
  const base = reader(Array.from({ length: 9 }, (_, index) => decision(String(index))));
  const live = service({ task_suggestion: async input => { reads++; return base(input); } });
  const first = await live.read(scope);
  const cursor = first.decisions.next.task_suggestion!;
  assert.ok(cursor);
  for (const changed of [{ actorId: "actor-b" }, { date: "2026-10-19" }, { timeZone: "UTC" }, { source: "agent_action" }, { section: "followups", source: "task" }, { cursor: `${cursor}x` }] satisfies Partial<TodoReadInput>[]) {
    const before = reads;
    await assert.rejects(live.read({ ...scope, section: "decisions", source: "task_suggestion", cursor, ...changed }), /TODO_CURSOR_INVALID|TODO_PAGE_INPUT_INVALID/);
    assert.equal(reads, before);
  }
  await assert.rejects(createTodoPageService({ workspaceId: "workspace-b", secret, readers: {} }).read({ ...scope, section: "decisions", source: "task_suggestion", cursor }), /TODO_CURSOR_INVALID/);
});

test("bounded source breaches keep a fixed diagnostic code and never expose the exception", async () => {
  const errors: unknown[] = [];
  const page = await service({ plan_pending: async () => { throw Error("TODO_PLAN_READ_LIMIT"); } }, error => errors.push(error)).read(scope);
  assert.equal(page.sources.plan_pending, "unavailable");
  assert.deepEqual(errors, [{ event: "todo_source_read_failed", source: "plan_pending", code: "TODO_PLAN_READ_LIMIT" }]);
});

test("an invalid source preview is unavailable rather than counted and silently skipped by the response reader", async () => {
  const page = await service({ task_suggestion: reader([{ ...decision("bad"), createdAt: "not-a-date" }]) }, () => {}).read(scope);
  assert.equal(page.sources.task_suggestion, "unavailable"); assert.equal(page.counts.decisions, 0);
});
