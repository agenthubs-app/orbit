/**
 * The conversation engine port (features/agent-v1/conversation): the bridge (ids, hint, World, log), the engine on the
 * agent's own words for the multi-turn defects it was brought in for — XL-010 (a person linked by the card two turns
 * back is asked about again), a correction followed by a pronoun, a request interrupted and resumed, a cancel, a window
 * that must not carry into a new task — and the switch: legacy never runs it, shadow changes nothing the user gets,
 * on applies it, and an engine failure never breaks a turn. Names and records are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { agentRefOf, appendTurn, hintOf, labIdOf, namesOf, normalizeLog, runEngine, worldOf, type ConversationLog } from "../../features/agent-v1/conversation/bridge";
import { applyTurn, compareTurn, isCancel } from "../../features/agent-v1/conversation/apply";
import { conversationMode } from "../../features/agent-v1/conversation/mode";
import { conversationNextAsks, conversationTurn } from "../../features/agent-v1/conversation/run";
import type { AgentReply, ModelHint } from "../../features/agent-v1/conversation/types";
import { buildFirstLayerContext } from "../../features/agent-v1/context/build";
import type { GraphPart } from "../../features/agent-v1/graph/state";
import type { UnderstandOutput } from "../../features/agent-v1/understand/schema";
import { captureTrace, graphKit, json, recordAccessOf } from "./graph-kit";
import { runFn } from "./functions-kit";
import { contact } from "./read-kit";

const START = Date.parse("2026-11-21T14:00:00+09:00");
const at = (minutes: number) => new Date(START + minutes * 60_000).toISOString();
const NAMES = {
  "C-contact:chen": { name: "陈一鸣", type: "contact" },
  "C-contact:lin": { name: "小林健", type: "contact" },
  "C-contact:shen": { name: "沈佳怡", type: "contact" },
  "C-contact:wang": { name: "王磊", type: "contact" },
  "T-task:shen": { name: "催沈佳怡要样品测试报告", type: "todo" },
  "T-task:wang": { name: "和王磊确认报价", type: "todo" },
};
const reply = (minutes: number, extra: Partial<AgentReply> = {}): AgentReply => ({ at: at(minutes), done: [], listed: [], mentions: [], text: "", ...extra });
const user = (text: string, minutes: number, hint: ModelHint | null = null) => ({ at: at(minutes), hint, text });
function turnOf(log: ConversationLog | null, message: string, minutes: number, hint: ModelHint | null = null, gone: string[] = []) {
  return runEngine(log, worldOf(log?.names ?? NAMES, at(minutes), "Asia/Tokyo"), { at: at(minutes), gone, hint, message });
}

/** A graph part over the whole message with the given refs and capabilities. */
function partOf(message: string, capabilities: string[], refs: { words: string; entity: string; recordId?: string | null }[] = [], extra: Partial<GraphPart> = {}): GraphPart {
  return {
    asked: 0, capabilities: capabilities as GraphPart["capabilities"], continues: null, dependsOn: [], localId: "p1", origin: null,
    plan: { clarity: "clear", dataOwner: "self", dataSources: ["orbit_records"], deliverable: "answer", hypothesis: false, intentBasis: "instruction", negation: false, persistence: "this_turn", readings: [] },
    quote: [0, message.length], reading: null, reason: null,
    refs: refs.map((ref) => ({ entity: ref.entity, quote: [message.indexOf(ref.words), message.indexOf(ref.words) + ref.words.length] as [number, number], recordId: ref.recordId ?? null })),
    route: null, status: "unfinished", step: null, verdict: null, waitReason: null, ...extra,
  } as GraphPart;
}

// ---------------------------------------------------------------- the bridge

