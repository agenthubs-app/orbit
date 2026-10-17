import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipTaskResolveHandler } from "../../features/connections/lifecycle/task-resolve-handler";

const actor = { id: "a", workspaceId: "w" };
const mapping = { taskId: "task:1", connectionId: "connection:1", contactId: "contact:1" };
const request = (query = "") => new Request(`http://localhost/api/relationship-tasks/task%3A1/resolve${query}`);
const context = (id = "task:1") => ({ params: Promise.resolve({ id }) });

test("exact resolver authenticates and uses only server account/workspace, never caller identity", async () => {
  const calls: unknown[] = [];
  const GET = createRelationshipTaskResolveHandler({ resolveActor: async () => actor, reader: workspace => {
    assert.equal(workspace, "w");
    return { read: async (actorId, taskId) => { calls.push([actorId, taskId]); return mapping; } };
  } });
  const response = await GET(request(), context());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, mapping);
  assert.deepEqual(calls, [["a", "task:1"]]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("resolver fails closed before SQL for missing auth/workspace or malformed id/query", async () => {
  const reader = () => { throw Error("MUST_NOT_READ_PRIVATE"); };
  assert.equal((await createRelationshipTaskResolveHandler({ resolveActor: async () => null, reader })(request(), context())).status, 401);
  assert.equal((await createRelationshipTaskResolveHandler({ resolveActor: async () => ({ id: "a" }), reader })(request(), context())).status, 503);
  const GET = createRelationshipTaskResolveHandler({ resolveActor: async () => actor, reader });
  for (const id of ["", " ", " leading", "trailing ", "a\0b", "a\nb", "x".repeat(257)]) assert.equal((await GET(request(), context(id))).status, 400, id);
  for (const query of ["?actorId=b", "?workspaceId=other", "?taskId=other", "?limit=1"]) assert.equal((await GET(request(query), context())).status, 400, query);
});

test("missing/unowned links return 404, ambiguity returns 409, other failures expose no private error", async () => {
  for (const [result, status] of [[null, 404], [Error("RELATIONSHIP_TASK_MAPPING_CONFLICT"), 409], [Error("PRIVATE SQL account a task1"), 503], [{ ...mapping, taskId: "another" }, 503]] as const) {
    const GET = createRelationshipTaskResolveHandler({ resolveActor: async () => actor, reader: () => ({ read: async () => {
      if (result instanceof Error) throw result;
      return result;
    } }) });
    const response = await GET(request(), context());
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /PRIVATE|account a|another|SQL/);
  }
  assert.equal((await createRelationshipTaskResolveHandler({ resolveActor: async () => actor, reader: () => null })(request(), context())).status, 503);
});
