import assert from "node:assert/strict";
import test from "node:test";

import { runAppointmentOutboxBatch } from "../../features/appointments/outbox-worker";
import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";

test("appointment worker keeps Meet not_synced when no provider is configured", async () => {
  const aggregateUpdates: { sql: string; values?: readonly unknown[] }[] = [];
  const executor = {
    async query<TRow = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      if (sql.includes("returning item.*")) {
        return {
          rowCount: 1,
          rows: [{
            aggregate_version: 3,
            appointment_id: "appointment:a-b",
            attempt_count: 1,
            available_at: "2026-08-05T00:00:00.000Z",
            created_at: "2026-08-05T00:00:00.000Z",
            dedupe_key: "appointment:a-b:1:meeting-requested",
            outbox_event_id: "appointment-event:meeting",
            event_type: "appointment.meeting.requested",
            lease_token: "lease:meeting",
            payload: { participantActorIds: ["actor:a", "actor:b"], revision: 1 },
          }] as TRow[],
        };
      }
      if (sql.includes("update appointment_aggregates set payload = jsonb_set")) aggregateUpdates.push({ sql, values });
      return { rowCount: sql.includes("update appointment_outbox set\n          status = 'completed'") ? 1 : 0, rows: [] as TRow[] };
    },
  };
  const runtime = {
    workspaceId: "workspace:test",
    client: {
      ...executor,
      async close() {},
      async transaction<TValue>(operation: (value: typeof executor) => Promise<TValue>) { return operation(executor); },
    },
  } as EventOperationsPostgresRuntime;

  const result = await runAppointmentOutboxBatch({
    projector: { async project() { return { notificationIds: [], policy: "provider_not_configured" }; } },
    runtime,
  });

  assert.deepEqual(result, { completed: 1, failed: 0, retried: 0 });
  assert.equal(aggregateUpdates.length, 1);
  assert.deepEqual(aggregateUpdates[0]?.values?.[2], ["projection", "meeting"]);
});
