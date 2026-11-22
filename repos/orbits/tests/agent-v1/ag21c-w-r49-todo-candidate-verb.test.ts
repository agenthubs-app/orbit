/**
 * AG21c R49 (W): a to-do named in another language than its title. With the record finder (owner decision on the port,
 * replacing D6's candidates by meaning) "passport" is 护照 through the finder's cross-script word list, so 「续签护照」 is
 * decided — a card carrying the part's own write (todo.delete, todo.complete …), still waiting for the click, nothing
 * changed before it; the judgment model is not asked. Names and wordings are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { ACTOR, byNode, cardKit, fnWorld, json, NOW } from "./functions-kit";
import { deepseekStub, graphKit, part, recordAccessOf } from "./graph-kit";
import { access, graded, judgeStub } from "./judgment-kit";
import { todo } from "./read-kit";

async function ask(message: string, verb: "delete" | "complete", clue: string, capability: string) {
  const world = fnWorld();
  world.records.push(todo(ACTOR, "task:passport", "续签护照", { plannedDate: "2026-11-25" }), todo(ACTOR, "task:tickets", "订机票"));
  const judge = judgeStub((id, _question, call) => {
    const key = /t\d+/u.exec(id)?.[0] ?? "";
    const line = call.body.input.map((item) => item.text).join("\n").split("\n").find((text) => text.startsWith(`[${key}]`)) ?? "";
    return line.includes("护照") ? graded(0.02, 0.05, 0.93) : graded(0.9, 0.08, 0.02);
  });
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ dependsOn: [], entity: "todo", localId: "w1", partId: "p1", selector: { clues: [clue] }, verb }] }),
    understand: () => json({ language: "en", parts: [part({ deliverable: "change", localId: "p1", objectClues: [{ entity: "todo", text: clue }], requiredCapabilities: [capability], sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world) });
  kit.deps.judgment = access(judge.fetchImplementation);
  const card = cardKit(world);
  kit.deps.cards = card.cards;
  const input = kit.input(message, { locale: "en" });
  const first = await runAgentGraph(kit.deps, input);
  return { card, first, input, judge, kit, world };
}

const stored = (world: ReturnType<typeof fnWorld>, id: string) => (world.records.find((record) => record.id === id)!.payload as { task: Record<string, unknown> }).task;

test("R49 'Delete the passport renewal to-do' with only 「续签护照」: decided as a todo.delete card on that to-do, still a click", async (t) => {
  // The default (new) record finder's behaviour, whatever ORBIT_AGENT_FINDER the run has.
  const finder = process.env.ORBIT_AGENT_FINDER;
  delete process.env.ORBIT_AGENT_FINDER;
  t.after(() => { if (finder !== undefined) process.env.ORBIT_AGENT_FINDER = finder; });
  const { card, first, judge, world } = await ask("Delete the passport renewal to-do", "delete", "passport renewal", "todo.delete");
  const intents = card.frozen.flatMap((item) => item.intents) as { capability: string; targetId?: string }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId]), [["todo.delete", "task:passport"]], first.text);
  assert.ok(!intents.some((intent) => intent.targetId === "task:tickets"), "never the other to-do");
  assert.equal(judge.calls.length, 0, "no judgment by meaning");
  assert.equal(stored(world, "task:passport").status, "open", "a card only: nothing is deleted before the click");
});

test("R49 'mark the passport renewal done': the card carries todo.complete on 「续签护照」, nothing changed before the click", async (t) => {
  // The default (new) record finder's behaviour, whatever ORBIT_AGENT_FINDER the run has.
  const finder = process.env.ORBIT_AGENT_FINDER;
  delete process.env.ORBIT_AGENT_FINDER;
  t.after(() => { if (finder !== undefined) process.env.ORBIT_AGENT_FINDER = finder; });
  const { card, first, world } = await ask("Mark the passport renewal as done", "complete", "passport renewal", "todo.complete");
  const intents = card.frozen.flatMap((item) => item.intents) as { capability: string; targetId?: string }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId]), [["todo.complete", "task:passport"]], first.text);
  assert.equal(stored(world, "task:passport").status, "open");
});
