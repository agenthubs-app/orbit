/**
 * The conversation engine's decisions opened on 2026-11-23 (conversation/mode.ts openedMode): the World read from the
 * store (bounded, the account's rows only), R27 pronouns (one person named in the latest turn that named anyone → that
 * person, no gender known; never after an idle break, never with two), and the merged request's people (a follow-up keeps
 * the person, a new request drops a person carried in). Names and records are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { applyCarry, applyTurn, carryChangesOf, withPronounsBound } from "../../features/agent-v1/conversation/apply";
import { appendTurn, runEngine, worldOf, type ConversationLog } from "../../features/agent-v1/conversation/bridge";
import { openedMode } from "../../features/agent-v1/conversation/mode";
import { awaitWorldRead, conversationIdsOf, enrichWorld, READ_CONTACTS, READ_RECORDS } from "../../features/agent-v1/conversation/world-read";
import type { AgentReply, ModelHint } from "../../features/agent-v1/conversation/types";
import { createWorldLoader, labIdOf } from "../../features/agent-v1/finder/world";
import type { GraphPart } from "../../features/agent-v1/graph/state";
import { recordAccessOf } from "./graph-kit";
import { contact, memo, todo } from "./read-kit";

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
const turnOf = (log: ConversationLog | null, message: string, minutes: number, hint: ModelHint | null = null) => runEngine(log, worldOf(log?.names ?? NAMES, at(minutes), "Asia/Tokyo"), { at: at(minutes), gone: [], hint, message });
const apply = (message: string, part: GraphPart, result: ReturnType<typeof turnOf>) => applyTurn({ agentFollowUps: new Map(), context: null, gone: new Set(), message, names: NAMES, parts: [part], result, timeZone: "Asia/Tokyo", waitingChange: false });

function partOf(message: string, capabilities: string[], refs: { words?: string; entity: string; recordId?: string | null }[] = []): GraphPart {
  return {
    asked: 0, capabilities: capabilities as GraphPart["capabilities"], continues: null, dependsOn: [], localId: "p1", origin: null,
    plan: { clarity: "clear", dataOwner: "self", dataSources: ["orbit_records"], deliverable: "answer", hypothesis: false, intentBasis: "instruction", negation: false, persistence: "this_turn", readings: [] },
    quote: [0, message.length], reading: null, reason: null,
    refs: refs.map((ref) => ({ entity: ref.entity, quote: ref.words ? [message.indexOf(ref.words), message.indexOf(ref.words) + ref.words.length] as [number, number] : null, recordId: ref.recordId ?? null })),
    route: null, status: "unfinished", step: null, verdict: null, waitReason: null,
  } as GraphPart;
}

// ---------------------------------------------------------------- R27 pronouns

test("R27: one person in the latest turn, no gender known — 她 and 他 both bind that person (the engine alone asks)", () => {
  const log = appendTurn(null, { agent: reply(1, { mentions: ["C-contact:shen"] }), requestId: "r1", user: user("沈佳怡最近怎么样？", 0) }, NAMES);
  for (const message of ["她的电话是多少？", "他的电话是多少？"]) {
    const result = turnOf(log, message, 2, { parts: [{ clarity: "clear", continues: null, quote: message, refs: [{ id: null, kind: "contact", said: message.slice(0, 1) }], slots: { kind: "contact", verb: "read" } }] });
    const pronoun = result.parts[0].refs.find((ref) => ref.said === message.slice(0, 1))!;
    const { bound, result: opened } = withPronounsBound(result, false);
    if (pronoun.outcome === "ask") assert.deepEqual(bound, [{ id: "C-contact:shen", quote: result.parts[0].quote, said: message.slice(0, 1) }]);
    const part = partOf(message, ["contact.read"], [{ entity: "contact", words: message.slice(0, 1) }]);
    assert.equal(apply(message, part, opened).parts[0].refs[0].recordId, "contact:shen", `${message}: ${JSON.stringify(result.parts[0].refs)}`);
  }
});

test("R27 does not bind after an idle break (R2), nor when the latest turn named two people", () => {
  const one = appendTurn(null, { agent: reply(1, { mentions: ["C-contact:shen"] }), requestId: "r1", user: user("沈佳怡最近怎么样？", 0) }, NAMES);
  const idle = turnOf(one, "她的电话是多少？", 90);
  assert.deepEqual(withPronounsBound(idle, true).bound, [], "idle: asked, never bound");
  const two = appendTurn(null, { agent: reply(1, { mentions: ["C-contact:shen", "C-contact:wang"] }), requestId: "r1", user: user("沈佳怡和王磊谁先回复了？", 0) }, NAMES);
  const result = turnOf(two, "她的电话是多少？", 2);
  assert.deepEqual(withPronounsBound(result, false).bound, [], JSON.stringify(result.parts[0].refs));
  const part = partOf("她的电话是多少？", ["contact.read"], [{ entity: "contact", words: "她" }]);
  assert.equal(apply("她的电话是多少？", part, withPronounsBound(result, false).result).parts[0].refs[0].recordId, null, "two people: the agent's resolver asks");
});

test("R27 after a correction: 「不是这个，是王磊那个」 then 「他的电话」 is 王磊, the agent's own binding is never replaced", () => {
  let log = appendTurn(null, { agent: reply(1, { listed: ["T-task:shen", "T-task:wang"], mentions: ["T-task:shen", "T-task:wang"] }), requestId: "r1", user: user("下周有哪些待办？", 0) }, NAMES);
  log = appendTurn(log, { agent: reply(3, { card: { id: "k1", op: "todo.update", target: "T-task:shen" }, mentions: ["T-task:shen", "C-contact:shen"] }), requestId: "r2", user: user("把第一个改到周五", 2) }, NAMES);
  log = appendTurn(log, { agent: reply(5, { card: { id: "k2", op: "todo.update", target: "T-task:wang" }, mentions: ["T-task:wang", "C-contact:wang"] }), requestId: "r3", user: user("不是这个，是王磊那个", 4) }, NAMES);
  const message = "他的电话是多少？";
  const { result } = withPronounsBound(turnOf(log, message, 6), false);
  assert.deepEqual(result.parts[0].refs.map((ref) => [ref.outcome, ref.id]), [["bound", "C-contact:wang"]]);
  assert.equal(apply(message, partOf(message, ["contact.read"], [{ entity: "contact", words: "他" }]), result).parts[0].refs[0].recordId, "contact:wang");
  const own = partOf(message, ["contact.read"], [{ entity: "contact", recordId: "contact:shen", words: "他" }]);
  assert.equal(apply(message, own, result).parts[0].refs[0].recordId, "contact:shen", "a clue the agent bound (a handle) stays");
});

// ---------------------------------------------------------------- the merged request's people

test("carry: a new task does not take the person talked about before; the person said in the words stays", () => {
  const log = appendTurn(null, { agent: reply(1, { answered: { kind: "todo", people: ["C-contact:wang"], verb: "read" }, mentions: ["C-contact:wang"] }), requestId: "r1", user: user("王磊那边还有什么待办？", 0) }, NAMES);
  const message = "帮我建个待办：周五订会议室";
  const result = turnOf(log, message, 2);
  assert.equal(result.parts[0].followUp, "new");
  assert.deepEqual(result.parts[0].request?.people ?? [], []);
  const carried = partOf(message, ["todo.create"], [{ entity: "contact", recordId: "contact:wang" }]);
  const changes = carryChangesOf({ message, parts: [carried], result });
  assert.deepEqual(changes.map((change) => [change.what, change.ids]), [["people_drop", ["contact:wang"]]]);
  assert.deepEqual(applyCarry([carried], changes)[0].refs, []);
  assert.equal(carried.refs.length, 1, "the agent's part is not mutated");
  const named = "给王磊建个待办：周五订会议室";
  const said = partOf(named, ["todo.create"], [{ entity: "contact", recordId: "contact:wang", words: "王磊" }]);
  assert.deepEqual(carryChangesOf({ message: named, parts: [said], result: turnOf(log, named, 2) }), [], "a person the words name is never dropped");
});

test("carry: 「那下下周呢」 after 「王磊下周的待办」 keeps 王磊 when the agent's part names no one", () => {
  const log = appendTurn(null, { agent: reply(1, { answered: { kind: "todo", people: ["C-contact:wang"], time: { from: "2026-11-23", to: "2026-11-29" }, verb: "read" }, listed: ["T-task:wang"], mentions: ["T-task:wang", "C-contact:wang"] }), requestId: "r1", user: user("王磊下周有哪些待办？", 0) }, NAMES);
  const message = "那下下周呢？";
  const result = turnOf(log, message, 2);
  assert.equal(result.parts[0].followUp, "swap_period");
  const changes = carryChangesOf({ message, parts: [partOf(message, ["todo.read"])], result });
  assert.deepEqual(changes.map((change) => [change.what, change.ids]), [["people_add", ["contact:wang"]]]);
  assert.deepEqual(applyCarry([partOf(message, ["todo.read"])], changes)[0].refs, [{ entity: "contact", quote: null, recordId: "contact:wang" }]);
  const write = carryChangesOf({ message, parts: [partOf(message, ["todo.create"])], result });
  assert.deepEqual(write, [], "only a read keeps the person");
});

// ---------------------------------------------------------------- the World from the store

test("XL-010 with the World read: 「小陈」 is still the 陈一鸣 the card linked, with his company and linked note in the World", () => {
  const first = "记一下：小林今天来电话了，说小陈还在审合同。";
  const log = appendTurn(null, { agent: reply(1, { card: { id: "k1", op: "memo.create", target: null }, mentions: ["C-contact:chen", "C-contact:lin"] }), requestId: "r1", user: user(first, 0) }, NAMES);
  const message = "我最近一次和小陈直接联系是什么时候？";
  const hint: ModelHint = { parts: [{ clarity: "clear", continues: null, quote: message, refs: [{ id: null, kind: "contact", said: "小陈" }], slots: { kind: "memo", verb: "read" } }] };
  const read = { aliases: [], attendance: [], contacts: [{ account: "A" as const, company: "北辰软件", id: "C-contact:chen", name: "陈一鸣" }, { account: "A" as const, company: "东岳物流", id: "C-contact:lin", name: "小林健" }], memos: [{ account: "A" as const, body: "审合同", contactIds: ["C-contact:chen"], id: "M-note:c", title: "和陈一鸣通话", updatedAt: at(0), writtenOn: "2026-11-20" }], now: at(3), platformEvents: [], privateEvents: [], schedule: [], timeZone: "Asia/Tokyo", todos: [] };
  // (the read holds only contacts the conversation named: a 陈 it never named would make 「小陈」 a question again)
  const world = enrichWorld(worldOf(NAMES, at(3), "Asia/Tokyo"), read);
  assert.deepEqual(world.genders, {}, "no gender, ever");
  assert.equal(world.contacts.find((item) => item.id === "C-contact:chen")?.company, "北辰软件", "the read contact replaces its names-only entry");
  const result = runEngine(log, world, { at: at(3), gone: [], hint, message });
  const ref = result.parts[0].refs.find((item) => item.said.includes("小陈"));
  assert.deepEqual(ref && [ref.outcome, ref.id], ["bound", "C-contact:chen"], JSON.stringify(result.parts[0].refs));
});

test("the World read: the conversation's contacts and their linked records only (at most 10 and 30), named records not re-read, the account's rows only", async () => {
  const ME = "actor:a";
  const records = [contact("actor:b", "contact:other", "王磊")];
  for (let index = 0; index < 15; index += 1) records.push(contact(ME, `contact:p${index}`, `联系人${index}`));
  for (let index = 0; index < 40; index += 1) records.push(todo(ME, `task:t${index}`, `跟进第${index}件事`, { relatedContactId: `contact:p${14 - (index % 3)}` }));
  for (let index = 0; index < 20; index += 1) records.push(memo(ME, `note:n${index}`, `第${index}次通话`, "2026-11-10T00:00:00.000Z", ["contact:p0"]));
  records.push(todo(ME, "task:unrelated", "与谁都无关"), todo("actor:b", "task:theirs", "别人的待办", { relatedContactId: "contact:p0" }));
  const access = recordAccessOf({ events: [], records });
  let log: ConversationLog | null = null;
  for (let index = 0; index < 15; index += 1) log = appendTurn(log, { agent: reply(index, { mentions: [`C-contact:p${index}`] }), requestId: `r${index}`, user: user(`联系人${index}怎么样`, index) }, { [`C-contact:p${index}`]: { name: `联系人${index}`, type: "contact" } });
  log = appendTurn(log, { agent: reply(20, { listed: ["T-task:unrelated", "M-note:n3"] }), requestId: "r20", user: user("看看", 20) }, {});
  const ids = conversationIdsOf(log, null);
  assert.equal(ids.contacts[0], "C-contact:p14", "most recent first");
  assert.deepEqual(ids.records, ["T-task:unrelated", "M-note:n3"]);
  const before = access.source.reads.length;
  const loader = createWorldLoader({ now: at(21), records: access, scope: access.scope(ME), timeZone: "Asia/Tokyo" });
  const world = await loader.conversationWorld({ contacts: ids.contacts, linkedPeople: 3, maxContacts: READ_CONTACTS, maxRecords: READ_RECORDS });
  const read = access.source.reads.slice(before);
  assert.ok(world.contacts.length <= READ_CONTACTS && world.contacts.length === 10);
  assert.ok(world.todos.length + world.memos.length + world.schedule.length <= READ_RECORDS);
  assert.ok(loader.reads() <= READ_CONTACTS + READ_RECORDS, `rows read ${loader.reads()}`);
  assert.ok(!read.includes("task:unrelated") && !read.includes("note:n3"), "a record the conversation named is not read again (AE-SCL-021)");
  assert.ok(world.todos.length > 0 && world.todos.every((item) => item.contactIds?.length), "the people's linked records are read");
  assert.ok(!read.includes("task:unrelated") && !read.includes("task:theirs") && !read.includes("contact:other"), "nothing unrelated, nothing of another account");
  assert.ok(world.todos.every((item) => item.contactIds?.every((id) => id.startsWith("C-contact:p"))), "links are kept");
  assert.equal((await awaitWorldRead(new Promise(() => {}), 5)).status, "timeout", "a slow read is not waited for");
});

test("switches: the opened decisions are shadow by default, on only under ORBIT_AGENT_CONVERSATION=on, off under legacy", () => {
  assert.equal(openedMode("pronoun", { ORBIT_AGENT_CONVERSATION: "on" }), "shadow");
  assert.equal(openedMode("pronoun", { ORBIT_AGENT_CONVERSATION: "on", ORBIT_AGENT_CONVERSATION_PRONOUN: "on" }), "on");
  assert.equal(openedMode("world", { ORBIT_AGENT_CONVERSATION: "shadow", ORBIT_AGENT_CONVERSATION_WORLD: "on" }), "shadow");
  assert.equal(openedMode("carry", { ORBIT_AGENT_CONVERSATION: "legacy", ORBIT_AGENT_CONVERSATION_CARRY: "on" }), "off");
  assert.equal(openedMode("world", { ORBIT_AGENT_CONVERSATION: "on", ORBIT_AGENT_CONVERSATION_WORLD: "off" }), "off");
});
