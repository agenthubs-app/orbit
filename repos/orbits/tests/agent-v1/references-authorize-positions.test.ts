import assert from "node:assert/strict";
import test from "node:test";

import { agentSendInputSchema, referencePositionProblem } from "../../shared/api-schema/agent-v1";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { ownEventsOf } from "../../features/agent-v1/domains/event/read";
import { createMemoryRecordSource } from "../../features/agent-v1/domains/source";
import { authorizeReferences } from "../../features/agent-v1/references/authorize";
import { bindMarkedReferences } from "../../features/agent-v1/references/marks";
import { referenceAuthorizer } from "../../features/agent-v1/graph/executor";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { A, B, CURSOR_KEY, memo, scopeOf, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG11-2 (设计稿 §3.6, 附录 E 消息引用): each @ reference carries its marker's place in the message; a
 * position outside the message, two overlapping markers or a place that is not a marker are refused; two markers with
 * the same words are two records in the order they appear; the server reads by type and id only and checks them every
 * turn — another account's record or a deleted one is REFERENCE_NOT_ACCESSIBLE. AG11 also opens «我去过» and private
 * events by id (the account's own only).
 */

const send = (message: string, references: unknown[]) => agentSendInputSchema.safeParse({ clientMessageId: "message:1", locale: "zh", message, protocolVersion: 3, references, sessionId: "session:1" });

test("positions: in the message, on an @ marker, not overlapping; both or neither; eventKind only on events", () => {
  const message = "根据 @客户访谈，看看 @回复田中的询价 的截止时间";
  const memoAt = message.indexOf("@客户访谈");
  const todoAt = message.indexOf("@回复田中的询价");
  assert.equal(send(message, [{ end: memoAt + 5, id: "note:m37", start: memoAt, type: "memo" }, { end: todoAt + 8, id: "task:t44", start: todoAt, type: "todo" }]).success, true);
  assert.equal(send(message, [{ id: "note:m37", type: "memo" }]).success, true, "an old client without positions is still accepted");
  assert.equal(send(message, [{ end: message.length + 3, id: "note:m37", start: memoAt, type: "memo" }]).success, false, "outside the message");
  assert.equal(send(message, [{ end: memoAt + 4, id: "note:m37", start: memoAt + 1, type: "memo" }]).success, false, "not on the @");
  assert.equal(send(message, [{ end: memoAt + 5, id: "note:m37", start: memoAt, type: "memo" }, { end: memoAt + 4, id: "note:m61", start: memoAt, type: "memo" }]).success, false, "overlapping markers");
  assert.equal(send(message, [{ id: "note:m37", start: memoAt, type: "memo" }]).success, false, "start without end");
  assert.equal(send(message, [{ end: memoAt + 5, eventKind: "platform", id: "note:m37", start: memoAt, type: "memo" }]).success, false, "eventKind on a memo");
  // The message is trimmed before the positions are checked: clients count from the trimmed text.
  assert.equal(send(`  ${message}`, [{ end: memoAt + 5, id: "note:m37", start: memoAt, type: "memo" }]).success, true);
  assert.deepEqual(referencePositionProblem("@a @b", [{ end: 2, start: 0 }, { end: 5, start: 3 }]), null);
});

test("the same record marked twice keeps both markers; a type that does not fit the id is not accessible", async () => {
  const { registry } = { registry: createDomainRegistry({ cursorKey: CURSOR_KEY, events: { async byIds() { return smallWorld().events; } }, now: () => "2026-11-15T01:00:00.000Z", source: createMemoryRecordSource(smallWorld().records) }) };
  const results = await authorizeReferences(registry, scopeOf(A), [
    { end: 5, id: "note:m37", start: 0, type: "memo" },
    { end: 13, id: "note:m37", start: 8, type: "memo" },
    { id: "event:e103", type: "event", eventKind: "private" },
    { id: "event:e103", type: "attendance" },
  ]);
  assert.deepEqual(results.map((item) => [item.type, item.id, item.accessible, item.marks ?? null]), [
    ["memo", "note:m37", true, [[0, 5], [8, 13]]],
    ["event", "event:e103", false, null],
    ["attendance", "event:e103", false, null],
  ]);
});

function ownWorld() {
  const world = smallWorld();
  const attendance = new Map([
    ["attendance:a1", { accountId: A, attendedOn: "2026-11-08", dayParts: ["evening"], eventRef: { id: "private_event:p1", kind: "private" as const }, id: "attendance:a1", selfNote: "见到了十年没见的室友", updatedAt: "2026-11-09T00:00:00.000Z", version: 1 }],
    ["attendance:b1", { accountId: B, attendedOn: "2026-11-08", eventRef: { id: "private_event:pb", kind: "private" as const }, id: "attendance:b1", selfNote: "乙的自述", updatedAt: "2026-11-09T00:00:00.000Z", version: 1 }],
  ]);
  const privateEvents = new Map([["private_event:p1", { accountId: A, id: "private_event:p1", startsAt: "2026-11-08T10:00:00.000Z", title: "大学同学聚会", updatedAt: "2026-11-01T00:00:00.000Z", version: 1 }]]);
  const byIds = async (ids: readonly string[]) => world.events.filter((event) => ids.includes(event.eventId));
  const own = ownEventsOf({
    attendance: { async get(actorId, id) { const note = attendance.get(id); return note && note.accountId === actorId ? note : null; } },
    byIds,
    privateEvents: { async get(actorId, id) { const event = privateEvents.get(id); return event && event.accountId === actorId ? event : null; } },
  });
  return { byIds, own, world };
}

test("«我去过» and a private event are read by id for their own account only", async () => {
  const { byIds, own, world } = ownWorld();
  const registry = createDomainRegistry({ cursorKey: CURSOR_KEY, events: { byIds, own }, now: () => "2026-11-15T01:00:00.000Z", source: createMemoryRecordSource(world.records) });
  const mine = await authorizeReferences(registry, scopeOf(A), [{ id: "attendance:a1", type: "attendance" }, { eventKind: "private", id: "private_event:p1", type: "event" }, { id: "attendance:b1", type: "attendance" }]);
  assert.deepEqual(mine.map((item) => [item.id, item.accessible, item.name]), [["attendance:a1", true, "大学同学聚会"], ["private_event:p1", true, "大学同学聚会"], ["attendance:b1", false, null]]);
  assert.equal(mine[0].view?.fields.selfNote, "见到了十年没见的室友");
  assert.equal(mine[0].view?.fields.kind, "attendance");
  const theirs = await authorizeReferences(registry, scopeOf(B), [{ id: "attendance:a1", type: "attendance" }]);
  assert.deepEqual([theirs[0].accessible, theirs[0].reason], [false, "REFERENCE_NOT_ACCESSIBLE"]);
});

test("markers bind by where they sit: same words, two records, in order; a marker no clue took becomes a clue", () => {
  const message = "@客户访谈 和 @客户访谈 这两篇里，两位客户各自最在意什么？";
  const first: [number, number] = [0, 5];
  const second: [number, number] = [message.indexOf("@客户访谈", 1), message.indexOf("@客户访谈", 1) + 5];
  const references = [{ id: "note:m37", marks: [first], type: "memo" }, { id: "note:m61", marks: [second], type: "memo" }];
  // The first layer found both clues at the first occurrence and bound both to the first record.
  const refs = [{ entity: "memo", quote: first, recordId: "note:m37" }, { entity: "memo", quote: first, recordId: "note:m37" }];
  const out = bindMarkedReferences({ make: (entity, recordId, quote) => ({ entity, quote, recordId }), message, part: [0, message.length], references, refs });
  assert.deepEqual(out.refs.map((ref) => [ref.recordId, ref.quote]), [["note:m37", first], ["note:m61", second]]);
  // Only one clue: the second marker is added.
  const one = bindMarkedReferences({ make: (entity, recordId, quote) => ({ entity, quote, recordId }), message, part: [0, message.length], references, refs: [{ entity: "memo", quote: first, recordId: null }] });
  assert.deepEqual(one.refs.map((ref) => ref.recordId), ["note:m37", "note:m61"]);
  assert.deepEqual(one.bound.map((item) => item.added), [false, true]);
  // A marker outside the part is not this part's.
  const outside = bindMarkedReferences({ make: (entity, recordId, quote) => ({ entity, quote, recordId }), message, part: [second[1], message.length], references, refs: [] });
  assert.deepEqual(outside.refs, []);
});

const ACTOR = "actor:a";

function worldOfActor() {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === A) record.userId = ACTOR;
  for (const record of world.records) if (record.collection === "notes") (record.payload.note as Record<string, unknown>).accountId = record.userId;
  world.records.push(memo(ACTOR, "note:m61", "王强说他们最在意售后响应速度，希望合同里写明四小时内答复。", "2026-11-13T08:00:00.000Z", [], { title: "客户访谈" }));
  world.records.push(todo(ACTOR, "task:t44", "回复田中的询价", { dueAt: "2026-11-17T09:00:00.000Z" }));
  return world;
}

test("a marker is the record picked now, not the one of the same name answered last turn (AE-SCL-021)", async () => {
  const message = "那 @客户访谈 这一篇呢？";
  const records = recordAccessOf(worldOfActor());
  const at = message.indexOf("@客户访谈");
  const model = deepseekStub([
    (call) => {
      const last = /\[records: (r\d)\]/u.exec(call.user)![1];
      return json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: last, text: "@客户访谈" }], requiredCapabilities: ["memo.read"], sourceQuote: message })], plainChat: false });
    },
    (call) => {
      assert.match(call.user, /售后响应速度/u);
      const handle = /(s\d+) — memo/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "这篇说王强最在意售后响应速度。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ role: "user", text: "@客户访谈 里说了什么？" }, { recordRefs: ["memo:note:m37"], role: "assistant", text: "田中最在意交付周期。" }], records, state: { lastMentioned: [{ id: "note:m37", name: "客户访谈", type: "memo" }], openItems: [], updatedAt: "2026-11-15T09:59:00.000Z" } as never });
  await kit.seeded;
  kit.deps.authorizeReferences = referenceAuthorizer(records);
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ end: at + 5, id: "note:m61", start: at, type: "memo" }] }));
  assert.deepEqual(result.sourceRefs, ["memo:note:m61"], JSON.stringify({ parts: result.partResults, text: result.text }));
  assert.equal(records.source.reads.includes("note:m37"), false, "the earlier note is not read again");
});

