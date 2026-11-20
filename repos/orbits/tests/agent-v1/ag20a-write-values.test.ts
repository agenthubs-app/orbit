import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveEventIntent } from "../../features/agent-v1/propose/events-resolve";
import { resolvePartIntents, type ResolveContext } from "../../features/agent-v1/propose/resolve";
import { resolveSaidDate } from "../../features/agent-v1/propose/dates";
import { durationMinutesOf, timeZoneOf } from "../../features/agent-v1/propose/times";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { recordAccessOf } from "./graph-kit";
import { contact, platformEvent } from "./read-kit";

/**
 * agent-design AG20a (independent suite first run, TRIAGE.md R5, R6, R7, R14), on this sprint's own data:
 * - R5 «我去过» on a private event and a schedule item made from an event do not demand a clock time (设计稿 §4, 附录 E
 *   `PrivateEvent.startsAt?`, `allDay?`): a day only is an all-day private event; an event's own start is the item's;
 * - R6 a new schedule item keeps the time zone the user named, the length they said (an end) and the person (附录 B);
 * - R7 a new to-do keeps a planned day and a deadline when both are said ("周四做，最迟周五中午", §3.5);
 * - R14 between two events of the same name, the month said and "我去了" (never a future event) decide before a question.
 */

const ACTOR = "user:a";
// Wednesday 2027-02-10, 10:00 in Tokyo.
const AS_OF = "2027-02-10T01:00:00.000Z";

function world() {
  return {
    events: [
      platformEvent("event:pot1", "陶艺入门讲座", "2027-01-16T05:00:00.000Z", "清澄白河"),
      platformEvent("event:pot2", "陶艺入门讲座", "2027-02-13T05:00:00.000Z", "清澄白河"),
      platformEvent("event:tea", "茶道体验课", "2027-02-13T01:00:00.000Z", "神乐坂", { endsAt: "2027-02-13T03:00:00.000Z" }),
    ],
    records: [contact(ACTOR, "contact:raf", "Rafael Ortiz", { organization: "Lisboa Sound" })],
  };
}

function ctxFor(message: string, extra: Partial<ResolveContext> = {}): ResolveContext & { createdEvents: { localId: string; title: string; day: string; time?: string }[] } {
  return { asOf: AS_OF, asked: new Map(), context: null, createdEvents: [], language: "zh", message, nameOf: () => null, people: [], records: recordAccessOf(world()), scope: { accountId: ACTOR, authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }, timeZone: "Asia/Tokyo", ...extra };
}

const at = (message: string, words: string): [number, number] => {
  const start = message.indexOf(words);
  assert.ok(start >= 0, `"${words}" is in the message`);
  return [start, start + words.length];
};
const partOf = (message: string) => ({ localId: "p1", quote: [0, message.length] as [number, number], refs: [] }) as never;
const intent = (fields: Partial<StoredIntent> & Pick<StoredIntent, "capability">): StoredIntent => ({ localId: "w1", relations: [], selector: [], ...fields });
const ready = (outcome: Awaited<ReturnType<typeof resolveEventIntent>>) => {
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  return (outcome as { ops: Record<string, unknown>[] }).ops;
};

test("R5: a private event said with a day only is an all-day event of that day; «我去过» on it needs no clock time", async () => {
  const message = "上周六我去了一个朋友办的陶艺市集，帮我建成私人活动并记上我去过。";
  const ctx = ctxFor(message);
  const created = ready(await resolveEventIntent(ctx, partOf(message), { intents: [], picks: {} }, intent({ capability: "privateEvent.create", date: at(message, "上周六"), title: at(message, "陶艺市集") })));
  assert.deepEqual(created[0].set, { allDay: true, startsAt: "2027-02-05T15:00:00.000Z", title: "陶艺市集" }, "00:00 of Saturday 02-06 in Tokyo, all day");
  const attended = ready(await resolveEventIntent(ctx, partOf(message), { intents: [], picks: {} }, intent({ after: "w1", capability: "attendance.create", localId: "w2" })));
  assert.equal((attended[0].set as { attendedOn: string }).attendedOn, "2027-02-06");
  // No day at all is still a question about the day, never a guess.
  const noDay = "帮我建一个私人活动叫读书会";
  const stop = await resolveEventIntent(ctxFor(noDay), partOf(noDay), { intents: [], picks: {} }, intent({ capability: "privateEvent.create", title: at(noDay, "读书会") }));
  assert.deepEqual([stop.kind, (stop as { reason?: string }).reason], ["stop", "date_unclear"]);
});

