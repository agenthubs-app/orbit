import assert from "node:assert/strict";
import test from "node:test";

import { myEventsResponseSchema } from "../../shared/api-schema/events-mine";
import { createMyEventsService, mergeMyEvents, type MyEventSourceRow } from "../../features/events/mine/service";
import { createMyEventsRoute, withCurrentScores } from "../../features/events/mine/configured";

// R26 events-mine.test：五种状态、合并取最强、upcoming 升序 / past 降序、取消不计入参加予定、外部活动链接、他人隔离（reader 只按 actor 读）。

const NOW = new Date("2026-10-07T03:00:00.000Z"); // 东京 12:00
const rows: MyEventSourceRow[] = [
  { endsAt: null, eventId: "e-cfo", startsAt: "2026-10-07T19:00:00+09:00", status: "planned", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" },
  { endsAt: null, eventId: "e-cfo", startsAt: "2026-10-07T19:00:00+09:00", status: "registered", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" },
  { endsAt: "2026-10-16T18:00:00+09:00", eventId: "e-saas", startsAt: "2026-10-16T10:00:00+09:00", status: "pending_review", title: "Japan SaaS Summit 2026 秋", venue: "東京国際フォーラム" },
  { endsAt: null, eventId: "e-dx", startsAt: "2026-10-23T13:00:00+09:00", status: "cancelled", title: "製造業 DX カンファレンス 大阪", venue: "グランフロント大阪" },
  { endsAt: null, eventId: "e-past", startsAt: "2026-09-30T19:00:00+09:00", status: "attended", title: "過去の勉強会", venue: null },
  { endsAt: null, eventId: "e-past2", startsAt: "2026-09-20T19:00:00+09:00", status: "registered", title: "未チェックイン", venue: null },
  { assessmentId: "evas_1", endsAt: null, eventId: "assessment:evas_1", external: true, score: 74, startsAt: "2026-10-21T08:00:00+09:00", status: "planned", title: "丸の内スタートアップ朝会 #42", venue: "丸の内" },
];

test("合并：同一场取最强状态（registered > planned）", () => {
  const merged = mergeMyEvents(rows);
  assert.equal(merged.find((row) => row.eventId === "e-cfo")?.status, "registered");
  assert.equal(merged.length, 6);
});

test("upcoming：升序、含待审核 / 加入计划 / 取消（取消不计数）；past：降序；外部活动链接到評価結果", async () => {
  const seen: string[] = [];
  const service = createMyEventsService({ now: () => NOW, reader: { rows: async (actorId) => { seen.push(actorId); return rows; } } });
  const upcoming = await service.list("actor:a", { limit: 20, platform: "web", range: "upcoming" });
  assert.deepEqual(upcoming.items.map((item) => item.eventId), ["e-cfo", "e-saas", "assessment:evas_1", "e-dx"]);
  assert.equal(upcoming.upcomingCount, 3);
  assert.equal(upcoming.items.find((item) => item.eventId === "assessment:evas_1")?.href, "/app/events/assessments/evas_1");
  assert.equal(upcoming.items[0]?.emoji, "🥂");
  myEventsResponseSchema.parse(upcoming);
  const past = await service.list("actor:a", { limit: 20, platform: "app", range: "past" });
  assert.deepEqual(past.items.map((item) => [item.eventId, item.status]), [["e-past", "attended"], ["e-past2", "registered"]]);
  assert.equal(past.items[0]?.href, "/events/e-past");
  assert.deepEqual(seen, ["actor:a", "actor:a"]);
  const one = await service.list("actor:a", { limit: 1, platform: "web", range: "upcoming" });
  assert.equal(one.items.length, 1);
  assert.equal(one.upcomingCount, 3, "the badge count ignores limit");
});

test("past opts into older participation without expanding other reads or the response limit", async () => {
  const older = { ...rows[5]!, eventId: "older-registration", startsAt: "2026-01-15T10:00:00.000Z" };
  const service = createMyEventsService({
    now: () => NOW,
    reader: {
      rows: async (actorId, window) => {
        assert.equal(window.limit, 200);
        if (actorId !== "actor:a") return [];
        return window.includeOlderParticipation ? [...rows, older] : rows;
      },
    },
  });
  const list = (actorId: string, range: "past" | "upcoming", limit: number) => service.list(actorId, { range, limit, platform: "web" });
  const past = await list("actor:a", "past", 3);
  assert.deepEqual(past.items.map((item) => [item.eventId, item.status, item.href]), [
    ["e-past", "attended", "/app/events/e-past"],
    ["e-past2", "registered", "/app/events/e-past2"],
    ["older-registration", "registered", "/app/events/older-registration"],
  ]);
  assert.equal(past.upcomingCount, 3);
  assert.equal((await list("actor:a", "past", 2)).items.length, 2);
  assert.equal((await list("actor:a", "upcoming", 3)).items.some((item) => item.eventId === older.eventId), false);
  assert.deepEqual((await list("actor:b", "past", 3)).items, []);
});

test("路由：未登录 401（live）；mock 返回演示世界并带 sample；参数不合法 400", async () => {
  const previous = process.env.ORBIT_FEATURE_MODE;
  // The route reads the real clock; keep its rows in the far future so the test does not expire with the calendar
  // (the fixture's 2026-10-21 08:00 event fell out of "upcoming" on that morning).
  const future = rows.map((row) => ({ ...row, startsAt: row.startsAt.replace("2026-", "2099-"), endsAt: row.endsAt ? row.endsAt.replace("2026-", "2099-") : null }));
  const route = createMyEventsRoute({ resolveActor: async () => ({ id: "actor:a" }) as never, reader: () => ({ rows: async () => future }) });
  const bad = await route(new Request("http://localhost/api/events/mine?range=soon"));
  assert.equal(bad.status, 400);
  const ok = await route(new Request("http://localhost/api/events/mine?range=upcoming&limit=2"));
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.data.items.length, 2);
  if (previous === undefined) delete process.env.ORBIT_FEATURE_MODE; else process.env.ORBIT_FEATURE_MODE = previous;
});

test("R26-12：参加予定的分按当前计划现算（view），读不到评估时保留原分", async () => {
  const contexts: string[] = [];
  const scored = await withCurrentScores(rows, "actor:a", {
    plan: { context: async (actorId: string) => { contexts.push(actorId); return { plan: "current" }; } },
    repository: { get: async (_actorId: string, id: string) => (id === "evas_1" ? { id } : null) },
    service: { view: async (row: { id: string }, context: { plan: string }) => ({ total: context.plan === "current" && row.id === "evas_1" ? 81 : 0 }) },
  } as never);
  assert.equal(scored.find((row) => row.assessmentId === "evas_1")?.score, 81, "stored 74 is replaced by the current-plan score");
  assert.deepEqual(contexts, ["actor:a"], "one plan context per request");
  const missing = await withCurrentScores(rows, "actor:a", { plan: { context: async () => ({}) }, repository: { get: async () => null }, service: { view: async () => ({ total: 0 }) } } as never);
  assert.equal(missing.find((row) => row.assessmentId === "evas_1")?.score, 74);
  assert.equal(await withCurrentScores(rows.filter((row) => !row.assessmentId), "actor:a", {} as never).then((out) => out.length), 6, "no assessments → no plan read");
});

// agent-design AG13-2：自己记的「我去过」只是可选字段——status 不变（签到才是 attended）；私人活动是自己的行（status 用已有的 planned），
// 将来的算进「计划参加 N 场」（D3）；旧版客户端的 schema 读不懂新字段时整行照常显示，不跳行。
test("AG13: «我去过（自己记的）» is an optional field and never changes status; private events are rows of their own (D3)", async () => {
  const service = createMyEventsService({
    now: () => NOW,
    reader: {
      rows: async () => rows,
      selfRecords: async () => ({
        attendance: [
          { attendedOn: "2026-09-20", dayParts: ["evening"], eventRef: { id: "e-past2", kind: "platform" as const } },
          { attendedOn: "2026-09-25", eventRef: { id: "private_event:old", kind: "private" as const }, selfNote: "见到了十年没见的室友" },
        ],
        privateEvents: [
          { id: "private_event:old", startsAt: "2026-09-25T18:00:00+09:00", title: "大学同学聚会", venue: "新宿" },
          { id: "private_event:new", startsAt: "2026-10-20T19:00:00+09:00", title: "读书会", venue: null },
        ],
        related: async (id: string) => (id === "private_event:old" ? [{ id: "task:t48", kind: "todo" as const, label: "联系老周" }] : []),
      }),
    },
  });
  const past = await service.list("actor:a", { limit: 20, platform: "web", range: "past" });
  const checkedIn = past.items.find((item) => item.eventId === "e-past");
  assert.equal(checkedIn?.status, "attended", "the organizer's check-in still reads attended");
  assert.equal(checkedIn?.selfAttendance, undefined);
  const self = past.items.find((item) => item.eventId === "e-past2");
  assert.equal(self?.status, "registered", "a note of the user's own never turns a registration into attended");
  assert.deepEqual(self?.selfAttendance, { attendedOn: "2026-09-20", dayParts: ["evening"] });
  const reunion = past.items.find((item) => item.eventId === "private_event:old");
  assert.equal(reunion?.privateEvent, true);
  assert.equal(reunion?.status, "planned");
  assert.equal(reunion?.selfAttendance?.selfNote, "见到了十年没见的室友");
  assert.deepEqual(reunion?.related, [{ id: "task:t48", kind: "todo", label: "联系老周" }]);
  assert.equal(reunion?.href, "/app/events?privateEvent=private_event%3Aold", "no page of its own: the list opens it in place");
  const upcoming = await service.list("actor:a", { limit: 20, platform: "app", range: "upcoming" });
  assert.ok(upcoming.items.some((item) => item.eventId === "private_event:new" && item.privateEvent));
  assert.equal(upcoming.upcomingCount, 4, "a future private event counts in 「计划参加 N 场」");
  const parsed = myEventsResponseSchema.parse(past);
  assert.equal(parsed.items.find((item) => item.eventId === "e-past2")?.selfAttendance?.attendedOn, "2026-09-20");
  const statuses = new Set(["registered", "pending_review", "waitlisted", "planned", "attended", "rejected", "cancelled"]);
  assert.ok(past.items.every((item) => statuses.has(item.status)), "no new status value");
});
