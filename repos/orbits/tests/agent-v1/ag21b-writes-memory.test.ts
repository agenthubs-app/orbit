import assert from "node:assert/strict";
import test from "node:test";

import { importTableOf, previewImport, withHeader } from "../../features/agent-v1/domains/contact/import-preview";
import { boundContactReader } from "../../features/agent-v1/domains/contact/types";
import { reviseImportByWords } from "../../features/agent-v1/entry/import-revision";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { usesPromisedDate } from "../../features/agent-v1/graph/nodes/functions";
import { clockBoundIn, meetsTime, timePreferenceIn } from "../../features/agent-v1/functions/basis";
import { timeWords } from "../../features/agent-v1/functions/copy";
import { asksToSkipConfirmation, settleRemember, timePreferenceOfEntry, topicKeyOf } from "../../features/agent-v1/domains/memory/turn";
import { MEMORY_CREATE, MEMORY_UPDATE, type MemoryCardIntent } from "../../features/agent-v1/domains/memory/ops";
import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { readMemoryWords } from "../../features/agent-v1/domains/memory/words";
import { applyResolution } from "../../features/agent-v1/graph/nodes/clarify";
import { groupInteractions, interactionNamedIn } from "../../features/agent-v1/functions/extract-interactions";
import { fnWorld, NOW as FN_NOW, runFn } from "./functions-kit";
import { access, choice, judgeStub, noul } from "./judgment-kit";
import { deepseekStub, graphKit, json, part, type ModelCall } from "./graph-kit";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import { endsInActionVerb, needsIntentReview, readsAsWriteRequest } from "../../features/agent-v1/judgment/intent-review";
import { resolveEventIntent } from "../../features/agent-v1/propose/events-resolve";
import type { ResolveContext } from "../../features/agent-v1/propose/resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { contactWorld, memoryContactAccess } from "./contact-kit";
import { recordAccessOf } from "./graph-kit";
import { contact, memo, schedule, todo } from "./read-kit";
import { readingKindsOf } from "../../features/agent-v1/graph/nodes/route";
import { asksForEverything } from "../../features/agent-v1/graph/nodes/answer";

/**
 * agent-design AG21b (independent suite, final run: R27–R43, writes and memory). This line's own sentences, not the suite's.
 */

const ACTOR = "actor:a";
const EVENT_RANK = (quote: string, extra: Record<string, unknown> = {}) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote, ...extra });
const fnRankOf = (events: Record<string, unknown>[]) => events.filter((event) => event.type === "fn.rank");
const NOW = "2026-11-20T01:00:00.000Z";

function withShinan() {
  return contactWorld((records) => {
    records.push(contact(ACTOR, "contact:sn", "石楠", { organization: "白鹭印务", primaryEmail: "shinan@example.test", role: "印务主管" }));
  });
}

const NUMBERED = "帮我导入这几位：\n1. 石楠，白鹭印务，shinan@example.test\n2. （名字忘了），柏舟设计，010-0000-0000\n3. 季朗，柏舟设计，项目经理";

test("R27 a numbered list with no header: markers off, each cell typed by its own shape, a placeholder name is no name", async () => {
  const table = importTableOf(NUMBERED)!;
  const existing = await memoryContactAccess(withShinan()).listActive(ACTOR);
  const preview = previewImport(table, existing, ACTOR);
  assert.deepEqual(preview.rows.map((row) => [row.row, row.name, row.organization, row.role, row.decision, row.reason ?? null]), [
    [1, "石楠", "白鹭印务", "", "duplicate", null],
    [2, "", "柏舟设计", "", "skip", "missing_name"],
    [3, "季朗", "柏舟设计", "项目经理", "create", null],
  ]);
  assert.equal(preview.rows[0].match?.id, "contact:sn", "the row whose e-mail and name match the existing contact");
  // Other markers and shapes; a column that mixes e-mails, phones and titles is typed per cell.
  const mixed = previewImport(withHeader("- 林小雨,青柠童书,lin@example.test\n2) 森田葵,东和商事,+81 90 1234 5678\n・王强,远帆物流,运营经理\n?,无名公司,实习生"), [], ACTOR);
  assert.deepEqual(mixed.rows.map((row) => [row.name, row.organization, row.role, row.reason ?? null]), [["林小雨", "青柠童书", "", null], ["森田葵", "东和商事", "", null], ["王强", "远帆物流", "运营经理", null], ["", "无名公司", "实习生", "missing_name"]]);
  assert.equal(withHeader(withHeader(table)), withHeader(table), "the header code writes is read back as a header");
});

