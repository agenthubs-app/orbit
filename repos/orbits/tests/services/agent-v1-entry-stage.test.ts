import assert from "node:assert/strict";
import test from "node:test";

import { acceptMessage, listSessionEvents, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";

/**
 * agent-design AG07 (approved visual draft, small change 4): while a round runs, code says which step it is at
 * ("正在查你的笔记…" → "正在整理回答…") as status events with a stage on the channel. Progress is not delivery:
 * the result document does not change, the same stage twice is one event, nothing arrives after the round ended,
 * and the basis and card line reach the stored answer.
 */
test("stage events while running: reading, then composing; none repeated, none after the document; the document keeps basis and cardLine", async () => {
  const dependencies: AgentEntryDependencies = {
    execute: async ({ onStage }) => {
      onStage?.("reading");
      onStage?.("reading");
      await new Promise((resolve) => setTimeout(resolve, 5));
      onStage?.("composing");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { basis: { links: [{ id: "note:m31", label: "11月12日的笔记", type: "memo" }], text: "按你11月12日记的笔记回答" }, cardLine: "确认卡", sourceRefs: ["memo:note:m31"], text: "答。\n\n确认卡" };
    },
    store: createMemoryAgentEntryStore(),
  };
  const accepted = await acceptMessage(dependencies, { actorId: "actor:a", body: { clientMessageId: "m1", locale: "zh", message: "上次聊了什么？", protocolVersion: 3, references: [], sessionId: "session:stage" } });
  await settleSession("actor:a", "session:stage");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const { events } = await listSessionEvents(dependencies, { actorId: "actor:a", afterSeq: 0, sessionId: "session:stage" });
  assert.deepEqual(events.map((event) => `${event.kind}:${event.status}${event.stage ? `:${event.stage}` : ""}`), ["accepted:queued", "status:running", "status:running:reading", "status:running:composing", "document:completed"]);
  const document = events.at(-1)!.document!;
  assert.equal(document.requestId, accepted.receipt.requestId);
  assert.deepEqual(document.answer?.basis?.links.map((link) => link.id), ["note:m31"]);
  assert.equal(document.answer?.cardLine, "确认卡");
});
