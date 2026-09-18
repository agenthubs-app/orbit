import assert from "node:assert/strict";
import test from "node:test";

import { createEventAnalyticsReadModel, EventAnalyticsReadModelError } from "../../features/events/event-analytics/read-model";
import type { EventOperationsSqlExecutor } from "../../features/events/event-operations/storage/postgres-client";

test("organizer aggregate distinguishes missing canonical ROI configuration from a read failure", async () => {
  const executor: EventOperationsSqlExecutor = {
    async query<TRow>(sql: string, values?: readonly unknown[]) {
      assert.deepEqual(values?.slice(0, 2), ["workspace:configuration-test", "event:unconfigured"]);
      return { rowCount: sql.includes("registrations_active") ? 1 : 0, rows: (sql.includes("registrations_active") ? [{}] : []) as TRow[] };
    },
  };
  const model = createEventAnalyticsReadModel({ runtime: {
    workspaceId: "workspace:configuration-test",
    client: { ...executor, async close() {}, async transaction(operation) { return operation(executor); } },
  } });
  await assert.rejects(model.readOrganizerAggregate({ eventId: "event:unconfigured" }), (error: unknown) => {
    assert.ok(error instanceof EventAnalyticsReadModelError);
    assert.equal(error.code, "EVENT_ANALYTICS_CONFIGURATION_REQUIRED");
    return true;
  });
});