test("ids: agent records ↔ lab ids (platform and private events apart); kinds the engine does not know have none", () => {
  assert.equal(labIdOf("contact", "contact:abc"), "C-contact:abc");
  assert.equal(labIdOf("event", "private_event:x"), "P-private_event:x");
  assert.equal(labIdOf("event", "event:fair"), "E-event:fair");
  assert.equal(labIdOf("rule", "automation:1"), null);
  for (const [type, id] of [["todo", "task:a-b"], ["memo", "note:z"], ["schedule", "schedule:q"], ["event", "private_event:x"]]) assert.deepEqual(agentRefOf(labIdOf(type, id)!), { id, type });
  assert.equal(agentRefOf("Z-nothing"), null);
});

test("hint: the first layer's parts as the lab's ModelHint — handles to lab ids, the open item a part continues, the slots", () => {
  const context = buildFirstLayerContext({
    messages: [{ createdAt: at(0), role: "user", text: "下周有哪些待办" }, { createdAt: at(1), role: "assistant", text: "两条" }],
    now: at(2),
    references: [],
    state: { lastMentioned: [{ id: "contact:wang", name: "王磊", type: "contact" }], openItems: [{ createdAt: at(1), kind: "clarification", partId: "p1", ref: "clarification:r1:p1", requestId: "r1", summary: "asked", unrelatedMessages: 0 }], sessionId: "s", shownList: null, updatedAt: at(1) },
  });
  const handle = [...context.handles.values()].find((item) => item.id === "contact:wang")!.handle;
  const output = { parts: [{ clarity: "clear", constraints: [], continues: { kind: "clarification", ref: "o1" }, dataOwner: "self", dataSources: ["orbit_records"], deliverable: "list", dependsOn: [], goal: "g", intentBasis: "instruction", localId: "p1", objectClues: [{ entity: "contact", referenceId: handle, text: "他" }], persistence: "this_turn", readFilter: { from: "2026-11-23", status: "open", to: "2026-11-29" }, requiredCapabilities: ["todo.read"], sourceQuote: "他下周的待办" }], plainChat: false } as unknown as UnderstandOutput;
  assert.deepEqual(hintOf(output, context), { parts: [{ clarity: "clear", continues: "clarification:r1:p1", quote: "他下周的待办", refs: [{ id: "C-contact:wang", kind: "contact", said: "他" }], slots: { kind: "todo", people: ["C-contact:wang"], status: "open", time: { from: "2026-11-23", to: "2026-11-29" }, verb: "read" } }] });
  assert.equal(hintOf({ ...output, plainChat: true }, context), null, "plain chat gives no hint");
  assert.ok(namesOf(null, context)["C-contact:wang"], "the context's named records go into the World");
});

test("World: only the records the conversation named, genders unknown; the log is capped and keeps the names it uses", () => {
  const world = worldOf(NAMES, at(0), "Asia/Tokyo");
  assert.deepEqual(world.contacts.map((item) => item.id).sort(), ["C-contact:chen", "C-contact:lin", "C-contact:shen", "C-contact:wang"]);
  assert.deepEqual(world.genders, {});
  let log: ConversationLog | null = null;
  for (let index = 0; index < 40; index += 1) log = appendTurn(log, { agent: reply(index), requestId: `r${index}`, user: user(`闲聊 ${index}`, index) }, index === 39 ? { "C-contact:x": { name: "某人", type: "contact" } } : {});
  assert.equal(log!.turns.length, 30);
  assert.ok(log!.names["C-contact:x"]);
  assert.equal(normalizeLog({ turns: "nope" }), null);
  assert.equal(normalizeLog(JSON.parse(JSON.stringify(log)))!.turns.length, 30, "the stored log reads back");
});

// ---------------------------------------------------------------- the multi-turn cases

