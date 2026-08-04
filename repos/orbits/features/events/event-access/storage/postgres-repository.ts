import { createHash } from "node:crypto";

import {
  isEventAccessAssignmentState,
  isEventAccessRole,
  type EventAccessAssignmentState,
  type EventAccessRole,
} from "../contract";
import {
  parseEventAccessGetQuery,
  parseEventAccessGrantCommand,
  parseEventAccessRevokeCommand,
  type EventAccessAssignmentView,
  type EventAccessGetQuery,
  type EventAccessGrantCommand,
  type EventAccessRepository,
  type EventAccessRevokeCommand,
} from "../repository";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "../../event-operations/storage/postgres-client";
import { EVENT_OPERATIONS_SCHEMA_MIGRATIONS } from "../../event-operations/storage/migrations";

export const EVENT_ACCESS_REPOSITORY_ERROR_CODES = [
  "EVENT_ACCESS_NOT_READY",
  "EVENT_ACCESS_NOT_FOUND",
  "EVENT_ACCESS_FORBIDDEN",
  "EVENT_ACCESS_CONFLICT",
  "EVENT_ACCESS_REPOSITORY_FAILED",
] as const;

export type EventAccessRepositoryErrorCode =
  (typeof EVENT_ACCESS_REPOSITORY_ERROR_CODES)[number];

export class EventAccessRepositoryError extends Error {
  constructor(readonly code: EventAccessRepositoryErrorCode) {
    super("Event access operation failed.");
    this.name = "EventAccessRepositoryError";
  }
}

interface StoredAssignment {
  readonly organizerActorId: string;
  readonly revision: number;
  readonly role: EventAccessRole | null;
  readonly state: EventAccessAssignmentState | null;
}

interface ReadinessRow {
  readonly audit_current: boolean;
  readonly checksum: string | null;
  readonly events_current: boolean;
  readonly heads_current: boolean;
  readonly migration_current: boolean;
  readonly name: string | null;
  readonly versions_current: boolean;
}

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

async function requireReadiness(
  executor: EventOperationsSqlExecutor,
): Promise<void> {
  const expected = EVENT_OPERATIONS_SCHEMA_MIGRATIONS.find(
    (migration) => migration.version === 13,
  );
  if (!expected) failure("EVENT_ACCESS_NOT_READY");
  const result = await executor.query<ReadinessRow>(
    `select
       migration.name,
       migration.checksum,
       exists (
         select 1
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace
             on namespace.oid = relation.relnamespace
          where relation.oid = to_regclass('event_ops_schema_migrations')
            and namespace.nspname = current_schema()
       ) as migration_current,
       exists (
         select 1
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace
             on namespace.oid = relation.relnamespace
          where relation.oid = to_regclass('event_ops_event_role_assignment_versions')
            and namespace.nspname = current_schema()
       ) as versions_current,
       exists (
         select 1
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace
             on namespace.oid = relation.relnamespace
          where relation.oid = to_regclass('event_ops_event_role_assignment_heads')
            and namespace.nspname = current_schema()
       ) as heads_current,
       exists (
         select 1
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace
             on namespace.oid = relation.relnamespace
          where relation.oid = to_regclass('event_ops_events')
            and namespace.nspname = current_schema()
       ) as events_current,
       exists (
         select 1
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace
             on namespace.oid = relation.relnamespace
          where relation.oid = to_regclass('event_ops_audit_log')
            and namespace.nspname = current_schema()
       ) as audit_current
     from (values (13)) expected(version)
     left join event_ops_schema_migrations migration
       on migration.version = expected.version`,
  );
  const row = result.rows[0];
  if (
    !row ||
    row.name !== expected.name ||
    row.checksum !== expected.checksum ||
    !row.migration_current ||
    !row.versions_current ||
    !row.heads_current ||
    !row.events_current ||
    !row.audit_current
  ) {
    failure("EVENT_ACCESS_NOT_READY");
  }
}

function parseRevision(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  return parsed;
}

function storedHead(row: Record<string, unknown> | undefined): {
  revision: number;
  role: EventAccessRole | null;
  state: EventAccessAssignmentState | null;
} {
  if (!row) return { revision: 0, role: null, state: null };
  if (!isEventAccessRole(row.role) || !isEventAccessAssignmentState(row.state)) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  return {
    revision: parseRevision(row.revision),
    role: row.role,
    state: row.state,
  };
}

async function loadAssignment(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  query: EventAccessGetQuery,
  lock: boolean,
): Promise<StoredAssignment> {
  const event = await executor.query<{ organizer_actor_id: string }>(
    `select organizer_actor_id
       from event_ops_events
      where workspace_id = $1
        and event_id = $2
      ${lock ? "for update" : ""}`,
    [workspaceId, query.eventId],
  );
  const organizerActorId = event.rows[0]?.organizer_actor_id;
  if (!organizerActorId || event.rows.length !== 1) {
    failure("EVENT_ACCESS_NOT_FOUND");
  }
  const headResult = await executor.query<Record<string, unknown>>(
    `select revision, role, state
       from event_ops_event_role_assignment_heads
      where workspace_id = $1
        and event_id = $2
        and subject_actor_id = $3
      ${lock ? "for update" : ""}`,
    [workspaceId, query.eventId, query.subjectActorId],
  );
  if (headResult.rows.length > 1) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  const head = storedHead(headResult.rows[0]);
  if (
    organizerActorId === query.subjectActorId &&
    (head.role !== null || head.state !== null || head.revision !== 0)
  ) {
    failure("EVENT_ACCESS_REPOSITORY_FAILED");
  }
  return {
    organizerActorId,
    revision: head.revision,
    role: head.role,
    state: head.state,
  };
}

