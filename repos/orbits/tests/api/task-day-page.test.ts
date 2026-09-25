import assert from "node:assert/strict";
import test from "node:test";
import { createTaskPageGetHandler } from "../../app/api/tasks/page/handler";
import type { TaskPageContract } from "../../shared/contract/task-page";

const actor = { id: "a", workspaceId: "w" };
const dueWindow = { plannedThrough: "2026-09-25", dueBefore: "2026-09-25T15:00:00.000Z" };
test("task day API forwards an authenticated bounded date window without changing old request defaults", async () => {
  let reads = 0;
  const handler = createTaskPageGetHandler({ resolveActor: async () => actor, reader: workspace => {
    assert.equal(workspace, "w");
    return { read: async (id, query) => {
      reads++; assert.equal(id, "a"); assert.equal(query.limit, 5); assert.deepEqual(query.dueWindow, dueWindow);
      return { actorId: id, status: "open", scope: "all", query: "", dueWindow, items: [], total: 0, counts: { open: 0, completed: 0 },
        hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00.000Z" } satisfies TaskPageContract;
    } };
  } });
  const response = await handler(new Request("https://orbit.test/api/tasks/page?" + new URLSearchParams({ limit: "5", ...dueWindow })));
  assert.equal(response.status, 200); assert.equal(reads, 1); assert.deepEqual((await response.json()).data.dueWindow, dueWindow);
});

test("invalid and incomplete date windows are rejected before opening storage", async () => {
  const handler = createTaskPageGetHandler({ resolveActor: async () => actor, reader: () => { throw Error("must not open storage"); } });
  for (const window of [
    { plannedThrough: dueWindow.plannedThrough }, { dueBefore: dueWindow.dueBefore },
    { ...dueWindow, plannedThrough: "2026-02-31" }, { ...dueWindow, plannedThrough: "2026-13-01" },
    { ...dueWindow, dueBefore: "2026-09-26T00:00:00+09:00" }, { ...dueWindow, dueBefore: "invalid" },
    { ...dueWindow, dueBefore: "" },
  ]) {
    const response = await handler(new Request("https://orbit.test/api/tasks/page?" + new URLSearchParams(window)));
    assert.equal(response.status, 400);
  }
});
