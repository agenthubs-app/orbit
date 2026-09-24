import assert from "node:assert/strict";
import test from "node:test";

import {
  createCloudReminderTargetAuthorizer,
  createConfiguredCloudReminderChainServices,
  parseCloudReminderChainCommand,
  runCloudReminderChain,
  type CloudReminderChainServices,
} from "../../scripts/verify-cloud-reminder-chain";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService, ReminderPlanServiceError } from "../../features/notifications/reminder-plan-service";
import type { NotificationDeliveryDTO, ReminderPlanDTO } from "../../features/notifications/reminder-plan-contract";
import type { NoteDTO } from "../../features/notes/contract";
import type { TaskItemDTO } from "../../features/tasks/contract";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:synthetic-r2";
const CONTACT = "contact:synthetic-r2";
const TASK = "task:synthetic-r2";
const NOW = "2026-09-16T00:10:00.000Z";

function command(overrides: readonly string[] = []) {
  return parseCloudReminderChainCommand([
    "--actor-id", ACTOR,
    "--contact-id", CONTACT,
    "--task-id", TASK,
    "--fire-at", "2026-09-16T00:00:00.000Z",
    ...overrides,
  ]);
}

function note(): NoteDTO {
  return {
    accountId: ACTOR,
    body: "synthetic note",
    contactIds: [CONTACT],
    createdAt: NOW,
    eventIds: [],
    id: "note:synthetic-r2",
    manualContactIds: [CONTACT],
    mentions: [],
    ownerUserId: ACTOR,
    title: "R2 note",
    updatedAt: NOW,
    version: 1,
  };
}

function task(): TaskItemDTO {
  return {
    accountId: ACTOR,
    category: "relationship",
    createdAt: NOW,
    id: TASK,
    ownerUserId: ACTOR,
    priority: "normal",
    source: "manual",
    status: "open",
    title: "Synthetic task",
    updatedAt: NOW,
  };
}

function plan(status: ReminderPlanDTO["status"] = "scheduled"): ReminderPlanDTO {
  return {
    accountId: ACTOR,
    body: "synthetic reminder",
    channels: ["in_app"],
    createdAt: NOW,
    createdBy: "user",
    deepLink: "/app/tasks/task%3Asynthetic-r2",
    fireAt: "2026-09-16T00:00:00.000Z",
    id: "reminder:synthetic-r2",
    ownerUserId: ACTOR,
    status,
    targetId: TASK,
    targetType: "task",
    timeZone: "Asia/Shanghai",
    title: "R2 reminder",
    updatedAt: NOW,
  };
}

function delivery(reminderPlanId: string): NotificationDeliveryDTO {
  return {
    accountId: ACTOR,
    channel: "in_app",
    createdAt: NOW,
    deliveredAt: NOW,
    fireAt: "2026-09-16T00:00:00.000Z",
    id: "notification-delivery:synthetic-r2",
    ownerUserId: ACTOR,
    reminderPlanId,
    status: "delivered",
    updatedAt: NOW,
  };
}

