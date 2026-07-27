import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentSignalCandidate,
  AgentSignalRecordPayload,
} from "../../features/agent/signals/contract";
import { createStorageAgentSignalService } from "../../features/agent/signals/service";
import { createAgentSignalSourceCollector } from "../../features/agent/signals/source-collector";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function candidate(overrides: Partial<AgentSignalCandidate> = {}): AgentSignalCandidate {
  return {
    actions: [
      {
        actionId: "open",
        href: "/app/followups",
        label: "查看跟进",
      },
    ],
    confidence: 0.9,
    fingerprint: "followup_due:task-1",
    importance: 90,
    material: {
      dueAt: "2026-07-28T09:00:00.000Z",
      status: "open",
      title: "Follow up with Ada",
    },
    materialHash: "hash-1",
    occurredAt: "2026-07-28T09:00:00.000Z",
    reason: "Due today",
    severity: "critical",
    sources: [
      {
        capturedAt: "2026-07-27T09:00:00.000Z",
        evidenceIds: ["evidence-1"],
        sourceId: "task-source-1",
        sourceLabel: "Follow-up task",
        sourceType: "manual",
      },
    ],
    summary: "Follow up with Ada",
    targetId: "task-1",
    targetType: "task",
    title: "跟进 Ada",
    type: "followup_due",
    ...overrides,
  };
}

test("Agent signal refresh creates, deduplicates, reopens changed signals and resolves missing sources", async () => {
  const store = createMemoryLiveRecordStore<AgentSignalRecordPayload>();
  let now = "2026-07-27T10:00:00.000Z";
  let candidates: readonly AgentSignalCandidate[] = [candidate()];
  const service = createStorageAgentSignalService({
    actorId: "alice",
    collect: async () => candidates,
    now: () => now,
    store,
    workspaceId: "workspace",
  });

  const first = await service.refresh();
  assert.equal(first.created, 1);
  assert.equal(first.changed, 0);
  assert.equal(first.signals[0]?.status, "new");

  await service.updateStatus(first.signals[0]!.signalId, {
    status: "acknowledged",
  });
  now = "2026-07-27T10:05:00.000Z";
  const unchanged = await service.refresh();
  assert.equal(unchanged.created, 0);
  assert.equal(unchanged.changed, 0);
  assert.equal(unchanged.signals[0]?.status, "acknowledged");

  now = "2026-07-27T10:10:00.000Z";
  candidates = [
    candidate({
      material: {
        dueAt: "2026-07-27T09:00:00.000Z",
        status: "open",
        title: "Follow up with Ada",
      },
      materialHash: "hash-2",
      reason: "Overdue",
    }),
  ];
  const changed = await service.refresh();
  assert.equal(changed.changed, 1);
  assert.equal(changed.signals[0]?.status, "new");
  assert.deepEqual(changed.signals[0]?.changes, [
    {
      after: "2026-07-27T09:00:00.000Z",
      before: "2026-07-28T09:00:00.000Z",
      field: "dueAt",
    },
  ]);

  candidates = [];
  now = "2026-07-27T10:15:00.000Z";
  const resolved = await service.refresh();
  assert.equal(resolved.resolved, 1);
  assert.deepEqual(resolved.signals, []);
  assert.equal((await service.list({ includeResolved: true }))[0]?.status, "resolved");
});

test("Agent signals are actor scoped and snoozed items reopen at the requested time", async () => {
  const store = createMemoryLiveRecordStore<AgentSignalRecordPayload>();
  let now = "2026-07-27T10:00:00.000Z";
  const options = {
    collect: async () => [candidate()],
    now: () => now,
    store,
    workspaceId: "workspace",
  };
  const alice = createStorageAgentSignalService({
    ...options,
    actorId: "alice",
  });
  const bob = createStorageAgentSignalService({
    ...options,
    actorId: "bob",
  });
  const signal = (await alice.refresh()).signals[0]!;
  assert.deepEqual(await bob.list(), []);

  await alice.updateStatus(signal.signalId, {
    snoozedUntil: "2026-07-27T12:00:00.000Z",
    status: "snoozed",
  });
  assert.equal((await alice.list())[0]?.status, "snoozed");
  now = "2026-07-27T12:00:00.000Z";
  assert.equal((await alice.list())[0]?.status, "new");
});

