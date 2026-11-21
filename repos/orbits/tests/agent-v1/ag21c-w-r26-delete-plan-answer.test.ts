/**
 * AG21c R26 (W): a typed answer to the delete-plan question ("「我去过」一起删 / 转到另一场 / 先不删了") was sent to the second layer
 * on its own; the event was then searched by the answer's words and "没找到「…」这场活动" came back, with no card. The answer is
 * now matched to the plan's options by what it says to do (delete / move / keep / unlink), as a click would, and the same
 * delete plan goes on to its card. Names and wordings are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deletePlanPickIn, optionPickedIn } from "../../features/agent-v1/propose/asked";
import { ACTOR, byNode, cardKit, json, NOW } from "./functions-kit";
import { deepseekStub, graphKit, part, recordAccessOf } from "./graph-kit";
import { memo } from "./read-kit";

const WITH_ATTENDANCE = ["delete_attendance", "move_attendance", "keep"];
const LINKS_ONLY = ["unlink", "keep"];

test("R26 the delete-plan answer is read by what it says to do, in zh, ja and en; two that disagree or none is no pick", () => {
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "去过的那条也删，笔记只解绑"), "delete_attendance");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "参加的那条转到周六那场"), "move_attendance");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "我去过的不删，挪到另一场"), "move_attendance", "a negated delete is not a delete");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "算了，先不删了"), "keep");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "行った記録も削除して、メモは紐付けを外して"), "delete_attendance");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "やめておきます"), "keep");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "Delete the I went note too, and unlink the rest"), "delete_attendance");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "move it to the other meetup"), "move_attendance");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "Never mind, don't delete it"), "keep");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "删掉，或者转到另一场也行"), null, "two that disagree");
  assert.equal(deletePlanPickIn(WITH_ATTENDANCE, "嗯"), null);
  assert.equal(deletePlanPickIn(LINKS_ONLY, "解绑就行"), "unlink");
  assert.equal(deletePlanPickIn(LINKS_ONLY, "紐づけを外してから消して"), "unlink");
  assert.equal(deletePlanPickIn(LINKS_ONLY, "keep the event"), "keep");
  const item = { options: WITH_ATTENDANCE.map((id) => ({ id, label: id, type: "event_plan" })), resume: { intents: [], picks: {}, quote: "x", refs: [] } };
  assert.deepEqual(optionPickedIn(item, "去过那条一起删"), { id: "delete_attendance", type: "event_plan" });
});

const FAIR = { accountId: ACTOR, createdAt: "2026-10-01T00:00:00.000Z", id: "private_event:ink", startsAt: "2026-10-24T06:00:00.000Z", title: "墨池读书夜", updatedAt: "2026-10-01T00:00:00.000Z", version: 3 };

function world() {
  const base = { events: [], records: [memo(ACTOR, "note:ink", "读书夜上聊了版式。", "2026-10-24T10:00:00.000Z", [], { eventRefs: [{ id: FAIR.id, kind: "private" }], title: "读书夜摘记" })] };
  const access = recordAccessOf(base);
  return {
    base,
    records: {
      ...access,
      attendance: { list: async () => [{ attendedOn: "2026-10-24", eventRef: { id: FAIR.id, kind: "private" }, id: "attendance:ink", version: 1 }] },
      privateEvents: {
        get: async (_account: string, id: string) => (id === FAIR.id ? FAIR : null),
        list: async () => [FAIR],
        references: async () => [{ id: "attendance:ink", kind: "attendance", label: "2026-10-24", version: "1" }, { id: "note:ink", kind: "memo", label: "读书夜摘记", version: "1" }],
      },
    },
  };
}

async function turn(session: ReturnType<typeof graphKit>, base: ReturnType<typeof world>["base"], message: string, parts: Record<string, unknown>[], operations: unknown[]) {
  let proposeCalls = 0;
  const model = deepseekStub(byNode({
    propose: () => { proposeCalls += 1; return json({ operations }); },
    understand: () => json({ language: "zh", parts: parts.map((item, index) => part({ localId: `p${index + 1}`, ...item })), plainChat: false }),
  }));
  session.deps.fetchImplementation = model.fetchImplementation;
  const card = cardKit(base as never);
  session.deps.cards = card.cards;
  await session.seeded;
  const result = await runAgentGraph(session.deps, session.input(message, { locale: "zh" }));
  return { frozen: card.frozen, proposeCalls, result };
}

test("R26 '去过的那条也删，笔记只解绑' after the delete plan: the same plan goes on to its card, the event is never searched by the answer", async () => {
  const { base, records } = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: records as never });
  const first = "把上个月的墨池读书夜删了";
  const one = await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "event", text: "墨池读书夜" }], requiredCapabilities: ["privateEvent.delete"], sourceQuote: first }], [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p1", selector: { clues: ["上个月的墨池读书夜"] }, verb: "delete" }]);
  assert.match(one.result.text, /读书夜摘记/u, one.result.text);
  assert.equal(one.frozen.length, 0);
  // If the second layer were asked, it would take the answer as the event's name (what R26 saw).
  const reply = "去过的那条也删，笔记只解绑";
  const two = await turn(session, base, reply, [{ continues: { kind: "clarification", ref: "o1" }, deliverable: "change", objectClues: [{ entity: "event", text: reply }], requiredCapabilities: ["privateEvent.delete"], sourceQuote: reply }], [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p1", selector: { clues: [reply] }, verb: "delete" }]);
  assert.doesNotMatch(two.result.text, /没找到/u, two.result.text);
  assert.equal(two.proposeCalls, 0, "the answer is not a request of its own");
  const intents = two.frozen.flatMap((card) => card.intents) as { capability: string; targetId?: string }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId]), [["attendance.delete", "attendance:ink"], ["memo.update", "note:ink"], ["privateEvent.delete", FAIR.id]]);
});

test("R26 a reply of three sentences to the delete plan is one answer: one plan on the card, never the same items twice", async () => {
  const { base, records } = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: records as never });
  const first = "把上个月的墨池读书夜删了";
  await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "event", text: "墨池读书夜" }], requiredCapabilities: ["privateEvent.delete"], sourceQuote: first }], [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p1", selector: { clues: ["上个月的墨池读书夜"] }, verb: "delete" }]);
  const sentences = ["去过的那条一起删掉", "笔记留着，只解除和这场活动的关联", "然后把活动删了"];
  const reply = sentences.join("；");
  // As the first layer gives it: the first sentence answers the question; the others only say what to do with the records.
  const parts = sentences.map((quote, index) => ({ ...(index === 0 ? { continues: { kind: "clarification", ref: "o1" } } : {}), deliverable: "change", requiredCapabilities: [index === 1 ? "memo.update" : "privateEvent.delete"], sourceQuote: quote }));
  const two = await turn(session, base, reply, parts, [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p3", selector: { clues: ["活动"] }, verb: "delete" }]);
  const intents = two.frozen.flatMap((card) => card.intents) as { capability: string; targetId?: string }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId]), [["attendance.delete", "attendance:ink"], ["memo.update", "note:ink"], ["privateEvent.delete", FAIR.id]], JSON.stringify(intents.map((intent) => [intent.capability, intent.targetId, (intent as { partId?: string }).partId])));
});

test("R26 combined-tree gate (AE-EVT-008): the unlink sentence tagged memo.unlink + todo.update is part of the same plan answer", async () => {
  const { base, records } = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: records as never });
  const first = "把上个月的墨池读书夜删了";
  await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "event", text: "墨池读书夜" }], requiredCapabilities: ["privateEvent.delete"], sourceQuote: first }], [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p1", selector: { clues: ["上个月的墨池读书夜"] }, verb: "delete" }]);
  const sentences = ["去过的那条一起删掉", "笔记和待办留着，只解除它们和这场活动的关联", "然后把活动删了"];
  const reply = sentences.join("；");
  // As the first layer gave it on the combined tree: the middle sentence as memo.unlink and todo.update.
  const capabilities = [["privateEvent.delete"], ["memo.unlink", "todo.update"], ["privateEvent.delete"]];
  const parts = sentences.map((quote, index) => ({ ...(index === 0 ? { continues: { kind: "clarification", ref: "o1" } } : {}), deliverable: "change", requiredCapabilities: capabilities[index], sourceQuote: quote }));
  const ops = [{ dependsOn: [], entity: "attendance", localId: "w1", partId: "p2", selector: { clues: ["参会"] }, verb: "delete" }, { dependsOn: [], entity: "privateEvent", localId: "w2", partId: "p2", selector: { clues: ["这场活动"] }, verb: "delete" }];
  const two = await turn(session, base, reply, parts, ops);
  const intents = two.frozen.flatMap((card) => card.intents) as { capability: string; targetId?: string }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId]), [["attendance.delete", "attendance:ink"], ["memo.update", "note:ink"], ["privateEvent.delete", FAIR.id]], JSON.stringify(intents.map((intent) => [intent.capability, intent.targetId, (intent as { partId?: string }).partId])));
  assert.equal(two.proposeCalls, 0, "no sentence of the answer is a request of its own");
});

test("R26 an answer that names no option keeps the asked event for the second layer (never 'no event called <the answer>')", async () => {
  const { base, records } = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: records as never });
  const first = "把上个月的墨池读书夜删了";
  await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "event", text: "墨池读书夜" }], requiredCapabilities: ["privateEvent.delete"], sourceQuote: first }], [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p1", selector: { clues: ["上个月的墨池读书夜"] }, verb: "delete" }]);
  const reply = "你看着办吧";
  const two = await turn(session, base, reply, [{ continues: { kind: "clarification", ref: "o1" }, deliverable: "change", requiredCapabilities: ["privateEvent.delete"], sourceQuote: reply }], [{ dependsOn: [], entity: "privateEvent", localId: "w1", partId: "p1", selector: { clues: [reply] }, verb: "delete" }]);
  assert.equal(two.proposeCalls, 1);
  assert.doesNotMatch(two.result.text, /没找到/u, two.result.text);
  assert.match(two.result.text, /墨池读书夜/u, "the plan is asked again for the same event");
});
