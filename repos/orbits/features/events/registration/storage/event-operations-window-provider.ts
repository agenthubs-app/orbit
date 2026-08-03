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
  profile_edit_deadline_at: Date | string | null;
  registration_migration_state: string;
  registration_cutoff_at: Date | string | null;
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
            configuration.profile_edit_deadline_at,
            configuration.registration_cutoff_at,
            statement_timestamp() as statement_timestamp
          from event_ops_events event
          left join event_ops_configuration_heads head
            on head.workspace_id = event.workspace_id
            and head.event_id = event.event_id
          left join event_ops_configurations configuration
            on configuration.workspace_id = head.workspace_id
            and configuration.event_id = head.event_id
            and configuration.configuration_version = head.configuration_version
          where event.workspace_id = $1 and event.event_id = $2
          limit 1
        `,
        [runtime.workspaceId, eventId],
      );
      const row = result.rows[0];
      if (!row) return { state: "legacy_unenrolled" };
      if (row.registration_migration_state !== "canonical") {
        return { state: "enrolled_misconfigured" };
      }
      const profileEditDeadlineAt = timestamp(row.profile_edit_deadline_at);
      const registrationCutoffAt = timestamp(row.registration_cutoff_at);
      const statementTimestamp = timestamp(row.statement_timestamp);
      if (
        !profileEditDeadlineAt ||
        !registrationCutoffAt ||
        !statementTimestamp
      ) {
        return { state: "enrolled_misconfigured" };
      }
      return {
        state: "enrolled",
        statementTimestamp,
        window: {
          eventId: row.event_id,
          profileEditDeadlineAt,
          registrationCutoffAt,
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
