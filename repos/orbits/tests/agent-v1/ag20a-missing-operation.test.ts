import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { proposeSystemPrompt } from "../../features/agent-v1/propose/prompt";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { ACTOR, contactWorld, memoryContactAccess } from "./contact-kit";
import { cardKit } from "./functions-kit";

/**
 * agent-design AG20a R23 (AE-BND-001, integration regression 2026-11-20): the second layer answered `{"operations": []}` for
 * a plain "把…这条待办改到周五" (it read the prompt's to-do verbs as a closed list). Every part handed over as a write must
 * come back with an operation of its own capabilities: none is a problem for the one repair; none again is a plain
 * "could not be prepared" sentence — never an ordinary paragraph, never a card for something else.
 */

const message = "把给李薇寄样片这条待办改到周五。";
const UPDATE = { dependsOn: [], entity: "todo", localId: "w1", partId: "p1", selector: { clues: ["给李薇寄样片"] }, dateText: "周五", verb: "update" };

async function run(proposeReplies: string[]) {
  const world = contactWorld();
  const proposeCalls: ModelCall[] = [];
  const model = deepseekStub((call) => {
    if (call.node === "understand") return json({ language: "zh", parts: [part({ deliverable: "change", objectClues: [{ entity: "todo", text: "给李薇寄样片" }], requiredCapabilities: ["todo.update"], sourceQuote: "把给李薇寄样片这条待办改到周五" })], plainChat: false });
    if (call.node === "propose") {
      proposeCalls.push(call);
      const reply = proposeReplies[proposeCalls.length - 1];
      if (reply === undefined) throw new Error("a third second-layer call");
      return reply;
    }
    throw new Error(`unexpected model call in ${call.node}`);
  });
  const access = memoryContactAccess(world);
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: { ...recordAccessOf(world), contacts: access } });
  const cards = cardKit(world);
  kit.deps.cards = cards.cards;
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message));
    return { calls: model.calls, events: trace.events, frozen: cards.frozen, proposeCalls, result };
  } finally {
    trace.restore();
  }
}

test("R23: no operation for a todo.update part — the repair is asked once, names the part, and its operation makes the card", async () => {
  const out = await run([json({ operations: [] }), json({ operations: [UPDATE] })]);
  assert.equal(out.proposeCalls.length, 2);
  assert.match(out.proposeCalls[1].user, /part p1 \("把给李薇寄样片这条待办改到周五"\) asks for [^;]*todo\.update[^;]*; give its operation/u);
  assert.equal(out.frozen.length, 1);
  assert.equal((out.frozen[0].intents[0] as { capability: string }).capability, "todo.update");
  assert.equal(out.result.partResults[0].status, "awaiting_confirmation", JSON.stringify(out.result.partResults) + out.result.text);
});

test("R23: none again — the part is not done, said plainly with how to ask again; no card; no third call", async () => {
  const out = await run([json({ operations: [] }), json({ operations: [] })]);
  assert.equal(out.proposeCalls.length, 2);
  assert.equal(out.frozen.length, 0);
  assert.equal(out.result.partResults[0].reason, "not_prepared");
  assert.match(out.result.text, /「把给李薇寄样片这条待办改到周五」这次没能准备好要改的内容，所以什么都没有改。可以再发一次/u);
  assert.ok(!out.calls.some((call) => call.node === "answer"), "no ordinary paragraph from the answer step");
});

test("R23: an operation the first time is not repaired; the prompt lists the five to-do verbs in one place", async () => {
  const out = await run([json({ operations: [UPDATE] })]);
  assert.equal(out.proposeCalls.length, 1);
  assert.equal(out.frozen.length, 1);
  assert.match(proposeSystemPrompt(), /To-dos \(entity "todo"\) have five verbs, all available: create[^]*update[^]*complete[^]*reopen[^]*delete/u);
  assert.doesNotMatch(proposeSystemPrompt(), /To-do verbs: complete/u);
  void ACTOR;
});
