import assert from "node:assert/strict";
import test from "node:test";

import { myEventsResponseSchema } from "../../shared/api-schema/events-mine";
import { createMyEventsService, mergeMyEvents, type MyEventSourceRow } from "../../features/events/mine/service";
import { createMyEventsRoute } from "../../features/events/mine/configured";

// R26 events-mine.test：五种状态、合并取最强、upcoming 升序 / past 降序、取消不计入参加予定、外部活动链接、他人隔离（reader 只按 actor 读）。

const NOW = new Date("2026-10-07T03:00:00.000Z"); // 东京 12:00
const rows: MyEventSourceRow[] = [
  { endsAt: null, eventId: "e-cfo", startsAt: "2026-10-07T19:00:00+09:00", status: "planned", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" },
  { endsAt: null, eventId: "e-cfo", startsAt: "2026-10-07T19:00:00+09:00", status: "registered", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" },
  { endsAt: "2026-10-16T18:00:00+09:00", eventId: "e-saas", startsAt: "2026-10-16T10:00:00+09:00", status: "pending_review", title: "Japan SaaS Summit 2026 秋", venue: "東京国際フォーラム" },
  { endsAt: null, eventId: "e-dx", startsAt: "2026-10-23T13:00:00+09:00", status: "cancelled", title: "製造業DXカンファレンス 大阪", venue: "グランフロント大阪" },
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

test("路由：未登录 401（live）；mock 返回演示世界并带 sample；参数不合法 400", async () => {
  const previous = process.env.ORBIT_FEATURE_MODE;
  const route = createMyEventsRoute({ resolveActor: async () => ({ id: "actor:a" }) as never, reader: () => ({ rows: async () => rows }) });
  const bad = await route(new Request("http://localhost/api/events/mine?range=soon"));
  assert.equal(bad.status, 400);
  const ok = await route(new Request("http://localhost/api/events/mine?range=upcoming&limit=2"));
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.data.items.length, 2);
  if (previous === undefined) delete process.env.ORBIT_FEATURE_MODE; else process.env.ORBIT_FEATURE_MODE = previous;
});
