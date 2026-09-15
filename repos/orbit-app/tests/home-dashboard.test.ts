import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const model = existsSync("src/view-models/home-dashboard.ts") ? require("../src/view-models/home-dashboard") : {};
const now = new Date("2026-09-11T05:00:00.000Z");
function subject(name: string) {
  assert.equal(typeof model[name], "function", name + " is not implemented");
  return model[name];
}
const task = (patch = {}) => ({
  id: "task:one", accountId: "account", ownerUserId: "actor", title: "发送项目介绍", status: "open",
  category: "work", priority: "normal", source: "manual", plannedDate: "2026-09-11",
  createdAt: "2026-09-09T01:00:00Z", updatedAt: "2026-09-10T01:00:00Z", ...patch
});
const schedule = (patch = {}) => ({
  id: "schedule:one", title: "林悦 · 合作沟通", kind: "meeting", category: "meeting",
  state: "upcoming", startsAt: "2026-09-11T05:30:00Z", endsAt: "2026-09-11T06:00:00Z",
  location: "线上", sourceId: "appointment:one", ...patch
});
const recommendation = (patch = {}) => ({
  eventId: "event:one", title: "周末产品交流会", startsAt: "2026-09-12T05:00:00Z",
  location: "东京", venue: "涩谷", valueScore: 92, scoreBand: "high",
  signals: [{ label: "目标一致", detail: "适合交流产品经验", weight: 1 }],
  recommendedAction: "先查看活动详情", ...patch
});
const contact = (patch = {}) => ({
  id: "contact:lin", displayName: "林悦", role: "产品设计师", organization: "星野", location: "东京",
  profileSnippet: "", relationshipContext: "讨论合作", lastInteractionAt: "2026-09-09T00:00:00Z",
  nextAction: "确认下次沟通时间", status: "needs_follow_up", tags: [],
  source: { type: "manual", label: "手动添加", evidenceId: "evidence:one" }, evidence: [],
  value: { score: 70, valueTypes: [], rationale: "已有合作记录", evidenceIds: [] },
  databaseQueryExecuted: true, searchIndexReadExecuted: false, externalNetworkRequested: false,
  aiProviderRequested: false, calendarProviderRequested: false, emailProviderRequested: false, notificationDelivered: false,
  ...patch
});

test("home date follows Tokyo midnight and starts the visible week on Monday across months", () => {
  const date = subject("homeDateView")(new Date("2026-08-31T15:01:00Z"));
  assert.equal(date.selectedDateKey, "2026-09-01");
  assert.equal(date.dateLabel, "9.1");
  assert.equal(date.weekdayLabel, "周二");
  assert.deepEqual(date.week.map((day: any) => day.dateKey), [
    "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"
  ]);
  assert.equal(date.week.filter((day: any) => day.isSelected).length, 1);
});

test("a selected day has its own date and never masquerades as today", () => {
  const date = subject("homeDateView")(now, "2026-09-10");
  assert.equal(date.selectedDateKey, "2026-09-10");
  assert.equal(date.weekdayLabel, "周四");
  assert.equal(date.isToday, false);
  assert.equal(date.week.find((day: any) => day.dateKey === "2026-09-11").isToday, true);
  assert.equal(subject("homeDateView")(now, "2026-02-30").selectedDateKey, "2026-09-11");
});

test("dashboard tasks keep only open work planned or due by the selected Tokyo date", () => {
  const rows = subject("homeTasksToView")({ tasks: [
    task({ id: "planned-today" }), task({ id: "overdue", plannedDate: "2026-09-10" }),
    task({ id: "future", plannedDate: "2026-09-12" }),
    task({ id: "completed", status: "completed" }), task({ id: "cancelled", status: "cancelled" }),
    task({ id: "unplanned", plannedDate: undefined }),
    task({ id: "due-next-tokyo-day", plannedDate: undefined, dueAt: "2026-09-11T15:00:00Z" }),
    task({ id: "due-today", plannedDate: undefined, dueAt: "2026-09-11T14:59:00Z" })
  ] }, "2026-09-11", now);
  assert.deepEqual(rows.map((row: any) => row.id), ["overdue", "due-today", "planned-today"]);
  assert.equal(rows[1].dueLabel, "23:59");
  assert.equal(rows[2].title, "发送项目介绍");
});

