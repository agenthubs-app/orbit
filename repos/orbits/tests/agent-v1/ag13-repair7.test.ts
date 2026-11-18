import assert from "node:assert/strict";
import test from "node:test";

import { refusedCreates } from "../../features/agent-v1/understand/negated-writes";
import { json, runContact } from "./contact-kit";

/**
 * agent-design AG13 repair round 7 (AE-UND-003, AG12 rerun at AG13 run-07): a create the user refuses in the same clause is
 * dropped by code before routing; a refused part never proposes a write. Controls: a create asked for still creates.
 */

const CAPS = ["todo.create", "memo.create", "schedule.create", "memo.read"];

test("refused creates are dropped (en, zh, ja)", () => {
  assert.deepEqual(refusedCreates("Tell me what Emily said she'd send me after our call, but don't add anything to my to-dos.", CAPS), ["todo.create"]);
  assert.deepEqual(refusedCreates("Don't save a note, just tell me.", CAPS), ["memo.create"]);
  assert.deepEqual(refusedCreates("看看小林答应了什么，先不要加到待办里。", CAPS), ["todo.create"]);
  assert.deepEqual(refusedCreates("别给我建待办，只说说他答应的事。", CAPS), ["todo.create"]);
  assert.deepEqual(refusedCreates("待办先不要加，告诉我就行。", CAPS), ["todo.create"]);
  assert.deepEqual(refusedCreates("这次不用记笔记。", CAPS), ["memo.create"]);
  assert.deepEqual(refusedCreates("山本さんが約束したことを教えて。ToDoには追加しないでください。", CAPS), ["todo.create"]);
  assert.deepEqual(refusedCreates("ToDoに追加しなくていいので、内容だけ教えて。", CAPS), ["todo.create"]);
  assert.deepEqual(refusedCreates("予定には入れないで。", CAPS), ["schedule.create"]);
});

test("controls: a create that is asked for stays (en, zh, ja)", () => {
  assert.deepEqual(refusedCreates("帮我加一条待办：给小林回电话。", CAPS), []);
  assert.deepEqual(refusedCreates("不要忘了，帮我加个待办提醒我周五交报告。", CAPS), [], "the refusal is about forgetting, in another clause");
  assert.deepEqual(refusedCreates("Add a to-do to call Emily, and don't forget the deadline.", CAPS), []);
  assert.deepEqual(refusedCreates("山本さんとの食事をToDoに追加して。", CAPS), []);
  assert.deepEqual(refusedCreates("Don't add anything to my to-dos.", ["memo.read"]), [], "nothing listed, nothing dropped");
});

test("graph (AE-UND-003): the refused to-do create is dropped and the part reads instead of proposing a write", async () => {
  const message = "Tell me what Emily said she'd send me after our call, but don't add anything to my to-dos.";
  const run = await runContact(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", text: "Emily" }], requiredCapabilities: ["contact.read", "memo.read", "view.recentInteraction", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], [], { answer: () => json({ segments: [] }) });
  const dropped = run.events.find((event) => event.type === "understand.refused_create");
  assert.ok(dropped, "the drop is traced");
  assert.deepEqual(dropped.dropped, ["todo.create"]);
  assert.equal(run.result.partResults[0].route, "read", "the part reads the records");
  assert.equal(run.events.filter((event) => event.type === "propose.card").length, 0);
});
