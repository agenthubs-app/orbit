import assert from "node:assert/strict";
import test from "node:test";

import type {
  EventOperationsPostgresClient,
  EventOperationsSqlResult,
} from "../../features/events/event-operations/storage/postgres-client";
import {
  createCanonicalPostEventNotificationDeliveryMaterializer,
  materializeCanonicalPostEventReminderIntents,
  nextLocalMorningAtEight,
  readCanonicalPostEventReminderIntents,
} from "../../features/notifications/canonical-post-event-reminder-source";

function runtimeWithRows(rows: readonly Record<string, unknown>[]) {
  const calls: { text: string; values?: readonly unknown[] }[] = [];
  const client: EventOperationsPostgresClient = {
    close: async () => undefined,
    async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values });
      return {
        rowCount: rows.length,
        rows: rows as readonly TRow[],
      } satisfies EventOperationsSqlResult<TRow>;
    },
    async transaction(operation) {
      return operation(client);
    },
  };
  return {
    calls,
    runtime: { client, workspaceId: "workspace:post-event-reminder" },
  };
}

test("canonical post-event reminder query is actor-scoped, action-aware, and publicly aggregate-only", async () => {
  const source = runtimeWithRows([{
    contact_id: "contact:must-not-leak",
    ends_at: "2026-03-08T06:30:00.000Z",
    event_id: "event:followup",
    event_version: "4",
    material_revision: "content-hash:v4",
    relationship_pair_id: "pair:must-not-leak",
    scheduled_at: "2026-03-08T12:00:00.000Z",
    timezone: "America/New_York",
  }]);
  const intents = await readCanonicalPostEventReminderIntents({
    actorId: "actor:owner",
    now: "2026-03-08T11:00:00.000Z",
    runtime: source.runtime,
  });

  assert.deepEqual(intents, [{
    eventId: "event:followup",
    eventVersion: 4,
    materialRevision: "content-hash:v4",
    scheduledFor: "2026-03-08T12:00:00.000Z",
    sourceRef: {
      id: "event:followup",
      label: "Canonical post-event follow-up",
      type: "event_import",
    },
  }]);
  const serialized = JSON.stringify(intents);
  assert.equal(serialized.includes("pair:must-not-leak"), false);
  assert.equal(serialized.includes("contact:must-not-leak"), false);

  const query = source.calls[0]?.text ?? "";
  assert.match(query, /lifecycle_state_v2 = 'published'/iu);
  assert.match(query, /side\.owner_actor_id = \$2/iu);
  assert.match(query, /interval '24 hours'/iu);
  assert.match(query, /collection_name = 'human_encounters'/iu);
  assert.match(query, /'save_message_draft'/iu);
  assert.match(query, /'create_followup_reminder'/iu);
  assert.match(query, /eventOrigin,relationshipPairId/iu);
  assert.match(query, /appointment\.status <> 'cancelled'/iu);
  assert.deepEqual(source.calls[0]?.values, [
    "workspace:post-event-reminder",
    "actor:owner",
    "2026-03-08T11:00:00.000Z",
  ]);
});

test("canonical post-event reminder source returns no intent after suppression", async () => {
  const source = runtimeWithRows([]);
  assert.deepEqual(await readCanonicalPostEventReminderIntents({
    actorId: "actor:owner",
    now: "2026-03-08T11:00:00.000Z",
    runtime: source.runtime,
  }), []);
});

test("next local 08:00 remains correct across US daylight-saving changes", () => {
  assert.equal(nextLocalMorningAtEight({
    eventEndsAt: "2026-03-08T06:30:00.000Z",
    timeZone: "America/New_York",
  }), "2026-03-08T12:00:00.000Z");
  assert.equal(nextLocalMorningAtEight({
    eventEndsAt: "2026-11-01T05:30:00.000Z",
    timeZone: "America/New_York",
  }), "2026-11-01T13:00:00.000Z");
});

test("aggregate intents can be handed to a per-device materializer", async () => {
  const observed: string[] = [];
  const baseIntent = {
    eventId: "event:one",
    eventVersion: 1,
    materialRevision: "hash:one",
    scheduledFor: "2026-03-08T12:00:00.000Z",
    sourceRef: {
      id: "event:one",
      label: "Canonical post-event follow-up" as const,
      type: "event_import" as const,
    },
  };
  const result = await materializeCanonicalPostEventReminderIntents({
    actorId: "actor:owner",
    intents: [
      baseIntent,
      { ...baseIntent, eventId: "event:two", materialRevision: "hash:two" },
    ],
    materializer: {
      async materialize({ intent }) {
        observed.push(intent.eventId);
        return { created: intent.eventId === "event:one" };
      },
    },
  });
  assert.deepEqual(observed, ["event:one", "event:two"]);
  assert.deepEqual(result, { created: 1, skipped: 1 });
});

test("notification materializer gates exact event ids and keeps duplicate ticks idempotent", async () => {
  const calls: Array<Record<string, unknown>> = [];
  let existing = false;
  const materializer = createCanonicalPostEventNotificationDeliveryMaterializer({
    actorId: "actor:owner",
    delivery: {
      async materialize(input) {
        calls.push(input as unknown as Record<string, unknown>);
        const created = !existing;
        existing = true;
        return {
          created,
          delivery: {} as never,
          deliveries: [],
        };
      },
    } as never,
    env: {
      NODE_ENV: "production",
      ORBIT_EVENT_PILOT_ENABLED: "true",
      ORBIT_EVENT_PILOT_PROACTIVE_REMINDERS_ENABLED: "true",
      ORBIT_EVENT_PILOT_EVENT_IDS: "event:allowed",
    },
  });
  const allowed = {
    eventId: "event:allowed",
    eventVersion: 7,
    materialRevision: "hash:7",
    scheduledFor: "2026-08-20T00:00:00.000Z",
    sourceRef: {
      id: "event:allowed",
      label: "Canonical post-event follow-up" as const,
      type: "event_import" as const,
    },
  };
  assert.deepEqual(
    await materializer.materialize({ actorId: "actor:owner", intent: allowed }),
    { created: true },
  );
  assert.deepEqual(
    await materializer.materialize({ actorId: "actor:owner", intent: allowed }),
    { created: false },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.phase, "post_event");
  assert.equal(calls[0]?.signalId, "event_post:event:allowed");
  assert.equal(calls[0]?.signalRevision, "7:hash:7");
  assert.equal("data" in (calls[0] ?? {}), false);

  const blocked = createCanonicalPostEventNotificationDeliveryMaterializer({
    actorId: "actor:owner",
    delivery: {
      async materialize() {
        throw new Error("blocked event must not materialize");
      },
    } as never,
    env: {
      NODE_ENV: "production",
      ORBIT_EVENT_PILOT_ENABLED: "true",
      ORBIT_EVENT_PILOT_PROACTIVE_REMINDERS_ENABLED: "true",
      ORBIT_EVENT_PILOT_EVENT_IDS: "event:other",
    },
  });
  assert.deepEqual(
    await blocked.materialize({ actorId: "actor:owner", intent: allowed }),
    { created: false },
  );
});
