/**
 * R17 路由层：mock 示例世界（照画板的六场活动）、示例账号在 live 下只读、live 未配置 503、未登录边界、请求体严格。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { hostCenterResponseSchema, hostEventWriteResultSchema } from "../../shared/api-schema/host-events";
import { hostKioskResponseSchema, hostMatchingResponseSchema, hostOverviewResponseSchema, hostPeopleResponseSchema, hostReportResponseSchema, hostSetupResponseSchema } from "../../shared/api-schema/host-console";
import { hostCohostsResponseSchema } from "../../shared/api-schema/host-cohosts";
import { organizerPublicResponseSchema } from "../../shared/api-schema/organizer-profile";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import { HOST_EVENT_IDS } from "../../shared/mock/demo-world/host-events";
import { createHostRoutes } from "../../features/events/host/handlers";
import { setHostMockState } from "../../features/events/host/mock";
import { encodeCheckInToken } from "../../shared/compute/checkin-token";

const actor = (id: string | null) => async () => (id ? ({ id } as never) : null);
const get = (path: string) => new Request(`http://localhost${path}`);
const send = (path: string, body: unknown, method = "POST") => new Request(`http://localhost${path}`, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method });
const params = (values: Record<string, string>) => ({ params: Promise.resolve(values) });
const data = async (response: Response) => (await response.json()).data;

test("mock center: empty / few / many / inactive follow b6 #0 / #1 / #2 and b12 #438", async () => {
  const routes = createHostRoutes({ resolveActor: actor("actor:host"), resolveMode: () => "mock" });
  setHostMockState({ center: "empty" });
  const empty = hostCenterResponseSchema.parse(await data(await routes.center(get("/api/host/center"))));
  assert.equal(empty.events.length, 0);
  assert.equal(empty.kpi, null);
  setHostMockState({ center: "few" });
  const few = hostCenterResponseSchema.parse(await data(await routes.center(get("/api/host/center"))));
  assert.deepEqual([few.summary.eventCount, few.spotlight?.pendingReview, few.next?.steps.length], [1, 3, 3]);
  setHostMockState({ center: "many" });
  const many = hostCenterResponseSchema.parse(await data(await routes.center(get("/api/host/center"))));
  assert.deepEqual([many.events.length, many.kpi?.appliedThisMonth, many.kpi?.followupRate, many.todo.length], [6, 188, 61, 3]);
  assert.equal(many.events[0]?.note.kind, "check_in_open");
  assert.equal(many.events[0]?.note.count, 42);
  const ended = hostCenterResponseSchema.parse(await data(await routes.center(get("/api/host/center?filter=ended"))));
  assert.equal(ended.events.length, 3);
  setHostMockState({ center: "inactive" });
  const inactive = hostCenterResponseSchema.parse(await data(await routes.center(get("/api/host/center"))));
  assert.deepEqual(inactive.events.map((row) => row.status), ["draft", "cancelled", "archived"]);
  setHostMockState(null);
});

test("mock console tabs read through the contract schemas", async () => {
  setHostMockState(null);
  const routes = createHostRoutes({ resolveActor: actor("actor:host"), resolveMode: () => "mock" });
  const cfo = { id: HOST_EVENT_IDS.cfo18 };
  const overview = hostOverviewResponseSchema.parse(await data(await routes.overview(get("/x"), params(cfo))));
  assert.deepEqual([overview.applied, overview.matchable, overview.checkedIn, overview.arrivalRate], [128, 112, 86, 67]);
  const matching = hostMatchingResponseSchema.parse(await data(await routes.matching(get("/x"), params(cfo))));
  assert.deepEqual([matching.state, matching.tableCount, matching.unplaced.length, matching.generationsLimit - matching.generationsUsed], ["draft", 22, 3, 2]);
  const people = hostPeopleResponseSchema.parse(await data(await routes.people(get("/x?bucket=pending"), params(cfo))));
  assert.deepEqual([people.counts.pending, people.counts.approved, people.counts.waitlisted, people.counts.rejected, people.rows.length, people.more, people.remaining], [12, 104, 8, 4, 8, 4, 46]);
  const kiosk = hostKioskResponseSchema.parse(await data(await routes.kiosk(get("/x?q=もり"), params(cfo))));
  assert.deepEqual(kiosk.rows.map((row) => row.status), ["not_arrived", "checked_in", "waitlisted"]);
  const setup = hostSetupResponseSchema.parse(await data(await routes.setup(get("/x"), params(cfo))));
  assert.deepEqual([setup.questions.length, setup.unpublishedChanges, setup.notices.length], [5, 2, 6]);
  const report = hostReportResponseSchema.parse(await data(await routes.report(get("/x"), params({ id: HOST_EVENT_IDS.cfo17 }))));
  assert.deepEqual([report.all?.checkInRate, report.all?.exchanges, report.all?.suppressedBelow], [84, 312, 5]);
  const mine = hostReportResponseSchema.parse(await data(await routes.report(get("/x?view=mine"), params({ id: HOST_EVENT_IDS.cfo17 }))));
  assert.equal(mine.mine?.unfollowed.length, 5);
  const cohosts = hostCohostsResponseSchema.parse(await data(await routes.cohosts(get("/x"), params(cfo))));
  assert.deepEqual(cohosts.members.map((member) => member.role), ["owner", "manager", "check_in", "read_only_analyst"]);
});

test("mock kiosk: QR v2 checks in once; old plaintext and other-event tokens are refused; undo returns the row", async () => {
  setHostMockState(null);
  const routes = createHostRoutes({ resolveActor: actor("actor:host"), resolveMode: () => "mock" });
  const cfo = { id: HOST_EVENT_IDS.cfo18 };
  const token = encodeCheckInToken({ eventId: HOST_EVENT_IDS.cfo18, exp: 1_900_000_000, participantId: "participant:hp-morita" }, "sample-signature-0000");
  const first = await data(await routes.scanCheckIn(send("/x", { idempotencyKey: "kiosk-key-1", payload: token }), params(cfo)));
  assert.deepEqual([first.status, first.duplicate], ["checked_in", false]);
  const again = await data(await routes.scanCheckIn(send("/x", { idempotencyKey: "kiosk-key-2", payload: token }), params(cfo)));
  assert.equal(again.duplicate, true);
  const plain = await routes.scanCheckIn(send("/x", { idempotencyKey: "kiosk-key-3", payload: `orbit-checkin:${HOST_EVENT_IDS.cfo18}:participant:hp-morita` }), params(cfo));
  assert.equal(plain.status, 404);
  const other = encodeCheckInToken({ eventId: HOST_EVENT_IDS.cfo17, exp: 1_900_000_000, participantId: "participant:hp-morita" }, "sample-signature-0000");
  assert.equal((await routes.scanCheckIn(send("/x", { idempotencyKey: "kiosk-key-4", payload: other }), params(cfo))).status, 404);
  const undone = await data(await routes.undoCheckIn(send("/x", { idempotencyKey: "kiosk-key-5" }), params({ ...cfo, participantId: "participant:hp-morita" })));
  assert.equal(undone.status, "not_arrived");
  const full = await routes.admitOnSite(send("/x", { idempotencyKey: "kiosk-key-6" }), params({ ...cfo, participantId: "participant:hp-morikawa" }));
  assert.equal(full.status, 409, "over capacity needs explicit confirmation");
  const admitted = await data(await routes.admitOnSite(send("/x", { confirmOverCapacity: true, idempotencyKey: "kiosk-key-7" }), params({ ...cfo, participantId: "participant:hp-morikawa" })));
  assert.equal(admitted.overCapacity, true);
  setHostMockState(null);
});

test("mock create → publish → cancel; strict bodies; public organizer page without sign-in", async () => {
  setHostMockState(null);
  const routes = createHostRoutes({ resolveActor: actor("actor:host"), resolveMode: () => "mock" });
  const created = hostEventWriteResultSchema.parse(await data(await routes.createEvent(send("/api/host/events", { endsAt: "2026-11-04T12:30:00.000Z", feeAmountYen: 5000, feeKind: "amount", organizerProfileId: "demo-org-cfo-night", startsAt: "2026-11-04T10:00:00.000Z", title: "CFO Night Tokyo vol.19" }))));
  assert.equal(created.event.lifecycle, "draft");
  const published = hostEventWriteResultSchema.parse(await data(await routes.publishEvent(send("/x", { expectedVersion: created.event.version }), params({ id: created.event.eventId }))));
  assert.match(published.event.participationCode ?? "", /^[2-9A-Z]{4}-[2-9A-Z]{4}$/u);
  const cancelled = hostEventWriteResultSchema.parse(await data(await routes.cancelEvent(send("/x", { expectedVersion: published.event.version, hostNote: "会場の都合により中止となりました。" }), params({ id: created.event.eventId }))));
  assert.equal(cancelled.event.lifecycle, "cancelled");
  assert.equal(cancelled.event.participationCode, null);
  assert.equal((await routes.cancelEvent(send("/x", { expectedVersion: 9, hostNote: "詳しくは https://example.com" }), params({ id: created.event.eventId }))).status, 400, "host note may not carry a link");
  assert.equal((await routes.createEvent(send("/api/host/events", { extra: 1, title: "x" }))).status, 400);
  const anonymous = createHostRoutes({ resolveActor: actor(null), resolveMode: () => "mock" });
  const page = organizerPublicResponseSchema.parse(await data(await anonymous.organizerPublic(get("/x"), params({ slug: "cfo-night" }))));
  assert.deepEqual([page.stats.eventsHeld, page.stats.attendeesTotal, page.following], [18, 2140, null]);
  setHostMockState(null);
});

test("live: unconfigured → 503, signed out → 401, the demo account is read-only", async () => {
  const live = createHostRoutes({ liveService: async () => null, resolveActor: actor("actor:host"), resolveMode: () => "live" });
  const unconfigured = await live.center(get("/api/host/center"));
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).error.context?.reason ?? "HOST_UNCONFIGURED", "HOST_UNCONFIGURED");
  const signedOut = createHostRoutes({ liveService: async () => null, resolveActor: actor(null), resolveMode: () => "live" });
  assert.equal((await signedOut.center(get("/api/host/center"))).status, 401);
  const demo = createHostRoutes({ liveService: async () => null, resolveActor: actor(DEMO_ACTOR_ID), resolveMode: () => "live" });
  assert.equal((await demo.center(get("/api/host/center"))).status, 200);
  const write = await demo.publishEvent(send("/x", { expectedVersion: 1 }), params({ id: HOST_EVENT_IDS.cfo18 }));
  assert.equal(write.status, 403);
});
