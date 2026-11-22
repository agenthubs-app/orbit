import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import type { AgentAutomationRecordPayload } from "../../features/agent/automations/contract";
import { dispatchDueAutomations, type AutomationDispatchDeps } from "../../features/agent/automations/dispatcher";
import { createPostgresAutomationStorage } from "../../features/agent/automations/due-index";
import { createAutomationRunStore } from "../../features/agent/automations/runs";
import { AGENT_AUTOMATION_COLLECTION, createStorageAgentAutomationService } from "../../features/agent/automations/service";
import { createDeliveryPolicyRepository } from "../../features/notifications/delivery-policy-repository";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { createTypedDeliveryRuntime } from "../../features/notifications/typed-delivery-factory";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { FRIDAY_9, picked, ruleSpec } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG15-2 on a real database (PLANNER 易错边界 2/3/4/6): the claim is atomic across connections; a rule and
 * its index row, and a run with its pending delivery and the rule's next period, are each one transaction; the inbox
 * entry of a run is readable by its owner and is never a push candidate. Runs in a private schema of the explicit
 * local test database (ORBIT_EVENT_DATABASE_URL), never the application's own.
 */

const url = process.env.ORBIT_EVENT_DATABASE_URL ?? process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = url ? false : "A local PostgreSQL URL is required (ORBIT_EVENT_DATABASE_URL)";
const at = (value: string) => new Date(value).toISOString();

