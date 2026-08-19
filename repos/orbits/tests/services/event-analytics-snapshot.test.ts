import assert from "node:assert/strict";
import test from "node:test";

import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
} from "../../features/events/event-operations/storage/postgres-client";
import {
  createEventAnalyticsRoiSnapshotFinalizer,
} from "../../features/events/event-analytics/snapshot";

const WORKSPACE_ID = "workspace:analytics:snapshot";
const EVENT_ID = "event:analytics:snapshot";

function roiRow(): Record<string, unknown> {
  return {
    roi_accepted_relationship_pairs: "1",
    roi_appointment_count: "0",
    roi_appointment_updated_at: null,
    roi_checkin_count: "2",
    roi_checkin_revision: "1",
    roi_completed_agent_receipt_count: "2",
    roi_completed_agent_receipt_updated_at: "2026-08-08T00:00:00.000Z",
    roi_configuration_version: "3",
    roi_declared_completed_operations: "2",
    roi_distinct_checkins: "2",
    roi_distinct_connected_checkins: "2",
    roi_effective_connection_pairs: "1",
    roi_effective_connection_participants: "2",
    roi_event_ends_at: "2026-08-01T00:00:00.000Z",
    roi_membership_count: "2",
    roi_membership_revision: "4",
    roi_mutually_checked_in_pairs: "1",
    roi_relationship_accepted_at: "2026-08-01T00:00:00.000Z",
    roi_relationship_pair_count: "1",
    roi_strongly_attributed_completed_operations: "1",
    roi_strong_action_appointments: "1",
    roi_strong_action_followup_reminders: "1",
    roi_strong_action_human_encounter_notes: "1",
    roi_strong_action_message_drafts: "1",
    roi_window_ends_at: "2026-08-08T00:00:00.000Z",
  };
}

function runtimeClient(input: { due?: boolean } = {}) {
  const snapshots: Record<string, unknown>[] = [];
  const dueQueries: string[] = [];
  let headRevision: number | null = null;
  let transactionQueue = Promise.resolve();

  const executor: EventOperationsSqlExecutor = {
    async query<TRow = Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = [],
    ) {
      let rows: Record<string, unknown>[] = [];
      if (text.includes("for update of configuration_head skip locked")) {
        dueQueries.push(text);
        const eventIds = values[3] as readonly string[] | null;
        const allowlisted = eventIds === null || eventIds.includes(EVENT_ID);
        rows = input.due && headRevision === null && allowlisted
          ? [{ db_now: "2026-08-09T00:00:00.000Z", event_id: EVENT_ID }]
          : [];
      } else if (text.includes("from event_analytics_roi_snapshot_heads")) {
        rows = headRevision === null ? [] : [snapshots[headRevision - 1]!];
      } else if (text.includes("with event_configuration as")) {
        rows = [roiRow()];
      } else if (text.includes("insert into event_analytics_roi_snapshots")) {
        snapshots.push({
          finalized_at: values[6],
          formula_hash: values[4],
          metric_version: values[2],
          metrics: JSON.parse(String(values[8])),
          revision: String(values[3]),
          source_watermark: JSON.parse(String(values[7])),
          window_ends_at: values[5],
        });
      } else if (text.includes("insert into event_analytics_roi_snapshot_heads")) {
        headRevision = Number(values[3]);
      }
      return { rowCount: rows.length, rows: rows as TRow[] };
    },
  };
  const client: EventOperationsPostgresClient = {
    close: async () => undefined,
    query: executor.query,
    async transaction(operation) {
      const previous = transactionQueue;
      let release!: () => void;
      transactionQueue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation(executor);
      } finally {
        release();
      }
    },
  };
  return { client, dueQueries, snapshots };
}

test("ROI finalization is immutable and recomputation requires an explicit revision and reason", async () => {
  const state = runtimeClient();
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    now: () => "2026-08-09T00:00:00.000Z",
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });

  const first = await finalizer.finalize({ eventId: EVENT_ID });
  assert.equal(first.snapshot.revision, 1);
  assert.equal(first.metrics.mutualConnections.participationRate.value, 1);
  assert.equal(first.metrics.effectiveConnectionPairs, 1);
  assert.equal(first.metrics.effectiveConnectionParticipants, 2);
  assert.equal(first.metrics.effectiveConnectionRate.value, 1);
  assert.deepEqual(first.metrics.strongActions, {
    appointments: 1,
    followupReminders: 1,
    humanEncounterNotes: 1,
    messageDrafts: 1,
  });
  assert.equal(first.metrics.attributionCoverage.rate.value, 0.5);
  assert.equal(state.snapshots.length, 1);

  const idempotent = await finalizer.finalize({ eventId: EVENT_ID });
  assert.equal(idempotent.snapshot.revision, 1);
  assert.equal(state.snapshots.length, 1);

  await assert.rejects(
    () => finalizer.finalize({
      eventId: EVENT_ID,
      expectedRevision: 0,
      recomputeReason: "Verified correction",
    }),
    /revision conflict/u,
  );
  const second = await finalizer.finalize({
    eventId: EVENT_ID,
    expectedRevision: 1,
    recomputeReason: "Verified correction",
  });
  assert.equal(second.snapshot.revision, 2);
  assert.equal(state.snapshots.length, 2);
});

test("ROI cannot be finalized before the seven-day window closes", async () => {
  const state = runtimeClient();
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    now: () => "2026-08-07T23:59:59.999Z",
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });

  await assert.rejects(
    () => finalizer.finalize({ eventId: EVENT_ID }),
    /not eligible until seven days/u,
  );
  assert.equal(state.snapshots.length, 0);
});

test("finalizeDue skips events whose seven-day window is not due", async () => {
  const state = runtimeClient({ due: false });
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });

  assert.deepEqual(await finalizer.finalizeDue({ limit: 10 }), { finalized: 0 });
  assert.equal(state.snapshots.length, 0);
  assert.match(state.dueQueries[0] ?? "", /for update of configuration_head skip locked/iu);
});

test("finalizeDue finalizes a due event using database time", async () => {
  const state = runtimeClient({ due: true });
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    now: () => "1900-01-01T00:00:00.000Z",
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });

  assert.deepEqual(await finalizer.finalizeDue({ limit: 1 }), { finalized: 1 });
  assert.equal(state.snapshots[0]?.finalized_at, "2026-08-09T00:00:00.000Z");
});

test("concurrent finalizeDue calls are idempotent", async () => {
  const state = runtimeClient({ due: true });
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });

  const results = await Promise.all([
    finalizer.finalizeDue(),
    finalizer.finalizeDue(),
  ]);
  assert.equal(results.reduce((total, result) => total + result.finalized, 0), 1);
  assert.equal(state.snapshots.length, 1);
});

test("finalizeDue skips an event with an existing current metric snapshot", async () => {
  const state = runtimeClient({ due: true });
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    now: () => "2026-08-09T00:00:00.000Z",
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });
  await finalizer.finalize({ eventId: EVENT_ID });

  assert.deepEqual(await finalizer.finalizeDue(), { finalized: 0 });
  assert.equal(state.snapshots.length, 1);
});

test("finalizeDue does not select a due event outside an exact event filter", async () => {
  const state = runtimeClient({ due: true });
  const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
    runtime: { client: state.client, workspaceId: WORKSPACE_ID },
  });

  assert.deepEqual(
    await finalizer.finalizeDue({ eventIds: ["event:other"] }),
    { finalized: 0 },
  );
  assert.equal(state.snapshots.length, 0);
  assert.match(state.dueQueries[0] ?? "", /event_id = any\(\$4::text\[\]\)/iu);
});
