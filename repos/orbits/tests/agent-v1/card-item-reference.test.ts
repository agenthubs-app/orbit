import assert from "node:assert/strict";
import { test } from "node:test";

import { reviseCardByWords, type CardRevisionDeps, type FoundRecord } from "../../features/agent-v1/entry/card-revision";
import { createCardKit, decide, type CardKit } from "../services/agent-ledger-card-kit";

/**
 * Card revision by words on a card of several items, and on schedule items and notes (设计稿 §5.1; AE-XL-014 extended):
 *
 * - words that name one item — by its place (「第二条」「2つ目」"the second one"), its title words, its person (「王磊那条」),
 *   its time (「三点那个」) — change only that item; the others stay as they were;
 * - 「不是这个，是X那个」 moves the change of the item meant (the only one that can be, or the one the words name: 「不是小林那条」)
 *   to the record X — a to-do, a schedule item or a note — with the same change;
 * - words that fit no item, or several, are answered with a short question listing the items; the card is not changed.
 */

const SESSION = "session:ref";

async function freezeIn(kit: CardKit, intents: Parameters<NonNullable<CardKit["runtime"]["freezeCard"]>>[0]["intents"], locale = "zh") {
  const frozen = await kit.runtime.freezeCard!({ actionId: "card:req:ref", intents, locale, origin: { conversationId: SESSION, kind: "conversation", requestId: "req:ref" } });
  assert.ok(frozen.action, JSON.stringify(frozen));
  return frozen.action!;
}

const revise = (kit: CardKit, message: string, extra: Partial<CardRevisionDeps> = {}) => reviseCardByWords({ actorId: "actor:ref", message, now: kit.now, runtime: kit.runtime, sessionId: SESSION, store: null, timeZone: "Asia/Tokyo", ...extra });
const lines = async (kit: CardKit) => (await kit.runtime.getAction("card:req:ref"))!.operations.map((op) => op.preview);
const revisionOf = async (kit: CardKit) => (await kit.runtime.getAction("card:req:ref"))!.revision ?? 1;

/** Records found by words, as the executor reads them (title words; kind by kind). */
function finderOver(records: Partial<Record<"todo" | "schedule" | "memo", FoundRecord[]>>): NonNullable<CardRevisionDeps["findRecords"]> {
  return async (kind, words) => (records[kind] ?? []).filter((record) => record.title.includes(words));
}

async function threeTodos(kit: CardKit) {
  const a = await kit.todo("给王磊回电话", "2026-11-18");
  const b = await kit.todo("给李薇寄样片", "2026-11-18");
  const c = await kit.todo("整理展会报价单", "2026-11-18");
  await freezeIn(kit, [a, b, c].map((task) => ({ capability: "todo.update" as const, set: { plannedDate: "2026-11-19" }, targetId: task.id })));
  return { a, b, c };
}

test("several to-dos: the item named by its person, its place or its title words is the only one changed (zh, ja, en)", async () => {
  const kit = createCardKit();
  await threeTodos(kit);
  const byPerson = await revise(kit, "王磊那条改到周五");
  assert.ok(byPerson, "the words are about the card");
  assert.equal(byPerson!.actionPreview!.revision, 2);
  assert.deepEqual(await lines(kit), [
    "待办「给王磊回电话」：计划日 11月18日（周三） → 11月20日（周五）",
    "待办「给李薇寄样片」：计划日 11月18日（周三） → 11月19日（周四）",
    "待办「整理展会报价单」：计划日 11月18日（周三） → 11月19日（周四）",
  ]);
  const byPlace = await revise(kit, "第二条改到下周二");
  assert.ok(byPlace);
  assert.match((await lines(kit))[1], /→ 11月17日（周二）/u);
  assert.match((await lines(kit))[0], /→ 11月20日（周五）/u, "the first item keeps its change");
  assert.match((await lines(kit))[2], /→ 11月19日（周四）/u);
  const byTitle = await revise(kit, "报价单那项不要了");
  assert.ok(byTitle);
  assert.deepEqual((await lines(kit)).length, 2);
  assert.ok((await lines(kit)).every((line) => !line.includes("报价单")));

  const ja = createCardKit();
  await threeTodos(ja);
  assert.ok(await revise(ja, "2つ目を金曜に変更して"));
  assert.match((await lines(ja))[1], /给李薇寄样片」：计划日 11月18日（周三） → 11月20日（周五）/u);
  assert.match((await lines(ja))[0], /→ 11月19日/u);
  const en = createCardKit();
  await threeTodos(en);
  assert.ok(await revise(en, "move the third one to Friday"));
  assert.match((await lines(en))[2], /整理展会报价单」：计划日 11月18日（周三） → 11月20日（周五）/u);
  assert.match((await lines(en))[0], /→ 11月19日/u);
});