test("R5: 'last Saturday' is the past one; a bare weekday with «我去了» is the latest past one", () => {
  assert.equal(resolveSaidDate("上周六", AS_OF, "Asia/Tokyo")?.day, "2027-02-06");
  assert.equal(resolveSaidDate("上个星期一", AS_OF, "Asia/Tokyo")?.day, "2027-02-01");
  assert.equal(resolveSaidDate("先週の土曜日", AS_OF, "Asia/Tokyo")?.day, "2027-02-06");
  assert.equal(resolveSaidDate("last Saturday", AS_OF, "Asia/Tokyo")?.day, "2027-02-06");
  assert.equal(resolveSaidDate("周六", AS_OF, "Asia/Tokyo")?.day, "2027-02-13", "a bare weekday is still the next one");
});

test("R5: a schedule item made from an event takes the event's start and end when no time is said", async () => {
  const message = "把周六上午的茶道体验课加到我的日程";
  const ops = ready(await resolveEventIntent(ctxFor(message), partOf(message), { intents: [], picks: {} }, intent({ capability: "schedule.create", date: at(message, "周六上午"), events: [at(message, "茶道体验课")] })));
  const set = ops[0].set as Record<string, unknown>;
  assert.equal(set.startsAt, "2027-02-13T01:00:00.000Z");
  assert.equal(set.endsAt, "2027-02-13T03:00:00.000Z");
  assert.equal(set.title, "茶道体验课");
  assert.deepEqual(set.eventRefs, [{ id: "event:tea", kind: "platform" }]);
});

test("R6: the named time zone, the stated length and the person go on the new schedule item; the title loses the time words", async () => {
  const message = "约 Rafael 周四下午四点伦敦时间 call，45 分钟";
  for (const withModelSpans of [true, false]) {
    const stored = intent({ capability: "schedule.create", date: at(message, "周四"), relations: [{ quote: at(message, "Rafael"), role: "about" }], time: at(message, "下午四点伦敦时间"), title: at(message, "Rafael 周四下午四点伦敦时间 call"), ...(withModelSpans ? { duration: at(message, "45 分钟"), zone: at(message, "伦敦时间") } : {}) });
    const ops = ready(await resolveEventIntent(ctxFor(message), partOf(message), { intents: [], picks: {} }, stored));
    const set = ops[0].set as Record<string, unknown>;
    assert.equal(set.timeZone, "Europe/London", `model spans: ${withModelSpans}`);
    assert.equal(set.startsAt, "2027-02-11T16:00:00.000Z", "16:00 in London (GMT in February)");
    assert.equal(set.endsAt, "2027-02-11T16:45:00.000Z");
    assert.deepEqual(set.contactIds, ["contact:raf"]);
    assert.equal(set.title, "Rafael call");
    assert.deepEqual((ops[0].shown as { names?: Record<string, string> }).names, { "contact:raf": "Rafael Ortiz" });
  }
  assert.equal(timeZoneOf("下午四点伦敦时间"), "Europe/London");
  assert.equal(timeZoneOf("3pm New York time"), "America/New_York");
  assert.equal(timeZoneOf("15時（ロンドン時間）"), "Europe/London");
  assert.equal(timeZoneOf("下午四点"), null);
  assert.equal(durationMinutesOf("45 分钟"), 45);
  assert.equal(durationMinutesOf("一个半小时"), 90);
  assert.equal(durationMinutesOf("1時間"), 60);
  assert.equal(durationMinutesOf("for 30 minutes"), 30);
  assert.equal(durationMinutesOf("下午三点半"), null, "a clock time is not a length");
});

