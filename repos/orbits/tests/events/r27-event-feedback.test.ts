/**
 * R27 SC-R27-02（契约 9 興味なし）/ SC-R27-01（探す三组）/ 关注 / 会う準備清单：内存 + 真实 PostgreSQL（随机 schema）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { eventDiscoverQueryObject } from "../../shared/api-schema/event-discover";
import { eventDiscoverResponseSchema } from "../../shared/api-schema/event-discover";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createMemoryActorRecordStore, createPostgresActorRecordStore, type ActorRecordStore } from "../../features/events/actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService } from "../../features/events/journey/attendee-records";
import { buildDiscover, eventArea, eventThemes, feedbackEffect, periodWindow, type DiscoverCandidate } from "../../features/events/journey/discover-core";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const NOW = new Date("2026-10-07T03:00:00.000Z"); // 2026-10-07（水）12:00 JST
const q = (input: Record<string, string> = {}) => eventDiscoverQueryObject.parse(input);

function candidate(id: string, extra: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return { emoji: "🎟️", eventId: id, organizerId: `org-${id}`, organizerName: `主催 ${id}`, startsAt: "2026-10-16T19:00:00+09:00", title: `イベント ${id}`, venue: "渋谷", ...extra };
}
const judged = (score: number, verdict: "recommend" | "conditional" | "skip" = score >= 70 ? "recommend" : score >= 50 ? "conditional" : "skip") => ({ judge: { reason: "VC パートナー 3名が登壇", score, verdict } });
const base = { attendedOrganizers: new Set<string>(), feedback: [], followedOrganizers: new Set<string>(), hasPlan: true, myEventIds: new Set<string>(), now: NOW, planGoal: "シリーズA 資金調達", signedIn: true };

async function exercise(store: ActorRecordStore) {
  const feedback = createEventFeedbackService({ now: () => NOW, store });
  const first = await feedback.dismiss("actor:a", { eventId: "e1", facts: { area: "tokyo", organizerId: "org-x", startsAt: "2026-10-16T19:00:00+09:00", themes: ["funding"] }, idempotencyKey: "k1", reason: "schedule" });
  // 同一幂等键 / 同一理由重放：不重复写，返回第一次的结果。
  const later = new Date(NOW.getTime() + 60_000);
  const replay = await createEventFeedbackService({ now: () => later, store }).dismiss("actor:a", { eventId: "e1", facts: {}, idempotencyKey: "k1", reason: "schedule" });
  assert.deepEqual(replay, first);
  const sameReason = await createEventFeedbackService({ now: () => later, store }).dismiss("actor:a", { eventId: "e1", facts: {}, idempotencyKey: "k2", reason: "schedule" });
  assert.equal(sameReason.dismissedAt, first.dismissedAt);
  assert.equal((await feedback.entries("actor:a")).length, 1, "one row per person × event");
  // 换理由 = 覆盖同一行。
  await createEventFeedbackService({ now: () => later, store }).dismiss("actor:a", { eventId: "e1", facts: { organizerId: "org-x" }, idempotencyKey: "k3", reason: "known" });
  const entries = await feedback.entries("actor:a");
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.reason, "known");
  // 他人隔离。
  assert.deepEqual(await feedback.entries("actor:b"), []);

  const follows = createOrganizerFollowService({ now: () => NOW, store });
  await follows.follow("actor:a", "org-cfo");
  await follows.follow("actor:a", "org-cfo");
  assert.deepEqual([...(await follows.followed("actor:a"))], ["org-cfo"]);
  assert.deepEqual([...(await follows.followed("actor:b"))], []);
  assert.equal((await follows.unfollow("actor:a", "org-cfo")).following, false);
  assert.equal((await follows.unfollow("actor:a", "org-cfo")).following, false);
  assert.deepEqual([...(await follows.followed("actor:a"))], []);
  await follows.follow("actor:a", "org-cfo");
  assert.deepEqual([...(await follows.followed("actor:a"))], ["org-cfo"], "re-follow after unfollow");

  const checklist = createPrepChecklistService({ now: () => NOW, store });
  assert.deepEqual((await checklist.read("actor:a", "ev")).map((item) => item.key), ["cards", "intro", "materials", "qr", "return"]);
  await checklist.patch("actor:a", "ev", [{ done: true, key: "intro" }]);
  const merged = await checklist.patch("actor:a", "ev", [{ done: true, key: "materials", label: "事業計画書 v3 の共有リンク" }]);
  assert.deepEqual(merged.filter((item) => item.done).map((item) => item.key), ["intro", "materials"], "patches from two clients merge");
  assert.equal(merged.find((item) => item.key === "materials")?.label, "事業計画書 v3 の共有リンク");
  assert.equal(merged.find((item) => item.key === "cards")?.label, undefined, "only 資料 keeps text");
  assert.equal((await checklist.read("actor:b", "ev")).some((item) => item.done), false);
}

test("feedback / follows / checklist: idempotent, one row per person, isolated (memory)", async () => {
  await exercise(createMemoryActorRecordStore());
});

test("feedback / follows / checklist: same behaviour on PostgreSQL (orbit_records)", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `r27_records_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await exercise(createPostgresActorRecordStore({ query: (sql, values) => pool.query(sql, values as unknown[]) as never, workspaceId: "workspace:r27" }));
    const owners = (await pool.query("select distinct user_id from orbit_records")).rows.map((row) => row.user_id);
    assert.deepEqual(owners, ["actor:a"]);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});

test("興味なし: known only filters that event; schedule / distance / content penalise similar events; 3 per organizer penalise all", () => {
  const facts = (id: string, extra: Record<string, unknown> = {}) => ({ area: "tokyo" as const, eventId: id, organizerId: "org-a", startsAt: "2026-10-16T19:00:00+09:00", themes: ["funding" as const], ...extra });
  assert.deepEqual(feedbackEffect(facts("x"), [{ eventId: "x", reason: "known" }]), { hidden: true, penalty: 0 });
  assert.deepEqual(feedbackEffect(facts("y"), [{ eventId: "x", reason: "known" }]), { hidden: false, penalty: 0 });
  assert.equal(feedbackEffect(facts("y", { startsAt: "2026-10-23T19:30:00+09:00" }), [{ eventId: "x", reason: "schedule", startsAt: "2026-10-16T19:00:00+09:00" }]).penalty, 15, "same weekday evening");
  assert.equal(feedbackEffect(facts("y", { startsAt: "2026-10-24T10:00:00+09:00" }), [{ eventId: "x", reason: "schedule", startsAt: "2026-10-16T19:00:00+09:00" }]).penalty, 0);
  assert.equal(feedbackEffect(facts("y"), [{ area: "tokyo", eventId: "x", reason: "distance" }]).penalty, 15);
  assert.equal(feedbackEffect(facts("y", { area: "online" }), [{ area: "online", eventId: "x", reason: "distance" }]).penalty, 0, "online is never far");
  assert.equal(feedbackEffect(facts("y"), [{ eventId: "x", organizerId: "org-a", reason: "content", themes: ["funding"] }]).penalty, 15);
  assert.equal(feedbackEffect(facts("y", { organizerId: "org-b" }), [{ eventId: "x", organizerId: "org-a", reason: "content", themes: ["funding"] }]).penalty, 0, "content never hits another organizer");
  const three = ["x1", "x2", "x3"].map((eventId) => ({ eventId, organizerId: "org-a", reason: "known" as const }));
  assert.equal(feedbackEffect(facts("y"), three).penalty, 25);
  assert.equal(feedbackEffect(facts("y"), three.slice(0, 2)).penalty, 0);
});

test("探す: planFit uses the given scores (never changed), dismissed / registered events leave recommendations but stay in すべて", () => {
  const events = [candidate("a", judged(82)), candidate("b", judged(77)), candidate("c", judged(71)), candidate("d", judged(68)), candidate("e", judged(41))];
  const result = buildDiscover({ ...base, candidates: events, feedback: [{ eventId: "b", reason: "content" }], myEventIds: new Set(["c"]), query: q() });
  eventDiscoverResponseSchema.parse(result);
  assert.deepEqual(result.planFit.map((row) => row.eventId), ["a", "d"]);
  assert.equal(result.planFitTotal, 2);
  assert.deepEqual(result.planFit.map((row) => row.score), [82, 68]);
  assert.equal(result.all.length, 5);
  assert.equal(result.popularityFallback, false);
  // 降权只改顺序：b 被同主办同主题降权后排在 d 后面，显示分不变。
  const reordered = buildDiscover({ ...base, candidates: [candidate("a", { ...judged(80), organizerId: "o", title: "資金調達 ナイト" }), candidate("b", { ...judged(78), organizerId: "o", title: "VC 交流会" }), candidate("d", judged(70))], feedback: [{ eventId: "a", organizerId: "o", reason: "content", themes: ["funding"] }], query: q() });
  assert.deepEqual(reordered.planFit.map((row) => [row.eventId, row.score]), [["d", 70], ["b", 78]]);
});

test("secretary candidates keep every eligible row and rank by raw score then eventId", () => {
  const events = [
    candidate("z", { ...judged(90), startsAt: "2026-10-10T19:00:00+09:00", organizerId: "org-x", title: "資金調達 ナイト" }),
    candidate("b", { ...judged(89), startsAt: "2026-10-11T19:00:00+09:00" }),
    candidate("c", { ...judged(88), startsAt: "2026-10-12T19:00:00+09:00" }),
    candidate("a", { ...judged(90), startsAt: "2026-10-20T19:00:00+09:00" }),
  ];
  const input = { ...base, candidates: events, feedback: [{ eventId: "dismissed", organizerId: "org-x", reason: "content" as const, themes: ["funding" as const] }], query: q() };
  assert.deepEqual(buildDiscover(input).planFit.map(row => row.eventId), ["a", "b", "c"]);
  assert.deepEqual(buildDiscover(input, { dailyCandidates: true }).planFit.map(row => row.eventId), ["a", "z", "b", "c"]);
});

test("探す: no plan / signed out → popularity order, no scores, no community; signed out never sees organizer ids", () => {
  const events = [candidate("a", { ...judged(82), registrationCount: 10 }), candidate("b", { ...judged(60), registrationCount: 90 })];
  const noPlan = buildDiscover({ ...base, candidates: events, hasPlan: false, query: q() });
  assert.equal(noPlan.popularityFallback, true);
  assert.deepEqual(noPlan.all.map((row) => row.eventId), ["b", "a"]);
  assert.equal(noPlan.planFit.length, 0);
  assert.equal(noPlan.all.some((row) => row.score !== undefined), false);
  const out = buildDiscover({ ...base, candidates: events, followedOrganizers: new Set(["org-a"]), query: q(), signedIn: false });
  assert.equal(out.signedOut, true);
  assert.equal(out.community.length, 0);
  assert.equal(out.all.every((row) => row.organizerId === null), true);
});

test("探す: community = followed or attended organizers; filters combine (period / area / theme / format / free)", () => {
  const events = [
    candidate("f", { organizerId: "org-follow", startsAt: "2026-10-21T19:00:00+09:00", title: "定例会" }),
    candidate("g", { organizerId: "org-went", startsAt: "2026-11-04T19:00:00+09:00", title: "CFO Night vol.19" }),
    candidate("osaka", { priceYen: 0, startsAt: "2026-10-23T13:00:00+09:00", title: "製造業 DX カンファレンス", venue: "グランフロント大阪" }),
    candidate("online", { priceYen: 0, startsAt: "2026-10-09T19:00:00+09:00", title: "シリーズA 実務勉強会", venue: "オンライン" }),
  ];
  const result = buildDiscover({ ...base, attendedOrganizers: new Set(["org-went"]), candidates: events, followedOrganizers: new Set(["org-follow"]), query: q() });
  assert.deepEqual(result.community.map((row) => [row.eventId, row.communityReason]), [["f", "following"], ["g", "attended"]]);
  assert.deepEqual(buildDiscover({ ...base, candidates: events, query: q({ areas: "osaka" }) }).all.map((row) => row.eventId), ["osaka"]);
  assert.deepEqual(buildDiscover({ ...base, candidates: events, query: q({ themes: "manufacturing_dx" }) }).all.map((row) => row.eventId), ["osaka"]);
  assert.deepEqual(buildDiscover({ ...base, candidates: events, query: q({ freeOnly: "1", period: "this_week" }) }).all.map((row) => row.eventId), ["online"]);
  assert.deepEqual(buildDiscover({ ...base, candidates: events, query: q({ period: "next_month" }) }).all.map((row) => row.eventId), ["g"]);
  const week = buildDiscover({ ...base, candidates: events, query: q({ period: "this_week" }) });
  assert.ok(week.widen?.some((item) => item.kind === "period" && item.value === "this_month" && item.extra === 2), "few results suggest widening the period");
  const tokyo = buildDiscover({ ...base, candidates: events, query: q({ areas: "tokyo", period: "this_month" }) });
  assert.ok(tokyo.widen?.some((item) => item.kind === "area" && item.value === "osaka" && item.extra === 1), "and adding 大阪");
});

test("探す helpers: area, themes, period windows (Tokyo)", () => {
  assert.equal(eventArea("グランフロント大阪"), "osaka");
  assert.equal(eventArea("オンライン"), "online");
  assert.equal(eventArea("東京国際フォーラム"), "tokyo");
  assert.deepEqual(eventThemes("製造業 × SaaS ナイト"), ["manufacturing_dx", "networking", "saas"]);
  const week = periodWindow({ period: "this_week" }, NOW);
  assert.equal(new Date(week.to).toISOString(), "2026-10-11T15:00:00.000Z", "今週 ends Sunday 24:00 JST");
  const month = periodWindow({ period: "next_month" }, NOW);
  assert.equal(new Date(month.from).toISOString(), "2026-10-31T15:00:00.000Z");
  assert.throws(() => eventDiscoverQueryObject.parse({ areas: "mars" }));
  assert.throws(() => eventDiscoverQueryObject.parse({ unknown: "1" }));
});
