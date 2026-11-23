import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { ledgerCardAccess } from "../../features/agent-v1/graph/executor";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG08 repair round 2: AE-UIX-008 in the AG07 rerun at AG08 — the second layer listed the person's name
 * ("Li Wei") among the to-do's clues; that clue left nothing after the name was taken out, and the AG07 rule (a
 * person's one open to-do, words in another script) did not apply, so Orbit asked instead of proposing the card.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

function records() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(contact(ACTOR, "contact:c31", "李薇", { organization: "自由职业", role: "摄影师" }));
  base.records.push(todo(ACTOR, "task:t45", "给李薇寄样片", { plannedDate: "2026-11-10", relatedContactId: "contact:c31" }));
  return recordAccessOf(base);
}

function cardsOver(access: ReturnType<typeof recordAccessOf>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  const reader = {
    async read(taskId: string) {
      const view = (await access.reader.read("todo", access.scope(ACTOR), { id: taskId })).items[0];
      if (!view) return null;
      return { dueAt: (view.fields.dueAt as string) ?? null, plannedDate: (view.fields.plannedDate as string) ?? null, status: String(view.fields.status ?? "open"), title: String(view.fields.title), updatedAt: view.updatedAt };
    },
  };
  const runtime = createAgentRuntimeService({ cardReader: reader, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
  return ledgerCardAccess(runtime, () => NOW);
}

test("AE-UIX-008: a to-do clue that is only the person's name does not stop the 'one open to-do in another script' rule", async () => {
  const message = "Can you push the to-do about sending Li Wei the sample prints to November 17?";
  const replies: Record<string, (call: ModelCall) => string> = {
    // The second layer's output recorded in the failing run.
    propose: () => json({ operations: [{ dateText: "November 17", dependsOn: [], entity: "todo", fields: [], localId: "w1", partId: "p1", relations: [{ clue: "Li Wei", entity: "contact", role: "about" }], selector: { clues: ["sending Li Wei the sample prints", "sample prints", "Li Wei"] }, verb: "update" }] }),
    understand: () => json({ language: "en", parts: [part({ deliverable: "change", objectClues: [{ entity: "todo", text: "the to-do about sending Li Wei the sample prints" }, { entity: "contact", text: "Li Wei" }], requiredCapabilities: ["todo.read", "todo.update"], sourceQuote: message })], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const access = records();
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: access });
  kit.deps.cards = cardsOver(access);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t45", "the card is proposed for Li Wei's one open to-do");
  assert.deepEqual(result.actionPreview?.operations[0].after, { plannedDate: "2026-11-17" });
});

test("AE-UIX-008 (AG09 rerun at AG13): no contact clue at all, the Latin name inside the to-do words is the person", async () => {
  const message = "Can you push the to-do about sending Li Wei the sample prints to November 17?";
  const replies: Record<string, (call: ModelCall) => string> = {
    // Both layers' outputs recorded in 20261118-175035-0966d2d-AG09-gate-rerun-at-AG13.
    propose: () => json({ operations: [{ dateText: "November 17", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", selector: { clues: ["sending Li Wei the sample prints"] }, verb: "update" }] }),
    understand: () => json({ language: "en", parts: [part({ deliverable: "change", objectClues: [{ entity: "todo", text: "the to-do about sending Li Wei the sample prints" }], requiredCapabilities: ["todo.read", "todo.update"], sourceQuote: message })], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const access = records();
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: access });
  kit.deps.cards = cardsOver(access);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t45", "the card is proposed for Li Wei's one open to-do");
  assert.deepEqual(result.actionPreview?.operations[0].after, { plannedDate: "2026-11-17" });
});
