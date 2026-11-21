/**
 * AG21c R49 (W) with decision D6: a to-do found only by meaning (another language, other script) is offered as a candidate,
 * never picked — and the option carried "todo.update" whatever the user asked to do. The option now carries the part's own
 * write (todo.delete, todo.complete …); delete → candidate → click → a delete card. Names and wordings are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { resumeAgentGraph, runAgentGraph } from "../../features/agent-v1/graph/build";
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
  return { card, first, input, kit };
}

test("R49/D6 'Delete the passport renewal to-do' with only 「续签护照」: offered as todo.delete; the click makes a delete card", async (t) => {
  // Record finder port: the lab design matches "passport" to 护照 (its cross-script word list) and decides that one to-do (a
  // card, still a click) where D6 offered it by meaning; D6 is the legacy lookup's, kept under the rollback flag.
  const finder = process.env.ORBIT_AGENT_FINDER;
  process.env.ORBIT_AGENT_FINDER = "legacy";
  t.after(() => { if (finder === undefined) delete process.env.ORBIT_AGENT_FINDER; else process.env.ORBIT_AGENT_FINDER = finder; });
  const { card, first, input, kit } = await ask("Delete the passport renewal to-do", "delete", "passport renewal", "todo.delete");
  assert.equal(card.frozen.length, 0, "a candidate by meaning is never picked");
  const question = first.clarifications.find((set) => set.options.some((option) => option.ref?.id === "task:passport"));
  assert.ok(question, first.text);
  const option = question!.options.find((item) => item.ref?.id === "task:passport")!;
  assert.equal(option.capability, "todo.delete");
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: question!.clarificationId, kind: "select", optionId: option.optionId });
  const intents = card.frozen.flatMap((item) => item.intents) as { capability: string; targetId?: string }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId]), [["todo.delete", "task:passport"]], resumed.text);
});

test("R49 'mark the passport renewal done': the candidate carries todo.complete", async (t) => {
  // Record finder port: as above: D6 is the legacy lookup's, kept under the rollback flag.
  const finder = process.env.ORBIT_AGENT_FINDER;
  process.env.ORBIT_AGENT_FINDER = "legacy";
  t.after(() => { if (finder === undefined) delete process.env.ORBIT_AGENT_FINDER; else process.env.ORBIT_AGENT_FINDER = finder; });
  const { first } = await ask("Mark the passport renewal as done", "complete", "passport renewal", "todo.complete");
  const option = first.clarifications.flatMap((set) => set.options).find((item) => item.ref?.id === "task:passport");
  assert.equal(option?.capability, "todo.complete", first.text);
});