test("one attached record cannot be opened: the other is still read and answered, the closed one is asked again (AE-REF-006)", async () => {
  const message = "根据 @客户笔记，看看 @回复田中的询价 的截止时间来不来得及。";
  const records = recordAccessOf(worldOfActor());
  const noteAt = message.indexOf("@客户笔记");
  const todoAt = message.indexOf("@回复田中的询价");
  const model = deepseekStub([
    () => json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", text: "@客户笔记" }, { entity: "todo", text: "@回复田中的询价" }, { entity: "todo", text: "截止时间" }], requiredCapabilities: ["memo.read", "todo.read"], sourceQuote: message })], plainChat: false }),
    (call) => {
      assert.doesNotMatch(call.user, /降价/u);
      assert.match(call.user, /cannot be opened now/u);
      const handle = /(s\d+) — to-do/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "「回复田中的询价」的截止时间是 11 月 17 日 18:00。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  kit.deps.authorizeReferences = referenceAuthorizer(records);
  // note:mb1 belongs to another account.
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ end: noteAt + 5, id: "note:mb1", start: noteAt, type: "memo" }, { end: todoAt + 8, id: "task:t44", start: todoAt, type: "todo" }] }));
  assert.deepEqual(result.partResults.map((item) => [item.partId, item.status, item.gaps]), [["p1", "answered", ["unreadable"]]]);
  assert.deepEqual(result.sourceRefs, ["todo:task:t44"]);
  assert.match(result.text, /「@客户笔记」打不开/u);
  assert.match(result.text, /11 月 17 日/u);
  assert.equal(records.source.reads.includes("note:mb1"), false, "the other account's note is never read");
  assert.deepEqual(records.source.reads.filter((id) => id.startsWith("note:")), [], "no other note is searched in place of the closed one (AE-REF-008)");
});