test("XL-010: turn 3 「小陈」 is the 陈一鸣 the card of turn 1 linked — bound, not asked again (on binds the agent's clue)", () => {
  const first = "记一下：小林今天来电话了，说小陈还在审合同。";
  const log = appendTurn(null, {
    agent: reply(1, { card: { id: "k1", op: "memo.create", target: null }, mentions: ["C-contact:chen", "C-contact:lin"] }),
    requestId: "r1",
    user: user(first, 0, { parts: [{ clarity: "clear", continues: null, quote: first, refs: [{ id: null, kind: "contact", said: "小林" }, { id: null, kind: "contact", said: "小陈" }], slots: { kind: "memo", verb: "create" } }] }),
  }, NAMES);
  const message = "我最近一次和小陈直接联系是什么时候？";
  // Without a hint the engine reads the name into the request (people), not as a reference to resolve.
  assert.ok(turnOf(log, message, 3).parts[0].request?.people?.includes("C-contact:chen"));
  for (const hint of [{ parts: [{ clarity: "clear" as const, continues: null, quote: message, refs: [{ id: null, kind: "contact" as const, said: "小陈" }], slots: { kind: "memo" as const, verb: "read" as const } }] }]) {
    const result = turnOf(log, message, 3, hint);
    const ref = result.parts[0].refs.find((item) => item.said.includes("小陈"));
    assert.deepEqual(ref && { id: ref.id, outcome: ref.outcome }, { id: "C-contact:chen", outcome: "bound" }, JSON.stringify(result));
    // The agent's part: a contact clue 「小陈」 with no record (legacy asks "是陈一鸣吗？").
    const part = partOf(message, ["contact.read", "view.recentInteraction"], [{ entity: "contact", words: "小陈" }]);
    const compared = compareTurn({ agentFollowUps: new Map(), message, parts: [part], result, waitingChange: true });
    assert.ok(compared.some((diff) => diff.field === "ref" && (diff.engine as { id: string }).id === "contact:chen"), "shadow logs the difference");
    const { applied, parts } = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: true });
    assert.equal(parts[0].refs[0].recordId, "contact:chen");
    assert.equal(part.refs[0].recordId, null, "the agent's own part is not mutated");
    assert.deepEqual(applied.map((item) => item.what), ["ref_bound"]);
    assert.ok(!isCancel(result.parts[0], true), "a read question is no cancel");
  }
});

const LIST = reply(1, { answered: { kind: "todo", status: "open", time: { from: "2026-11-23", to: "2026-11-29" }, verb: "read" }, listed: ["T-task:shen", "T-task:wang"], mentions: ["T-task:shen", "T-task:wang"] });

test("a correction 「不是这个，是王磊那个」 binds 王磊's to-do (never the rejected one), and the pronoun after it points at 王磊 only", () => {
  let log = appendTurn(null, { agent: LIST, requestId: "r1", user: user("下周有哪些待办？", 0) }, NAMES);
  log = appendTurn(log, { agent: reply(3, { card: { id: "k1", op: "todo.update", set: { plannedDate: "2026-11-27" }, target: "T-task:shen" }, mentions: ["T-task:shen"] }), requestId: "r2", user: user("把第一个改到周五", 2) }, NAMES);
  const message = "不是这个，是王磊那个";
  const result = turnOf(log, message, 4);
  assert.equal(result.parts[0].followUp, "correct");
  const part = partOf(message, ["todo.update"], [{ entity: "todo", words: "这个", recordId: "task:shen" }, { entity: "todo", words: "王磊那个" }]);
  const { parts } = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: true });
  assert.equal(parts[0].refs[1].recordId, "task:wang", "the record meant");
  assert.equal(parts[0].refs[0].recordId, "task:shen", "the rejected pointer is left as the agent had it, never re-bound by the engine");
  log = appendTurn(log, { agent: reply(5, { card: { id: "k2", op: "todo.update", set: { plannedDate: "2026-11-27" }, target: "T-task:wang" }, mentions: ["T-task:wang", "C-contact:wang"] }), requestId: "r3", user: user(message, 4) }, NAMES);
  const pronoun = turnOf(log, "他的电话是多少？", 6).parts[0].refs[0];
  assert.ok(pronoun.outcome === "bound" ? pronoun.id === "C-contact:wang" : pronoun.outcome === "ask" && JSON.stringify(pronoun.candidates) === JSON.stringify(["C-contact:wang"]), JSON.stringify(pronoun));
});

