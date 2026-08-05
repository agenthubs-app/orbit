import {
  isEventAccessRole,
  type EventAccessPrincipalRole,
} from "../contract";
import {
  isEventAccessDirectoryLifecycleState,
  type EventAccessAccessibleEventsQuery,
  type EventAccessDirectoryEvent,
  type EventAccessDirectoryLifecycleState,
  type EventAccessDirectoryRepository,
  type EventAccessRoleMember,
  type EventAccessRoleMembersPayload,
  type EventAccessRoleMembersQuery,
} from "../directory";
import {
  EventAccessRepositoryError,
  requireEventAccessRepositoryReadiness,
} from "./postgres-repository";
import type { EventAccessRepositoryErrorCode } from "./postgres-repository";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "../../event-operations/storage/postgres-client";

type SqlRow = Record<string, unknown>;

function failure(code: EventAccessRepositoryErrorCode): never {
  throw new EventAccessRepositoryError(code);
}

async function protectedOperation<TValue>(
  operation: () => Promise<TValue>,
): Promise<TValue> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof EventAccessRepositoryError) throw error;
    const sqlState =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : null;
    if (
      sqlState === "23505" ||
      sqlState === "40001" ||
      sqlState === "40P01"
    ) {
      failure("EVENT_ACCESS_CONFLICT");
    }
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
}

function requiredText(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  return value;
}

function optionalText(row: SqlRow, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") failure("EVENT_ACCESS_REPOSITORY_FAILED");
  return value;
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") failure("EVENT_ACCESS_REPOSITORY_FAILED");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) failure("EVENT_ACCESS_REPOSITORY_FAILED");
  return new Date(parsed).toISOString();
}

function optionalTimestamp(row: SqlRow, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : timestamp(value);
}

function revision(value: unknown, minimum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  return parsed;
}

function lifecycleState(row: SqlRow): EventAccessDirectoryLifecycleState {
  const canonical = optionalText(row, "lifecycle_state_v2");
  if (canonical !== null) {
    if (!isEventAccessDirectoryLifecycleState(canonical)) {
      failure("EVENT_ACCESS_REPOSITORY_FAILED");
    }
    return canonical;
  }
  const legacy = requiredText(row, "lifecycle_state");
  if (legacy === "active") return "legacy_active";
  if (legacy === "archived") return "legacy_archived";
  failure("EVENT_ACCESS_REPOSITORY_FAILED");
}

function migrationPending(row: SqlRow): boolean {
  // `lifecycle_state_v2` is the Event Core cutover marker. Do not read
  // title/time/location from pre-cutover rows: doing so recreates a second
  // event read model and can make legacy metadata appear authoritative.
  return optionalText(row, "lifecycle_state_v2") === null;
}

function eventFromRow(row: SqlRow, actorId: string): EventAccessDirectoryEvent {
  const organizerActorId = requiredText(row, "organizer_actor_id");
  const owner = organizerActorId === actorId;
  const isMigrationPending = migrationPending(row);
  const delegatedRole = optionalText(row, "role");
  const delegatedRevision = row.revision ?? null;
  if (owner && (delegatedRole !== null || delegatedRevision !== null)) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  if (!owner && !isEventAccessRole(delegatedRole)) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }

  const role: EventAccessPrincipalRole = owner
    ? "owner"
    : isEventAccessRole(delegatedRole)
      ? delegatedRole
      : failure("EVENT_ACCESS_REPOSITORY_FAILED");
  return Object.freeze({
    endsAt: isMigrationPending ? null : optionalTimestamp(row, "ends_at"),
    eventId: requiredText(row, "event_id"),
    lifecycleState: lifecycleState(row),
    migrationPending: isMigrationPending,
    owner,
    revision: owner ? 0 : revision(delegatedRevision, 1),
    role,
    startsAt: isMigrationPending ? null : optionalTimestamp(row, "starts_at"),
    title: isMigrationPending ? null : optionalText(row, "title"),
    venue: isMigrationPending ? null : optionalText(row, "venue"),
  });
}

