import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipTaskPageGetHandler } from "../../app/api/relationship-tasks/page/handler";
import { loadLifecycleTaskPages } from "../../app/(app)/app/tasks/lifecycle-pages-route-service";

test("both follow-up boundaries log safe diagnostic codes and keep private failures out of responses and logs", async t => {
  const lines: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
  const failures = [
    [new Error("READ_CURSOR_SECRET_MISSING"), "READ_CURSOR_SECRET_MISSING"],
    [new Error("LIFECYCLE_SORT_RUNTIME_UNVERIFIED"), "LIFECYCLE_SORT_RUNTIME_UNVERIFIED"],
    [Object.assign(new Error("PRIVATE title and actor details"), { code: "42703" }), "42703"],
    [Object.assign(new Error("PRIVATE title"), { code: "PRIVATE" }), "LIFECYCLE_READ_FAILED"],
    [Object.assign(new Error("PRIVATE title"), { code: "ALICE" }), "LIFECYCLE_READ_FAILED"],
  ] as const;
  for (const [error, code] of failures) {
    const handler = createRelationshipTaskPageGetHandler({
      resolveActor: async () => ({ id: "PRIVATE_ACTOR", userId: "PRIVATE_USER", accountId: "PRIVATE_ACTOR", workspaceId: "PRIVATE_WORKSPACE" }),
      reader: () => ({ read: async () => { throw error; } }),
    });
    const response = await handler(new Request("http://localhost/api/relationship-tasks/page"));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /PRIVATE|READ_CURSOR|LIFECYCLE_SORT/);
    const web = await loadLifecycleTaskPages({ actorId: "PRIVATE_ACTOR", reader: { read: async () => { throw error; } } });
    assert.equal(web.state, "unavailable");
    assert.deepEqual(lines.splice(0).map(line => JSON.parse(line)), [
      { event: "lifecycle_read_failed", check: "relationship_task_page", code },
      { event: "lifecycle_read_failed", check: "lifecycle_pages", code },
    ]);
  }
});

test("follow-up error responses survive a failed logging sink", async t => {
  t.mock.method(console, "warn", () => { throw Error("sink unavailable"); });
  const web = await loadLifecycleTaskPages({ actorId: "a", reader: { read: async () => { throw Error("READ_CURSOR_SECRET_MISSING"); } } });
  assert.equal(web.state, "unavailable");
  const handler = createRelationshipTaskPageGetHandler({
    resolveActor: async () => ({ id: "a", userId: "a", accountId: "a", workspaceId: "w" }),
    reader: () => ({ read: async () => { throw Error("READ_CURSOR_SECRET_MISSING"); } }),
  });
  assert.equal((await handler(new Request("http://localhost/api/relationship-tasks/page"))).status, 503);
});