test("interrupted then resumed: 「就按刚才的建吧」 goes back to 王磊's to-do with its own day, not the schedule question in between", () => {
  let log = appendTurn(null, { agent: reply(1, { card: { id: "k1", op: "todo.create", set: { dueAt: "2026-11-27" }, target: null }, mentions: ["C-contact:wang"] }), requestId: "r1", user: user("给王磊建一个待办：周五前发报价", 0) }, NAMES);
  log = appendTurn(log, { agent: reply(3, { answered: { kind: "schedule", people: ["C-contact:shen"], time: { from: "2026-11-22", to: "2026-11-22" }, verb: "read" }, mentions: ["C-contact:shen"] }), requestId: "r2", user: user("先帮我查一下沈佳怡明天的日程", 2) }, NAMES);
  const result = turnOf(log, "就按刚才的建吧", 4);
  assert.deepEqual(result.parts[0].request, { kind: "todo", people: ["C-contact:wang"], time: { from: "2026-11-27", to: "2026-11-27" }, verb: "create" });
  assert.deepEqual(result.parts[0].redo, []);
});

test("a cancel 「算了先别建」: no request, nothing redone; on drops the part's write, and only when a change waits", () => {
  const log = appendTurn(null, { agent: reply(1, { card: { id: "k1", op: "todo.create", target: null }, mentions: ["C-contact:wang"] }), requestId: "r1", user: user("给王磊建一个待办：周五前发报价", 0) }, NAMES);
  const message = "算了先别建";
  const result = turnOf(log, message, 2);
  assert.deepEqual(result.parts[0].request, {});
  assert.deepEqual(result.parts[0].redo, []);
  const part = partOf(message, ["todo.create"]);
  const on = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: true });
  assert.deepEqual(on.parts[0].capabilities, []);
  assert.equal(on.parts[0].plan.negation, true);
  const nothingWaits = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.deepEqual(nothingWaits.parts[0].capabilities, ["todo.create"]);
});

test("a window does not carry into a new task; 「那下下周呢」 swaps only the period (on gives the read part the new window)", () => {
  const log = appendTurn(null, { agent: LIST, requestId: "r1", user: user("下周有哪些待办？", 0) }, NAMES);
  const create = turnOf(log, "给沈佳怡建个待办：寄样品", 2).parts[0];
  assert.equal(create.followUp, "new");
  assert.equal(create.request?.time, undefined, "next week stays with the list");
  const message = "那下下周呢？";
  const swap = turnOf(log, message, 2);
  assert.equal(swap.parts[0].followUp, "swap_period");
  const { parts } = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [partOf(message, ["todo.read"])], result: swap, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.deepEqual([parts[0].plan.readFilter?.from, parts[0].plan.readFilter?.to], ["2026-11-30", "2026-12-06"]);
  const elsewhere = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [partOf(message, ["todo.read"])], result: swap, timeZone: "Europe/Berlin", waitingChange: false });
  assert.equal(elsewhere.parts[0].plan.readFilter, undefined, "the engine's calendar is Asia/Tokyo's: no window applied elsewhere");
});

test("a record gone since is never bound", () => {
  const log = appendTurn(null, { agent: reply(1, { mentions: ["T-task:wang"] }), requestId: "r1", user: user("和王磊确认报价那条什么时候到期？", 0) }, NAMES);
  const message = "把那条标成完成";
  const result = turnOf(log, message, 2, null, ["T-task:wang"]);
  const { parts } = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(["T-task:wang"]), message, names: NAMES, parts: [partOf(message, ["todo.complete"], [{ entity: "todo", words: "那条" }])], result, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.equal(parts[0].refs[0].recordId, null, JSON.stringify(result));
});

// ---------------------------------------------------------------- the switch

test("switch: shadow by default; legacy and on from ORBIT_AGENT_CONVERSATION", () => {
  assert.equal(conversationMode({}), "shadow");
  assert.equal(conversationMode({ ORBIT_AGENT_CONVERSATION: "legacy" }), "legacy");
  assert.equal(conversationMode({ ORBIT_AGENT_CONVERSATION: " ON " }), "on");
  assert.equal(conversationMode({ ORBIT_AGENT_CONVERSATION: "nonsense" }), "shadow");
});

