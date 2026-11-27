// 2026-11-27 用户定：报名成功后自动加入日历（可移除）；日历跟审批 / 中止 / 改期 / 取消联动。
import assert from "node:assert/strict";
import test from "node:test";

import { createJoinService, joinCalendarKey, type JoinPorts, type JoinTentativeRecord } from "../../features/events/journey/join";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { createHostRoutes, type HostJoinCalendar } from "../../features/events/host/handlers";
import { eventJoinCalendarRemoveResultSchema, eventJoinResultSchema } from "../../shared/api-schema/event-join";
import { JOURNEY_EVENT_ID } from "../../shared/mock/demo-world/events-journey";

type Status = Awaited<ReturnType<JoinPorts["registrationStatus"]>>;
const answer = { answer: "VC", field: "targetAttendees", prompt: "q", questionToken: "t" };

/** 个人日程服务的替身：同一个账号同一个幂等键只建一条（同 personal-schedule 的回执），删掉的就不在了。 */
function world(initial: Status = "none") {
  const calls: string[] = [];
  const receipts = new Map<string, string>();
  const items = new Map<string, { title: string; startsAt: string; endsAt: string; owner: string }>();
  const records = new Map<string, JoinTentativeRecord>();
  const status = new Map<string, Status>();
  let event: { title: string; startsAt: string; endsAt: string | null; review: boolean; registrationClosesAt: string | null } | null = { endsAt: "2026-12-10T12:30:00.000Z", registrationClosesAt: "2026-12-08T14:59:00.000Z", review: true, startsAt: "2026-12-10T10:00:00.000Z", title: "CFO Night Tokyo vol.18" };
  let eventReads = 0;
  let outcome: "pending_review" | "registered" = "pending_review";
  const ports: JoinPorts = {
    cancel: async () => undefined,
    createSchedule: async (actorId, input) => {
      const key = `${actorId}\u0000${input.idempotencyKey}`;
      const known = receipts.get(key);
      if (known) return known;
      const id = `sch-${receipts.size + 1}`;
      receipts.set(key, id);
      items.set(id, { endsAt: input.endsAt, owner: actorId, startsAt: input.startsAt, title: input.title });
      calls.push(`create:${actorId}:${input.title}:${input.idempotencyKey}`);
      return id;
    },
    event: async () => { eventReads += 1; return event; },
    eventTentatives: async (eventId) => [...records.entries()].filter(([key]) => key.endsWith(`:${eventId}`)).map(([key, record]) => ({ actorId: key.slice(0, key.lastIndexOf(":")), record })),
    next: async () => null,
    now: () => Date.parse("2026-11-27T00:00:00.000Z"),
    persona: async () => null,
    profileIntro: async () => null,
    readTentative: async (actorId, eventId) => records.get(`${actorId}:${eventId}`) ?? null,
    registrationStatus: async (actorId) => status.get(actorId) ?? initial,
    removeSchedule: async (_actorId, id) => { calls.push(`remove:${id}`); items.delete(id); },
    renameSchedule: async (_actorId, id, title) => { const item = items.get(id); if (!item) return false; calls.push(`rename:${id}:${title}`); item.title = title; return true; },
    saveIntro: async () => undefined,
    saveTentative: async (actorId, eventId, record) => { records.set(`${actorId}:${eventId}`, record); },
    scheduleExists: async (_actorId, id) => items.has(id),
    submit: async () => ({ status: outcome, submittedAt: "2026-11-27T05:32:00.000Z" }),
    updateSchedule: async (_actorId, id, patch) => { const item = items.get(id); if (!item) return false; calls.push(`move:${id}:${patch.startsAt}`); Object.assign(item, patch); return true; },
  };
  return {
    calls, items, records, status,
    service: createJoinService({ ports }),
    setEvent: (next: typeof event) => { event = next; },
    setOutcome: (next: typeof outcome) => { outcome = next; },
    eventReads: () => eventReads,
  };
}

test("submit writes the calendar entry automatically: tentative title in review, final when confirmed; fixed key per account + event", async () => {
  const w = world();
  const pending = await w.service.submit("actor:a", "ev", [answer], "ja");
  assert.deepEqual(pending?.calendar, { final: false, scheduleItemId: "sch-1", title: "仮：CFO Night" });
  assert.deepEqual(w.calls, [`create:actor:a:仮：CFO Night:${joinCalendarKey("ev", 0)}`]);
  assert.equal(w.records.get("actor:a:ev")?.startsAt, "2026-12-10T10:00:00.000Z", "the written time is kept for later comparison");
  w.setOutcome("registered");
  const confirmed = await w.service.submit("actor:b", "ev", [answer], "zh");
  assert.deepEqual(confirmed?.calendar, { final: true, scheduleItemId: "sch-2", title: "CFO Night" });
  assert.ok(eventJoinResultSchema.safeParse(confirmed).success);
});