test("R7: '周四做，最迟周五中午' keeps both the planned day and the deadline", async () => {
  const message = "新建一条待办：交季度报表，周四做，最迟周五中午。";
  const ctx = ctxFor(message);
  for (const stored of [
    intent({ capability: "todo.create", date: at(message, "周四"), title: at(message, "交季度报表") }),
    intent({ capability: "todo.create", date: at(message, "周四"), due: at(message, "最迟周五中午"), title: at(message, "交季度报表") }),
    // The model put the deadline in the date: the words around it still tell them apart.
    intent({ capability: "todo.create", date: at(message, "周五中午"), title: at(message, "交季度报表") }),
  ]) {
    const outcome = await resolvePartIntents(ctx, partOf(message), { intents: [stored], picks: {} });
    const ops = ready(outcome as never);
    assert.deepEqual(ops[0].set, { dueAt: "2027-02-12T03:00:00.000Z", plannedDate: "2027-02-11", title: "交季度报表" }, JSON.stringify(stored));
  }
  // A deadline alone stays a deadline; a plain day stays a planned day.
  const only = "新建待办：交季度报表，最迟周五。";
  const due = ready(await resolvePartIntents(ctxFor(only), partOf(only), { intents: [intent({ capability: "todo.create", date: at(only, "周五"), title: at(only, "交季度报表") })], picks: {} }) as never);
  assert.deepEqual(due[0].set, { dueAt: "2027-02-12T14:59:00.000Z", title: "交季度报表" });
  assert.equal((due[0].shown as { dueDayOnly?: boolean } | undefined)?.dueDayOnly, true);
  const plain = "新建待办：交季度报表，周四做。";
  const planned = ready(await resolvePartIntents(ctxFor(plain), partOf(plain), { intents: [intent({ capability: "todo.create", date: at(plain, "周四"), title: at(plain, "交季度报表") })], picks: {} }) as never);
  assert.deepEqual(planned[0].set, { plannedDate: "2027-02-11", title: "交季度报表" });
});

test("R14: the month said and '我去了' pick one of two same-named events before any question", async () => {
  const run = async (message: string) => resolveEventIntent(ctxFor(message), partOf(message), { intents: [], picks: {} }, intent({ capability: "attendance.create", events: [at(message, "陶艺入门讲座")] }));
  const january = ready(await run("一月那场陶艺入门讲座我去了，帮我记上。"));
  assert.deepEqual((january[0].set as { eventRef: unknown }).eventRef, { id: "event:pot1", kind: "platform" });
  const past = ready(await run("陶艺入门讲座我去过了，记一下。"));
  assert.deepEqual((past[0].set as { eventRef: unknown }).eventRef, { id: "event:pot1", kind: "platform" }, "the 02-13 one has not happened yet");
  const english = "I went to the January 陶艺入门讲座, log it.";
  const en = ready(await resolveEventIntent(ctxFor(english, { language: "en" }), partOf(english), { intents: [], picks: {} }, intent({ capability: "attendance.create", events: [at(english, "陶艺入门讲座")] })));
  assert.deepEqual((en[0].set as { eventRef: unknown }).eventRef, { id: "event:pot1", kind: "platform" });
  // Nothing tells them apart (a schedule item, no month): still a question.
  const message = "把陶艺入门讲座加到我的日程";
  const ask = await resolveEventIntent(ctxFor(message), partOf(message), { intents: [], picks: {} }, intent({ capability: "attendance.create", events: [at(message, "陶艺入门讲座")] }));
  assert.equal(ask.kind, "ask");
});