function scopeOf(state: unknown) {
  const kit = graphKit((async () => { throw new Error("no model"); }) as typeof fetch);
  const context = buildFirstLayerContext({ messages: [], now: at(5), references: [], state: null });
  return { deps: kit.deps, input: kit.input("我最近一次和小陈直接联系是什么时候？"), run: { carriedQuestions: new Map(), context, conversation: null, sessionState: state } } as never;
}

test("an engine failure never breaks a turn: traced, the parts go on unchanged", () => {
  const trace = captureTrace();
  try {
    trace.settings.conversation = "on";
    const broken = { conversation: { names: {}, turns: [{ agent: { at: "x" }, requestId: "r1", user: { at: at(0), hint: { parts: "not a list" }, text: "hi" } }] } };
    const scope = scopeOf(broken);
    const parts = [partOf("我最近一次和小陈直接联系是什么时候？", ["contact.read"], [{ entity: "contact", words: "小陈" }])];
    const out = conversationTurn(scope, { asOf: at(5), timeZone: "Asia/Tokyo" } as never, null, parts);
    assert.equal(out, parts);
    assert.ok(trace.events.some((event) => event.type === "conversation.error"), JSON.stringify(trace.events));
    assert.equal((scope as { run: { conversation: { status: string } } }).run.conversation.status, "error");
    trace.settings.conversation = "legacy";
    const legacyScope = scopeOf(null);
    assert.equal(conversationTurn(legacyScope, { asOf: at(5), timeZone: "Asia/Tokyo" } as never, null, parts), parts);
    assert.equal((legacyScope as { run: { conversation: unknown } }).run.conversation, null, "legacy never runs the engine");
  } finally {
    trace.restore();
  }
});

// ---------------------------------------------------------------- through the graph

function people() {
  return { events: [], records: [contact("actor:a", "contact:chen-ym", "陈一鸣", { organization: "北辰软件" }), contact("actor:a", "contact:chen-wd", "陈卫东", { organization: "东岳物流" }), contact("actor:a", "contact:lin", "小林健")] };
}

const FIRST = "陈一鸣在哪家公司？";
const SECOND = "小陈的电话是多少？";
const ANSWER = () => json({ segments: [{ cites: [], partId: "p1", text: "陈一鸣在北辰软件。" }] });

for (const mode of ["legacy", "shadow", "on"] as const) {
  test(`graph (${mode}): 「${SECOND}」 after a turn about 陈一鸣 — the log is kept (not under legacy); only on binds 小陈 to him`, async () => {
    const world = people();
    const kit = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world) });
    const holder = globalThis as { __orbitAgentEval?: { setting?: (name: string) => unknown } };
    const run = async (message: string, clue: string) => {
      const previous = holder.__orbitAgentEval;
      const result = await runFn(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: clue }], requiredCapabilities: ["contact.read"], sourceQuote: message }], { answer: ANSWER, session: kit, world });
      holder.__orbitAgentEval = previous;
      return result;
    };
    const before = process.env.ORBIT_AGENT_CONVERSATION;
    process.env.ORBIT_AGENT_CONVERSATION = mode;
    try {
      await run(FIRST, "陈一鸣");
      const state = await kit.sessionState.get("actor:a", "session:a");
      assert.equal(Boolean(state?.conversation), mode !== "legacy", JSON.stringify(state?.conversation ?? null));
      if (mode !== "legacy") assert.ok(state!.conversation!.turns[0].agent!.mentions.includes("C-contact:chen-ym"), JSON.stringify(state!.conversation));
      const second = await run(SECOND, "小陈");
      const shadow = second.events.find((event) => event.type === "conversation.shadow");
      assert.equal(Boolean(shadow), mode !== "legacy");
      const asked = second.events.some((event) => event.type === "clarify.asked");
      const applied = second.events.filter((event) => event.type === "conversation.applied");
      if (mode === "on") {
        assert.deepEqual(applied.map((event) => event.what), ["ref_bound"]);
        assert.ok(!asked, second.result.text);
      } else {
        assert.equal(applied.length, 0);
        if (mode === "shadow") assert.ok((shadow!.diffs as { field: string }[]).some((diff) => diff.field === "ref"), JSON.stringify(shadow));
      }
    } finally {
      if (before === undefined) delete process.env.ORBIT_AGENT_CONVERSATION;
      else process.env.ORBIT_AGENT_CONVERSATION = before;
    }
  });
}

