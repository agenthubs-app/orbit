import assert from "node:assert/strict";
import test from "node:test";

import { gapOfReadError } from "../../features/agent-v1/domains/registry";
import { A, B, pagedWorld, readKit, scopeOf } from "./read-kit";

/**
 * agent-design AG05-2: reads happen only in the account and workspace the server authenticated. Each of
 * the five kinds reads account A's records for A and none of them for B; a cursor of one scope is refused
 * in another; contact methods never reach the fields the model gets.
 */

const OF_B = ["note:mb1", "task:tb1", "personal:sb1", "contact:cb1"];

test("each of the five kinds reads only the scope's own records", async () => {
  const { registry, source } = readKit();
  const memoA = await registry.read("memo", scopeOf(A), { contactId: "contact:c17" });
  assert.deepEqual(memoA.items.map((item) => item.id), ["note:m31", "note:m32"]);
  assert.deepEqual((await registry.read("memo", scopeOf(A), { text: "降价" })).items, [], "A never sees B's note by its words");
  assert.deepEqual((await registry.read("todo", scopeOf(A), {})).items.map((item) => item.id), ["task:t42"]);
  assert.deepEqual((await registry.read("schedule", scopeOf(A), {})).items.map((item) => item.id), ["personal:s10"]);
  assert.deepEqual((await registry.read("contact", scopeOf(A), { text: "小林" })).items.map((item) => item.id), ["contact:c17"]);
  assert.deepEqual((await registry.read("contact", scopeOf(A), { text: "小林诚" })).items, [], "小林诚 exists only in B");
  await assert.rejects(registry.read("todo", scopeOf(A), { id: "task:tb1" }), /READ_NOT_FOUND/u, "another account's record by id is not found");
  assert.deepEqual(source.reads.filter((id) => OF_B.includes(id)), [], "no read of A returned a record of B");

  assert.deepEqual((await registry.read("memo", scopeOf(B), { contactId: "contact:c17" })).items, [], "B reads none of A's notes, even with A's contact id");
  await assert.rejects(registry.read("memo", scopeOf(B), { id: "note:m31" }), /READ_NOT_FOUND/u);
  assert.deepEqual((await registry.read("memo", scopeOf(B), { text: "降价" })).items.map((item) => item.id), ["note:mb1"]);
  assert.deepEqual((await registry.read("todo", scopeOf(B), {})).items.map((item) => item.id), ["task:tb1"]);
  assert.deepEqual((await registry.read("schedule", scopeOf(B), {})).items.map((item) => item.id), ["personal:sb1"]);
});

test("events: a published platform event is readable by id; someone else's draft is not", async () => {
  const { registry } = readKit();
  const read = await registry.read("event", scopeOf(A), { id: "event:e103" });
  assert.deepEqual(read.items.map((item) => [item.ref, item.fields.title, item.fields.location]), [["event:event:e103", "SaaS 定价研讨会", "丸之内"]]);
  await assert.rejects(registry.read("event", scopeOf(A), { id: "event:draft" }), /READ_NOT_FOUND/u);
});

test("a cursor sealed for one scope is refused in another (and for another filter)", async () => {
  const { registry } = readKit(pagedWorld(23));
  const first = await registry.read("memo", scopeOf(A), { contactId: "contact:c17" });
  assert.ok(first.nextCursor, "more than one page");
  await assert.rejects(registry.read("memo", scopeOf(B), { contactId: "contact:c17", cursor: first.nextCursor }), /INVALID_CURSOR/u);
  await assert.rejects(registry.read("memo", { ...scopeOf(A), workspaceId: "workspace:other" }, { contactId: "contact:c17", cursor: first.nextCursor }), /INVALID_CURSOR/u);
  await assert.rejects(registry.read("memo", scopeOf(A), { contactId: "contact:c30", cursor: first.nextCursor }), /INVALID_CURSOR/u);
  assert.equal(gapOfReadError(new Error("INVALID_CURSOR"), { byId: false }), "service_error");
});

test("contact methods (e-mail, phone) are never in the fields", async () => {
  const { registry } = readKit();
  const read = await registry.read("contact", scopeOf(A), { id: "contact:c17" });
  const shown = JSON.stringify(read.items);
  assert.ok(shown.includes("小林健") && shown.includes("北辰软件") && shown.includes("销售总监"));
  for (const hidden of ["@example.test", "+81-90", "primaryEmail", "primaryPhone"]) assert.equal(shown.includes(hidden), false, hidden);
});
