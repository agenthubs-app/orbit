import {
  createConfiguredEventOperationsPostgresRuntime,
  type EventOperationsPostgresRuntime,
} from "../../event-operations/storage/postgres-client";
import type {
  EventRegistrationWindowEnrollment,
  EventRegistrationWindowProvider,
} from "../deadline-gated-service";

interface WindowRow {
  event_id: string;
  registration_migration_state: string;
  starts_at: Date | string | null;
  statement_timestamp: Date | string;
}

function timestamp(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function createEventOperationsRegistrationWindowProvider(
  runtime: EventOperationsPostgresRuntime | null,
): EventRegistrationWindowProvider {
  return {
    async getEnrollment(eventId): Promise<EventRegistrationWindowEnrollment> {
      if (!runtime) return { state: "legacy_unenrolled" };
      const result = await runtime.client.query<WindowRow>(
        `
          select
            event.event_id,
            event.registration_migration_state,
            event.starts_at,
            statement_timestamp() as statement_timestamp
          from event_ops_events event
          where event.workspace_id = $1 and event.event_id = $2
          limit 1
        `,
        [runtime.workspaceId, eventId],
      );
      const row = result.rows[0];
      if (!row) return { state: "legacy_unenrolled" };
      if (row.registration_migration_state !== "canonical") {
        return { state: "legacy_importing" };
      }
      const startsAt = timestamp(row.starts_at);
      const statementTimestamp = timestamp(row.statement_timestamp);
      if (
        !startsAt ||
        !statementTimestamp
      ) {
        return { state: "canonical_misconfigured" };
      }
      return {
        state: "enrolled",
        statementTimestamp,
        window: {
          eventId: row.event_id,
          profileEditDeadlineAt: startsAt,
          registrationCutoffAt: startsAt,
        },
      };
    },
  };
}

export function createConfiguredEventOperationsRegistrationWindowProvider(): EventRegistrationWindowProvider {
  return createEventOperationsRegistrationWindowProvider(
    createConfiguredEventOperationsPostgresRuntime(),
  );
}