test("changing selected date filters real tasks without fabricating missing tasks", () => {
  const payload = { tasks: [task({ id: "old", plannedDate: "2026-09-10" }), task({ id: "later", plannedDate: "2026-09-12" })] };
  assert.deepEqual(subject("homeTasksToView")(payload, "2026-09-10", now).map((row: any) => row.id), ["old"]);
  assert.deepEqual(subject("homeTasksToView")(payload, "2026-09-12", now).map((row: any) => row.id), ["old", "later"]);
  assert.deepEqual(subject("homeTasksToView")({ tasks: [] }, "2026-09-11", now), []);
});

test("malformed task payload and impossible dates are visible failures, not empty days", () => {
  const read = subject("homeTasksToView");
  for (const payload of [{}, { tasks: null }, { tasks: [null] }, { tasks: [task({ id: "" })] },
    { tasks: [task({ plannedDate: "2026-02-30" })] }, { tasks: [task({ dueAt: "not-a-date" })] },
    { tasks: [task({ category: "invented" })] }, { tasks: [task({ status: "archived" })] }]) {
    assert.equal(read(payload, "2026-09-11", now), null);
  }
});

test("home schedules show real start time, duration and escaped existing destination", () => {
  const rows = subject("homeScheduleToView")({ scheduleItems: [
    schedule(),
    schedule({ id: "event", sourceId: "event:/ 空", kind: "event", category: "event",
      startsAt: "2026-09-11T07:00:00Z", endsAt: "2026-09-11T07:45:00Z", location: "东京" })
  ] }, "2026-09-11", now);
  assert.equal(rows[0].timeLabel, "14:30");
  assert.equal(rows[0].detail, "线上 · 30 分钟");
  assert.equal(rows[0].href, "/schedule");
  assert.equal(rows[1].href, "/schedule/events/event%3A%2F%20%E7%A9%BA");
  assert.equal(rows[1].detail, "东京 · 45 分钟");
});

test("cancelled schedules are excluded and real timestamps determine ended/ongoing/upcoming", () => {
  const rows = subject("homeScheduleToView")({ scheduleItems: [
    schedule({ id: "later" }),
    schedule({ id: "cancelled", state: "cancelled" }),
    schedule({ id: "ended", startsAt: "2026-09-11T01:00:00Z", endsAt: "2026-09-11T01:30:00Z" }),
    schedule({ id: "ongoing", startsAt: "2026-09-11T04:45:00Z", endsAt: "2026-09-11T05:15:00Z" })
  ] }, "2026-09-11", now);
  assert.deepEqual(rows.map((row: any) => [row.id, row.state]), [["ended", "ended"], ["ongoing", "ongoing"], ["later", "upcoming"]]);
});

test("a cross-midnight schedule occupies its real days but not an exclusive end boundary", () => {
  const payload = { scheduleItems: [
    schedule({ id: "overnight", startsAt: "2026-09-10T14:30:00Z", endsAt: "2026-09-11T01:00:00Z" }),
    schedule({ id: "ends-at-midnight", startsAt: "2026-09-10T13:00:00Z", endsAt: "2026-09-10T15:00:00Z" }),
    schedule({ id: "multi-day", startsAt: "2026-09-09T01:00:00Z", endsAt: "2026-09-13T01:00:00Z" })
  ] };
  const rows = subject("homeScheduleToView")(payload, "2026-09-11", now);
  assert.deepEqual(rows.map((row: any) => row.id), ["multi-day", "overnight"]);
  assert.match(rows[1].timeLabel, /9\.10.*23:30/);
});