function ledgerOver(world: ReturnType<typeof contactWorld>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  return createAgentRuntimeService({ cardReader: { read: async () => null, contacts: boundContactReader(memoryContactAccess(world), ACTOR) }, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
}

test("R27 a revision that sets a row to the decision it already has says so and leaves the card as it is", async () => {
  const world = withShinan();
  const runtime = ledgerOver(world);
  await runtime.freezeCard!({ actionId: "card:imp", intents: [{ capability: "contact.import", overrides: {}, text: importTableOf(NUMBERED)! }], locale: "zh", origin: { conversationId: "session:a", kind: "conversation", requestId: "req:imp" } });
  const same = await reviseImportByWords({ actorId: ACTOR, message: "第3行也新建", now: () => NOW, runtime, sessionId: "session:a", store: null });
  assert.ok(same);
  assert.match(same!.text, /第3行本来就是新增/u);
  assert.doesNotMatch(same!.text, /改为新建/u);
  assert.equal(same!.actionPreview?.revision, 1, "no new revision");
  const mixed = await reviseImportByWords({ actorId: ACTOR, message: "第1行和第3行都新建", now: () => NOW, runtime, sessionId: "session:a", store: null });
  assert.match(mixed!.text, /第1行改为新建/u);
  assert.match(mixed!.text, /第3行本来就是新增/u);
  assert.equal(mixed!.actionPreview?.revision, 2);
});

// ---------------------------------------------------------------------------------------------------------------------
// R28: an event named for a delete or a change is looked for among the user's private events when no schedule item matches.

const TEA = { accountId: ACTOR, createdAt: "2026-10-01T00:00:00.000Z", id: "private_event:tea", startsAt: "2026-10-18T05:00:00.000Z", title: "校友茶会", updatedAt: "2026-10-01T00:00:00.000Z", version: 2 };

function teaWorld() {
  const records = [memo(ACTOR, "note:tea", "茶会上和石楠聊了印刷排期。", "2026-10-18T09:00:00.000Z", [], { eventRefs: [{ id: "private_event:tea", kind: "private" }], title: "茶会纪要" })];
  const base = recordAccessOf({ events: [], records });
  return {
    ...base,
    attendance: { list: async () => [{ attendedOn: "2026-10-18", eventRef: { id: "private_event:tea", kind: "private" }, id: "attendance:tea", version: 1 }] },
    privateEvents: {
      get: async (_account: string, id: string) => (id === TEA.id ? TEA : null),
      list: async () => [TEA],
      references: async () => [{ id: "attendance:tea", kind: "attendance", label: "2026-10-18", version: "1" }, { id: "note:tea", kind: "memo", label: "茶会纪要", version: "1" }],
    },
  };
}

function eventCtx(message: string): ResolveContext & { deleting?: boolean } {
  return { asOf: NOW, asked: new Map(), context: null, language: "zh", message, nameOf: () => null, people: [], records: teaWorld() as never, scope: { accountId: ACTOR, authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }, timeZone: "Asia/Tokyo" };
}
const span = (message: string, words: string): [number, number] => [message.indexOf(words), message.indexOf(words) + words.length];
const eventPart = (message: string) => ({ localId: "p1", quote: [0, message.length], refs: [] }) as never;

test("R28 a delete tagged as a schedule item finds the user's private event and reaches its delete plan (links listed)", async () => {
  const message = "把上个月的校友茶会删了";
  const ctx = eventCtx(message);
  const intent: StoredIntent = { capability: "schedule.delete", localId: "w1", relations: [], selector: [span(message, "上个月的校友茶会")] };
  const outcome = await resolveEventIntent(ctx, eventPart(message), { intents: [], picks: {} }, intent) as unknown as { kind: string; question?: { type: string; line: string } };
  assert.equal(outcome.kind, "ask", JSON.stringify(outcome));
  assert.equal(outcome.question?.type, "event_plan");
  assert.match(outcome.question!.line, /茶会纪要/u, "the plan lists the linked note");
  assert.doesNotMatch(JSON.stringify(outcome), /日程里没找到/u);
  assert.equal(ctx.deleting, true, "other parts of the message (\"笔记只解除关联\") are made by the plan");
  // With the plan's words in the same message, the card: the «我去过» deleted, the note unlinked, the event last.
  const said = "把上个月的校友茶会删了，参加记录也删掉，笔记只解除关联";
  const ready = await resolveEventIntent(eventCtx(said), eventPart(said), { intents: [], picks: {} }, { capability: "schedule.delete", localId: "w1", relations: [], selector: [span(said, "上个月的校友茶会")] }) as unknown as { kind: string; ops: { capability: string }[] };
  assert.equal(ready.kind, "ready", JSON.stringify(ready));
  assert.deepEqual(ready.ops.map((op) => op.capability), ["attendance.delete", "memo.update", "privateEvent.delete"]);
});

test("R28 a change tagged as a schedule item goes to the private event; a note unlink outside a plan is the unlink", async () => {
  const message = "把校友茶会改到11月22日下午三点";
  const moved = await resolveEventIntent(eventCtx(message), eventPart(message), { intents: [], picks: {} }, { capability: "schedule.update", localId: "w1", relations: [], selector: [span(message, "校友茶会")] }) as unknown as { kind: string; ops: { capability: string; targetId: string }[] };
  assert.equal(moved.kind, "ready", JSON.stringify(moved));
  assert.deepEqual([moved.ops[0].capability, moved.ops[0].targetId], ["privateEvent.update", TEA.id]);
  const unlinkSaid = "把茶会纪要和校友茶会的关联解除";
  const unlink = await resolveEventIntent(eventCtx(unlinkSaid), eventPart(unlinkSaid), { intents: [], picks: {} }, { capability: "memo.update", events: [span(unlinkSaid, "校友茶会")], localId: "w2", relations: [], selector: [span(unlinkSaid, "茶会纪要")] }) as unknown as { kind: string; ops: { capability: string; targetId: string; set: { eventRefs: unknown[] } }[] };
  assert.equal(unlink.kind, "ready", JSON.stringify(unlink));
  assert.deepEqual([unlink.ops[0].capability, unlink.ops[0].targetId, unlink.ops[0].set.eventRefs], ["memo.update", "note:tea", []]);
});

// ---------------------------------------------------------------------------------------------------------------------
// R29: a clause ending in a bare action verb, next to a write or continuing one, is an instruction without review.

test("R29 '那条也删' / '备注也改' with another write in the message or right after one is not reviewed; alone or as a report it is", () => {
  const base = { capabilities: ["todo.delete"] as never, clarity: "clear" as const, hypothesis: false, intentBasis: "instruction" as const, negation: false };
  const asks = (quote: string, withWrite: boolean) => needsIntentReview({ ...base, quote, withWrite });
  assert.equal(asks("寄样书那条也删", true), false);
  assert.equal(asks("和石楠的那两条一起删", true), false);
  assert.equal(asks("备注也改", true), false);
  assert.equal(asks("それも消して", true), false);
  assert.equal(asks("that one too, delete it", true), false);
  // Without a write around it, the bare verb is still reviewed (as before); a report or a question always is.
  assert.equal(asks("寄样书那条也删", false), true);
  assert.equal(asks("我昨天已经删了", true), true);
  assert.equal(asks("那条也删吗？", true), true);
  assert.equal(endsInActionVerb("季朗的报价也挪一下"), true);
  assert.equal(endsInActionVerb("今天和季朗聊了报价"), false);
  assert.equal(readsAsWriteRequest("把给石楠寄样书的待办删掉"), true);
  assert.equal(readsAsWriteRequest("石楠下周来东京吗？"), false);
});

// ---------------------------------------------------------------------------------------------------------------------
// R30: a to-do to chase someone else's promise takes the promise's own date when the user says so.

function proofWorld() {
  const world = fnWorld();
  world.records.push(
    contact("actor:a", "contact:jl", "季朗", { organization: "柏舟设计", role: "项目经理" }),
    memo("actor:a", "note:proof", "和季朗对了封面。季朗说11月20日前把校样发来。", "2026-11-16T03:00:00.000Z", ["contact:jl"], { title: "封面沟通" }),
  );
  return world;
}

const chase = (message: string) => runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@封面沟通" }, { entity: "todo", text: "待办" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
  extract: { followUps: [{ aboutClue: "季朗", action: "把校样发来", dueDateText: "11月20日前", owner: "other", sentenceIds: [2] }] },
  judge: (id: string) => (id.split("__")[1] === "f1" ? choice("other", 0.95) : undefined),
  references: [{ id: "note:proof", name: "封面沟通", type: "memo" }],
  world: proofWorld(),
});

