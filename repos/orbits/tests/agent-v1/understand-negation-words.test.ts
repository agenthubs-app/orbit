import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { access, judgeStub } from "./judgment-kit";
import { smallWorld } from "./read-kit";

/**
 * agent-design AG09 run-04 repair 2 — two first-layer outputs seen in the reruns at 90280c6, handled by code:
 *
 * 1. AE-JDG-007 (AG08 rerun): the constraint for "要是把给小林发修订报价那条待办改到周五，会不会来不及？" was the model's own
 *    note "要是…会不会来不及（假设，先不要真的改）". "先不要" in that note was read as the user's negation, so the write tag was
 *    taken as already blocked: not reviewed, and no entry offered. A negation counts only when the user's own message
 *    carries one; a note the model wrote around the user's words does not make one.
 * 2. AE-SCL-007 (AG05 rerun): "…and where is he now?" came as its own part (contact.read, view.context) with no readFilter,
 *    so only the profile was read, not the newer note saying where he is now. A part about a person whose words ask how
 *    they stand now ("now", "现在", "今は") reads as the AG05 run-03 `current` read.
 */

test("AE-JDG-007 at 90280c6: a negation only in the model's note is not the user's — the write tag is reviewed and an entry offered", async () => {
  const message = "要是把给小林发修订报价那条待办改到周五，会不会来不及？";
  const trace = captureTrace();
  try {
    const model = deepseekStub((call) => {
      if (call.node === "understand") return json({ parts: [part({ clarity: "statement", constraints: ["要是…会不会来不及（假设，先不要真的改）"], deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }, { entity: "todo", text: "给小林发修订报价那条待办" }], requiredCapabilities: ["todo.read", "schedule.read", "memo.create"], sourceQuote: message })], plainChat: false });
      return json({ segments: [{ partId: "p1", text: "只是假设的话，先看对方要求的期限。" }] });
    });
    const judge = judgeStub(() => undefined, { status: 503 });
    const kit = graphKit(model.fetchImplementation);
    kit.deps.judgment = access(judge.fetchImplementation);
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.ok(trace.events.some((event) => event.type === "route.intent_review"), "the write tag is reviewed");
    assert.equal(result.actionPreview, null);
    assert.ok(result.clarifications.some((set) => set.kind === "entry" && set.options.length >= 1), "one entry is offered");
  } finally {
    trace.restore();
  }
});

test("a negation the user wrote still blocks the write", async () => {
  const message = "把给小林发修订报价那条待办改到周五——等等，先别改。";
  const model = deepseekStub((call) => {
    if (call.node === "understand") return json({ parts: [part({ clarity: "clear", constraints: ["先别改"], deliverable: "change", objectClues: [{ entity: "todo", text: "给小林发修订报价那条待办" }], requiredCapabilities: ["todo.update"], sourceQuote: message })], plainChat: false });
    return json({ segments: [{ partId: "p1", text: "好的，先不改。" }] });
  });
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(result.actionPreview, null);
  assert.notEqual(result.partResults[0].route, "propose_write");
});

test("AE-SCL-007 shape: 'where is he now' with no readFilter still reads how the person stands now", async () => {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  const records = recordAccessOf(world);
  const message = "小林健第一次见面时在哪家公司？他现在在哪？";
  let answerPrompt = "";
  const model = deepseekStub((call) => {
    if (call.node === "understand") return json({ parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "小林健" }], readFilter: { order: "oldest" }, requiredCapabilities: ["contact.read", "view.timeline"], sourceQuote: "小林健第一次见面时在哪家公司" }),
      part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "他" }], requiredCapabilities: ["contact.read", "view.context"], sourceQuote: "他现在在哪" }),
    ], plainChat: false });
    answerPrompt = call.user;
    const handle = /(s\d+) — /u.exec(call.user)![1];
    return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "在北辰软件。" }, { cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p2", text: "还在北辰软件。" }] });
  });
  const kit = graphKit(model.fetchImplementation, { records });
  await runAgentGraph(kit.deps, kit.input(message));
  const p2 = answerPrompt.slice(answerPrompt.indexOf("- p2 ["));
  assert.ok(answerPrompt, "answered");
  assert.match(p2, /how the person stands now/u, "p2 is read as how the person stands now");
});