function harness(input: { existingPlan?: ReminderPlanDTO } = {}): {
  services: CloudReminderChainServices;
  calls: { noteCreates: number; reminderCreates: number; dispatches: number; markReads: number };
} {
  let storedNote: NoteDTO | null = null;
  let storedPlan: ReminderPlanDTO | null = input.existingPlan ?? null;
  let storedDelivery: NotificationDeliveryDTO | null = null;
  let interaction: "read" | "ignored" | undefined;
  const calls = { noteCreates: 0, reminderCreates: 0, dispatches: 0, markReads: 0 };
  const services: CloudReminderChainServices = {
    notes: {
      async create() {
        calls.noteCreates += 1;
        storedNote = note();
        return storedNote;
      },
      async get() {
        return storedNote;
      },
      async search() {
        return { notes: storedNote ? [storedNote] : [], total: storedNote ? 1 : 0 };
      },
    },
    reminders: {
      async create() {
        calls.reminderCreates += 1;
        storedPlan = plan();
        return storedPlan;
      },
      async list() {
        return storedPlan ? [storedPlan] : [];
      },
      async dispatchDue() {
        calls.dispatches += 1;
        if (storedPlan) {
          storedPlan = { ...storedPlan, status: "delivered", deliveredAt: NOW, updatedAt: NOW };
          storedDelivery = delivery(storedPlan.id);
        }
        return { claimed: 1, inAppDelivered: 1, pushDelivered: 0, pushFailed: 0, quietHoursSuppressed: 0 };
      },
      async listDeliveries() {
        return storedDelivery ? [storedDelivery] : [];
      },
    },
    interactions: {
      async list() {
        return interaction ? { ["reminder:synthetic-r2"]: interaction } : {};
      },
      async set() {
        calls.markReads += 1;
        interaction = "read";
        return { notificationId: "reminder:synthetic-r2", state: "read", updatedAt: NOW };
      },
    },
    async readContact() {
      return { id: CONTACT, displayName: "Synthetic contact" } as never;
    },
    async readTask() {
      return task();
    },
    async readLegacyNotifications() {
      return [];
    },
  };
  return { services, calls };
}

test("defaults to a bounded dry-run and never enables push", () => {
  const parsed = command();
  assert.equal("help" in parsed, false);
  if ("help" in parsed) return;
  assert.equal(parsed.write, false);
  assert.equal(parsed.dispatch, false);
  assert.equal(parsed.markRead, false);
  assert.equal(parsed.timeZone, "Asia/Shanghai");
  assert.throws(
    () => parseCloudReminderChainCommand([
      "--actor-id", ACTOR, "--contact-id", CONTACT, "--task-id", TASK,
      "--dispatch",
    ]),
    /requires --write/u,
  );
  assert.throws(
    () => parseCloudReminderChainCommand([
      "--actor-id", ACTOR, "--contact-id", CONTACT, "--task-id", TASK,
      "--write",
    ]),
    /--run-id is required/u,
  );
  assert.throws(
    () => parseCloudReminderChainCommand([
      "--actor-id", ACTOR, "--contact-id", CONTACT, "--task-id", TASK,
      "--ios-push",
    ]),
    /Unknown option/u,
  );
});