test("two submits at once, a repeated submit, and an edit never make a second entry", async () => {
  const w = world();
  const [first, second] = await Promise.all([w.service.submit("actor:a", "ev", [answer], "ja"), w.service.submit("actor:a", "ev", [answer], "ja")]);
  assert.equal(first?.calendar?.scheduleItemId, second?.calendar?.scheduleItemId);
  assert.equal(w.items.size, 1, "the same idempotency key → one schedule item");
  w.status.set("actor:a", "pending_review");
  await w.service.submit("actor:a", "ev", [answer], "ja");
  const edited = await w.service.submit("actor:a", "ev", [answer], "ja", undefined, true);
  assert.equal(edited?.calendar, undefined, "edit mode does not touch the calendar");
  assert.equal(w.calls.filter((call) => call.startsWith("create")).length, 1);
});

test("older clients calling join/tentative after submit get the entry already written", async () => {
  const w = world();
  const result = await w.service.submit("actor:a", "ev", [answer], "ja");
  const legacy = await w.service.tentative("actor:a", "ev", "client-key", "ja");
  assert.equal(legacy?.scheduleItemId, result?.calendar?.scheduleItemId);
  assert.equal(w.items.size, 1);
});

test("remove: the entry is deleted and not written again by a later submit or sync, until the person adds it", async () => {
  const w = world("pending_review");
  await w.service.submit("actor:a", "ev", [answer], "ja");
  assert.deepEqual(eventJoinCalendarRemoveResultSchema.parse(await w.service.removeCalendar("actor:a", "ev")), { eventId: "ev", removed: true });
  assert.equal(w.items.size, 0);
  assert.equal(w.records.get("actor:a:ev")?.optedOut, true);
  const again = await w.service.submit("actor:a", "ev", [answer], "ja");
  assert.equal(again?.calendar, null, "a removed entry is not re-created automatically");
  w.status.set("actor:a", "registered");
  await w.service.syncTentative("actor:a", "ev", "ja");
  assert.equal(w.items.size, 0);
  const added = await w.service.tentative("actor:a", "ev", "k", "ja");
  assert.equal(w.items.size, 1, "an explicit add writes it again");
  assert.match(w.calls.at(-1)!, new RegExp(`${joinCalendarKey("ev", 1)}$`), "with the next key (the old receipt points at the deleted item)");
  assert.equal(added?.title, "CFO Night");
});

test("an entry the person deleted in the calendar is respected (no automatic re-write); an explicit add writes a new one", async () => {
  const w = world("pending_review");
  const first = await w.service.submit("actor:a", "ev", [answer], "ja");
  w.items.delete(first!.calendar!.scheduleItemId);
  const again = await w.service.submit("actor:a", "ev", [answer], "ja");
  assert.equal(again?.calendar, null);
  assert.equal(w.records.get("actor:a:ev")?.optedOut, true);
  const added = await w.service.tentative("actor:a", "ev", "k", "ja");
  assert.notEqual(added?.scheduleItemId, first?.calendar?.scheduleItemId);
  assert.equal(w.items.size, 1);
});

test("follows the registration: approved → final title, rejected → removed, cancelled → removed", async () => {
  const w = world();
  await w.service.submit("actor:a", "ev", [answer], "en");
  await w.service.submit("actor:b", "ev", [answer], "ja");
  await w.service.submit("actor:c", "ev", [answer], "ja");
  w.status.set("actor:a", "registered");
  w.status.set("actor:b", "rejected");
  w.status.set("actor:c", "cancelled");
  // The host side syncs with the default language; the title follows the language the entry was written in.
  for (const actor of ["actor:a", "actor:b", "actor:c"]) await w.service.syncTentative(actor, "ev", "ja");
  assert.equal(w.items.get("sch-1")?.title, "CFO Night");
  assert.equal(w.records.get("actor:a:ev")?.final, true);
  assert.deepEqual([w.items.has("sch-2"), w.items.has("sch-3")], [false, false]);
  assert.deepEqual([w.records.get("actor:b:ev")?.removed, w.records.get("actor:c:ev")?.removed], [true, true]);
  const before = w.calls.length;
  for (const actor of ["actor:a", "actor:b"]) await w.service.syncTentative(actor, "ev", "ja");
  assert.equal(w.calls.length, before, "nothing is written twice");
  // Removed by the system (not by the person): registering again writes a fresh entry.
  w.status.set("actor:c", "none");
  assert.equal((await w.service.submit("actor:c", "ev", [answer], "ja"))?.calendar?.title, "仮：CFO Night");
});

