import assert from "node:assert/strict";
import test from "node:test";

import { resolveEventIntent } from "../../features/agent-v1/propose/events-resolve";
import { resolveSaidTimes } from "../../features/agent-v1/propose/times";
import { ACTOR, createCardKit, decide, freeze, type CardKit } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG13-3 (设计稿 §4, 附录 B 个人日程; PLANNER 易错边界 3): changing one time of a repeating schedule item
 * writes one exception and leaves the series and its other times as they are (its people and notes stay); the whole
 * series changes the series. Repetitions the product cannot store are said so, with one-off dates offered; no card.
 */

async function series(kit: CardKit) {
  const created = await kit.schedule.create(ACTOR, { contactIds: undefined, idempotencyKey: "s10", recurrence: { frequency: "weekly" }, startsAt: "2026-11-16T01:00:00.000Z", endsAt: "2026-11-16T02:00:00.000Z", timeZone: "Asia/Tokyo", title: "团队周会" } as never);
  return created.scheduleItem;
}

const list = async (kit: CardKit, collectionName: string) => kit.store.listRecords({ collectionName, limit: "unbounded", userId: ACTOR, workspaceId: kit.workspaceId });

test("only this time: one exception for 11-16, the series and the next Monday stay 10:00–11:00", async () => {
  const kit = createCardKit({ start: "2026-11-15T01:00:00.000Z" });
  const item = await series(kit);
  const card = await freeze(kit, [{ capability: "schedule.update", partId: "p1", set: { endsAt: "2026-11-16T06:00:00.000Z", occurrenceDate: "2026-11-16", scope: "this_occurrence", startsAt: "2026-11-16T05:00:00.000Z" }, shown: { before: { endsAt: "2026-11-16T02:00:00.000Z", startsAt: "2026-11-16T01:00:00.000Z" }, repeats: "weekly", timeZone: "Asia/Tokyo", title: "团队周会" }, targetId: item.id }]);
  const op = card.operations[0];
  assert.equal(op.display?.record, "日程「团队周会」 · 只改这一次");
  assert.deepEqual(op.display?.rows.map((row) => [row.label, row.before ?? null, row.after]), [["哪一次", null, "11月16日（周一）"], ["时间", "10:00–11:00", "14:00–15:00"]]);
  assert.equal(op.display?.note, "以后每周一照旧 10:00–11:00。");
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const exceptions = await list(kit, "personal_schedule_occurrence_exceptions");
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].recordId, `${item.id}:occurrence:2026-11-16`);
  const stored = (await list(kit, "personal_schedule_items"))[0].payload as { startsAt: string; recurrence: unknown };
  assert.equal(stored.startsAt, "2026-11-16T01:00:00.000Z", "the series is unchanged");
  assert.deepEqual(stored.recurrence, { frequency: "weekly" });
  const next = await kit.schedule.get({ actorId: ACTOR, id: `${item.id}:occurrence:2026-11-23` });
  assert.equal(next.startsAt, "2026-11-23T01:00:00.000Z");
  const moved = await kit.schedule.get({ actorId: ACTOR, id: `${item.id}:occurrence:2026-11-16` });
  assert.equal(moved.startsAt, "2026-11-16T05:00:00.000Z");
});

test("the whole series: the series' time changes; the repetition stays", async () => {
  const kit = createCardKit({ start: "2026-11-15T01:00:00.000Z" });
  const item = await series(kit);
  const card = await freeze(kit, [{ capability: "schedule.update", partId: "p1", set: { endsAt: "2026-11-16T03:00:00.000Z", scope: "whole_series", startsAt: "2026-11-16T02:00:00.000Z" }, shown: { before: { endsAt: "2026-11-16T02:00:00.000Z", startsAt: "2026-11-16T01:00:00.000Z" }, repeats: "weekly", timeZone: "Asia/Tokyo", title: "团队周会" }, targetId: item.id }], "action:series", "ja");
  assert.equal(card.operations[0].display?.record, "予定「团队周会」 · シリーズ全体 · 毎週月曜");
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await list(kit, "personal_schedule_occurrence_exceptions")).length, 0);
  const stored = (await list(kit, "personal_schedule_items"))[0].payload as { startsAt: string; endsAt: string; recurrence: unknown };
  assert.deepEqual([stored.startsAt, stored.endsAt, stored.recurrence], ["2026-11-16T02:00:00.000Z", "2026-11-16T03:00:00.000Z", { frequency: "weekly" }]);
});

