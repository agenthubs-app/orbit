import assert from "node:assert/strict";
import test from "node:test";

import { createTodoHandoffStorage } from "../src/screens/todo/todo-handoff-storage";

test("handoff storage is actor/server scoped and rejects draft text or corrupt records", async () => {
  const values = new Map<string, string>();
  const storage = createTodoHandoffStorage({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  });
  const scope = { actorId: "actor-1", serverUrl: "https://one.test" };
  const records = [{ sourceId: "signal-1", handedOffAt: "2026-10-18T01:00:00.000Z" }];
  await storage.save(scope, records);
  assert.deepEqual(await storage.load(scope), records);
  assert.deepEqual(await storage.load({ ...scope, actorId: "actor-2" }), []);
  assert.deepEqual(await storage.load({ ...scope, serverUrl: "https://two.test" }), []);
  const key = [...values.keys()][0]!;
  assert.doesNotMatch(values.get(key)!, /draft|message|contact-1/u);
  values.set(key, JSON.stringify([{ ...records[0], draft: "private" }]));
  assert.deepEqual(await storage.load(scope), []);
  await assert.rejects(storage.save(scope, [{ ...records[0], draft: "private" }] as never));
});

test("invalid identity cannot persist or read a shared key", async () => {
  const storage = createTodoHandoffStorage({ getItem: async () => "[]", setItem: async () => {} });
  assert.deepEqual(await storage.load({ actorId: " ", serverUrl: "https://one.test" }), []);
  await assert.rejects(storage.save({ actorId: " ", serverUrl: "https://one.test" }, []));
});
