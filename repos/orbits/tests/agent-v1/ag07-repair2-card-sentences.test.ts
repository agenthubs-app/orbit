import assert from "node:assert/strict";
import test from "node:test";

import { stripSaveTalk } from "../../features/agent-v1/entry/approval-claims";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { ledgerCardAccess } from "../../features/agent-v1/graph/executor";
import { objectOf } from "../../features/agent-v1/graph/nodes/clarify";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, smallWorld } from "./read-kit";

/**
 * agent-design AG07 repair 2.
 * Item 3 (AE-BND-008): a sentence whose words went into the card is never reported as not understood; the
 *   coverage, statement and answer rules know which sentences the card used.
 * Item 8 (AE-XL-011): no answer contradicts the card it ships with ("I can't store notes here" next to a card that
 *   saves the note); an option label names the person a pronoun stands for, never the pronoun.
 * The model replies are the ones recorded in the runs that failed.
 */
const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

function world(extra: (records: ReturnType<typeof smallWorld>["records"]) => void = () => {}) {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  extra(base.records);
  return base;
}

function cardsOver(records: ReturnType<typeof recordAccessOf>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  const reader = {
    async read(taskId: string) {
      const view = (await records.reader.read("todo", records.scope(ACTOR), { id: taskId })).items[0];
      if (!view) return null;
      return { dueAt: (view.fields.dueAt as string) ?? null, plannedDate: (view.fields.plannedDate as string) ?? null, status: String(view.fields.status ?? "open"), title: String(view.fields.title), updatedAt: view.updatedAt };
    },
  };
  const runtime = createAgentRuntimeService({ cardReader: reader, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
  return ledgerCardAccess(runtime, () => NOW);
}

const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

test("item 3 AE-BND-008: the date sentence the card carries is not reported as not understood", async () => {
  const records = recordAccessOf(world());
  const message = "「見積書のドラフトを見直す」というタスクを追加してください。予定日は11月18日です。";
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ dateText: "11月18日", dependsOn: [], entity: "todo", fields: [{ name: "title", valueText: "見積書のドラフトを見直す" }], localId: "w1", partId: "p1", relations: [], verb: "create" }] }),
    understand: () => json({ language: "ja", parts: [
      part({ dataSources: ["turn_material"], deliverable: "change", localId: "p1", requiredCapabilities: ["todo.create"], sourceQuote: "「見積書のドラフトを見直す」というタスクを追加してください。" }),
      part({ dataSources: ["turn_material"], deliverable: "change", dependsOn: ["p1"], localId: "p2", requiredCapabilities: ["todo.update"], sourceQuote: "予定日は11月18日です。" }),
    ], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cardsOver(records);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(result.actionPreview?.operations.length, 1);
  assert.match(result.actionPreview!.operations[0].text, /11月18日/u);
  assert.doesNotMatch(result.text, /分からなかった|どう変更すればよいか/u, "the sentence the card used is not 'not understood'");
  const p2 = result.partResults.find((item) => item.partId === "p2");
  assert.equal(p2?.status, "awaiting_confirmation");
  assert.equal(p2?.reason, "in_card");
});

test("item 3 + 8 AE-XL-011: a statement whose words the card's note carries is not answered beside the card, and no option names \"She\"", async () => {
  const records = recordAccessOf(world((list) => list.push(contact(ACTOR, "contact:c30", "Emily Carter", { organization: "Northwind" }))));
  const message = "Log that Emily called me today. She said she's moving to the Tokyo office in January.";
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ partId: "p2", text: "Emily's move to Tokyo is worth capturing. I can't store notes here, so this won't be saved on my side." }] }),
    propose: () => json({ operations: [{ channel: "phone", dateText: "today", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "Emily called me today. She said she's moving to the Tokyo office in January." }], localId: "w1", partId: "p1", relations: [{ clue: "Emily", entity: "contact", role: "actual_contact" }], verb: "create" }] }),
    understand: () => json({ language: "en", parts: [
      part({ dataSources: ["turn_material"], deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", text: "Emily" }], requiredCapabilities: ["memo.create"], sourceQuote: "Log that Emily called me today." }),
      part({ clarity: "statement", dataSources: ["turn_material"], deliverable: "answer", localId: "p2", objectClues: [{ entity: "contact", text: "She" }], sourceQuote: "She said she's moving to the Tokyo office in January." }),
    ], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cardsOver(records);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(result.actionPreview?.operations.length, 1);
  assert.doesNotMatch(result.text, /can't store|won't be saved|not be saved/iu, "no sentence contradicts the card");
  const labels = result.clarifications.flatMap((set) => set.options.map((option) => option.label));
  assert.ok(labels.every((label) => !/\bShe\b/u.test(label)), labels.join(" | "));
  assert.equal(result.partResults.find((item) => item.partId === "p2")?.status, "awaiting_confirmation");
});

test("item 8: a model sentence about what is or is not saved is never delivered (zh, ja, en); other sentences stay", () => {
  for (const text of [
    "I can't store notes here, so this won't be saved on my side.",
    "I've saved that for you.",
    "这里不能保存笔记，所以不会记下来。",
    "已经帮你记下了。",
    "ここではメモを保存できません。",
    "メモに保存しました。",
  ]) assert.equal(stripSaveTalk(text).text, "", text);
  const kept = stripSaveTalk("You saved the quote draft on Nov 12. Emily is moving to Tokyo.");
  assert.match(kept.text, /Emily is moving to Tokyo/u);
  assert.equal(stripSaveTalk("没有记录显示她换了工作。").text, "没有记录显示她换了工作。", "'no record shows' is about the records, not about saving");
});

test("item 8: a person said only by a pronoun is named by the person it stands for in option labels", () => {
  const message = "Log that Emily called me today. She said she's moving to the Tokyo office in January.";
  const scope = { input: { message }, run: { context: { handles: new Map(), lastMentionedForCode: [], references: [] }, names: new Map([["contact:c30", "Emily Carter"]]), readNames: new Map() } } as never;
  const p1 = { localId: "p1", quote: [0, 31], refs: [{ entity: "contact", quote: [9, 14], recordId: "contact:c30" }] } as never;
  const p2 = { localId: "p2", quote: [32, 85], refs: [{ entity: "contact", quote: [32, 35] }] } as never;
  const object = objectOf(scope, p2, [p1, p2]);
  assert.equal(object.name, "Emily Carter");
  assert.equal(object.text, null, "the pronoun is never the object's words");
  const alone = objectOf(scope, p2, [p2]);
  assert.equal(alone.text, null);
  assert.equal(alone.name, null, "nobody to stand for: a generic label, never \"She\"");
});