function assignmentView(
  query: EventAccessGetQuery,
  stored: StoredAssignment,
): EventAccessAssignmentView {
  return Object.freeze({
    eventId: query.eventId,
    owner: stored.organizerActorId === query.subjectActorId,
    revision: stored.revision,
    role: stored.role,
    state: stored.state,
    subjectActorId: query.subjectActorId,
  });
}

function auditId(
  workspaceId: string,
  command: EventAccessGrantCommand | EventAccessRevokeCommand,
  version: number,
): string {
  const digest = createHash("sha256")
    .update(
      `${workspaceId}\0${command.eventId}\0${command.subjectActorId}\0${version}`,
    )
    .digest("hex");
  return `audit:event-access:${digest}`;
}

export function createPostgresEventAccessRepository(
  runtime: EventOperationsPostgresRuntime,
): EventAccessRepository {
  async function write(
    command: EventAccessGrantCommand | EventAccessRevokeCommand,
    operation: "grant" | "revoke",
  ): Promise<EventAccessAssignmentView> {
    return runtime.client.transaction(
      async (executor) => {
        await requireReadiness(executor);
        const current = await loadAssignment(
          executor,
          runtime.workspaceId,
          command,
          true,
        );
        if (
          current.organizerActorId !== command.actingActorId ||
          current.organizerActorId === command.subjectActorId
        ) {
          failure("EVENT_ACCESS_FORBIDDEN");
        }
        if (current.revision !== command.expectedRevision) {
          failure("EVENT_ACCESS_CONFLICT");
        }

        let action: string;
        let role: EventAccessRole;
        let state: EventAccessAssignmentState;
        if (operation === "revoke") {
          if (current.state !== "active" || !current.role) {
            failure("EVENT_ACCESS_CONFLICT");
          }
          action = "event.access.revoked";
          role = current.role;
          state = "revoked";
        } else {
          role = (command as EventAccessGrantCommand).role;
          if (current.state === "active" && current.role === role) {
            failure("EVENT_ACCESS_CONFLICT");
          }
          action =
            current.state === "active"
              ? "event.access.changed"
              : "event.access.granted";
          state = "active";
        }

        const assignmentVersion = current.revision + 1;
        await executor.query(
          `insert into event_ops_event_role_assignment_versions (
             workspace_id, event_id, subject_actor_id, assignment_version,
             role, state, assigned_by_actor_id, reason
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            runtime.workspaceId,
            command.eventId,
            command.subjectActorId,
            assignmentVersion,
            role,
            state,
            command.actingActorId,
            command.reason,
          ],
        );
        const head = await executor.query(
          `insert into event_ops_event_role_assignment_heads (
             workspace_id, event_id, subject_actor_id, assignment_version,
             role, state, revision, updated_at
           ) values ($1,$2,$3,$4,$5,$6,$4,statement_timestamp())
           on conflict (workspace_id,event_id,subject_actor_id) do update
             set assignment_version = excluded.assignment_version,
                 role = excluded.role,
                 state = excluded.state,
                 revision = excluded.revision,
                 updated_at = excluded.updated_at
           where event_ops_event_role_assignment_heads.revision = $7`,
          [
            runtime.workspaceId,
            command.eventId,
            command.subjectActorId,
            assignmentVersion,
            role,
            state,
            command.expectedRevision,
          ],
        );
        if (head.rowCount !== 1) failure("EVENT_ACCESS_CONFLICT");
        await executor.query(
          `insert into event_ops_audit_log (
             workspace_id, audit_id, event_id, actor_id, action,
             aggregate_type, aggregate_id, before_payload, after_payload,
             evidence_ids, occurred_at
           ) values (
             $1,$2,$3,$4,$5,'event_role_assignment',$6,$7::jsonb,$8::jsonb,
             '{}',statement_timestamp()
           )`,
          [
            runtime.workspaceId,
            auditId(runtime.workspaceId, command, assignmentVersion),
            command.eventId,
            command.actingActorId,
            action,
            command.subjectActorId,
            JSON.stringify({
              revision: current.revision,
              role: current.role,
              state: current.state,
            }),
            JSON.stringify({
              assignedByActorId: command.actingActorId,
              reason: command.reason,
              revision: assignmentVersion,
              role,
              state,
            }),
          ],
        );
        return Object.freeze({
          eventId: command.eventId,
          owner: false,
          revision: assignmentVersion,
          role,
          state,
          subjectActorId: command.subjectActorId,
        });
      },
      { isolation: "serializable" },
    );
  }

  return Object.freeze({
    async get(input: EventAccessGetQuery) {
      return protectedOperation(async () => {
        const query = parseEventAccessGetQuery(input);
        await requireReadiness(runtime.client);
        const stored = await loadAssignment(
          runtime.client,
          runtime.workspaceId,
          query,
          false,
        );
        return assignmentView(query, stored);
      });
    },
    async grant(input: EventAccessGrantCommand) {
      return protectedOperation(async () =>
        write(parseEventAccessGrantCommand(input), "grant"),
      );
    },
    async revoke(input: EventAccessRevokeCommand) {
      return protectedOperation(async () =>
        write(parseEventAccessRevokeCommand(input), "revoke"),
      );
    },
  });
}