test("comparing the events the user picked reads those events by id, not every event of the deployment (AE-REF-002)", async () => {
  const { fnWorld, runFn } = await import("./functions-kit");
  const world = fnWorld();
  const records = recordAccessOf(world);
  const asked: string[][] = [];
  let listed = 0;
  records.listEvents = async () => { listed += 1; return world.events; };
  records.eventsByIds = async (ids) => { asked.push([...ids]); return world.events.filter((event) => ids.includes(event.eventId)); };
  const { graphKit: kitOf } = await import("./graph-kit");
  const session = kitOf((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T10:00:00.000Z", records });
  const message = "对比一下 @街拍工作坊 和 @SaaS 定价研讨会 的时间";
  const references = [{ id: "event:e102", name: "街拍工作坊", type: "event" }, { id: "event:e103", name: "SaaS 定价研讨会", type: "event" }];
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "comparison", objectClues: [{ entity: "event", referenceId: "r1", text: "@街拍工作坊" }, { entity: "event", referenceId: "r2", text: "@SaaS 定价研讨会" }], requiredCapabilities: ["event.read", "fn.compare"], sourceQuote: message }], { references, session, world });
  assert.match(run.result.text, /街拍工作坊/u);
  assert.equal(listed, 0, "no listing of every event");
  assert.deepEqual(asked, [["event:e102", "event:e103"]]);
});