test("configured verifier refuses without an explicitly configured database", () => {
  const keys = ["ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL", "VERCEL_ENV", "ORBIT_EXPECTED_DATABASE_HOST", "ORBIT_EXPECTED_WORKSPACE_ID"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(
      () => createConfiguredCloudReminderChainServices(ACTOR),
      /Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL first/u,
    );
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("cloud target authorizer uses only the local task-list dependency and preserves raw failures", async () => {
  const input = (targetType: "task" | "schedule_item", targetId: string, idempotencyKey: string) => ({
    actorId: ACTOR,
    body: "authorizer contract",
    channels: ["in_app"] as const,
    createdBy: "user" as const,
    deepLink: "/authorizer-contract",
    fireAt: "2026-09-16T01:00:00.000Z",
    idempotencyKey,
    targetId,
    targetType,
    timeZone: "UTC",
    title: "authorizer contract",
  });
  const createLocalService = (listTask: (actorId: string) => Promise<readonly TaskItemDTO[]>) => {
    const store = createMemoryLiveRecordStore<Record<string, unknown>>();
    const repository = createReminderPlanRepository({ store, workspaceId: "workspace:cloud-authorizer-test" });
    const service = createReminderPlanService({ now: () => NOW, repository, targetAuthorizer: createCloudReminderTargetAuthorizer(listTask) });
    return { service, store };
  };

  let listCalls = 0;
  const nonTask = createLocalService(async () => { listCalls += 1; return [task()]; });
  await assert.rejects(
    nonTask.service.create(input("schedule_item", "schedule:not-accepted", "non-task")),
    (error: unknown) => error instanceof ReminderPlanServiceError && error.code === "TARGET_NOT_OWNED",
  );
  assert.equal(listCalls, 0, "non-task input is rejected before task lookup");
  assert.equal((await nonTask.store.listRecords({ limit: "unbounded", workspaceId: "workspace:cloud-authorizer-test", collectionName: "reminderPlans" })).length, 0);

  const missing = createLocalService(async () => []);
  await assert.rejects(
    missing.service.create(input("task", TASK, "missing")),
    (error: unknown) => error instanceof ReminderPlanServiceError && error.code === "TARGET_NOT_OWNED",
  );
  assert.equal((await missing.store.listRecords({ limit: "unbounded", workspaceId: "workspace:cloud-authorizer-test", collectionName: "reminderPlans" })).length, 0);

  const successful = createLocalService(async (actorId) => actorId === ACTOR ? [task()] : []);
  const created = await successful.service.create(input("task", TASK, "success"));
  assert.equal(created.status, "scheduled");
  assert.equal((await successful.store.listRecords({ limit: "unbounded", workspaceId: "workspace:cloud-authorizer-test", collectionName: "reminderPlans" })).length, 1);

  for (const [label, failure] of [
    ["ordinary", new Error("ordinary task-list failure")],
    ["serialization", Object.assign(new Error("task-list serialization failure"), { code: "40001" })],
    ["deadlock", Object.assign(new Error("task-list deadlock failure"), { code: "40P01" })],
  ] as const) {
    const raw = createLocalService(async () => { throw failure; });
    await assert.rejects(
      raw.service.create(input("task", TASK, `raw-${label}`)),
      (error: unknown) => error === failure,
    );
    assert.equal((await raw.store.listRecords({ limit: "unbounded", workspaceId: "workspace:cloud-authorizer-test", collectionName: "reminderPlans" })).length, 0, `${label} authorizer failure must not write`);
  }
});

test("dry-run reads ownership and existing state without calling a write service", async () => {
  const { services, calls } = harness();
  const parsed = command();
  if ("help" in parsed) throw new Error("unexpected help");
  const report = await runCloudReminderChain(parsed, services, () => NOW);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.preflight.contactFound, true);
  assert.equal(report.preflight.taskOwnerMatches, true);
  assert.equal(report.complete, false);
  assert.deepEqual(calls, { noteCreates: 0, reminderCreates: 0, dispatches: 0, markReads: 0 });
});

test("full synthetic run writes one note, one in-app reminder, one delivery and one read interaction", async () => {
  const { services, calls } = harness();
  const parsed = command(["--run-id", "test-001", "--write", "--dispatch", "--mark-read"]);
  if ("help" in parsed) throw new Error("unexpected help");
  const report = await runCloudReminderChain(parsed, services, () => NOW);
  assert.equal(report.mode, "write");
  assert.equal(report.complete, true);
  assert.equal(report.chain.note.contactLinked, true);
  assert.equal(report.chain.note.reloaded, true);
  assert.equal(report.chain.delivery.status, "delivered");
  assert.equal(report.chain.delivery.channel, "in_app");
  assert.equal(report.chain.notification.interactionState, "read");
  assert.equal(report.chain.notification.legacyRecordMatched, false);
  assert.equal(report.sideEffects.pushProviderCalls, 0);
  assert.deepEqual(calls, { noteCreates: 1, reminderCreates: 1, dispatches: 1, markReads: 1 });
});

test("refuses a dispatch when an actor already has a due reminder", async () => {
  const { services, calls } = harness({ existingPlan: plan() });
  const parsed = command(["--run-id", "test-due-conflict", "--write", "--dispatch"]);
  if ("help" in parsed) throw new Error("unexpected help");
  await assert.rejects(
    runCloudReminderChain(parsed, services, () => NOW),
    /already has a due reminder/u,
  );
  assert.deepEqual(calls, { noteCreates: 0, reminderCreates: 0, dispatches: 0, markReads: 0 });
});