test("several items: words that fit no item, or several, get a short question listing the items; nothing is changed", async () => {
  const kit = createCardKit();
  const a = await kit.todo("回复王强的报价", "2026-11-18");
  const b = await kit.todo("回复田中的报价", "2026-11-18");
  const c = await kit.todo("订会议室", "2026-11-18");
  await freezeIn(kit, [a, b, c].map((task) => ({ capability: "todo.update" as const, set: { plannedDate: "2026-11-19" }, targetId: task.id })));
  const several = await revise(kit, "报价那条改到周五");
  assert.match(several!.text, /你说的是哪一项？卡上有「回复王强的报价」、「回复田中的报价」。卡片还没有改。/u);
  const none = await revise(kit, "张伟那条改到周五");
  assert.match(none!.text, /你说的是哪一项？卡上有「回复王强的报价」、「回复田中的报价」、「订会议室」。卡片还没有改。/u);
  const outOfRange = await revise(kit, "第五条不要了");
  assert.match(outOfRange!.text, /你说的是哪一项？/u);
  assert.equal(await revisionOf(kit), 1, "the card was not changed");
  assert.ok((await lines(kit)).every((line) => line.endsWith("11月19日（周四）")));
  // Words beside the reference that are another request are left to the graph.
  assert.equal(await revise(kit, "把张伟那个项目的预算表改到周五发给我"), null);
});

test("schedule items: the one named by its time or its title is changed; the other stays", async () => {
  const kit = createCardKit();
  await freezeIn(kit, [
    { capability: "schedule.create", set: { endsAt: "2026-11-18T07:00:00.000Z", startsAt: "2026-11-18T06:00:00.000Z", timeZone: "Asia/Tokyo", title: "和客户通话" }, shown: { events: [] } },
    { capability: "schedule.create", set: { endsAt: "2026-11-18T02:00:00.000Z", startsAt: "2026-11-18T01:00:00.000Z", timeZone: "Asia/Tokyo", title: "和设计师对稿" }, shown: { events: [] } },
  ] as never);
  assert.ok(await revise(kit, "三点那个改到下午五点"));
  assert.deepEqual(await lines(kit), ["新增 日程「和客户通话」：时间 11月18日（周三）17:00–18:00", "新增 日程「和设计师对稿」：时间 11月18日（周三）10:00–11:00"]);
  assert.ok(await revise(kit, "对稿那个改到周四"));
  assert.deepEqual(await lines(kit), ["新增 日程「和客户通话」：时间 11月18日（周三）17:00–18:00", "新增 日程「和设计师对稿」：时间 11月19日（周四）10:00–11:00"]);
});

