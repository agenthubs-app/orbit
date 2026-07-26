import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import {
  nextAgentAutomationRunAt,
  type AgentAutomationRecordPayload,
} from "../../features/agent/automations/contract";
import {
  createStorageAgentAutomationService,
} from "../../features/agent/automations/service";
import { runAgentAutomation } from "../../features/agent/automations/runner";

test("agent automation schedules preserve the user's time zone", () => {
  assert.equal(
    nextAgentAutomationRunAt(
      {
        kind: "daily",
        time: "09:30",
        timeZone: "Asia/Tokyo",
      },
      "2026-07-26T00:00:00.000Z",
    ),
    "2026-07-26T00:30:00.000Z",
  );

  assert.equal(
    nextAgentAutomationRunAt(
      {
        daysOfWeek: [1, 5],
        kind: "weekly",
        time: "09:00",
        timeZone: "Asia/Tokyo",
      },
      "2026-07-26T12:00:00.000Z",
    ),
    "2026-07-27T00:00:00.000Z",
  );

  assert.equal(
    nextAgentAutomationRunAt(
      {
        at: "2026-07-27T03:00:00.000Z",
        kind: "once",
      },
      "2026-07-26T12:00:00.000Z",
    ),
    "2026-07-27T03:00:00.000Z",
  );
});

test("agent automations are actor scoped and support create, pause, resume, and delete", async () => {
  const store = createMemoryLiveRecordStore<AgentAutomationRecordPayload>();
  let now = "2026-07-26T12:00:00.000Z";
  const alice = createStorageAgentAutomationService({
    actorId: "alice",
    id: () => "automation-alice-1",
    now: () => now,
    store,
    workspaceId: "workspace",
  });
  const bob = createStorageAgentAutomationService({
    actorId: "bob",
    id: () => "automation-bob-1",
    now: () => now,
    store,
    workspaceId: "workspace",
  });

  const created = await alice.create({
    capabilityId: "followups.reviewQueue",
    delivery: "in_app",
    instruction: "Review relationships that need attention this week.",
    trigger: {
      kind: "schedule",
      schedule: {
        kind: "daily",
        time: "09:00",
        timeZone: "Asia/Tokyo",
      },
    },
    title: "Morning relationship review",
  });

  assert.equal(created.automationId, "automation-alice-1");
  assert.equal(created.status, "active");
  assert.equal((await alice.list()).length, 1);
  assert.equal((await bob.list()).length, 0);

  now = "2026-07-26T12:01:00.000Z";
  const paused = await alice.update(created.automationId, {
    status: "paused",
  });
  assert.equal(paused.status, "paused");
  assert.equal(paused.nextRunAt, null);

  const resumed = await alice.update(created.automationId, {
    status: "active",
  });
  assert.equal(resumed.status, "active");
  assert.equal(resumed.nextRunAt, "2026-07-27T00:00:00.000Z");

  await alice.remove(created.automationId);
  assert.deepEqual(await alice.list(), []);
});

test("agent automations only accept capabilities declared safe for user automation", async () => {
  const service = createStorageAgentAutomationService({
    actorId: "actor",
    id: () => "automation-1",
    leaseId: () => "lease-1",
    now: () => "2026-07-26T12:00:00.000Z",
    store: createMemoryLiveRecordStore<AgentAutomationRecordPayload>(),
    workspaceId: "workspace",
  });

  await assert.rejects(
    service.create({
      capabilityId: "calendar.syncEvent",
      delivery: "in_app",
      instruction: "Create calendar events automatically.",
      trigger: {
        kind: "schedule",
        schedule: {
          at: "2026-07-27T03:00:00.000Z",
          kind: "once",
        },
      },
      title: "Unsafe calendar automation",
    }),
    /does not allow user-configurable automation/,
  );
});

