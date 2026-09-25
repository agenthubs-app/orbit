import assert from "node:assert/strict";
import test from "node:test";
import { createNoteTaskPageGetHandler } from "../../app/api/tasks/note-page/handler";

const actor = { id: "a", workspaceId: "w" };
const request = (query = "noteId=n") => new Request("http://localhost/api/tasks/note-page?" + query);
test("note task page resolves canonical identity, validates input before storage, and never falls back", async () => {
  let reads = 0;
  const handler = createNoteTaskPageGetHandler({ resolveActor: async () => actor, reader: workspace => {
    reads++; assert.equal(workspace, "w"); return { async read(actorId, query) {
      assert.equal(actorId, "a"); assert.deepEqual(query, { noteId: "n", limit: 20, cursor: null });
      return { actorId, noteId: query.noteId, items: [], total: 0, hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00Z" };
    } };
  } });
  const result = await handler(request()); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
  for (const query of ["", "noteId=", "noteId=n&actorId=b", "noteId=n&noteId=x", "noteId=n&limit=31", "noteId=n&limit=0", "noteId=n&limit=1.5", "noteId=n&cursor=", "noteId=n&status=open"]) assert.equal((await handler(request(query))).status, 400, query);
  assert.equal(reads, 1);
  assert.equal((await createNoteTaskPageGetHandler({ resolveActor: async () => null, reader: () => { throw Error("No read"); } })(request())).status, 401);
  for (const [message, status] of [["NOTE_TASK_PAGE_CURSOR_INVALID", 400], ["READ_CURSOR_SECRET_MISSING", 503], ["private database details", 503]] as const) {
    const failed = await createNoteTaskPageGetHandler({ resolveActor: async () => actor, reader: () => ({ async read() { throw Error(message); } }) })(request());
    assert.equal(failed.status, status); assert.ok(!(await failed.text()).includes(message));
  }
});
