import assert from "node:assert/strict";
import test from "node:test";
import { createTodoPlanReaders } from "../../features/todo/plan-sources";
import { createTodoPageService } from "../../features/todo/service";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { demoPlanEventFacts } from "../../features/plans/v2/event-facts";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { draftInput } from "../plans/v2-fixture";

test("bounded read-only plan sources expose a real next move and reject incomplete reads", databaseTest, async () => withNetworkDatabase(async ({ pool }) => {
  const actorId = "a", now = () => new Date("2026-10-18T00:00:00Z");
  let eventReads = 0;
  const native = createPlanV2Service({ repository: createPostgresPlanV2Repository({ pool }), scope: { actorId, workspaceId: WORKSPACE }, now,
    events: async () => { eventReads++; return demoPlanEventFacts(); } });
  const { plan } = await native.createPlanFromDraft(draftInput());
  await native.skip({ planId: plan.planId, itemId: plan.content.personTypes.find(item => item.key === "cfo")!.itemId, idempotencyKey: "skip-cfo" });
  const expected = await native.pending(); assert.ok(expected.length > 0);
  assert.equal(eventReads, 1);
  const checked = new Set<string>();
  const readers = createTodoPlanReaders({ pool, workspaceId: WORKSPACE, now, assertAllowed: collection => { checked.add(collection); }, events: async () => demoPlanEventFacts() });
  const errors: unknown[] = [];
  const live = createTodoPageService({ workspaceId: WORKSPACE, secret: "local-secret-".repeat(4), readers, now: () => now().toISOString(), onError: error => errors.push(error) });
  const input = { actorId, date: "2026-10-18", timeZone: "Asia/Tokyo" };
  const before = (await pool.query("select count(*)::int as n from plan_log")).rows[0].n;
  const page = await live.read(input);
  assert.equal(page.sources.plan_pending, "ok");
  assert.equal(page.sources.plan_today_chance, "ok", "an active plan with a future matching event has a next move");
  assert.equal(page.counts.nextMoves, 1);
  assert.equal(page.nextMoves.items[0]?.eventId, "demo-event-saas-summit");
  assert.equal(page.counts.decisions, expected.length);
  assert.deepEqual(page.decisions.items.map(item => item.sourceId).sort(), expected.map(item => item.id).sort());
  assert.deepEqual(page.decisions.items.map(item => item.titlePreview).sort(), expected.map(item => item.title).sort());
  assert.equal((await pool.query("select count(*)::int as n from plan_log")).rows[0].n, before);
  assert.deepEqual(errors, []);
  assert.ok(checked.has("plans")); assert.ok(checked.has("plan_items")); assert.ok(checked.has("plan_log")); assert.ok(checked.has("contacts"));
  assert.ok(checked.has("events"), "event facts for today's chance must pass the read budget gate");
  const otherDay = await live.read({ ...input, date: "2026-10-17" });
  assert.equal(otherDay.sources.plan_pending, "ok");
  assert.equal(otherDay.sources.plan_today_chance, "ok");
  assert.equal(otherDay.nextMoves.items.length, 0, "a page for yesterday cannot show today's chance");
  const losAngeles = await live.read({ ...input, date: "2026-10-17", timeZone: "America/Los_Angeles" });
  assert.equal(losAngeles.sources.plan_today_chance, "ok");
  assert.match(losAngeles.nextMoves.items[0]?.titlePreview ?? "", /10月21日/, "chance wording uses the requested zone's event date");
  let clockReads = 0;
  let eventReadAt: Date | undefined;
  const crossing = createTodoPlanReaders({ pool, workspaceId: WORKSPACE, assertAllowed() {}, events: async (_actorId, at) => { eventReadAt = at; return demoPlanEventFacts(); },
    now: () => new Date(clockReads++ === 0 ? "2026-10-18T14:59:59.000Z" : "2026-10-18T15:00:01.000Z") });
  const beforeMidnight = await crossing.plan_today_chance({ ...input, cursor: null, limit: 3 });
  assert.equal(beforeMidnight.total, 1, "one read keeps the opening local date across midnight");
  assert.equal(eventReadAt?.toISOString(), "2026-10-18T14:59:59.000Z", "event facts share the same read instant");
  const noPlan = await live.read({ ...input, actorId: "actor-without-plan" });
  assert.equal(noPlan.sources.plan_pending, "ok");
  assert.equal(noPlan.sources.plan_today_chance, "not_implemented", "no current plan is not an exact zero chance");
  assert.equal(noPlan.nextMoves.items.length, 0);
  const failedEvents = createTodoPageService({ workspaceId: WORKSPACE, secret: "local-secret-".repeat(4),
    readers: createTodoPlanReaders({ pool, workspaceId: WORKSPACE, now, assertAllowed() {},
      events: async () => { throw Error("EVENT_PROVIDER_FAILED"); } }), onError() {} });
  const unavailable = await failedEvents.read(input);
  assert.equal(unavailable.sources.plan_pending, "ok");
  assert.equal(unavailable.sources.plan_today_chance, "unavailable", "event failure affects only the chance source");
  assert.equal(unavailable.nextMoves.items.length, 0);
  const eventBudgetClosed = createTodoPageService({ workspaceId: WORKSPACE, secret: "local-secret-".repeat(4),
    readers: createTodoPlanReaders({ pool, workspaceId: WORKSPACE, now, events: async () => demoPlanEventFacts(),
      assertAllowed(collection) { if (collection === "events") throw Error("READ_BUDGET_EXCEEDED"); } }), onError() {} });
  const partial = await eventBudgetClosed.read(input);
  assert.equal(partial.sources.plan_pending, "ok");
  assert.equal(partial.sources.plan_today_chance, "unavailable", "blocked event facts cannot become a precise zero");
  // Enough historical source rows to exceed the adapter's explicit per-query cap.
  // A truncated log would lose prior decisions and resurrect dismissed cards.
  await pool.query(`insert into plan_log(workspace_id,id,actor_id,plan_id,kind,event,author,body,payload,idempotency_key)
    select $1,'growth:'||n,$2,$3,'auto','pending_dismissed','user','dismissed',jsonb_build_object('pendingId','x'||n),'growth:'||n from generate_series(1,110) n`, [WORKSPACE, actorId, plan.planId]);
  const over = await live.read(input);
  assert.equal(over.sources.plan_pending, "unavailable");
  assert.equal(over.decisions.items.length, 0); assert.equal(over.counts.decisions, 0);
  assert.equal(errors.length, 2); // pending and summary both need the now-oversized log
  const denied = createTodoPlanReaders({ pool, workspaceId: WORKSPACE, now, assertAllowed() { throw Error("READ_BUDGET_EXCEEDED"); } });
  await assert.rejects(denied.plan_pending({ ...input, cursor: null, limit: 5 }), /READ_BUDGET_EXCEEDED/);
}));
