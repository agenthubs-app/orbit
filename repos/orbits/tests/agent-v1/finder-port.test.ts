/**
 * The record finder port (features/agent-v1/finder): the World is the signed-in account's only (another account's
 * same-named records never enter, the deny list holds, other accounts' private events and «我去过» notes are dropped);
 * a lab decision maps onto the agent's ids as one / ask / none; the live lookup calls Gemini only when the rules do
 * not settle it, maps its probabilities as the lab did, and falls back to the rules on a timeout (a question, never a
 * guess); ORBIT_AGENT_FINDER=legacy is the rollback switch. Names and records are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createWorldLoader, labIdOf, agentRefOf } from "../../features/agent-v1/finder/world";
import { findRecord, finderMode, finderSessionOf, outcomeOf } from "../../features/agent-v1/finder/session";
import { liveFind, pickOfProbabilities, pickRequestOf } from "../../features/agent-v1/finder/live";
import type { FindInput, World } from "../../features/agent-v1/finder/types";
import { newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { captureTrace, deepseekStub, recordAccessOf } from "./graph-kit";
import { contact, platformEvent, todo } from "./read-kit";

const ME = "actor:me";
const OTHER = "actor:other";
const NOW = "2026-11-21T06:00:00.000Z";

function twoAccounts() {
  return {
    events: [platformEvent("event:fair", "北陆陶器市", "2026-11-28T01:00:00.000Z", "金沢"), platformEvent("event:draft", "未公开的草稿", "2026-12-01T01:00:00.000Z", "未定", { lifecycleState: "draft" as never })],
    records: [
      contact(ME, "contact:mine", "苇原清", { organization: "千鸟纸业" }),
      contact(OTHER, "contact:theirs", "苇原清", { organization: "别家公司" }),
      todo(ME, "task:mine", "给苇原清寄纸样", { relatedContactId: "contact:mine" }),
      todo(OTHER, "task:theirs", "给苇原清寄纸样"),
      todo(OTHER, "task:only-theirs", "核对琥珀色色卡"),
      todo(ME, "task:hidden", "整理琥珀色色卡"),
    ],
  };
}

function accessFor(denied: string[] = []) {
  const access = recordAccessOf(twoAccounts(), { denied: new Set(denied) });
  access.privateEvents = {
    async list() {
      return [
        { accountId: ME, createdAt: NOW, id: "private_event:mine", startsAt: "2026-11-23T10:00:00.000Z", title: "茶会", updatedAt: NOW, version: 1 },
        { accountId: OTHER, createdAt: NOW, id: "private_event:theirs", startsAt: "2026-11-23T10:00:00.000Z", title: "茶会", updatedAt: NOW, version: 1 },
      ];
    },
  } as never;
  access.attendance = { async list() { return [{ accountId: OTHER, attendedOn: "2026-11-01", createdAt: NOW, eventRef: { id: "event:fair", kind: "platform" }, id: "attendance:theirs", updatedAt: NOW, version: 1 }]; } } as never;
  return access;
}

test("finder World: only the signed-in account's records, every part; the deny list holds; drafts of others are not events", async () => {
  const access = accessFor(["task:hidden"]);
  const loader = createWorldLoader({ now: NOW, records: access, scope: access.scope(ME), timeZone: "Asia/Tokyo" });
  const world = await loader.world(["todos", "memos", "schedule", "events"]);
  assert.deepEqual(world.contacts.map((item) => item.id), [labIdOf("contact", "contact:mine")]);
  assert.deepEqual(world.todos.map((item) => item.id), [labIdOf("todo", "task:mine")], "another account's same-titled to-do and the denied one never enter");
  assert.deepEqual(world.todos[0].contactIds, [labIdOf("contact", "contact:mine")]);
  assert.deepEqual(world.privateEvents.map((item) => item.id), [labIdOf("private", "private_event:mine")]);
  assert.deepEqual(world.attendance, [], "another account's «我去过» is dropped");
  assert.deepEqual(world.platformEvents.map((item) => item.id), [labIdOf("platform", "event:fair")], "a draft organised by someone else is not offered");
  assert.ok([...world.contacts, ...world.todos, ...world.privateEvents].every((item) => item.account === "A"));
  assert.equal(await loader.world(["events", "todos", "memos", "schedule"]), world, "one World per set of parts in a request");
  // The other account sees its own, never mine.
  const theirs = await createWorldLoader({ now: NOW, records: access, scope: access.scope(OTHER), timeZone: "Asia/Tokyo" }).world(["todos"]);
  assert.deepEqual(theirs.todos.map((item) => item.id).sort(), [labIdOf("todo", "task:only-theirs"), labIdOf("todo", "task:theirs")]);
});

test("finder lookup: a title only another account holds is not found; the account's own is", async () => {
  const access = accessFor(["task:hidden"]);
  const host = { asOf: NOW, records: access, scope: access.scope(ME), timeZone: "Asia/Tokyo" };
  const session = finderSessionOf(host)!;
  assert.equal(finderSessionOf(host), session, "made once per context");
  const none = await findRecord(session, { accept: ["todo"], clue: "核对琥珀色色卡", fn: "findTodosMemos", kinds: ["todo"], sentence: "把核对琥珀色色卡那条标成完成", status: "open", verb: "complete" });
  assert.equal(none.kind, "none");
  const one = await findRecord(session, { accept: ["todo"], clue: "寄纸样", fn: "findTodosMemos", kinds: ["todo"], sentence: "把寄纸样那条改到周五", status: "open", verb: "update" });
  assert.deepEqual(one, { agentKind: "todo", id: "task:mine", kind: "one" });
});

test("finder lookup: a read that fails is 'failed', never 'none'", async () => {
  const access = accessFor();
  access.source.page = async () => { throw new Error("connection reset"); };
  const session = finderSessionOf({ asOf: NOW, records: access, scope: access.scope(ME), timeZone: "Asia/Tokyo" })!;
  const result = await findRecord(session, { accept: ["todo"], clue: "寄纸样", fn: "findTodosMemos", kinds: ["todo"], sentence: "把寄纸样那条改到周五", status: "open", verb: "update" });
  assert.equal(result.kind, "failed");
});

test("outcome mapping: one / ask / none onto the agent's ids; other kinds are not offered; the occurrence day is kept", () => {
  assert.deepEqual(agentRefOf("P-private_event:x"), { id: "private_event:x", kind: "private" });
  assert.deepEqual(agentRefOf("T-task:a-b"), { id: "task:a-b", kind: "todo" });
  assert.equal(agentRefOf("X-1"), null);
  assert.deepEqual(outcomeOf({ ids: ["T-task:a"], outcome: "one" }, ["todo"]), { agentKind: "todo", id: "task:a", kind: "one" });
  assert.deepEqual(outcomeOf({ ids: ["S-sched:1"], outcome: "one" }, ["schedule"], new Map([["S-sched:1", "2026-11-24"]])), { agentKind: "schedule", id: "sched:1", kind: "one", occurrence: "2026-11-24" });
  assert.deepEqual(outcomeOf({ ids: ["T-task:a", "T-task:b", "T-task:c"], outcome: "ask" }, ["todo"]), { ids: [{ agentKind: "todo", id: "task:a" }, { agentKind: "todo", id: "task:b" }, { agentKind: "todo", id: "task:c" }], kind: "ask" });
  assert.deepEqual(outcomeOf({ ids: ["E-event:1", "P-private_event:2"], outcome: "ask" }, ["platform", "private"]).kind, "ask");
  assert.deepEqual(outcomeOf({ ids: [], outcome: "none" }, ["todo"]), { kind: "none" });
  assert.deepEqual(outcomeOf({ ids: ["M-note:1"], outcome: "one" }, ["todo"]), { kind: "none" }, "a memo is never acted on as a to-do");
  assert.deepEqual(outcomeOf({ ids: ["M-note:1", "M-note:2"], outcome: "ask" }, ["todo"]), { kind: "none" });
});

// ---------------- the live lookup with a stubbed Gemini Decision ----------------

const world: World = {
  aliases: [], attendance: [], contacts: [], memos: [], now: NOW, platformEvents: [], privateEvents: [], schedule: [], timeZone: "Asia/Tokyo",
  todos: [
    { account: "A", createdAt: NOW, id: "T-1", status: "open", title: "准备季度复盘材料", updatedAt: NOW },
    { account: "A", createdAt: NOW, id: "T-2", status: "open", title: "准备年度复盘材料", updatedAt: NOW },
  ],
};
const input: FindInput = { account: "A", clue: "复盘材料", kinds: ["todo"], sentence: "把复盘材料那条改到周五", status: "open", verb: "update" };

function geminiStub(answer: (labels: Map<string, string>) => Record<string, number> | "hang") {
  const calls: { body: { questions: { pick: { criteria: Record<string, string>; instructions: string; type: string } } } }[] = [];
  const fetchImplementation = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    const { label } = pickRequestOf(input, [{ id: "T-1", matched: [], score: 1 }, { id: "T-2", matched: [], score: 1 }], world);
    const probs = answer(label);
    if (probs === "hang") {
      await new Promise((resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    const top = Object.entries(probs as Record<string, number>).sort((a, b) => b[1] - a[1])[0][0];
    return new Response(JSON.stringify({ answers: { pick: { choice: top, confidence: 0.9, probabilities: probs, type: "choice" } }, usage: { total_input_tokens: 321 } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImplementation };
}

test("live lookup: the rules settle it → no model call; a tie → one Gemini pick over shuffled labels, mapped as the lab did", async () => {
  const clear = await liveFind("findTodosMemos", { ...input, clue: "季度复盘材料" }, world, { judgment: { apiKey: "test" }, judgmentBudget: newJudgmentBudget() });
  assert.deepEqual(clear.decision, { ids: ["T-1"], outcome: "one" });
  assert.deepEqual(clear.calls, { pick: 0, reformulate: 0 });

  const stub = geminiStub((label) => Object.fromEntries([...label].map(([key, id]) => [key, id === "T-2" ? 0.85 : 0.1]).concat([["none", 0.05]])));
  const trace = captureTrace();
  const budget = newJudgmentBudget();
  try {
    const picked = await liveFind("findTodosMemos", input, world, { judgment: { apiKey: "test", fetchImplementation: stub.fetchImplementation }, judgmentBudget: budget, requestId: "req:1" });
    assert.deepEqual(picked.decision, { ids: ["T-2"], outcome: "one" }, "chosen at ≥ 0.8");
    assert.equal(stub.calls.length, 1);
    assert.equal(budget.used, 1, "inside the round's judgment budget");
    const question = stub.calls[0].questions.pick;
    assert.equal(question.type, "choice");
    assert.deepEqual(Object.keys(question.criteria).sort(), ["c1", "c2", "none"], "opaque labels, never ids");
    assert.ok(!JSON.stringify(stub.calls[0]).includes("T-1"));
    const decided = trace.events.filter((event) => event.type === "judgment.decided");
    assert.equal(decided.length, 1);
    assert.equal(decided[0].sent, true);
    assert.equal(decided[0].candidates, 2);
    assert.equal(decided[0].purpose, "finder_pick");
  } finally {
    trace.restore();
  }
});

test("live lookup: a split answer asks between the fitting ones; a timeout falls back to the rules (a question, never a guess)", async () => {
  const split = geminiStub((label) => Object.fromEntries([...label].map(([key]) => [key, 0.45]).concat([["none", 0.1]])));
  const asked = await liveFind("findTodosMemos", input, world, { judgment: { apiKey: "test", fetchImplementation: split.fetchImplementation }, judgmentBudget: newJudgmentBudget() });
  assert.equal(asked.decision.outcome, "ask");
  assert.deepEqual([...asked.decision.ids].sort(), ["T-1", "T-2"]);

  const hang = geminiStub(() => "hang");
  const started = Date.now();
  const fallback = await liveFind("findTodosMemos", input, world, { judgment: { apiKey: "test", fetchImplementation: hang.fetchImplementation }, judgmentBudget: newJudgmentBudget(), timeoutMs: 50 });
  assert.ok(Date.now() - started < 1000, "one short attempt, no retry");
  assert.equal(hang.calls.length, 1);
  assert.equal(fallback.decision.outcome, "ask");
  assert.deepEqual([...fallback.decision.ids].sort(), ["T-1", "T-2"]);

  const noKey = await liveFind("findTodosMemos", input, world, { judgment: { apiKey: null }, judgmentBudget: newJudgmentBudget() });
  assert.equal(noKey.decision.outcome, "ask");
  assert.deepEqual(noKey.calls, { pick: 0, reformulate: 0 });
  const spent = { limit: 3, used: 3 };
  assert.equal((await liveFind("findTodosMemos", input, world, { judgment: { apiKey: "test", fetchImplementation: split.fetchImplementation }, judgmentBudget: spent })).calls.pick, 0, "no budget left: no request");
});

test("Gemini probabilities → pick (params.json: chosen 0.8, none 0.5, ambiguous ≥ 0.1, at most 3)", () => {
  const label = new Map([["c1", "T-1"], ["c2", "T-2"], ["c3", "T-3"], ["c4", "T-4"]]);
  assert.deepEqual(pickOfProbabilities({ c1: 0.81, c2: 0.1, none: 0.09 }, label), { chosen: ["T-1"] });
  assert.deepEqual(pickOfProbabilities({ c1: 0.2, none: 0.6 }, label), { none: true });
  assert.deepEqual(pickOfProbabilities({ c1: 0.3, c2: 0.25, c3: 0.2, c4: 0.15, none: 0.1 }, label), { ambiguous: ["T-1", "T-2", "T-3"] });
  assert.equal(pickOfProbabilities({ c1: 0.05, none: 0.4 }, label), null);
  assert.equal(pickOfProbabilities({}, label), null);
});

test("ORBIT_AGENT_FINDER=legacy is the rollback switch; anything else is the new finder", () => {
  assert.equal(finderMode({}), "new");
  assert.equal(finderMode({ ORBIT_AGENT_FINDER: "legacy" }), "legacy");
  assert.equal(finderMode({ ORBIT_AGENT_FINDER: " LEGACY " }), "legacy");
  assert.equal(finderMode({ ORBIT_AGENT_FINDER: "new" }), "new");
});

test("live lookup: no candidates → one DeepSeek reformulate round (node propose, 2 s, inside the model budget), then a pick over what it found", async () => {
  const model = deepseekStub([JSON.stringify({ terms: ["季度复盘材料"] })]);
  const budget = { limit: 4, used: 1 };
  const found = await liveFind("findTodosMemos", { ...input, clue: "quarterly review deck", sentence: "move the quarterly review deck to Friday" }, world, { fetchImplementation: model.fetchImplementation, judgment: { apiKey: null }, judgmentBudget: newJudgmentBudget(), modelBudget: budget, requestId: "req:2" });
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].node, "propose");
  assert.match(model.calls[0].system, /search its saved records/u);
  assert.equal(budget.used, 2);
  assert.deepEqual(found.calls, { pick: 0, reformulate: 1 });
  assert.equal(found.input.clue, "季度复盘材料");
  // As in the lab harness, decide judges against the user's own words: without a pick it is a question, never a guess.
  assert.equal(found.decision.outcome, "ask");
  assert.deepEqual(found.decision.ids, ["T-1", "T-2"]);
  // Never a second round, and none at all without budget or without content words.
  const spent = await liveFind("findTodosMemos", { ...input, clue: "quarterly review deck" }, world, { fetchImplementation: model.fetchImplementation, modelBudget: { limit: 4, used: 4 }, requestId: "req:3" });
  assert.deepEqual(spent.decision, { ids: [], outcome: "none" });
  assert.equal(model.calls.length, 1);
  const kindOnly = await liveFind("findTodosMemos", { ...input, clue: "那条待办", sentence: "把那条待办改到周五" }, world, { fetchImplementation: model.fetchImplementation, modelBudget: { limit: 4, used: 0 }, requestId: "req:4" });
  assert.equal(kindOnly.calls.reformulate, 0);
  assert.equal(model.calls.length, 1);
});

test("live lookup (port guard): the named person's only record, holding none of the words, is offered — not decided — unless the words are in another script", async () => {
  const personWorld: World = {
    ...world,
    contacts: [{ account: "A", id: "C-k", name: "鹤见遥" }],
    todos: [{ account: "A", contactIds: ["C-k"], createdAt: NOW, id: "T-k", status: "open", title: "给鹤见遥发修订版报价", updatedAt: NOW }],
  };
  const same = await liveFind("findTodosMemos", { ...input, clue: "给鹤见遥寄合同那条待办", people: ["C-k"], sentence: "把给鹤见遥寄合同那条待办改到周五" }, personWorld, { judgment: { apiKey: null }, judgmentBudget: newJudgmentBudget() });
  assert.deepEqual(same.decision, { ids: ["T-k"], outcome: "ask" });
  assert.equal(same.unmatched, true);
  const other = await liveFind("findTodosMemos", { ...input, clue: "the revised pricing thing", people: ["C-k"], sentence: "move the revised pricing thing for her to Friday" }, personWorld, { judgment: { apiKey: null }, judgmentBudget: newJudgmentBudget() });
  assert.deepEqual(other.decision, { ids: ["T-k"], outcome: "one" }, "English words cannot be compared with a Chinese title: her only to-do (a card, still a click)");
});