async function harness() {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url!).hostname), "Local PostgreSQL only");
  const schema = `ag15_dispatch_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: url, max: 6, options: `-c search_path=${schema} -c statement_timeout=30000` });
  const client = createTransactionalPostgresClient({ connectionString: url!, pool });
  await runOrbitRecordsMigration(client);
  const workspaceId = `workspace:${schema}`;
  const storage = createPostgresAutomationStorage({ client, workspaceId });
  const clock = { now: "2026-11-15T01:00:00.000Z" };
  const now = () => clock.now;
  const service = (actorId: string) => createStorageAgentAutomationService({ actorId, now, storage, store: storage.direct.store as unknown as LiveRecordStoreLike<AgentAutomationRecordPayload>, workspaceId });
  const create = (actorId: string, title = "每周五挑三场周末活动") => service(actorId).create({ capabilityId: "events.recommend", delivery: "in_app", instruction: "周末活动", rule: ruleSpec(), title, trigger: { kind: "schedule", schedule: FRIDAY_9 } });
  return {
    clock, client, create, now, pool, service, storage, workspaceId,
    async close() {
      await pool.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}

test("real storage: the migration makes the due index; two dispatchers claiming at once never take the same row", { skip, timeout: 60_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const owners = Array.from({ length: 12 }, (_unused, index) => `user:${String(index).padStart(2, "0")}`);
  for (const owner of owners) await h.create(owner);
  const due = at("2026-11-20T09:10:00+09:00");
  const claims = await Promise.all(["one", "two", "three"].map((leaseId) => h.storage.claimDue({ leaseId, leaseMs: 300_000, limit: 5, now: due })));
  const taken = claims.flat();
  assert.equal(new Set(taken.map((item) => item.ownerId)).size, taken.length, "no row was claimed twice");
  assert.equal(taken.length, 12, "three claims of five took all twelve between them");
  for (const item of taken) assert.equal(item.nextRunAt, at("2026-11-20T09:00:00+09:00"));
  assert.deepEqual(await h.storage.claimDue({ leaseId: "four", leaseMs: 300_000, limit: 50, now: due }), [], "leased rows are not handed out again");
  // A lease that ran out (a dispatcher that died) is taken over.
  assert.equal((await h.storage.claimDue({ leaseId: "five", leaseMs: 300_000, limit: 50, now: at("2026-11-20T09:20:00+09:00") })).length, 12);
});

test("real storage: a rule and its index row are one transaction — a failure leaves neither", { skip, timeout: 60_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const rule = await h.create("user:a");
  const scoped = `${h.workspaceId}:agent-actor:user:a`;
  const record = (await h.storage.direct.store.getRecord({ collectionName: AGENT_AUTOMATION_COLLECTION, recordId: rule.automationId, workspaceId: scoped }))!;
  assert.ok(await h.storage.direct.due.get({ key: rule.automationId, kind: "rule", ownerId: "user:a" }));
  await assert.rejects(() => h.storage.transaction(async (tx) => {
    await tx.store.upsertRecord({ ...record, payload: { automation: { ...(record.payload.automation as object), title: "写到一半" } }, recordId: "rule:half" });
    await tx.due.put({ definition: {}, key: "rule:half", kind: "rule", nextRunAt: at("2026-11-20T09:00:00+09:00"), ownerId: "user:a", status: "active", updatedAt: h.now(), version: 1 });
    throw new Error("the transaction fails after both writes");
  }), /fails after both writes/u);
  assert.equal(await h.storage.direct.store.getRecord({ collectionName: AGENT_AUTOMATION_COLLECTION, recordId: "rule:half", workspaceId: scoped }), null);
  assert.equal(await h.storage.direct.due.get({ key: "rule:half", kind: "rule", ownerId: "user:a" }), null);
  // Pausing through the service changes the record and the row together.
  await h.service("user:a").update(rule.automationId, { status: "paused" });
  assert.deepEqual([(await h.service("user:a").get(rule.automationId))?.status, (await h.storage.direct.due.get({ key: rule.automationId, kind: "rule", ownerId: "user:a" }))?.status], ["paused", "paused"]);
});

test("real storage: two accounts at the same time — one stored run and one inbox entry each, readable only by its owner; the entries are not push candidates", { skip, timeout: 90_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const a = await h.create("user:a");
  const b = await h.create("user:b", "每周五看看有什么活动");
  const inbox = createInboxRuntime({ client: h.client, now: h.now, workspaceId: h.workspaceId });
  const computed: string[] = [];
  const deps: AutomationDispatchDeps = {
    delivery: { inbox: (entry) => inbox.service.upsert(entry), now: h.now, storage: h.storage },
    now: h.now,
    runPeriod: async (input) => {
      computed.push(input.ownerId);
      return picked(input.ownerId === "user:a" ? ["E101", "E102", "E105"] : ["E101", "E104", "E102"]);
    },
    storage: h.storage,
    timers: { expireCard: async () => "unchanged" },
  };
  h.clock.now = at("2026-11-20T09:10:00+09:00");
  // Two dispatchers at once: every period is still computed once.
  const [first, second] = await Promise.all([dispatchDueAutomations(deps), dispatchDueAutomations(deps)]);
  assert.equal(first.periods + second.periods, 2);
  assert.deepEqual(computed.sort(), ["user:a", "user:b"]);
  const runs = createAutomationRunStore(h.storage.direct.store, h.workspaceId);
  const [runA] = await runs.list("user:a", a.automationId, 10);
  assert.deepEqual([runA.outcome, runA.delivery.inbox.state, runA.items.map((item) => item.id)], ["delivered", "delivered", ["E101", "E102", "E105"]]);
  assert.deepEqual(await runs.list("user:a", b.automationId, 10), [], "an account's history holds only its own rules");
  assert.equal((await h.storage.listOwned("user:a", "delivery")).length, 0);
  assert.equal((await h.storage.direct.due.get({ key: a.automationId, kind: "rule", ownerId: "user:a" }))?.nextRunAt, at("2026-11-27T09:00:00+09:00"));

  const listA = await inbox.service.list("user:a", { limit: 50 });
  const listB = await inbox.service.list("user:b", { limit: 50 });
  assert.equal(listA.items.length, 1);
  assert.equal(listB.items.length, 1);
  assert.equal(listA.items[0].sources[0].sourceKind, "automation_result");
  assert.equal(listA.items[0].target.status, "available", "the owner may read the run its entry points at");
  assert.match(listA.items[0].reason, /E105/u);
  assert.doesNotMatch(listB.items[0].reason, /E105/u);
  assert.equal(listA.unreadCount, 1);
  // The other account cannot open this entry.
  await assert.rejects(() => inbox.service.get("user:b", listA.items[0].id), /not found/iu);

  // The existing push pipeline turns unread inbox entries into candidates; the agent's own entries are left out of it.
  const repository = createDeliveryPolicyRepository({ client: h.client, now: h.now, workspaceId: h.workspaceId });
  await repository.tx("user:a", (db) => repository.save(db, "notificationCutover", "user:a", "user:a", { batchId: "ag15", enabled: true, generation: 1, legacyBlocked: true, since: "2026-11-01T00:00:00.000Z" }));
  await inbox.service.upsert({ actions: ["read"], actorId: "user:a", kind: "update", occurredAt: h.now(), origin: "business", reason: "主办方改了时间", semanticKey: "control:host-notice", sources: [{ occurredAt: h.now(), readAt: h.now(), sourceId: "notice:1", sourceKind: "event_host_notice", sourceRevision: "1" }], target: { href: null, id: "event:1", kind: "event", status: "available" }, title: "活动时间变更" });
  const delivery = createTypedDeliveryRuntime({ actorId: "user:a", client: h.client, devices: { listActive: async () => [], register: async () => { throw new Error("not used"); }, revoke: async () => null } as never, now: h.now, push: null, workspaceId: h.workspaceId });
  const counts = await delivery.materialize();
  assert.equal(counts.notifications, 1, "only the ordinary entry became a push candidate; the scheduled task's result did not");
});

test("real storage: a delivery that failed is sent again from the stored run; nothing is computed twice", { skip, timeout: 60_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const rule = await h.create("user:a");
  const inbox = createInboxRuntime({ client: h.client, now: h.now, workspaceId: h.workspaceId });
  let fail = true;
  let computed = 0;
  const deps: AutomationDispatchDeps = {
    delivery: { inbox: async (entry) => { if (fail) throw new Error("inbox write failed"); return inbox.service.upsert(entry); }, now: h.now, storage: h.storage },
    now: h.now,
    runPeriod: async () => { computed += 1; return picked(["E101"]); },
    storage: h.storage,
    timers: { expireCard: async () => "unchanged" },
  };
  h.clock.now = at("2026-11-20T09:10:00+09:00");
  await dispatchDueAutomations(deps);
  const runs = createAutomationRunStore(h.storage.direct.store, h.workspaceId);
  assert.deepEqual([(await runs.list("user:a", rule.automationId, 10))[0].outcome, (await h.storage.listOwned("user:a", "delivery")).length], ["undelivered", 1], "the result and what is still to deliver were stored together");
  fail = false;
  h.clock.now = at("2026-11-20T09:20:00+09:00");
  const retry = await dispatchDueAutomations(deps);
  assert.deepEqual([retry.periods, retry.deliveriesRetried, computed], [0, 1, 1]);
  assert.equal((await runs.list("user:a", rule.automationId, 10))[0].outcome, "delivered");
  assert.equal((await inbox.service.list("user:a", { limit: 50 })).items.length, 1);
  h.clock.now = at("2026-11-20T09:30:00+09:00");
  await dispatchDueAutomations(deps);
  assert.equal((await inbox.service.list("user:a", { limit: 50 })).items.length, 1);
});