test("report: the conversation section lists each account's turns with their differences, never another account's", async () => {
  const { createMemoryConversationShadowStore } = await import("../../features/agent-v1/rollout/conversation-shadow");
  const { buildShadowReport, shadowReportMarkdown } = await import("../../features/agent-v1/rollout/shadow-report");
  const { createMemoryShadowStore } = await import("../../features/agent-v1/rollout/shadow");
  const store = createMemoryConversationShadowStore();
  const base = { applied: [], comparedAt: at(1), error: null, mode: "shadow" as const, ms: 3, schemaVersion: 1 as const, sessionId: "s", status: "compared" as const, workspaceId: "workspace:test" };
  await store.put({ ...base, actorId: "actor:a", diffs: [{ agent: null, engine: { id: "contact:chen", outcome: "bound", said: "小陈" }, field: "ref", part: "p1" }], message: "小陈的电话是多少？", requestId: "r1" });
  await store.put({ ...base, actorId: "actor:a", diffs: [], message: "谢谢", requestId: "r2" });
  await store.put({ ...base, actorId: "actor:b", diffs: [{ agent: "go", engine: "ask", field: "next", part: "p1" }], message: "她呢", requestId: "r3" });
  const report = await buildShadowReport(createMemoryShadowStore(), [{ account: "A", actorId: "actor:a" }, { account: "B", actorId: "actor:b" }], () => at(2), store);
  assert.deepEqual(report.conversation!.map((group) => [group.account, group.turns, group.withDiffs, group.foreign.length]), [["A", 2, 1, 0], ["B", 1, 1, 0]]);
  const markdown = shadowReportMarkdown(report);
  assert.match(markdown, /多轮理解引擎/u);
  assert.match(markdown, /指代 1，追问还是往下做 1/u);
  assert.equal((await buildShadowReport(createMemoryShadowStore(), [], () => at(2))).conversation, undefined, "no section without the store");
});

test("「王磊那条」: the person the first layer reports is not the reference — the hint asks for his record, on binds the to-do", () => {
  const message = "把王磊那条改到周五";
  const output = { parts: [{ clarity: "clear", constraints: [], dataOwner: "self", dataSources: ["orbit_records"], deliverable: "change", dependsOn: [], goal: "g", intentBasis: "instruction", localId: "p1", objectClues: [{ entity: "contact", text: "王磊" }], persistence: "this_turn", requiredCapabilities: ["todo.update"], sourceQuote: message }], plainChat: false } as unknown as UnderstandOutput;
  const hint = hintOf(output, null)!;
  assert.deepEqual(hint.parts[0].refs, [{ id: null, kind: "todo", said: "王磊那条" }]);
  assert.equal(hint.parts[0].slots?.people, undefined, "no person stands in for the record");
  const log = appendTurn(null, { agent: LIST, requestId: "r1", user: user("下周有哪些待办？", 0) }, NAMES);
  const result = turnOf(log, message, 2, hint);
  const ref = result.parts[0].refs[0];
  assert.deepEqual({ id: ref.id, outcome: ref.outcome }, { id: "T-task:wang", outcome: "bound" }, JSON.stringify(result));
  const part = partOf(message, ["todo.update"], [{ entity: "contact", words: "王磊" }]);
  const { parts } = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.equal(parts[0].refs[0].recordId, null, "the person clue is not turned into a to-do");
  assert.deepEqual(parts[0].refs[1], { entity: "todo", quote: [1, 5], recordId: "task:wang" });
  for (const words of ["王磊的那条", "王さんのあの件"]) assert.ok(hintOf({ ...output, parts: [{ ...output.parts[0], objectClues: [{ entity: "contact", text: words.startsWith("王磊") ? "王磊" : "王さん" }], sourceQuote: `${words}改到周五` }] } as UnderstandOutput, null)!.parts[0].refs![0].said === words, words);
});