test("due automations are claimed once and advance after a successful run", async () => {
  const service = createStorageAgentAutomationService({
    actorId: "actor",
    id: () => "automation-1",
    leaseId: () => "lease-1",
    now: () => "2026-07-26T12:00:00.000Z",
    store: createMemoryLiveRecordStore<AgentAutomationRecordPayload>(),
    workspaceId: "workspace",
  });
  const created = await service.create({
    capabilityId: "followups.reviewQueue",
    delivery: "in_app",
    instruction: "Review this week's follow-ups.",
    trigger: {
      kind: "schedule",
      schedule: {
        kind: "daily",
        time: "21:01",
        timeZone: "Asia/Tokyo",
      },
    },
    title: "Daily follow-up review",
  });

  const claimed = await service.claimDue({
    limit: 10,
    now: "2026-07-26T12:01:00.000Z",
    workerId: "worker-1",
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].status, "running");
  assert.deepEqual(
    await service.claimDue({
      limit: 10,
      now: "2026-07-26T12:01:00.000Z",
      workerId: "worker-2",
    }),
    [],
  );

  const completed = await service.recordRun({
    automationId: created.automationId,
    completedAt: "2026-07-26T12:02:00.000Z",
    leaseId: "lease-1",
    outcome: {
      status: "success",
      summary: "Three relationships need attention.",
    },
  });
  assert.equal(completed.status, "active");
  assert.equal(completed.lastRun?.status, "success");
  assert.equal(completed.nextRunAt, "2026-07-27T12:01:00.000Z");
});

test("expired automation leases are reclaimed and fence stale workers", async () => {
  const leaseIds = ["lease-1", "lease-2"];
  const service = createStorageAgentAutomationService({
    actorId: "actor",
    id: () => "automation-1",
    leaseId: () => leaseIds.shift() ?? "lease-fallback",
    now: () => "2026-07-26T12:00:00.000Z",
    store: createMemoryLiveRecordStore<AgentAutomationRecordPayload>(),
    workspaceId: "workspace",
  });
  const automation = await service.create({
    capabilityId: "followups.reviewQueue",
    delivery: "in_app",
    instruction: "Review this week's follow-ups.",
    trigger: {
      kind: "schedule",
      schedule: {
        kind: "daily",
        time: "21:01",
        timeZone: "Asia/Tokyo",
      },
    },
    title: "Daily follow-up review",
  });

  const firstClaim = await service.claimDue({
    limit: 10,
    now: "2026-07-26T12:01:00.000Z",
    workerId: "worker-1",
  });
  assert.equal(firstClaim[0].lease?.leaseId, "lease-1");
  assert.deepEqual(
    await service.claimDue({
      limit: 10,
      now: "2026-07-26T12:05:59.999Z",
      workerId: "worker-2",
    }),
    [],
  );

  const reclaimed = await service.claimDue({
    limit: 10,
    now: "2026-07-26T12:06:00.000Z",
    workerId: "worker-2",
  });
  assert.equal(reclaimed[0].lease?.leaseId, "lease-2");

  await assert.rejects(
    service.recordRun({
      automationId: automation.automationId,
      completedAt: "2026-07-26T12:06:01.000Z",
      leaseId: "lease-1",
      outcome: {
        status: "success",
        summary: "Stale worker result.",
      },
    }),
    /lease is no longer owned/,
  );
  const completed = await service.recordRun({
    automationId: automation.automationId,
    completedAt: "2026-07-26T12:06:02.000Z",
    leaseId: "lease-2",
    outcome: {
      status: "success",
      summary: "Current worker result.",
    },
  });
  assert.equal(completed.lastRun?.summary, "Current worker result.");
});

test("agent automations can run immediately and persist their real result summary", async () => {
  let clock = 0;
  const times = [
    "2026-07-26T12:00:00.000Z",
    "2026-07-26T12:01:00.000Z",
    "2026-07-26T12:01:02.000Z",
  ];
  const service = createStorageAgentAutomationService({
    actorId: "actor",
    id: () => "automation-1",
    leaseId: () => "lease-1",
    now: () => times[Math.min(clock++, times.length - 1)],
    store: createMemoryLiveRecordStore<AgentAutomationRecordPayload>(),
    workspaceId: "workspace",
  });
  const automation = await service.create({
    capabilityId: "followups.reviewQueue",
    delivery: "in_app",
    instruction: "Review this week's follow-ups.",
    trigger: {
      kind: "schedule",
      schedule: {
        kind: "daily",
        time: "09:00",
        timeZone: "Asia/Tokyo",
      },
    },
    title: "Daily follow-up review",
  });

  const completed = await runAgentAutomation(
    service,
    automation.automationId,
    {
      execute: async (claimed) => ({
        runId: `run:${claimed.automationId}`,
        summary: "Three relationships need attention.",
      }),
      now: () => times[Math.min(clock++, times.length - 1)],
      workerId: "manual-run",
    },
  );

  assert.equal(completed.runCount, 1);
  assert.equal(completed.lastRun?.status, "success");
  assert.equal(completed.lastRun?.summary, "Three relationships need attention.");
  assert.equal(completed.lastRun?.runId, "run:automation-1");
});
