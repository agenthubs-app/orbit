import assert from "node:assert/strict";
import test from "node:test";

import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";
import { createEventOperationsRegistrationWindowProvider } from "../../features/events/registration/storage/event-operations-window-provider";
import { resolveEventRegistrationAvailability } from "../../features/events/registration/deadline-gated-service";

function runtimeWithRows(
  rows: readonly Record<string, unknown>[],
): EventOperationsPostgresRuntime {
  return {
    client: {
      async close() {},
      async query<TRow>() {
        return {
          rowCount: rows.length,
          rows: rows as readonly TRow[],
        };
      },
      async transaction(operation) {
        return operation(this);
      },
    },
    workspaceId: "workspace:registration-window-test",
  };
}

test("registration window provider treats a runtime or event without enrollment as legacy", async () => {
  const withoutRuntime = createEventOperationsRegistrationWindowProvider(null);
  assert.deepEqual(await withoutRuntime.getEnrollment("event:legacy"), {
    state: "legacy_unenrolled",
  });

  const withoutEvent = createEventOperationsRegistrationWindowProvider(
    runtimeWithRows([]),
  );
  assert.deepEqual(await withoutEvent.getEnrollment("event:legacy"), {
    state: "legacy_unenrolled",
  });
});

test("an enrolled event without published operations and admission windows fails closed", async () => {
  const provider = createEventOperationsRegistrationWindowProvider(
    runtimeWithRows([
      {
        event_id: "event:enrolled",
        registration_migration_state: "canonical",
        profile_edit_deadline_at: null,
        registration_closes_at: null,
        statement_timestamp: "2026-08-03T09:00:00.000Z",
      },
    ]),
  );
  assert.deepEqual(await provider.getEnrollment("event:enrolled"), {
    state: "canonical_misconfigured",
  });
});

test("an event still importing keeps legacy reads distinct from canonical misconfiguration", async () => {
  const provider = createEventOperationsRegistrationWindowProvider(
    runtimeWithRows([
      {
        event_id: "event:importing",
        registration_migration_state: "importing",
        profile_edit_deadline_at: null,
        registration_closes_at: null,
        statement_timestamp: "2026-08-03T09:00:00.000Z",
      },
    ]),
  );
  assert.deepEqual(await provider.getEnrollment("event:importing"), {
    state: "legacy_importing",
  });
});

test("an enrolled event uses the authoritative operations and admission windows", async () => {
  const provider = createEventOperationsRegistrationWindowProvider(
    runtimeWithRows([
      {
        event_id: "event:enrolled",
        registration_migration_state: "canonical",
        profile_edit_deadline_at: new Date("2026-08-03T10:00:00.000Z"),
        registration_closes_at: new Date("2026-08-03T11:00:00.000Z"),
        statement_timestamp: new Date("2026-08-03T09:45:12.345Z"),
      },
    ]),
  );
  assert.deepEqual(await provider.getEnrollment("event:enrolled"), {
    state: "enrolled",
    statementTimestamp: "2026-08-03T09:45:12.345Z",
    window: {
      eventId: "event:enrolled",
      profileEditDeadlineAt: "2026-08-03T10:00:00.000Z",
      registrationCutoffAt: "2026-08-03T11:00:00.000Z",
    },
  });
});

test("an enrolled event fails closed when profile edits outlive registration", async () => {
  const provider = createEventOperationsRegistrationWindowProvider(
    runtimeWithRows([
      {
        event_id: "event:enrolled",
        registration_migration_state: "canonical",
        profile_edit_deadline_at: "2026-08-03T12:00:00.000Z",
        registration_closes_at: "2026-08-03T11:00:00.000Z",
        statement_timestamp: "2026-08-03T09:45:12.345Z",
      },
    ]),
  );
  assert.deepEqual(await provider.getEnrollment("event:enrolled"), {
    state: "canonical_misconfigured",
  });
});

test("registration availability follows the same authoritative window as writes", () => {
  assert.equal(
    resolveEventRegistrationAvailability({ state: "legacy_unenrolled" }),
    "open",
  );
  assert.equal(
    resolveEventRegistrationAvailability({ state: "canonical_misconfigured" }),
    "unavailable",
  );
  assert.equal(
    resolveEventRegistrationAvailability({
      state: "enrolled",
      statementTimestamp: "2026-08-03T09:00:00.000Z",
      window: {
        eventId: "event:open",
        profileEditDeadlineAt: "2026-08-03T10:00:00.000Z",
        registrationCutoffAt: "2026-08-03T11:00:00.000Z",
      },
    }),
    "open",
  );
  assert.equal(
    resolveEventRegistrationAvailability({
      state: "enrolled",
      statementTimestamp: "2026-08-03T10:30:00.000Z",
      window: {
        eventId: "event:profile-frozen",
        profileEditDeadlineAt: "2026-08-03T10:00:00.000Z",
        registrationCutoffAt: "2026-08-03T11:00:00.000Z",
      },
    }),
    "profile_edit_closed",
  );
  assert.equal(
    resolveEventRegistrationAvailability({
      state: "enrolled",
      statementTimestamp: "2026-08-03T11:00:00.000Z",
      window: {
        eventId: "event:closed",
        profileEditDeadlineAt: "2026-08-03T10:00:00.000Z",
        registrationCutoffAt: "2026-08-03T11:00:00.000Z",
      },
    }),
    "registration_closed",
  );
});