test("Agent signal collector derives source-backed follow-up, event and stale relationship signals", async () => {
  const collector = createAgentSignalSourceCollector({
    actorId: "actor:agent-signal-source-collector",
    eventProvider: {
      source: "events",
      sourceLabel: "Events",
      createManualEvent: async () => {
        throw new Error("not used");
      },
      getEvent: async () => null,
      listEvents: async () => [
        {
          description: "Tokyo founder dinner",
          evidence: [
            {
              capturedAt: "2026-07-27T08:00:00.000Z",
              createdBy: "calendar-sync",
              evidenceId: "event-evidence-1",
              excerpt: "Calendar invitation",
            },
          ],
          id: "event-1",
          startsAt: "2026-07-28T09:00:00.000Z",
          status: "confirmed",
          title: "Fintech founder dinner",
          venue: "Tokyo",
          source: {
            id: "calendar-event-1",
            importedAt: "2026-07-27T08:00:00.000Z",
            provider: "google-calendar",
            providerRecordId: "gcal-1",
            type: "calendar_signal",
          },
        },
      ],
    },
    followupProvider: {
      readFollowupGraph: async () => ({
        connections: [
          {
            accountId: "account-1",
            contactId: "contact-1",
            createdAt: "2025-01-01T00:00:00.000Z",
            evidenceIds: ["relationship-evidence-1"],
            id: "connection-1",
            source: { id: "connection-source-1", type: "manual" },
            stage: "active",
            summary: "Met at a fintech conference.",
            updatedAt: "2025-01-01T00:00:00.000Z",
            valueTypes: ["commercial_opportunity"],
          },
        ],
        contacts: [
          {
            createdAt: "2025-01-01T00:00:00.000Z",
            displayName: "Ada",
            evidenceIds: ["relationship-evidence-1"],
            id: "contact-1",
            source: {
              id: "contact-source-1",
              label: "Imported contact",
              type: "manual",
            },
            stage: "active",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        evidence: [
          {
            confidence: 0.88,
            createdBy: "user",
            id: "relationship-evidence-1",
            occurredAt: "2025-01-01T00:00:00.000Z",
            sourceId: "note-1",
            sourceType: "manual",
            summary: "Met at a fintech conference.",
          },
        ],
        generatedAt: "2026-07-27T08:00:00.000Z",
        tasks: [
          {
            contactId: "contact-1",
            createdAt: "2026-07-20T00:00:00.000Z",
            dueAt: "2026-07-27T09:00:00.000Z",
            evidenceIds: ["relationship-evidence-1"],
            id: "task-1",
            source: { id: "task-source-1", type: "manual" },
            status: "open",
            title: "Send Ada the partnership note",
            updatedAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
      source: "followups",
      sourceLabel: "Follow-ups",
    },
    now: () => "2026-07-27T10:00:00.000Z",
  });

  const signals = await collector.collect();
  assert.deepEqual(
    new Set(signals.map((signal) => signal.type)),
    new Set(["followup_due", "event_upcoming", "relationship_stale"]),
  );
  assert.equal(
    signals.find((signal) => signal.type === "followup_due")?.sources[0]
      ?.evidenceIds[0],
    "relationship-evidence-1",
  );
  assert.equal(
    signals.find((signal) => signal.type === "event_upcoming")?.sources[0]
      ?.provider,
    "google-calendar",
  );
  assert.match(
    signals.find((signal) => signal.type === "relationship_stale")?.reason ??
      "",
    /天没有新的关系证据/,
  );
});