test("R30 '建个待办盯一下，截止就按他说的': the card's to-do is due on the promise's own day; without those words no due date", async () => {
  const run = await chase("从 @封面沟通 建个待办盯一下季朗，截止就按他说的");
  assert.equal(run.frozen.length, 1, run.result.text);
  const [intent] = run.frozen[0].intents as unknown as { capability: string; set: Record<string, unknown> }[];
  assert.equal(intent.capability, "todo.create");
  assert.equal(String(intent.set.dueAt).slice(0, 10), "2026-11-20", "the day of the promise (end of that day, Tokyo)");
  assert.ok(usesPromisedDate("Add a to-do to chase it, due when he said"));
  assert.ok(usesPromisedDate("相手の期限でToDoに追加して"));
  const plain = await chase("从 @封面沟通 建个待办跟进季朗答应的校样");
  assert.equal(plain.frozen.length, 1, plain.result.text);
  assert.equal((plain.frozen[0].intents[0] as unknown as { set: Record<string, unknown> }).set.dueAt, null, "no date guessed from their deadline");
});

// ---------------------------------------------------------------------------------------------------------------------
// R31: one meeting with several people is one interaction; several occasions are a registered question.

const SITE = { id: "note:site", name: "工地笔记", type: "memo" };
function siteWorld(body: string) {
  const world = fnWorld();
  world.records.push(
    contact("actor:a", "contact:sn", "石楠", { organization: "白鹭印务" }),
    contact("actor:a", "contact:jl", "季朗", { organization: "柏舟设计" }),
    contact("actor:a", "contact:gbz", "葛柏舟", { organization: "青檀装订" }),
    memo("actor:a", "note:site", body, "2026-11-12T03:00:00.000Z", ["contact:sn", "contact:jl"], { title: "工地笔记" }),
  );
  return world;
}
const UPDATE = (message: string) => [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@工地笔记" }], requiredCapabilities: ["memo.read", "fn.extractInteractions", "memo.update"], sourceQuote: message }];
const MEETING = [{ channel: "meeting", contactClue: "石楠", dateText: "11月10日", direction: "mutual", kind: "happened", precision: "day", sentenceIds: [1] }, { channel: "meeting", contactClue: "季朗", dateText: "11月10日", direction: "mutual", kind: "happened", precision: "day", sentenceIds: [1] }];

test("R31 grouping and picking, by code: one sentence, day and channel is one occasion; a reply names one by its words", () => {
  const people = { jl: { id: "contact:jl", name: "季朗" }, sn: { id: "contact:sn", name: "石楠" } };
  const result = (contact: { id: string; name: string }, channel: "meeting" | "phone", sentenceIds: number[]) => ({ channel, clue: contact.name, contact, direction: "mutual" as const, key: contact.id, occurredOn: "2026-11-10", precision: "day" as const, reason: null, sentenceIds, writable: true });
  const groups = groupInteractions([result(people.sn, "meeting", [1]), result(people.jl, "meeting", [1]), result(people.jl, "phone", [2])]);
  assert.deepEqual(groups.map((group) => [group.channel, group.contacts.map((contact) => contact.id)]), [["meeting", ["contact:sn", "contact:jl"]], ["phone", ["contact:jl"]]]);
  const options = [{ id: "a", label: "石楠、季朗，11月10日，见面「11月10日在工地和石楠、季朗碰头。」" }, { id: "b", label: "季朗，11月10日，电话「11月10日晚上给季朗打了电话。」" }];
  assert.equal(interactionNamedIn("工地那次", options), "a");
  assert.equal(interactionNamedIn("打电话那个", options), "b");
  assert.equal(interactionNamedIn("第二个", options), "b");
  assert.equal(interactionNamedIn("都行", options), null);
});

test("R31 '用这篇更新往来' on one meeting with two people: one interaction with both, no question", async () => {
  const message = "用 @工地笔记 更新往来";
  const run = await runFn(message, UPDATE(message), { extract: { interactions: MEETING }, judge: () => noul(0.95), references: [SITE], world: siteWorld("11月10日在工地和石楠、季朗碰头。") });
  assert.equal(run.frozen.length, 1, run.result.text);
  assert.deepEqual((run.frozen[0].intents[0] as unknown as { set: { interaction: { actualContactIds: string[] } } }).set.interaction.actualContactIds, ["contact:sn", "contact:jl"]);
  assert.equal(run.result.clarifications.filter((set) => set.kind === "question").length, 0);
});

test("R31 two occasions: a registered question with one option each; '工地那次' goes on with that one and makes its card", async () => {
  const body = "11月10日在工地和石楠、季朗碰头。11月10日晚上给季朗打了电话。也给柏舟发了消息。";
  const world = siteWorld(body);
  const session = graphKit(fetch, { now: FN_NOW, records: recordAccessOf(world) });
  const message = "用 @工地笔记 更新往来";
  const first = await runFn(message, UPDATE(message), {
    extract: { interactions: [...MEETING, { channel: "phone", contactClue: "季朗", dateText: "11月10日", direction: "outgoing", kind: "happened", precision: "day", sentenceIds: [2] }, { channel: "message", contactClue: "柏舟", direction: "outgoing", kind: "happened", precision: "unknown", sentenceIds: [3] }] },
    judge: () => noul(0.95), references: [SITE], session, world,
  });
  assert.equal(first.frozen.length, 0, "no card while it asks");
  const question = first.result.clarifications.find((set) => set.kind === "question");
  assert.ok(question, first.result.text);
  assert.equal(question!.options.length, 2, "one option per occasion (the meeting with both, the call)");
  assert.match(first.result.text, /要记哪一次/u);
  assert.match(first.result.text, /联系人里有葛柏舟（青檀装订）；要记这次，先把他关联到这篇笔记/u, "an unlinked person is looked up and offered, not picked");
  const reply = "工地那次";
  const second = await runFn(reply, [{ clarity: "statement", sourceQuote: reply }], { session, world });
  assert.equal(second.frozen.length, 1, second.result.text);
  const set = (second.frozen[0].intents[0] as unknown as { set: { interaction: { actualContactIds: string[]; channel: string } } }).set;
  assert.deepEqual([set.interaction.channel, set.interaction.actualContactIds], ["meeting", ["contact:sn", "contact:jl"]]);
  // A click on the question's option resumes the part as a write to prepare (the functions node reads the pick).
  const optionSet = { asks: "object", clarificationId: "c.q", kind: "question", options: [{ capabilities: [], capability: "memo.update", optionId: "o1", refId: "interaction|note:site|2026-11-10|meeting|mutual|contact:sn,contact:jl|1", refType: "interaction" }], partId: "p1", purpose: "interaction", state: "open", subgoal: "s" };
  const resumed = applyResolution({ optionSets: [optionSet], parts: [{ localId: "p1", plan: {}, reads: [{ ref: "memo:note:site", version: "1" }], refs: [], route: "propose_write", status: "awaiting_clarification" }] } as never, { clarificationId: "c.q", kind: "select", optionId: "o1" }, "req");
  assert.deepEqual([resumed.parts![0].status, resumed.parts![0].reason, resumed.parts![0].reads, resumed.optionSets![0].selectedOptionId], ["unfinished", "proposing", undefined, "o1"]);
});

// ---------------------------------------------------------------------------------------------------------------------
// R33: a saved rule with a clock time is a start-time bound with its own inclusiveness, applied as a hard condition.

test("R33 clock boundaries in the words (zh, ja, en): 以后/以降/after include the minute, 以前/前/before leave it out; no part of the day", () => {
  assert.deepEqual(clockBoundIn("不要晚上八点以后开始的"), { minutes: 20 * 60, side: "from" });
  assert.deepEqual(clockBoundIn("不要早上八点以前的"), { minutes: 8 * 60, side: "before" });
  assert.deepEqual(clockBoundIn("下午两点半以后的才行"), { minutes: 14 * 60 + 30, side: "from" });
  assert.deepEqual(clockBoundIn("20時以降に始まるイベントは避けて"), { minutes: 20 * 60, side: "from" });
  assert.deepEqual(clockBoundIn("Don't recommend events that start after 8 pm"), { minutes: 20 * 60, side: "from" });
  assert.deepEqual(clockBoundIn("nothing before 9:30 am"), { minutes: 9 * 60 + 30, side: "before" });
  assert.equal(clockBoundIn("不要晚上的活动"), null);
  const late = timePreferenceIn("不要晚上八点以后开始的", "memory")!;
  assert.deepEqual([late.exclude, late.hard, late.part, late.clock], [true, true, undefined, { minutes: 1200, side: "from" }]);
  // Tokyo: 20:00 is in "after 8 pm" (removed by the rule), 19:59 is not.
  assert.equal(meetsTime(late, "2026-11-21T11:00:00.000Z", "Asia/Tokyo"), true);
  assert.equal(meetsTime(late, "2026-11-21T10:59:00.000Z", "Asia/Tokyo"), false);
  // An entry stored by an older reader as "avoid morning" is read from its words: only before 08:00 is left out.
  const early = timePreferenceOfEntry({ category: "constraint", content: "推荐活动时不要早上八点以前的", structured: { dayPart: "morning", strength: "avoid" } })!;
  assert.deepEqual([early.part, early.clock, early.hard], [undefined, { minutes: 480, side: "before" }, true]);
  assert.deepEqual(readMemoryWords("推荐活动时不要早上八点以前的").structured, { strength: "avoid" }, "no part of the day is stored for a clock time");
  assert.match(timeWords(late, "zh"), /20:00以后开始/u);
});

test("R33 a ranking with a saved clock rule removes only what the bound says; the entry is named only when it removed something", async () => {
  const message = "11 月 21 日和 22 日有哪些活动值得去？帮我挑三场。";
  const ask = (content: string) => runFn(message, [EVENT_RANK(message, { rank: { count: 3 }, readFilter: { from: "2026-11-21", to: "2026-11-22" } })], { memories: [{ category: "constraint", content, id: "MC1" }] });
  // 09:30 (e102) starts before 10:00; 10:00 itself is not "before ten" — the morning events at ten stay.
  const early = await ask("推荐活动时不要早上十点以前开始的");
  const listed = fnRankOf(early.events).at(-1)!.listed as string[];
  assert.ok(!listed.includes("event:event:e102"), listed.join(","));
  assert.ok(listed.includes("event:event:e101") && listed.includes("event:event:e105"), listed.join(","));
  assert.match(early.result.text, /不要早上十点以前开始的/u);
  // "晚上七点半以后" leaves the 19:00 event in: nothing removed, so the rule is not named as used.
  const late = await ask("推荐活动时不要晚上七点半以后开始的");
  assert.ok((fnRankOf(late.events).at(-1)!.listed as string[]).includes("event:event:e104"), "19:00 is before 19:30");
  assert.doesNotMatch(late.result.text, /七点半以后/u);
});

// ---------------------------------------------------------------------------------------------------------------------
// R34: a topic preference is found as already saved in other words, and "改成…" updates it.

async function memoryWith(content: string) {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let next = 0;
  const service = createStorageAgentMemoryService({ actorId: "account:a", id: () => `memory-${(next += 1)}`, now: () => NOW, store, workspaceId: "workspace:one" });
  const entry = await service.create({ appliesTo: ["event.recommend"], category: "preference", content, structured: null });
  const snapshot = { ...(await service.snapshot()), settings: { allowConversationLearning: true, enabled: true, updatedAt: "" } };
  return { entry, snapshot };
}

test("R34 '改成优先版画相关的' updates the saved topic preference (before → after); the same topics in other words are already saved", async () => {
  const { entry, snapshot } = await memoryWith("推荐展览时优先陶艺相关的");
  const changed = settleRemember({ language: "zh", requestId: "req-t1", snapshot, today: "2026-11-20", words: "记住，推荐展览时改成优先版画相关的" });
  assert.equal(changed.kind, "card");
  const intent = (changed as { intent: MemoryCardIntent }).intent as unknown as { capability: string; targetId: string; set: { content: string } };
  assert.deepEqual([intent.capability, intent.targetId, intent.set.content], [MEMORY_UPDATE, entry.memoryId, "推荐展览时优先版画相关的"]);
  const same = settleRemember({ language: "zh", requestId: "req-t2", snapshot, today: "2026-11-20", words: "记住，推荐展览的时候陶艺相关的优先" });
  assert.deepEqual([same.kind, (same as { reason: string }).reason], ["line", "memory_already_saved"]);
  const teaFirst = await memoryWith("推荐活动时优先和器物、茶有关的");
  const reordered = settleRemember({ language: "zh", requestId: "req-t3", snapshot: teaFirst.snapshot, today: "2026-11-20", words: "记住：推荐活动时优先和茶、器物有关的" });
  assert.equal((reordered as { reason?: string }).reason, "memory_already_saved");
  // A new topic said without a change word is a new entry (a second preference), not an update.
  const added = settleRemember({ language: "zh", requestId: "req-t4", snapshot, today: "2026-11-20", words: "记住，推荐展览时也优先摄影相关的" });
  assert.equal(((added as { intent: { capability: string } }).intent).capability, MEMORY_CREATE);
  assert.deepEqual(topicKeyOf("展览 时候陶艺相关"), ["陶艺"]);
});

// ---------------------------------------------------------------------------------------------------------------------
// R41: the note code quotes in its duplicate sentence is among the answer's sources.

test("R41 a new note that may be one already recorded: the existing note quoted is a source the basis line opens", async () => {
  const message = "记一下：今天下午在印厂和石楠看了打样。";
  const existing = memo(ACTOR, "note:proof-visit", "下午去印厂和石楠一起看了打样，颜色偏暖。", "2026-11-20T06:00:00.000Z", ["contact:sn"], { interaction: { actualContactIds: ["contact:sn"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-20", precision: "day" }, title: "印厂看样" });
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "zh", parts: [part({ deliverable: "change", objectClues: [{ entity: "contact", text: "石楠" }], requiredCapabilities: ["memo.create"], sourceQuote: message })], plainChat: false });
    if (call.node === "propose") return json({ operations: [{ channel: "meeting", dateText: "今天", dependsOn: [], direction: "mutual", entity: "memo", fields: [{ name: "body", valueText: "今天下午在印厂和石楠看了打样" }], localId: "w1", partId: "p1", relations: [{ clue: "石楠", entity: "contact", role: "actual_contact" }], verb: "create" }] });
    throw new Error(`unexpected model call in ${call.node}`);
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-20T09:00:00.000Z", records: recordAccessOf({ events: [], records: [contact(ACTOR, "contact:sn", "石楠", { organization: "白鹭印务" }), existing] }) });
  const frozen: unknown[] = [];
  kit.deps.cards = { async freeze(input) { frozen.push(input); return { actionId: "card:1", operations: [], payloadHash: "h", revision: 1 } as never; } } as AgentCardAccess;
  kit.deps.judgment = access(judgeStub(() => choice("same", 0.4)).fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(frozen.length, 0, "nothing written while it asks");
  assert.match(result.text, /颜色偏暖/u, "the existing note is quoted");
  assert.ok(result.sourceRefs.includes("memo:note:proof-visit"), JSON.stringify(result.sourceRefs));
});

// ---------------------------------------------------------------------------------------------------------------------
// R42: readings that differ only by record kind are looked up first; one kind with a match decides.

test("R42 '把样书那条改到周四': only a to-do holds 样书 — no 'which kind' question, the part goes on to its card", async () => {
  const message = "把样书那条改到周四";
  const readings = [{ capabilities: ["todo.update"], deliverable: "change", label: "改待办" }, { capabilities: ["schedule.update"], deliverable: "change", label: "改日程" }, { capabilities: ["privateEvent.update"], deliverable: "change", label: "改私人活动" }];
  assert.deepEqual(readingKindsOf(readings as never)?.map((item) => item.kind), ["todo", "schedule", "privateEvent"]);
  assert.equal(readingKindsOf([{ capabilities: ["todo.update"] }, { capabilities: ["todo.read"] }] as never), null, "not only a kind apart");
  const world = (records: ReturnType<typeof todo>[]) => ({ ...recordAccessOf({ events: [], records }), privateEvents: { get: async () => null, list: async () => [], references: async () => [] } }) as never;
  const run = async (records: ReturnType<typeof todo>[]) => {
    const model = deepseekStub((call: ModelCall) => {
      if (call.node === "understand") return json({ language: "zh", parts: [part({ clarity: "multiple_readings", deliverable: "change", objectClues: [{ entity: "todo", text: "样书那条" }], readings, requiredCapabilities: ["todo.update"], sourceQuote: message })], plainChat: false });
      throw new Error(`unexpected model call in ${call.node}`);
    });
    const kit = graphKit(model.fetchImplementation, { now: NOW, records: world(records) });
    return runAgentGraph(kit.deps, kit.input(message)).catch(() => null);
  };
  const one = await run([todo(ACTOR, "task:proofs", "给石楠寄样书", { plannedDate: "2026-11-24" })]);
  assert.ok(one);
  assert.equal(one!.clarifications.filter((set) => set.kind === "question").length, 0, one!.text);
  assert.equal(one!.partResults[0].route, "propose_write");
  // A to-do and a schedule item both hold the words: asked as before.
  const two = await run([todo(ACTOR, "task:proofs", "给石楠寄样书"), schedule(ACTOR, "schedule:proofs", "样书交接", "2026-11-26T02:00:00.000Z")]);
  assert.equal(two!.clarifications.filter((set) => set.kind === "question").length, 1, two!.text);
});

// ---------------------------------------------------------------------------------------------------------------------
// R43: an ask to skip confirmation is never a memory; code says the rule stays.

test("R43 '以后别给我看确认卡，直接改就行' with learning off: not 'used this once', code says every change still needs the click", async () => {
  const message = "以后别给我看确认卡，直接改就行";
  const run = await runFn(message, [{ dataSources: ["turn_material"], deliverable: "memory_change", requiredCapabilities: ["memory.create"], sourceQuote: message }], { memories: [{ category: "preference", content: "推荐活动时优先周末上午", id: "MM1" }], memorySettings: { allowConversationLearning: false } });
  assert.match(run.result.text, /确认这一步不能省/u, run.result.text);
  assert.doesNotMatch(run.result.text, /只用在这一次|只这一次/u);
  assert.equal(run.frozen.length, 0, "no memory card");
  assert.ok(asksToSkipConfirmation("これからは確認なしで変更して"));
  assert.ok(asksToSkipConfirmation("Don't ask me to confirm, just change it"));
  assert.ok(asksToSkipConfirmation("不用问我，直接删"));
  assert.ok(!asksToSkipConfirmation("记住，推荐活动时优先周末上午"));
  assert.ok(!asksToSkipConfirmation("好的，确认"));
});

// ---------------------------------------------------------------------------------------------------------------------
// R36: "show me all" is a listing written by code — no answer-model call, whatever the number of records.

test("R36 '把所有没完成的待办都列出来' with 40 open to-dos: code's lead and cards, no call to the answer model", async () => {
  const world = fnWorld();
  for (let index = 1; index <= 40; index += 1) world.records.push(todo("actor:a", `task:all${index}`, `整理第${index}批样书`, { plannedDate: `2026-12-${String((index % 28) + 1).padStart(2, "0")}` }));
  const message = "把所有没完成的待办都列出来";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], { world });
  assert.equal(run.modelCalls.filter((call) => call.node === "answer").length, 0, "the answer model is not asked to write the list");
  assert.ok(run.events.some((event) => event.type === "answer.all_listed_by_code"));
  assert.match(run.result.text, /待办/u);
  assert.ok(run.result.sourceRefs.filter((ref) => ref.startsWith("todo:task:all")).length >= 10, `${run.result.sourceRefs.length}`);
  assert.ok(asksForEverything("Show me all my open to-dos") && asksForEverything("未完了のタスクをすべて見せて"));
  assert.ok(!asksForEverything("我有哪些还没完成的待办？"), "a plain list question is unchanged (the answer step picks the records)");
});