test("on never overrides the agent: a record it bound (an @ pick) stays, and its own question attribution is not moved or cleared", () => {
  const log = appendTurn(null, { agent: reply(1, { mentions: ["T-task:shen"] }), requestId: "r1", user: user("催沈佳怡要样品测试报告那条什么时候到期？", 0) }, NAMES);
  const message = "那这一条呢";
  const result = turnOf(log, message, 2);
  const picked = partOf(message, ["todo.read"], [{ entity: "todo", recordId: "task:wang", words: "这一条" }]);
  const bound = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [picked], result, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.equal(bound.parts[0].refs[0].recordId, "task:wang", JSON.stringify(result));
  assert.deepEqual(bound.applied, []);
  // The agent says p1 answers q1; the engine says it is new: the agent's attribution stays.
  const context = { openItems: [{ kind: "clarification", ref: "q1" }] } as never;
  const fake = { parts: [{ continues: null, followUp: "new" as const, next: "go" as const, quote: message, redo: [], refs: [], request: {} }], shelved: [] };
  const kept = applyTurn({ agentFollowUps: new Map(), context, gone: new Set(), message, parts: [partOf(message, [], [], { continues: { kind: "clarification", ref: "q1" } })], result: fake, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.deepEqual(kept.parts[0].continues, { kind: "clarification", ref: "q1" });
  const added = applyTurn({ agentFollowUps: new Map(), context, gone: new Set(), message, parts: [partOf(message, [])], result: { ...fake, parts: [{ ...fake.parts[0], continues: "q1", followUp: null as never, request: null as never }] }, timeZone: "Asia/Tokyo", waitingChange: false });
  assert.deepEqual(added.parts[0].continues, { kind: "clarification", ref: "q1" }, "a part the agent left new is attributed");
});

test("AE-XL-014 (eval on run): a described to-do the conversation never showed is not bound to the only to-do the engine knows", async () => {
  const { contentContradicts } = await import("../../features/agent-v1/conversation/apply");
  const names = { ...NAMES, "T-task:quote": { name: "给小林发修订报价", type: "todo" } };
  const log = appendTurn(null, { agent: reply(1, { card: { id: "k1", op: "todo.update", set: { plannedDate: "2026-11-20" }, target: "T-task:quote" }, mentions: ["T-task:quote"] }), requestId: "r1", user: user("把给小林发修订报价这条待办改到周五。", 0) }, { "T-task:quote": names["T-task:quote"] });
  const message = "不是这条，是给李薇寄样片那条。";
  const result = runEngine(log, worldOf(log.names, at(2), "Asia/Tokyo"), { at: at(2), gone: [], hint: { parts: [{ clarity: "clear", continues: null, quote: message, refs: [{ id: null, kind: "todo", said: "给李薇寄样片那条" }], slots: { kind: "todo", verb: "update" } }] }, message });
  const part = partOf(message, ["todo.update"], [{ entity: "todo", words: "给李薇寄样片那条" }]);
  const { applied, parts } = applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: log.names, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: true });
  assert.equal(parts[0].refs[0].recordId, null, JSON.stringify(result));
  assert.ok(!applied.some((item) => item.what === "ref_bound" || item.what === "ref_added"), JSON.stringify(applied));
  assert.equal(contentContradicts("那条", "给小林发修订报价", "todo"), false, "a bare pointer has no words of its own");
  assert.equal(contentContradicts("「给小林发修订报价（实施费单列）」这条待办", "给小林发修订报价", "todo"), false);
  assert.equal(contentContradicts("小陈", "陈一鸣", "contact"), false, "names are the engine's own matching");
});

