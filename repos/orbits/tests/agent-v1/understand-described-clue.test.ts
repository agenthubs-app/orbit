import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { ledgerCardAccess } from "../../features/agent-v1/graph/executor";
import { describedObjectSpan } from "../../features/agent-v1/understand/described-clue";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { smallWorld, todo } from "./read-kit";

/**
 * agent-design AG09 run-03 (coordinator, AE-BND-006 in the AG05 rerun at 41c3478): the first layer gave only "这条待办" as
 * the to-do clue of "把约山本吃饭这条待办的计划日定在 11 月 21 日。"; with no context, code took the object as missing and
 * asked. When the words just before a demonstrative describe the record ("约山本吃饭这条待办", "山本さんとの食事のこのタスク",
 * "the dinner-with-Yamamoto task"), those words are the clue and the record is looked up by them.
 */

const span = (message: string, clue: string) => {
  const at = message.indexOf(clue);
  const found = describedObjectSpan(message, [at, at + clue.length], [0, message.length]);
  return found ? message.slice(found[0], found[1]) : null;
};

test("the words before a demonstrative are the clue (zh, ja, en); a bare demonstrative stays one", () => {
  assert.equal(span("把约山本吃饭这条待办的计划日定在 11 月 21 日。", "这条待办"), "约山本吃饭");
  assert.equal(span("山本さんとの食事のこのタスクを金曜にずらして。", "このタスク"), "山本さんとの食事");
  assert.equal(span("Move the dinner-with-Yamamoto task to Friday.", "the task"), null, "the clue is not in the message as written");
  const english = "Move the dinner-with-Yamamoto task to Friday.";
  assert.equal(describedObjectSpan(english, null, [0, english.length], "the task") && english.slice(...describedObjectSpan(english, null, [0, english.length], "the task")!), "dinner-with-Yamamoto");
  assert.equal(span("把这条待办改到周五。", "这条待办"), null, "nothing describes it");
  assert.equal(span("把他的这条待办改到周五。", "这条待办"), null, "a pronoun before it describes nothing");
  assert.equal(span("刚才那件事帮我处理一下。", "那件事"), null, "words of when describe no record");
  assert.equal(span("さっきのその件、どうなった？", "その件"), null);
});

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

test("graph, AE-BND-006 wording: only '这条待办' from the first layer — the to-do is found by 约山本吃饭 and the card is made, no question", async () => {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(todo(ACTOR, "task:t47", "约山本吃饭", { plannedDate: "2026-11-18" }));
  const access = recordAccessOf(base);
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  const reader = {
    async read(taskId: string) {
      const view = (await access.reader.read("todo", access.scope(ACTOR), { id: taskId })).items[0];
      if (!view) return null;
      return { dueAt: (view.fields.dueAt as string) ?? null, plannedDate: (view.fields.plannedDate as string) ?? null, status: String(view.fields.status ?? "open"), title: String(view.fields.title), updatedAt: view.updatedAt };
    },
  };
  const runtime = createAgentRuntimeService({ cardReader: reader, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
  const message = "把约山本吃饭这条待办的计划日定在 11 月 21 日。";
  const replies: Record<string, (call: ModelCall) => string> = {
    propose: () => json({ operations: [{ dateText: "11 月 21 日", dependsOn: [], entity: "todo", fields: [], localId: "w1", partId: "p1", relations: [], selector: { clues: ["这条待办"] }, verb: "update" }] }),
    // The first layer's output recorded in the failing run: the to-do clue is only the demonstrative.
    understand: () => json({ parts: [part({ deliverable: "change", objectClues: [{ entity: "todo", text: "这条待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把约山本吃饭这条待办的计划日定在 11 月 21 日" })], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: access });
  kit.deps.cards = ledgerCardAccess(runtime, () => NOW);
  const trace = captureTrace();
  const result = await runAgentGraph(kit.deps, kit.input(message)).finally(() => trace.restore());
  const seen = trace.events.filter((event) => /^(propose|understand\.described)/u.test(String(event.type))).map((event) => JSON.stringify(event).slice(0, 300)).join("\n");
  assert.equal(result.clarifications.filter((set) => set.kind === "question").length, 0, "not asked which to-do");
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t47", `${seen}\n${result.text}`);
  assert.deepEqual(result.actionPreview?.operations[0].after, { plannedDate: "2026-11-21" });
});