test("a note and a to-do: 「王磊那条」 names the note by its person; only its day changes", async () => {
  const kit = createCardKit();
  await freezeIn(kit, [
    { capability: "memo.create", set: { body: "和王磊吃饭聊了展会", contactIds: ["contact:wl"], interaction: { actualContactIds: ["contact:wl"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-17", precision: "day" }, names: { "contact:wl": "王磊" }, title: "展会午餐" } },
    { capability: "todo.create", set: { plannedDate: "2026-11-19", title: "订会议室" } },
  ] as never);
  assert.ok(await revise(kit, "王磊那条改到周一"));
  const [memo, todo] = await lines(kit);
  assert.match(memo, /展会午餐」：实际往来对象 王磊，11月16日（周一），见面/u);
  assert.match(todo, /订会议室」，计划日 11月19日（周四）/u);
});

test("correction on a card of several to-dos: 「不是小林那条，是X那条」 moves only that item; a bare 「不是这条」 asks which item", async () => {
  const kit = createCardKit();
  const xiaolin = await kit.todo("给小林发修订报价", "2026-11-18");
  const wanglei = await kit.todo("给王磊回电话", "2026-11-18");
  const meant = await kit.todo("给李薇寄样片", "2026-11-12");
  await freezeIn(kit, [xiaolin, wanglei].map((task) => ({ capability: "todo.update" as const, set: { plannedDate: "2026-11-20" }, targetId: task.id })));
  const people = { [meant.id]: [{ id: "contact:liwei", name: "李薇" }] };
  const findRecords: NonNullable<CardRevisionDeps["findRecords"]> = async (kind, words) => kind === "todo" ? (await kit.listTasks()).filter((task) => task.status === "open" && task.title.includes(words)).map((task) => ({ id: task.id, people: people[task.id] ?? [], status: "open", title: task.title })) : [];
  const bare = await revise(kit, "不是这条，是给李薇寄样片那条", { findRecords });
  assert.match(bare!.text, /你说的是哪一项？卡上有「给小林发修订报价」、「给王磊回电话」。卡片还没有改。/u);
  assert.equal(await revisionOf(kit), 1);
  const named = await revise(kit, "不是小林那条，是给李薇寄样片那条", { findRecords });
  assert.equal(named!.actionPreview!.revision, 2);
  assert.deepEqual(await lines(kit), ["待办「给李薇寄样片」：计划日 11月12日（周四） → 11月20日（周五）", "待办「给王磊回电话」：计划日 11月18日（周三） → 11月20日（周五）"]);
  assert.deepEqual(named!.mentioned?.map((item) => [item.type, item.id]), [["todo", meant.id], ["contact", "contact:liwei"]]);
  const ja = createCardKit();
  const one = await ja.todo("見積もりを送る", "2026-11-18");
  const two = await ja.todo("会場を予約", "2026-11-18");
  const three = await ja.todo("名刺を発注", "2026-11-18");
  await freezeIn(ja, [one, two].map((task) => ({ capability: "todo.update" as const, set: { plannedDate: "2026-11-20" }, targetId: task.id })), "ja");
  const jaFind: NonNullable<CardRevisionDeps["findRecords"]> = async (kind, words) => kind === "todo" ? (await ja.listTasks()).filter((task) => task.title.includes(words)).map((task) => ({ id: task.id, people: [], status: "open", title: task.title })) : [];
  assert.ok(await revise(ja, "2つ目じゃなくて、名刺を発注の方", { findRecords: jaFind }));
  assert.match((await lines(ja))[1], /名刺を発注/u);
  assert.match((await lines(ja))[0], /見積もりを送る/u);
  assert.notEqual(three.id, two.id);
});

const STANDUP: FoundRecord = { endsAt: "2026-11-18T00:30:00.000Z", id: "schedule:standup", people: [], recurrence: null, startsAt: "2026-11-18T00:00:00.000Z", timeZone: "Asia/Tokyo", title: "晨会" };
const WEEKLY: FoundRecord = { endsAt: "2026-11-19T06:00:00.000Z", id: "schedule:weekly", people: [{ id: "contact:wl", name: "王磊" }], recurrence: null, startsAt: "2026-11-19T05:00:00.000Z", timeZone: "Asia/Tokyo", title: "产品周会" };

test("correction of a schedule item: 「不是这个，是周会那个」 — the same new time on the other item, on its own day and length", async () => {
  const kit = createCardKit();
  await freezeIn(kit, [{ capability: "schedule.update", set: { endsAt: "2026-11-18T01:30:00.000Z", scope: "whole_series", startsAt: "2026-11-18T01:00:00.000Z" }, shown: { before: { endsAt: STANDUP.endsAt, startsAt: STANDUP.startsAt }, repeats: null, timeZone: "Asia/Tokyo", title: "晨会" }, targetId: STANDUP.id }] as never);
  const findRecords = finderOver({ schedule: [STANDUP, WEEKLY] });
  const result = await revise(kit, "不是这个，是周会那个", { findRecords });
  assert.ok(result);
  assert.equal(result!.actionPreview!.revision, 2);
  assert.deepEqual(await lines(kit), ["改 日程「产品周会」：时间 14:00–15:00 → 10:00–11:00（关联的人和笔记保留。）"]);
  assert.match(result!.text, /卡上改的是「产品周会」，不再是「晨会」/u);
  assert.deepEqual(result!.mentioned?.map((item) => [item.type, item.id]), [["schedule", WEEKLY.id], ["contact", "contact:wl"]]);
  const op = (await kit.runtime.getAction("card:req:ref"))!.operations[0];
  assert.equal(op.targetRef?.id, WEEKLY.id);
  // A deletion moves too; none found is said.
  const del = createCardKit();
  await freezeIn(del, [{ capability: "schedule.delete", set: { scope: "single" }, shown: { repeats: null, startsAt: STANDUP.startsAt, timeZone: "Asia/Tokyo", title: "晨会" }, targetId: STANDUP.id }] as never);
  assert.match((await revise(del, "不是这个，是读书会那个", { findRecords }))!.text, /没有找到「读书会」这个日程，卡片没有改/u);
  assert.ok(await revise(del, "not this one, the 产品周会 one", { findRecords }));
  assert.deepEqual(await lines(del), ["删除 日程「产品周会」：时间 11月19日（周四）14:00"]);
});

test("correction of a note: 「不是这个，是X那个笔记」 unlinks the same event from that note; a note without that event is said", async () => {
  const kit = createCardKit();
  await freezeIn(kit, [{ before: { eventRefs: [{ id: "ev:tea", kind: "private" }] }, capability: "memo.update", expectedVersion: 2, links: true, set: { eventRefs: [] }, shown: { events: { after: [], before: ["校友茶会"] }, title: "茶会纪要" }, targetId: "note:tea" }] as never);
  const notes: FoundRecord[] = [
    { eventRefs: [{ id: "ev:tea", kind: "private" }, { id: "ev:expo", kind: "private" }], id: "note:recap", people: [], title: "茶会后的跟进", version: 5 },
    { eventRefs: [], id: "note:plain", people: [], title: "展会想法", version: 1 },
  ];
  const findRecords = finderOver({ memo: notes });
  const wrong = await revise(kit, "不是这个，是展会想法那个", { findRecords });
  assert.match(wrong!.text, /「展会想法」没有关联「校友茶会」，卡片没有改/u);
  const moved = await revise(kit, "不是这条，是茶会后的跟进那条笔记", { findRecords });
  assert.ok(moved);
  const op = (await kit.runtime.getAction("card:req:ref"))!.operations[0];
  assert.equal(op.targetRef?.id, "note:recap");
  assert.deepEqual((op.payload as { eventRefs?: unknown; patch?: unknown }).eventRefs ?? (op.after as { eventRefs?: unknown }).eventRefs, [{ id: "ev:expo", kind: "private" }]);
  assert.match((await lines(kit))[0], /笔记「茶会后的跟进」/u);
  assert.equal(kit.executorCalls.length, 0);
});

test("a correction on a card of a to-do and a schedule item: X found only among schedule items moves the schedule item", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  await freezeIn(kit, [
    { capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id },
    { capability: "schedule.update", set: { endsAt: "2026-11-18T01:30:00.000Z", scope: "whole_series", startsAt: "2026-11-18T01:00:00.000Z" }, shown: { before: { endsAt: STANDUP.endsAt, startsAt: STANDUP.startsAt }, repeats: null, timeZone: "Asia/Tokyo", title: "晨会" }, targetId: STANDUP.id },
  ] as never);
  assert.ok(await revise(kit, "不是这个，是产品周会那个", { findRecords: finderOver({ schedule: [STANDUP, WEEKLY] }) }));
  const [first, second] = await lines(kit);
  assert.match(first, /给小林发修订报价/u);
  assert.match(second, /产品周会/u);
  void decide;
});
