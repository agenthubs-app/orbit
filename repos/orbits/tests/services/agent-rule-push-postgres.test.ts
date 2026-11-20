import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import type { AgentAutomationRecordPayload } from "../../features/agent/automations/contract";
import { dispatchDueAutomations, type AutomationDispatchDeps } from "../../features/agent/automations/dispatcher";
import { createPostgresAutomationStorage } from "../../features/agent/automations/due-index";
import { createRulePushPolicy } from "../../features/agent/automations/push-configured";
import type { RulePushDeps } from "../../features/agent/automations/push";
import { createAutomationRunStore, pushDueKeyOf } from "../../features/agent/automations/runs";
import { createStorageAgentAutomationService } from "../../features/agent/automations/service";
import { createDeliveryPolicyRepository } from "../../features/notifications/delivery-policy-repository";
import { createStoragePushDeviceService } from "../../features/notifications/push-device-service";
import { createEncryptedPushTokenVault } from "../../features/notifications/push-token-vault";
import type { OrbitPushMessage } from "../../features/notifications/push-adapter";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { FRIDAY_9, picked, ruleSpec } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG16 on a real database (PLANNER 易错边界 1/2/4/5): the reminder's own row of the due index is written in
 * the inbox delivery's transaction and survives a pass that dies before sending; the owner's quiet hours and daily
 * limit are read from the records every other automatic notification obeys, and a reminder that goes out counts
 * towards the same limit; a registered browser is sent to only through the reminder's own device list. Runs in a
 * private schema of the explicit local test database (ORBIT_EVENT_DATABASE_URL), never the application's own.
 */

const url = process.env.ORBIT_EVENT_DATABASE_URL ?? process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = url ? false : "A local PostgreSQL URL is required (ORBIT_EVENT_DATABASE_URL)";
const at = (value: string) => new Date(value).toISOString();
const tokenVault = createEncryptedPushTokenVault({ encryptionKeyBase64: Buffer.alloc(32, 9).toString("base64") });

async function harness() {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url!).hostname), "Local PostgreSQL only");
  const schema = `ag16_push_${randomUUID().replaceAll("-", "")}`;
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
  const create = (actorId: string, schedule: typeof FRIDAY_9 | { kind: "daily"; time: string; timeZone: string } = FRIDAY_9, push = true) => service(actorId).create({ capabilityId: "events.recommend", delivery: push ? "push" : "in_app", instruction: "周末活动", rule: ruleSpec({ notify: { inApp: true, push } }), title: "每周五挑三场周末活动", trigger: { kind: "schedule", schedule } });
  const devices = (actorId: string) => createStoragePushDeviceService({ actorId, now, store: createPostgresLiveRecordStore({ client }) as never, tokenVault, workspaceId });
  const sent: (OrbitPushMessage & { platform: string })[] = [];
  const failing = { value: false };
  const inbox: string[] = [];
  const push: RulePushDeps = {
    channel: {
      async send(message) {
        if (failing.value) throw new Error("the process died here");
        sent.push(message);
        return { receiptId: `ticket-${sent.length}`, verified: true };
      },
      supports: () => true,
    },
    devices: (ownerId) => ({
      async listActive() {
        return (await devices(ownerId).listActive({ includeWeb: true })).map((device) => ({ deviceId: device.deviceId, platform: device.platform, token: device.token }));
      },
      revoke: (deviceId) => devices(ownerId).revoke(deviceId, "provider_rejected"),
    }),
    now,
    policy: createRulePushPolicy({ client, workspaceId }),
    storage,
  };
  let picks = 0;
  const deps: AutomationDispatchDeps = {
    delivery: { inbox: async (entry) => { inbox.push(entry.semanticKey); return { id: `inbox:${entry.semanticKey}` }; }, now, storage },
    now,
    push,
    runPeriod: async () => picked([`E${(picks += 1)}`]),
    storage,
    timers: { expireCard: async () => "expired" },
  };
  return {
    client, clock, create, deps, devices, failing, inbox, now, pool, push, sent, service, storage, workspaceId,
    dispatch(time: string) {
      clock.now = at(time);
      return dispatchDueAutomations(deps);
    },
    runs: (ownerId: string, automationId: string) => createAutomationRunStore(storage.direct.store, workspaceId).list(ownerId, automationId, 50),
    async close() {
      await pool.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}

test("real storage: a phone and a browser both get the one reminder; the browser is invisible to the senders written for phones", { skip, timeout: 60_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const rule = await h.create("user:a");
  await h.create("user:b", FRIDAY_9, false);
  await h.devices("user:a").register({ deviceId: "phone", permission: "granted", platform: "ios", token: "ExponentPushToken[a]" });
  await h.devices("user:a").register({ deviceId: "browser", permission: "granted", platform: "web", token: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { auth: "a", p256dh: "p" } }) });
  await h.devices("user:a").register({ deviceId: "browser-no", permission: "denied", platform: "web", token: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/y", keys: { auth: "a", p256dh: "p" } }) });
  await h.devices("user:b").register({ deviceId: "phone-b", permission: "granted", platform: "ios", token: "ExponentPushToken[b]" });
  const summary = await h.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(summary.delivered, 2, "both accounts' results are in their inboxes");
  assert.deepEqual(h.sent.map((message) => message.platform).sort(), ["ios", "web"], "account b's task has no switch: its phone gets nothing; the denied browser gets nothing");
  const [run] = await h.runs("user:a", rule.automationId);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.attempts, run.delivery.push.targets?.length], ["delivered", 1, 2]);
  assert.deepEqual((await h.devices("user:a").listActive()).map((device) => device.deviceId), ["phone"]);
  assert.equal((await h.storage.listOwned("user:a", "delivery")).length, 0, "nothing left to do for this period");
  // Counted once towards the day's limit, whatever the number of devices.
  const counted = await h.client.query<{ n: string }>("select count(*)::text as n from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='notificationDeliveryReservations'", [h.workspaceId, "user:a"]);
  assert.equal(counted.rows[0].n, "1");
});

