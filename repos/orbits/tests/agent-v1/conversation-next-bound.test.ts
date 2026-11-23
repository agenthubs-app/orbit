/**
 * ORBIT_AGENT_CONVERSATION_NEXT=on after the 2026-11-23 production check: 「高桥智子最近有什么记录？」 (the contact is stored as
 * 高橋智子, found by the agent only through the variant-spelling contact search) was turned into "which one?" with no
 * options. What the agent bound this turn — by any route — counts as bound for the engine's reference doubts
 * (conversation/bridge.ts AgentBinding, conversation/run.ts askGoRun), and an engine ask with nothing to offer never
 * becomes a question (conversationNextAsks, clarify.ts prepare). Names and records are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { agentCovers, runAskGo, settledHintOf, type AgentBinding } from "../../features/agent-v1/conversation/bridge";
import { askOptionsOf } from "../../features/agent-v1/conversation/run";
import type { ModelHint, PartResult } from "../../features/agent-v1/conversation/types";
import { graphKit, json, recordAccessOf } from "./graph-kit";
import { runFn } from "./functions-kit";
import { contact } from "./read-kit";

const AT = "2026-11-23T10:00:00.000Z";
const INCIDENT = "高桥智子最近有什么记录？";
const ANSWER = () => json({ segments: [{ cites: [], partId: "p1", text: "没有找到记录。" }] });

function world() {
  return { events: [], records: [
    contact("actor:a", "contact:takahashi", "高橋智子", { organization: "青葉飲食" }),
    contact("actor:a", "contact:watanabe", "渡辺颯太", { organization: "関西飲食" }),
    contact("actor:a", "contact:liwei", "李薇", { organization: "北辰咨询" }),
    contact("actor:a", "contact:bailu-1", "周敏", { organization: "白鹭印务" }),
    contact("actor:a", "contact:bailu-2", "郑凯", { organization: "白鹭印务" }),
  ] };
}

async function withNext<T>(next: "on" | "shadow", body: () => Promise<T>): Promise<T> {
  const before = { main: process.env.ORBIT_AGENT_CONVERSATION, next: process.env.ORBIT_AGENT_CONVERSATION_NEXT };
  const holder = globalThis as { __orbitAgentEval?: unknown };
  const previous = holder.__orbitAgentEval;
  process.env.ORBIT_AGENT_CONVERSATION = "on";
  process.env.ORBIT_AGENT_CONVERSATION_NEXT = next;
  try {
    return await body();
  } finally {
    holder.__orbitAgentEval = previous;
    for (const [key, value] of [["ORBIT_AGENT_CONVERSATION", before.main], ["ORBIT_AGENT_CONVERSATION_NEXT", before.next]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const readPart = (message: string, clue: string, clarity: string, capabilities = ["contact.read"]) => ({ clarity, dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: clue }], requiredCapabilities: capabilities, sourceQuote: message });
const nextDiffs = (events: readonly Record<string, unknown>[]) => ((events.find((event) => event.type === "conversation.shadow")?.diffs ?? []) as { field: string }[]).filter((diff) => diff.field === "next");

// ---------------------------------------------------------------- the incident, end to end

for (const clarity of ["missing_one", "multiple_readings", "clear"]) for (const capabilities of [["contact.read"], ["memo.read", "todo.read"], ["view.timeline"]]) {
  test(`incident (${clarity}, ${capabilities.join("+")}): 「${INCIDENT}」 — first mention, variant spelling, a read: answered, never "which one"`, async () => {
    await withNext("on", async () => {
      const run = await runFn(INCIDENT, [readPart(INCIDENT, "高桥智子", clarity, capabilities)], { answer: ANSWER, world: world() });
      const types = run.events.map((event) => event.type);
      assert.ok(types.includes("resolve.contact_variant_spelling"), "the agent found her by the variant spelling");
      assert.ok(!types.includes("conversation.next_asked"), JSON.stringify(types));
      assert.ok(!types.includes("clarify.asked"), run.result.text);
      assert.equal(run.result.status, "completed", run.result.text);
      assert.doesNotMatch(run.result.text, /哪一[条位个]|which one/u);
      assert.equal(nextDiffs(run.events).length, 0, "the engine goes as the agent does");
    });
  });
}

test("incident, then a pronoun: 「她有没完成的待办吗？」 after the variant-spelling first mention — answered, no question either turn", async () => {
  await withNext("on", async () => {
    const records = world();
    const kit = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(records) });
    const first = await runFn(INCIDENT, [readPart(INCIDENT, "高桥智子", "missing_one")], { answer: ANSWER, session: kit, world: records });
    assert.equal(first.result.status, "completed", first.result.text);
    const state = await kit.sessionState.get("actor:a", "session:a");
    assert.ok(state?.conversation?.turns[0].agent?.mentions.includes("C-contact:takahashi"), JSON.stringify(state?.conversation ?? null));
    const message = "她有没完成的待办吗？";
    const second = await runFn(message, [readPart(message, "她", "clear", ["todo.read"])], { answer: ANSWER, session: kit, world: records });
    assert.ok(!second.events.some((event) => event.type === "clarify.asked"), second.result.text);
    assert.equal(second.result.status, "completed", second.result.text);
  });
});

// ---------------------------------------------------------------- the other routes the agent binds by

const ROUTES: { name: string; message: string; clue: string }[] = [
  { clue: "高桥", message: "高桥最近有什么记录？", name: "a partial name in another script (高桥 → 高橋智子)" },
  { clue: "渡边飒太", message: "渡边飒太最近有什么记录？", name: "a full name in simplified characters (渡边飒太 → 渡辺颯太)" },
  { clue: "Li Wei", message: "Li Wei最近有什么记录？", name: "a romanized name (Li Wei → 李薇)" },
  { clue: "白鹭印务的人", message: "白鹭印务的人最近有什么记录？", name: "a company's people (白鹭印务 → 周敏, 郑凯; the clue keeps no record)" },
];

for (const route of ROUTES) test(`route: ${route.name} — the engine's doubt is the agent's binding, no question`, async () => {
  await withNext("on", async () => {
    const run = await runFn(route.message, [readPart(route.message, route.clue, "missing_one")], { answer: ANSWER, world: world() });
    const types = run.events.map((event) => event.type);
    assert.ok(!types.includes("clarify.asked"), `${run.result.text} ${JSON.stringify(types)}`);
    assert.equal(run.result.status, "completed", run.result.text);
    assert.equal(nextDiffs(run.events).length, 0, JSON.stringify(run.events.find((event) => event.type === "conversation.shadow")));
  });
});

test("shadow: the same incident logs no next difference (the comparison counts what the agent bound too)", async () => {
  await withNext("shadow", async () => {
    const run = await runFn(INCIDENT, [readPart(INCIDENT, "高桥智子", "missing_one")], { answer: ANSWER, world: world() });
    assert.equal(nextDiffs(run.events).length, 0);
    assert.equal(run.result.status, "completed");
  });
});

// ---------------------------------------------------------------- the bridge

const hintOf = (clarity: "missing_one" | "none" | "clear", said = "高桥智子"): ModelHint => ({ parts: [{ clarity, continues: null, quote: INCIDENT, refs: [{ id: null, kind: "contact", said }], slots: { kind: "memo", verb: "read" } }] });
const bound = (settled: boolean, ids = ["C-contact:takahashi"], words = ["高桥智子"]): AgentBinding => ({ ids, quote: INCIDENT, settled, words });

test("bridge: the World lacked her (no name the store gave) — the engine still goes when the agent bound her on a read", () => {
  for (const clarity of ["missing_one", "none"] as const) {
    const turn = { at: AT, gone: [], hint: hintOf(clarity), message: INCIDENT };
    assert.equal(runAskGo(null, {}, turn, false).parts[0].next, "ask", "before: the first layer's doubt asks");
    assert.equal(runAskGo(null, {}, turn, false, {}, "Asia/Tokyo", undefined, undefined, [bound(true)]).parts[0].next, "go", clarity);
    assert.equal(runAskGo(null, {}, turn, false, {}, "Asia/Tokyo", undefined, undefined, [bound(false)]).parts[0].next, "go", "an unbound reference the agent bound is excused too");
  }
});

test("bridge: the clarity doubt is lifted only on parts the agent settled (a write, or a part with a clue left, keeps it)", () => {
  assert.equal(settledHintOf(hintOf("missing_one"), [bound(true)])!.parts[0].clarity, "clear");
  assert.equal(settledHintOf(hintOf("none"), [bound(true)])!.parts[0].clarity, "clear");
  assert.equal(settledHintOf(hintOf("missing_one"), [bound(false)])!.parts[0].clarity, "missing_one");
  assert.equal(settledHintOf(hintOf("missing_one"), [{ ...bound(true), quote: "另一句话" }])!.parts[0].clarity, "missing_one", "another part's binding");
  // nobody bound: the engine's ask stands
  const turn = { at: AT, gone: [], hint: hintOf("missing_one", "某位人脉"), message: "某位人脉最近有什么记录？" };
  assert.equal(runAskGo(null, {}, { ...turn, hint: { parts: [{ ...turn.hint.parts[0], quote: turn.message }] } }, false).parts[0].next, "ask");
});

test("bridge: an engine reference the agent covers — by its words, its id or one of its candidates", () => {
  const agent = bound(false, ["C-contact:takahashi"], ["高桥智子"]);
  assert.ok(agentCovers(agent, { outcome: "none", said: "高桥智子" }));
  assert.ok(agentCovers(agent, { outcome: "none", said: "@高桥智子" }));
  assert.ok(agentCovers(agent, { candidates: ["C-contact:takahashi", "C-contact:x"], outcome: "ask", said: "她" }));
  assert.ok(!agentCovers(agent, { outcome: "none", said: "渡边" }));
});

// ---------------------------------------------------------------- an ask with nothing to offer

test("an engine ask offers its candidates as the agent's records; with no candidate it has nothing to offer", () => {
  const names = { "C-contact:a": { name: "陈一鸣", type: "contact" }, "C-contact:b": { name: "陈卫东", type: "contact" } };
  const asking: PartResult = { continues: null, followUp: "new", next: "ask", quote: "小陈", redo: [], refs: [{ candidates: ["C-contact:a", "C-contact:b", "C-contact:nameless"], outcome: "ask", said: "小陈" }], request: {} };
  assert.deepEqual(askOptionsOf(asking, names), [{ id: "contact:a", name: "陈一鸣", type: "contact" }, { id: "contact:b", name: "陈卫东", type: "contact" }]);
  assert.deepEqual(askOptionsOf({ ...asking, refs: [{ outcome: "none", said: "某位人脉" }] }, names), []);
  assert.deepEqual(askOptionsOf({ ...asking, refs: [] }, names), [], "a clarity-only ask");
});

test("next on: 「Review a discussion with a contact」 (AE-ANS-026) — the engine asks with no one to offer: no question, the agent's answer stands", async () => {
  await withNext("on", async () => {
    const message = "Review a discussion with a contact";
    const run = await runFn(message, [{ clarity: "missing_one", dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "a contact" }], requiredCapabilities: ["contact.read"], sourceQuote: message }], { answer: ANSWER, language: "en", world: world() });
    const types = run.events.map((event) => event.type);
    assert.ok(types.includes("conversation.next_no_options"), JSON.stringify(types));
    assert.ok(!types.includes("clarify.asked"), run.result.text);
    assert.notEqual(run.result.status, "waiting_user");
  });
});