test("one picked event and one picked schedule item are not an event comparison: both are read and answered (App check)", async () => {
  const { fnWorld, runFn } = await import("./functions-kit");
  const { schedule } = await import("./read-kit");
  const world = fnWorld();
  world.records.push(schedule("actor:a", "personal:s11", "和田中午餐", "2026-11-19T03:00:00.000Z"));
  const message = "@和田中午餐 和 @SaaS 定价研讨会 是同一天吗？";
  // The event is both a clue of the part and an @ reference: one event, not two.
  const references = [{ id: "personal:s11", name: "和田中午餐", type: "schedule" }, { id: "event:e103", name: "SaaS 定价研讨会", type: "event" }];
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "comparison", objectClues: [{ entity: "schedule", referenceId: "r1", text: "@和田中午餐" }, { entity: "event", referenceId: "r2", text: "@SaaS 定价研讨会" }], requiredCapabilities: ["schedule.read", "event.read", "fn.compare"], sourceQuote: message }], {
    answer: (call) => {
      const lunch = /(s\d+) — personal schedule item/u.exec(call.user)![1];
      const seminar = /(s\d+) — platform event/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: lunch }, { sentenceIds: [1], sourceRef: seminar }], partId: "p1", text: "是同一天，都在 11 月 19 日。" }] });
    },
    references,
    world,
  });
  assert.equal(run.events.some((event) => event.type === "functions.compared"), false, "no event comparison of a single event");
  assert.deepEqual([...run.result.sourceRefs].sort(), ["event:event:e103", "schedule:personal:s11"]);
});

test("an @ «我去过» is read by its id and its own sentence reaches the answer (AE-REF-002)", async () => {
  const message = "@大学同学聚会 那次我自己记了什么？";
  const { byIds, own, world } = ownWorld();
  for (const record of world.records) if (record.userId === A) record.userId = ACTOR;
  const base = recordAccessOf(world);
  const ownOfActor: typeof own = (actorId, id) => own(actorId === ACTOR ? A : actorId, id);
  const reader = createDomainRegistry({ cursorKey: CURSOR_KEY, events: { byIds, own: ownOfActor }, now: () => "2026-11-15T01:00:00.000Z", source: base.source });
  const records = { ...base, reader };
  const model = deepseekStub([
    () => json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "attendance", text: "@大学同学聚会" }], requiredCapabilities: ["attendance.read"], sourceQuote: message })], plainChat: false }),
    (call) => {
      assert.match(call.user, /The user wrote: 见到了十年没见的室友/u);
      const handle = /(s\d+) — «I went»/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [4], sourceRef: handle }], partId: "p1", text: "你记的是“见到了十年没见的室友”。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  kit.deps.authorizeReferences = referenceAuthorizer(records);
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ end: 7, id: "attendance:a1", start: 0, type: "attendance" }] }));
  assert.deepEqual(result.sourceRefs, ["event:attendance:a1"]);
  assert.match(result.text, /十年没见的室友/u);
});
