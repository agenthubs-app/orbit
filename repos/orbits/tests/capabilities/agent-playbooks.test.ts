import assert from "node:assert/strict";
import test from "node:test";

import {
  createStorageAgentAutomationService,
} from "../../features/agent/automations/service";
import {
  runAgentAutomationsForSignals,
} from "../../features/agent/automations/runner";
import type {
  AgentAutomationRecordPayload,
} from "../../features/agent/automations/contract";
import {
  createAgentPlaybookCompiler,
} from "../../features/agent/playbooks/compiler";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("natural language compiles into a bounded read-only Playbook draft", async () => {
  let systemInstruction = "";
  const compiler = createAgentPlaybookCompiler(async (input) => {
    systemInstruction = input.systemInstruction;
    return {
      model: "deepseek-chat",
      provider: "deepseek",
      source: "provider:deepseek-chat-completions-api",
      success: true,
      text: JSON.stringify({
        assumptions: ["Use the current Asia/Tokyo time zone."],
        capabilityId: "followups.reviewQueue",
        explanation:
          "A stale relationship is best handled as an evidence-backed follow-up review.",
        instruction:
          "Review the relationships that just became stale, rank who needs attention first, and explain why from Orbit evidence.",
        title: "关系转冷复核",
        trigger: {
          kind: "signal",
          minimumImportance: 65,
          signalTypes: ["relationship_stale"],
        },
      }),
    };
  });

  const result = await compiler.compile({
    currentTimeIso: "2026-07-27T00:00:00.000Z",
    request: "当关系转冷时复核谁最需要跟进并说明原因",
    timeZone: "Asia/Tokyo",
  });

  assert.equal(result.success, true);
  assert.equal(result.draft.definition.source, "natural_language");
  assert.deepEqual(result.draft.definition.trigger, {
    kind: "signal",
    minimumImportance: 65,
    signalTypes: ["relationship_stale"],
  });
  assert.match(systemInstruction, /read-only/);
  assert.match(systemInstruction, /followup_due/);
  assert.match(systemInstruction, /Never include sending/);
});

test("Playbook compiler rejects model-created write capabilities", async () => {
  const compiler = createAgentPlaybookCompiler(async () => ({
    model: "deepseek-chat",
    provider: "deepseek",
    source: "provider:deepseek-chat-completions-api",
    success: true,
    text: JSON.stringify({
      assumptions: [],
      capabilityId: "calendar.syncEvent",
      explanation: "Unsafe.",
      instruction: "Create a calendar event.",
      title: "Unsafe automation",
      trigger: {
        kind: "schedule",
        schedule: {
          at: "2030-01-01T00:00:00.000Z",
          kind: "once",
        },
      },
    }),
  }));

  const result = await compiler.compile({
    request: "自动创建日历",
    timeZone: "Asia/Tokyo",
  });

  assert.deepEqual(result, {
    error: {
      code: "PLAYBOOK_SCHEMA_INVALID",
      message:
        "The model did not return a safe, supported Playbook draft.",
    },
    success: false,
  });
});

test("Playbook configuration edits create versions while pause and resume do not", async () => {
  let now = "2026-07-27T00:00:00.000Z";
  const service = createStorageAgentAutomationService({
    actorId: "actor:version",
    id: () => "playbook:versioned",
    now: () => now,
    store: createMemoryLiveRecordStore<AgentAutomationRecordPayload>(),
    workspaceId: "workspace",
  });
  const created = await service.create({
    capabilityId: "followups.reviewQueue",
    delivery: "in_app",
    instruction: "Review stale relationships.",
    source: "natural_language",
    title: "Stale relationship review",
    trigger: {
      kind: "signal",
      minimumImportance: 60,
      signalTypes: ["relationship_stale"],
    },
  });

  assert.equal(created.version, 1);
  assert.equal(created.revisions.length, 1);
  now = "2026-07-27T01:00:00.000Z";
  const paused = await service.update(created.automationId, {
    status: "paused",
  });
  const resumed = await service.update(created.automationId, {
    status: "active",
  });
  assert.equal(paused.version, 1);
  assert.equal(resumed.version, 1);

  now = "2026-07-27T02:00:00.000Z";
  const updated = await service.update(created.automationId, {
    changeNote: "Raise the importance threshold.",
    trigger: {
      kind: "signal",
      minimumImportance: 75,
      signalTypes: ["relationship_stale"],
    },
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.revisions.length, 2);
  assert.equal(
    updated.revisions[1]?.changeNote,
    "Raise the importance threshold.",
  );
});

test("signal-triggered Playbooks batch matching events and do not repeat them", async () => {
  let now = "2026-07-27T00:00:00.000Z";
  let lease = 0;
  const service = createStorageAgentAutomationService({
    actorId: "actor:signal",
    id: () => "playbook:signal",
    leaseId: () => `lease:${++lease}`,
    now: () => now,
    store: createMemoryLiveRecordStore<AgentAutomationRecordPayload>(),
    workspaceId: "workspace",
  });
  await service.create({
    capabilityId: "followups.reviewQueue",
    delivery: "in_app",
    instruction: "Review the stale relationship and explain why it matters.",
    title: "Stale relationship review",
    trigger: {
      kind: "signal",
      minimumImportance: 70,
      signalTypes: ["relationship_stale"],
    },
  });
  const signal = {
    actions: [],
    changes: [],
    confidence: 0.9,
    fingerprint: "relationship_stale:contact:1",
    firstObservedAt: now,
    importance: 82,
    lastMeaningfulChangeAt: now,
    lastObservedAt: now,
    materialHash: "hash",
    occurredAt: now,
    reason: "No interaction for 90 days.",
    severity: "high" as const,
    signalId: "signal:relationship_stale:contact:1",
    sources: [
      {
        capturedAt: now,
        evidenceIds: ["evidence:contact:1"],
        sourceId: "contact:1",
        sourceLabel: "Contact record",
        sourceType: "manual",
      },
    ],
    status: "new" as const,
    summary: "The relationship has been inactive for 90 days.",
    targetId: "contact:1",
    targetType: "contact" as const,
    title: "Relationship needs attention",
    type: "relationship_stale" as const,
  };
  const secondSignal = {
    ...signal,
    fingerprint: "relationship_stale:contact:2",
    materialHash: "hash:2",
    signalId: "signal:relationship_stale:contact:2",
    sources: [
      {
        ...signal.sources[0],
        evidenceIds: ["evidence:contact:2"],
        sourceId: "contact:2",
      },
    ],
    summary: "A second relationship has been inactive for 120 days.",
    targetId: "contact:2",
    title: "Second relationship needs attention",
  };

  now = "2026-07-27T00:01:00.000Z";
  let executions = 0;
  const first = await runAgentAutomationsForSignals(service, [signal, secondSignal], {
    execute: async () => {
      executions += 1;
      return {
        evidenceIds: ["evidence:contact:1"],
        sourceModules: ["contacts"],
        summary: "Review completed.",
      };
    },
    now: () => now,
    workerId: "signal-test",
  });
  const repeated = await runAgentAutomationsForSignals(service, [signal, secondSignal], {
    execute: async () => {
      throw new Error("A handled signal must not execute again.");
    },
    now: () => now,
    workerId: "signal-test",
  });

  assert.equal(first.length, 1);
  assert.equal(executions, 1);
  assert.equal(first[0]?.runCount, 1);
  assert.deepEqual(first[0]?.lastRun?.sourceModules, ["contacts"]);
  assert.equal(first[0]?.handledEventIds.length, 2);
  assert.deepEqual(repeated, []);
});