test("the time changed since the card was shown: nothing is written (a permanent failure)", async () => {
  const kit = createCardKit({ start: "2026-11-15T01:00:00.000Z" });
  const item = await series(kit);
  const card = await freeze(kit, [{ capability: "schedule.update", partId: "p1", set: { occurrenceDate: "2026-11-16", scope: "this_occurrence", startsAt: "2026-11-16T05:00:00.000Z" }, shown: { before: { endsAt: "2026-11-16T02:00:00.000Z", startsAt: "2026-11-16T00:30:00.000Z" }, repeats: "weekly", timeZone: "Asia/Tokyo", title: "团队周会" }, targetId: item.id }]);
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await list(kit, "personal_schedule_occurrence_exceptions")).length, 0);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "failed");
});

test("times in words: 下午两点到三点, 上午十点到十二点, 11時から12時, 2pm, 下午三点开始", () => {
  assert.deepEqual(resolveSaidTimes("下午两点到三点"), { end: "15:00", start: "14:00" });
  assert.deepEqual(resolveSaidTimes("明天上午十点到十二点的东京街头摄影展"), { end: "12:00", start: "10:00" });
  assert.deepEqual(resolveSaidTimes("これからはずっと11時から12時に変更して"), { end: "12:00", start: "11:00" });
  assert.deepEqual(resolveSaidTimes("It started at 2pm in Ebisu"), { start: "14:00" });
  assert.deepEqual(resolveSaidTimes("改到下午三点开始"), { start: "15:00" });
  assert.deepEqual(resolveSaidTimes("晚上七点"), { start: "19:00" });
});

test("隔周 / 每月第二个周二 / 共几次: said not to be supported, a few one-off dates offered, no card", async () => {
  const records = { listEvents: async () => [], maxPages: 1, reader: { read: async () => ({ items: [], partialReasons: [] }) }, scope: () => ({ accountId: ACTOR, authorizationEpoch: "e", workspaceId: "w" }), source: {} as never, visible: async () => new Set<string>() };
  const ctx = { asOf: "2026-11-15T01:00:00.000Z", asked: new Map(), context: null, language: "zh" as const, message: "", nameOf: () => null, people: [], records: records as never, scope: { accountId: ACTOR, authorizationEpoch: "e", workspaceId: "w" }, timeZone: "Asia/Tokyo" };
  const run = (message: string, capability: "schedule.create" | "schedule.update") => resolveEventIntent({ ...ctx, message }, { localId: "p1", quote: [0, message.length], refs: [] } as never, { intents: [], picks: {} }, { capability, localId: "w1", relations: [], selector: [] });
  const biweekly = await run("帮我建一个隔周周三下午三点到四点的例会，叫产品同步。", "schedule.create");
  assert.equal(biweekly.kind, "stop");
  assert.match((biweekly as { line: string }).line, /「隔周」这种重复方式现在还不支持.*11月18日（周三）、12月2日（周三）/u);
  const monthly = await run("那改成每月第二个周二下午三点到四点呢？", "schedule.update");
  assert.match((monthly as { line: string }).line, /「每月第二个周二」这种重复方式现在还不支持.*12月8日（周二）/u);
  const count = await run("每周一上午十点开会，共5次", "schedule.create");
  assert.match((count as { line: string }).line, /「共5次」这种重复方式现在还不支持/u);
});