test("malformed schedule data never creates invented time, kind or source destination", () => {
  const read = subject("homeScheduleToView");
  for (const payload of [{}, { scheduleItems: [null] }, { scheduleItems: [schedule({ startsAt: "bad" })] },
    { scheduleItems: [schedule({ endsAt: "2026-09-11T04:00:00Z" })] },
    { scheduleItems: [schedule({ kind: "invented" })] }, { scheduleItems: [schedule({ sourceId: "" })] }]) {
    assert.equal(read(payload, "2026-09-11", now), null);
  }
  assert.deepEqual(read({ scheduleItems: [] }, "2026-09-11", now), []);
});

test("home recommendations keep real event identity, local time and venue", () => {
  const rows = subject("homeRecommendedEventsToView")({ state: "success", recommendations: [
    recommendation(), recommendation({ eventId: "event:two", title: "设计师午间聚会", startsAt: "2026-09-13T03:00:00Z", location: "东京", venue: "代官山" })
  ] }, "Asia/Tokyo");
  assert.deepEqual(rows, [
    { id: "event:one", title: "周末产品交流会", dateLabel: "9月12日 周六 14:00", locationLabel: "东京 · 涩谷" },
    { id: "event:two", title: "设计师午间聚会", dateLabel: "9月13日 周日 12:00", locationLabel: "东京 · 代官山" }
  ]);
  assert.deepEqual(subject("homeRecommendedEventsToView")({ state: "empty", recommendations: [] }), []);
  assert.deepEqual(subject("homeRecommendedEventsToView")({ state: "pending", recommendations: [] }), []);
});

test("invalid recommendation payloads are failures instead of invented or empty events", () => {
  const read = subject("homeRecommendedEventsToView");
  for (const payload of [{}, { state: "success", recommendations: [] }, { state: "empty", recommendations: [recommendation()] },
    { state: "success", recommendations: [null] }, { state: "success", recommendations: [recommendation({ eventId: "" })] },
    { state: "success", recommendations: [recommendation({ startsAt: "bad" })] },
    { state: "success", recommendations: [recommendation({ valueScore: 101 })] },
    { state: "success", recommendations: [recommendation(), recommendation()] }]) {
    assert.equal(read(payload, "Asia/Tokyo"), null);
  }
});

test("followup people remain available to non-home consumers with real identities", () => {
  const rows = subject("homeFollowupsToView")({ state: "success", contacts: [
    contact(), contact({ id: "active", status: "active" }), contact({ id: "archived", status: "archived" }),
    contact({ id: "contact:chen", displayName: "陈默", role: "产品经理" })
  ] });
  assert.deepEqual(rows.map((row: any) => [row.id, row.name]), [["contact:lin", "林悦"], ["contact:chen", "陈默"]]);
  assert.equal(rows[0].role, "产品设计师");
  assert.deepEqual(subject("homeFollowupsToView")({ state: "empty", contacts: [] }), []);
});

test("invalid contact collections do not become fictitious people or an empty followup claim", () => {
  for (const payload of [{}, { contacts: [null] }, { contacts: [contact({ id: "" })] },
    { contacts: [contact({ displayName: "" })] }, { contacts: [contact({ status: "invented" })] }]) {
    assert.equal(subject("homeFollowupsToView")({ state: "success", ...payload }), null);
  }
});

test("contact collection state must be valid and agree with its records before claiming an empty followup list", () => {
  for (const payload of [{ contacts: [] }, { state: "bogus", contacts: [] }, { state: "pending", contacts: [] },
    { state: "empty", contacts: [contact()] }, { state: "success", contacts: [] }]) {
    assert.equal(subject("homeFollowupsToView")(payload), null);
  }
  assert.deepEqual(subject("homeFollowupsToView")({ state: "empty", contacts: [] }), []);
  assert.equal(subject("homeFollowupsToView")({ state: "success", contacts: [contact()] }).length, 1);
});