test("real storage: a pass that dies right after the inbox write does not lose the reminder — its row was written in the same transaction", { skip, timeout: 60_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const rule = await h.create("user:a");
  await h.devices("user:a").register({ deviceId: "phone", permission: "granted", platform: "ios", token: "ExponentPushToken[a]" });
  // The send blows up in a way pushRun does not catch for its bookkeeping: simulate the process dying by removing the channel's answer.
  const realPush = h.deps.push;
  h.deps.push = { ...realPush!, devices: () => { throw new Error("the process died here"); } };
  await h.dispatch("2026-11-20T09:10:00+09:00");
  let [run] = await h.runs("user:a", rule.automationId);
  assert.deepEqual([run.outcome, run.delivery.inbox.state, run.delivery.push.state, run.delivery.push.attempts], ["delivered", "delivered", "pending", 0]);
  const row = (await h.storage.listOwned("user:a", "delivery")).find((item) => item.key === pushDueKeyOf(run.runId));
  assert.equal(row?.nextRunAt, at("2026-11-20T09:15:00+09:00"), "the safety row comes due five minutes later");
  h.deps.push = realPush;
  const second = await h.dispatch("2026-11-20T09:20:00+09:00");
  [run] = await h.runs("user:a", rule.automationId);
  assert.deepEqual([run.delivery.push.state, run.delivery.push.attempts, second.periods, h.inbox.length, h.sent.length], ["delivered", 1, 0, 1, 1]);
  assert.equal(run.computedAt, at("2026-11-20T09:10:00+09:00"));
  assert.equal(run.delivery.push.deliveredAt, at("2026-11-20T09:20:00+09:00"));
});

test("real storage (视觉稿 D16-4, approved 2026-11-20): quiet hours and the daily limit hold a reminder back, read from the owner's own notification settings", { skip, timeout: 60_000 }, async (t) => {
  const h = await harness();
  t.after(() => h.close());
  // A task that runs at 23:00: inside the default quiet hours (22:00–07:30, Asia/Tokyo).
  const night = await h.create("user:a", { kind: "daily", time: "23:00", timeZone: "Asia/Tokyo" });
  await h.devices("user:a").register({ deviceId: "phone", permission: "granted", platform: "ios", token: "ExponentPushToken[a]" });
  await h.dispatch("2026-11-15T23:10:00+09:00");
  let [run] = await h.runs("user:a", night.automationId);
  assert.deepEqual([run.outcome, run.delivery.push.state, run.delivery.push.reason], ["delivered", "skipped", "quiet_hours"]);
  assert.equal(h.sent.length, 0);
  assert.equal(h.inbox.length, 1, "the result is in the inbox");

  // Daytime, with the day's three automatic notifications already used up.
  const day = await h.create("user:c", { kind: "daily", time: "09:00", timeZone: "Asia/Tokyo" });
  await h.devices("user:c").register({ deviceId: "phone-c", permission: "granted", platform: "ios", token: "ExponentPushToken[c]" });
  await h.dispatch("2026-11-16T09:10:00+09:00");
  await h.dispatch("2026-11-16T09:11:00+09:00");
  [run] = await h.runs("user:c", day.automationId);
  assert.equal(run.delivery.push.state, "delivered", "under the limit it goes out");
  const repository = createDeliveryPolicyRepository({ client: h.client, now: h.now, workspaceId: h.workspaceId });
  h.clock.now = at("2026-11-17T08:00:00+09:00");
  for (const key of ["x1", "x2", "x3"]) await repository.tx("user:c", (database) => repository.save(database, "notificationDeliveryReservations", `r-${key}`, "user:c", { at: h.clock.now, eventKey: key, suggestion: false, timeZone: "Asia/Tokyo" }));
  // (Account a's night task catches up in the daytime passes below and is reminded then; only account c is counted here.)
  const toC = () => h.sent.filter((message) => message.token === "ExponentPushToken[c]").length;
  const before = toC();
  await h.dispatch("2026-11-17T09:10:00+09:00");
  [run] = await h.runs("user:c", day.automationId);
  assert.deepEqual([run.scheduledAt, run.delivery.push.state, run.delivery.push.reason], [at("2026-11-17T09:00:00+09:00"), "skipped", "daily_cap"]);
  assert.equal(toC(), before);

  // The owner turned "updates" off in the notification settings: no reminder, the inbox still gets the result.
  const prefs = await repository.preferences("user:c");
  await repository.updatePreferences("user:c", { expectedRevision: prefs.revision, updateEnabled: false }, async () => true);
  await h.dispatch("2026-11-18T09:10:00+09:00");
  [run] = await h.runs("user:c", day.automationId);
  assert.deepEqual([run.outcome, run.delivery.push.state, run.delivery.push.reason], ["delivered", "skipped", "notifications_off"]);
});
