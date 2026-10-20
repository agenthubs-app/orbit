import assert from "node:assert/strict";
import test from "node:test";

test("deletion clears native outbox before the sync lifecycle archives a scope", async () => {
  const { clearAccountRightsSyncScope } = await import("../src/screens/account-rights/local-cleanup");
  const calls: string[] = [];
  const result = await clearAccountRightsSyncScope({
    async setScope(scope) { calls.push(scope ? "open" : "close"); return true; },
    async withDatabase(_scope, operation) {
      calls.push("transaction");
      return operation({ async run(sql) { calls.push(sql); } });
    },
  }, { baseUrl: "http://localhost:3400", actorId: "actor" });
  assert.equal(result, true);
  assert.deepEqual(calls, ["open", "transaction", "DELETE FROM sync_outbox", "DELETE FROM sync_aliases", "close"]);
  calls.length = 0;
  assert.equal(await clearAccountRightsSyncScope({
    async setScope(scope) { calls.push(scope ? "open" : "close"); return true; },
    async withDatabase(_scope, operation) { return operation({ async run(sql) { calls.push(sql); } }); },
  }, { baseUrl: "http://localhost:3400", actorId: "actor" }, { close: false }), true);
  assert.deepEqual(calls, ["open", "DELETE FROM sync_outbox", "DELETE FROM sync_aliases"]);
});