function memberFromRow(row: SqlRow, eventId: string): EventAccessRoleMember {
  const role = optionalText(row, "role");
  if (!isEventAccessRole(role) || optionalText(row, "state") !== "active") {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  return Object.freeze({
    assignedAt: timestamp(row.created_at),
    assignedByActorId: requiredText(row, "assigned_by_actor_id"),
    eventId,
    reason: requiredText(row, "reason"),
    revision: revision(row.revision, 1),
    role,
    state: "active",
    subjectActorId: requiredText(row, "subject_actor_id"),
  });
}

async function eventForRoleManagement(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  query: EventAccessRoleMembersQuery,
): Promise<EventAccessDirectoryEvent> {
  const result = await executor.query<SqlRow>(
    `select event_id, organizer_actor_id, lifecycle_state, lifecycle_state_v2,
            title, venue, starts_at, ends_at
       from event_ops_events
      where workspace_id = $1
        and event_id = $2`,
    [workspaceId, query.eventId],
  );
  if (result.rows.length !== 1) failure("EVENT_ACCESS_NOT_FOUND");
  const row = result.rows[0];
  if (requiredText(row, "organizer_actor_id") !== query.actingActorId) {
    failure("EVENT_ACCESS_FORBIDDEN");
  }
  const event = eventFromRow(row, query.actingActorId);
  // The centered role UI must not become a back door around the canonical
  // authorization boundary enforced by the assignment repository.
  if (event.migrationPending) failure("EVENT_ACCESS_NOT_FOUND");
  return event;
}

export function createPostgresEventAccessDirectoryRepository(
  runtime: EventOperationsPostgresRuntime,
): EventAccessDirectoryRepository {
  return Object.freeze({
    async listAccessibleEvents(input: EventAccessAccessibleEventsQuery) {
      return protectedOperation(async () => {
        await requireEventAccessRepositoryReadiness(runtime.client);
        const result = await runtime.client.query<SqlRow>(
          `select event.event_id, event.organizer_actor_id,
                  event.lifecycle_state, event.lifecycle_state_v2,
                  event.title, event.venue, event.starts_at, event.ends_at,
                  assignment.role, assignment.revision
             from event_ops_events event
             left join event_ops_event_role_assignment_heads assignment
               on assignment.workspace_id = event.workspace_id
              and assignment.event_id = event.event_id
              and assignment.subject_actor_id = $2
              and assignment.state = 'active'
            where event.workspace_id = $1
              and (
                event.organizer_actor_id = $2
                or assignment.subject_actor_id is not null
              )
            order by coalesce(event.starts_at, event.updated_at) asc,
                     event.event_id asc`,
          [runtime.workspaceId, input.actorId],
        );
        return Object.freeze(
          result.rows.map((row) => eventFromRow(row, input.actorId)),
        );
      });
    },
    async listEventRoleMembers(input: EventAccessRoleMembersQuery) {
      return protectedOperation(async () => {
        await requireEventAccessRepositoryReadiness(runtime.client);
        const event = await eventForRoleManagement(
          runtime.client,
          runtime.workspaceId,
          input,
        );
        const assignments = await runtime.client.query<SqlRow>(
          `select assignment.subject_actor_id, assignment.role, assignment.state,
                  assignment.revision, version.assigned_by_actor_id,
                  version.reason, version.created_at
             from event_ops_event_role_assignment_heads assignment
             join event_ops_event_role_assignment_versions version
               on version.workspace_id = assignment.workspace_id
              and version.event_id = assignment.event_id
              and version.subject_actor_id = assignment.subject_actor_id
              and version.assignment_version = assignment.assignment_version
              and version.role = assignment.role
              and version.state = assignment.state
            where assignment.workspace_id = $1
              and assignment.event_id = $2
              and assignment.state = 'active'
            order by assignment.role asc, assignment.subject_actor_id asc`,
          [runtime.workspaceId, input.eventId],
        );
        const delegated = assignments.rows.map((row) =>
          memberFromRow(row, input.eventId),
        );
        if (
          delegated.some(
            (member) => member.subjectActorId === input.actingActorId,
          )
        ) {
          failure("EVENT_ACCESS_REPOSITORY_FAILED");
        }
        return Object.freeze({
          event,
          members: Object.freeze([
            Object.freeze({
              assignedAt: null,
              assignedByActorId: null,
              eventId: input.eventId,
              reason: "Derived from the Event Core organizer.",
              revision: 0,
              role: "owner",
              state: "active" as const,
              subjectActorId: input.actingActorId,
            }),
            ...delegated,
          ]),
        });
      });
    },
  });
}
