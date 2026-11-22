import assert from "node:assert/strict";
import test from "node:test";

import { authorizeReferences } from "../../features/agent-v1/references/authorize";
import { A, readKit, scopeOf, smallWorld } from "./read-kit";

/**
 * agent-design AG05-5 (设计稿 §3.6, 附录 D REFERENCE_NOT_ACCESSIBLE): each of the six kinds of @ reference
 * is checked on the server, one by one — kind, id, owner, not deleted; events are platform-visible or the
 * account's own; attendance records do not exist before AG13 and are never accessible. One reference that
 * fails does not fail the others (the old contact check threw on the first).
 */

test("six kinds, one result each: own records pass; another account's, deleted and attendance do not", async () => {
  const world = smallWorld();
  world.records.find((record) => record.id === "note:m37")!.deleted = true;
  const { registry } = readKit(world);
  const results = await authorizeReferences(registry, scopeOf(A), [
    { id: "contact:c17", type: "contact" },
    { id: "note:m31", type: "note" },
    { id: "note:m37", type: "memo" },
    { id: "note:mb1", type: "memo" },
    { id: "task:t42", type: "todo" },
    { id: "personal:s10", type: "schedule" },
    { id: "event:e103", type: "event" },
    { id: "event:draft", type: "event" },
    { id: "attendance:a1", type: "attendance" },
  ]);
  assert.deepEqual(results.map((item) => [item.type, item.id, item.accessible, item.name]), [
    ["contact", "contact:c17", true, "小林健"],
    ["memo", "note:m31", true, "和小林聊了报价初稿。小林"],
    ["memo", "note:m37", false, null],
    ["memo", "note:mb1", false, null],
    ["todo", "task:t42", true, "给小林发修订报价"],
    ["schedule", "personal:s10", true, "团队周会"],
    ["event", "event:e103", true, "SaaS 定价研讨会"],
    ["event", "event:draft", false, null],
    ["attendance", "attendance:a1", false, null],
  ]);
  for (const item of results.filter((entry) => !entry.accessible)) assert.equal(item.reason, "REFERENCE_NOT_ACCESSIBLE");
  assert.equal(JSON.stringify(results).includes("降价"), false, "nothing of the other account's note comes back");
});

test("a read failure is not a missing record: the reference says the source was unavailable", async () => {
  const { registry } = readKit();
  const failing = { ...registry, async read() { throw new Error("SOURCE_UNAVAILABLE"); } };
  const [result] = await authorizeReferences(failing, scopeOf(A), [{ id: "note:m31", type: "note" }]);
  assert.deepEqual([result.accessible, result.reason], [false, "SOURCE_UNAVAILABLE"]);
});

test("a withdrawn read permission makes the reference inaccessible", async () => {
  const { registry } = readKit(smallWorld(), { denied: new Set(["note:m31"]) });
  const [result] = await authorizeReferences(registry, scopeOf(A), [{ id: "note:m31", type: "memo" }]);
  assert.deepEqual([result.accessible, result.reason], [false, "REFERENCE_NOT_ACCESSIBLE"]);
});
