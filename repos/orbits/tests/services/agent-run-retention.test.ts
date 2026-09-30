import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_RUN_RETENTION_DAYS,
  agentRunRetentionCutoff,
  agentRunSetEndedAt,
  type AgentRunSetForRetention,
} from "../../features/agent/retention/run-retention";

/**
 * Sprint 0111 (AI A4): when does a run set "end"? Pure policy, no database.
 * The Postgres behaviour (what is actually deleted) lives in
 * agent-run-retention-postgres.test.ts.
 */

const T0 = "2025-01-01T00:00:00.000Z";
const T1 = "2025-02-01T00:00:00.000Z";
const T2 = "2025-03-01T00:00:00.000Z";

function set(overrides: Partial<AgentRunSetForRetention> = {}): AgentRunSetForRetention {
  return {
    run: { status: "completed", createdAt: T0, updatedAt: T0, completedAt: T0 },
    steps: [],
    actions: [],
    outbox: [],
    receipts: [],
    ...overrides,
  };
}

test("the retention period is one year and the cutoff is exactly that many days before now", () => {
  assert.equal(AGENT_RUN_RETENTION_DAYS, 365);
  assert.equal(agentRunRetentionCutoff(new Date("2026-09-28T00:00:00.000Z")).toISOString(), "2025-09-28T00:00:00.000Z");
});

test("a terminal run without actions ends at its latest timestamp", () => {
  assert.equal(agentRunSetEndedAt(set()), T0);
  assert.equal(agentRunSetEndedAt(set({ run: { status: "failed", createdAt: T0, updatedAt: T0, failedAt: T1 } })), T1);
  assert.equal(agentRunSetEndedAt(set({ run: { status: "canceled", createdAt: T0, updatedAt: T0, canceledAt: T1 } })), T1);
});

test("a run that has not finished never ends, whatever its age", () => {
  for (const status of ["queued", "running", "waiting_for_input", "waiting_for_confirmation"]) {
    assert.equal(agentRunSetEndedAt(set({ run: { status, createdAt: T0, updatedAt: T0 } })), null, status);
  }
});

test("any action that is not terminal keeps the whole set open", () => {
  for (const status of ["awaiting_confirmation", "deferred", "approved", "executing"]) {
    const actions = [
      { status: "completed", createdAt: T0, updatedAt: T0, completedAt: T0 },
      { status, createdAt: T0, updatedAt: T0 },
    ];
    assert.equal(agentRunSetEndedAt(set({ actions })), null, status);
  }
});

test("the set ends at the latest end among the run and its terminal actions (completed, partially_failed, failed, rejected, canceled, undone)", () => {
  const cases: Array<[string, Record<string, string>]> = [
    ["completed", { completedAt: T2 }],
    ["partially_failed", { failedAt: T2 }],
    ["failed", { failedAt: T2 }],
    ["rejected", { rejectedAt: T2 }],
    ["canceled", { canceledAt: T2 }],
    ["undone", { completedAt: T1, undoneAt: T2 }],
  ];
  for (const [status, stamps] of cases) {
    const actions = [{ status, createdAt: T0, updatedAt: T1, ...stamps }];
    assert.equal(agentRunSetEndedAt(set({ actions })), T2, status);
  }
});

test("a later touch (updatedAt) on any member counts, so an undo or retry late in life moves the end forward", () => {
  const actions = [{ status: "completed", createdAt: T0, completedAt: T0, updatedAt: T2 }];
  assert.equal(agentRunSetEndedAt(set({ actions })), T2);
  const receipts = [{ status: "undone", createdAt: T0, updatedAt: T2 }];
  assert.equal(agentRunSetEndedAt(set({ receipts })), T2);
  const steps = [{ status: "completed", createdAt: T0, updatedAt: T1 }];
  assert.equal(agentRunSetEndedAt(set({ steps })), T1);
});

test("outbox work that is still pending, processing or scheduled for retry keeps the set open; completed, dead-lettered and canceled do not", () => {
  for (const status of ["pending", "processing", "retry_scheduled"]) {
    assert.equal(agentRunSetEndedAt(set({ outbox: [{ status, createdAt: T0, updatedAt: T0 }] })), null, status);
  }
  for (const status of ["completed", "dead_letter", "canceled"]) {
    assert.equal(agentRunSetEndedAt(set({ outbox: [{ status, createdAt: T0, updatedAt: T0, processedAt: T1 }] })), T1, status);
  }
});

test("unknown statuses are treated as not finished, and unparseable timestamps are ignored rather than trusted", () => {
  assert.equal(agentRunSetEndedAt(set({ actions: [{ status: "mystery", createdAt: T0, updatedAt: T0 }] })), null);
  assert.equal(agentRunSetEndedAt(set({ run: { status: "completed", createdAt: T0, updatedAt: "not a date", completedAt: T1 } })), T1);
  // A run with no usable timestamp at all cannot be dated, so it never expires.
  assert.equal(agentRunSetEndedAt(set({ run: { status: "completed", createdAt: "x", updatedAt: "y" } })), null);
});