test("the organizer cancels the event: every attendee's entry is removed without reading the event; a reschedule moves only what changed", async () => {
  const w = world();
  await w.service.submit("actor:a", "ev", [answer], "ja");
  await w.service.submit("actor:b", "ev", [answer], "ja");
  await w.service.submit("actor:x", "other", [answer], "ja");
  assert.equal(await w.service.syncEvent("ev", "updated"), 0, "nothing changed → nothing written");
  w.setEvent({ endsAt: "2026-12-11T12:30:00.000Z", registrationClosesAt: null, review: true, startsAt: "2026-12-11T10:00:00.000Z", title: "CFO Night Tokyo vol.18" });
  const reads = w.eventReads();
  assert.equal(await w.service.syncEvent("ev", "updated"), 2);
  assert.equal(w.eventReads() - reads, 1, "the event is read once for the whole batch");
  assert.deepEqual([w.items.get("sch-1")?.startsAt, w.items.get("sch-2")?.endsAt], ["2026-12-11T10:00:00.000Z", "2026-12-11T12:30:00.000Z"]);
  assert.equal(w.items.get("sch-3")?.startsAt, "2026-12-10T10:00:00.000Z", "another event's entry is untouched");
  w.setEvent(null);
  assert.equal(await w.service.syncEvent("ev", "cancelled"), 2);
  assert.deepEqual([w.items.has("sch-1"), w.items.has("sch-2"), w.items.has("sch-3")], [false, false, true]);
  assert.equal(await w.service.syncEvent("ev", "cancelled"), 0, "already removed entries are skipped");
});

test("the person cancels: the entry goes with the registration", async () => {
  const w = world("pending_review");
  await w.service.submit("actor:a", "ev", [answer], "ja");
  w.status.set("actor:a", "cancelled");
  await w.service.cancel("actor:a", "ev", "ja");
  assert.equal(w.items.size, 0);
});

test("a calendar that cannot be written never fails the registration", async () => {
  const w = world();
  const service = createJoinService({ ports: { ...({} as JoinPorts), ...{
    cancel: async () => undefined, createSchedule: async () => { throw new Error("down"); }, event: async () => ({ endsAt: null, registrationClosesAt: null, review: false, startsAt: "2026-12-10T10:00:00.000Z", title: "X" }),
    next: async () => null, persona: async () => null, profileIntro: async () => null, readTentative: async () => null, registrationStatus: async () => "none" as const, removeSchedule: async () => undefined,
    renameSchedule: async () => undefined, saveIntro: async () => undefined, saveTentative: async () => undefined, submit: async () => ({ status: "registered" as const, submittedAt: "2026-11-27T00:00:00.000Z" }),
  } } });
  const result = await service.submit("actor:a", "ev", [answer], "ja");
  assert.equal(result?.status, "registered");
  assert.equal(result?.calendar, null);
  assert.ok(w);
});

test("routes: DELETE join/tentative removes (sample: answered without writing); host decide / cancel / update sync the calendar after the host operation", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const removed = await routes.joinCalendarRemove(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) });
  assert.equal((await removed.json()).data.removed, true);

  const synced: string[] = [];
  const calendar: HostJoinCalendar = { syncEvent: async (eventId, change) => { synced.push(`${change}:${eventId}`); return 0; }, syncTentative: async (actorId, eventId) => { synced.push(`person:${actorId}:${eventId}`); } };
  const order: string[] = [];
  const service = {
    cancelEvent: async () => { order.push("cancel"); return writeResult; },
    decide: async () => { order.push("decide"); return { actorId: "actor:p", applicationVersion: 2, notified: 1, receptionNumber: null, status: "approved" }; },
    updateEvent: async () => { order.push("update"); return writeResult; },
  };
  const host = createHostRoutes({ joinCalendar: async () => { order.push("sync"); return calendar; }, liveService: async () => service as never, resolveActor: async () => ({ id: "actor:host" }) as never, resolveMode: () => "live" });
  const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
  await host.decide(new Request("http://localhost/x", json({ decision: "approve", expectedVersion: 1 })), { params: Promise.resolve({ actorId: "actor:p", id: "ev" }) });
  await host.cancelEvent(new Request("http://localhost/x", json({ expectedVersion: 3 })), { params: Promise.resolve({ id: "ev" }) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(synced, ["person:actor:p:ev", "cancelled:ev"]);
  assert.ok(order.indexOf("decide") < order.indexOf("sync"), "the sync runs after the host operation");

  // Sample mode never writes calendars.
  synced.length = 0;
  const sample = createHostRoutes({ joinCalendar: async () => calendar, resolveActor: async () => ({ id: "actor:host" }) as never, resolveMode: () => "mock" });
  await sample.cancelEvent(new Request("http://localhost/x", json({ expectedVersion: 3 })), { params: Promise.resolve({ id: "ev" }) }).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(synced, []);
});

const writeResult = { event: null, notified: 0 } as never;