// ---------------------------------------------------------------- ORBIT_AGENT_CONVERSATION_NEXT=on (add-only, r12 port)

const VAGUE = "Review a discussion with a contact";

for (const next of ["shadow", "on"] as const) {
  test(`next ${next}: 「${VAGUE}」 (AE-ANS-026) — the agent would answer, the engine asks; on makes it the agent's own question`, async () => {
    const world = people();
    const holder = globalThis as { __orbitAgentEval?: unknown };
    const before = { main: process.env.ORBIT_AGENT_CONVERSATION, next: process.env.ORBIT_AGENT_CONVERSATION_NEXT };
    process.env.ORBIT_AGENT_CONVERSATION = "on";
    process.env.ORBIT_AGENT_CONVERSATION_NEXT = next;
    const previous = holder.__orbitAgentEval;
    try {
      const run = await runFn(VAGUE, [{ clarity: "missing_one", dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "a contact" }], requiredCapabilities: ["contact.read"], sourceQuote: VAGUE }], { answer: ANSWER, language: "en", world });
      const asked = run.events.filter((event) => event.type === "clarify.asked");
      const gate = run.events.filter((event) => event.type === "conversation.next_asked");
      const shadow = run.events.find((event) => event.type === "conversation.shadow");
      const nextDiffs = ((shadow?.diffs ?? []) as { field: string }[]).filter((diff) => diff.field === "next");
      if (next === "on") {
        assert.equal(gate.length, 1, JSON.stringify(run.events.map((event) => event.type)));
        assert.equal(asked.length, 1, run.result.text);
        assert.equal(run.result.status, "waiting_user");
        assert.equal(nextDiffs.length, 0, "the agent now asks as the engine does");
      } else {
        assert.equal(gate.length, 0);
        assert.equal(asked.length, 0, run.result.text);
        assert.equal(nextDiffs.length, 1, JSON.stringify(shadow));
      }
    } finally {
      holder.__orbitAgentEval = previous;
      for (const [key, value] of [["ORBIT_AGENT_CONVERSATION", before.main], ["ORBIT_AGENT_CONVERSATION_NEXT", before.next]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}

test("next on: never while the request has a card (an engine ask on a write is left out), never on a resume, never a discussion part", () => {
  const before = { main: process.env.ORBIT_AGENT_CONVERSATION, next: process.env.ORBIT_AGENT_CONVERSATION_NEXT };
  process.env.ORBIT_AGENT_CONVERSATION = "on";
  process.env.ORBIT_AGENT_CONVERSATION_NEXT = "on";
  try {
    const part = partOf(VAGUE, ["contact.read"], [{ entity: "contact", words: "a contact" }], { gaps: ["no_record"], route: "read", status: "answered" } as Partial<GraphPart>);
    const discussion = partOf(VAGUE, ["answer"], [], { route: "answer", status: "answered" });
    const record = { result: { parts: [{ next: "ask", quote: VAGUE, refs: [] }], shelved: [] }, turn: { at: at(5), gone: [], hint: null, message: VAGUE } };
    const scopeWith = (actionPreview: unknown) => ({ deps: {}, input: { message: VAGUE, requestId: "r1" }, run: { actionPreview, conversation: record, sessionState: null } }) as never;
    const state = (touched: string[] | null, parts = [part]) => ({ asOf: at(5), optionSets: [], parts, timeZone: "Asia/Tokyo", touched }) as never;
    assert.deepEqual(conversationNextAsks(scopeWith({ actionId: "card" }), state(null)), []);
    assert.deepEqual(conversationNextAsks(scopeWith(null), state(["p1"])), []);
    assert.deepEqual(conversationNextAsks(scopeWith(null), state(null, [discussion])), [], "AE-ANS-038: a discussion part asks inside its answer");
  } finally {
    for (const [key, value] of [["ORBIT_AGENT_CONVERSATION", before.main], ["ORBIT_AGENT_CONVERSATION_NEXT", before.next]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
