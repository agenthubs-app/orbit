import { EventCoreDataError, type CanonicalEventRecord } from "../contract";
import type { EventCoreRepository } from "../repository";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "../../event-operations/storage/postgres-client";

type SqlRow = Record<string, unknown>;

function text(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new EventCoreDataError(
      "EVENT_CORE_ROW_INVALID",
      `Canonical event SQL row is missing ${key}.`,
    );
  }
  return value;
}

function optionalText(row: SqlRow, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : text(row, key);
}

function timestamp(row: SqlRow, key: string): string {
  const value = row[key];
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new EventCoreDataError(
      "EVENT_CORE_ROW_INVALID",
      `Canonical event SQL row has invalid ${key}.`,
    );
  }
  return new Date(parsed).toISOString();
}

function optionalTimestamp(row: SqlRow, key: string): string | null {
  return row[key] === null || row[key] === undefined
    ? null
    : timestamp(row, key);
}

function positiveInteger(row: SqlRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new EventCoreDataError(
      "EVENT_CORE_ROW_INVALID",
      `Canonical event SQL row has invalid ${key}.`,
    );
  }
  return value;
}

function jsonObject(
  row: SqlRow,
  key: string,
): Readonly<Record<string, unknown>> {
  const raw = row[key];
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EventCoreDataError(
      "EVENT_CORE_ROW_INVALID",
      `Canonical event SQL row has invalid ${key}.`,
    );
  }
  return value as Readonly<Record<string, unknown>>;
}

function canonicalEventSelect(): string {
  return `
    select
      workspace_id,
      event_id,
      organizer_actor_id,
      public_code,
      title,
      description,
      venue,
      timezone,
      starts_at,
      ends_at,
      lifecycle_state_v2,
      coalesce(source_payload, '{}'::jsonb) as source_payload,
      cancelled_at,
      archived_at,
      event_version
    from event_ops_events
  `;
}

function recordFromRow(row: SqlRow): CanonicalEventRecord {
  return {
    archivedAt: optionalTimestamp(row, "archived_at"),
    cancelledAt: optionalTimestamp(row, "cancelled_at"),
    description: optionalText(row, "description"),
    endsAt: optionalTimestamp(row, "ends_at"),
    eventId: text(row, "event_id"),
    eventVersion: positiveInteger(row, "event_version"),
    lifecycleState: text(row, "lifecycle_state_v2") as CanonicalEventRecord["lifecycleState"],
    organizerActorId: text(row, "organizer_actor_id"),
    publicCode: optionalText(row, "public_code"),
    sourcePayload: jsonObject(row, "source_payload"),
    startsAt: optionalTimestamp(row, "starts_at"),
    timezone: optionalText(row, "timezone"),
    title: optionalText(row, "title"),
    venue: optionalText(row, "venue"),
    workspaceId: text(row, "workspace_id"),
  };
}

export function createPostgresEventCoreRepository(input: {
  client: EventOperationsSqlExecutor;
  workspaceId: string;
}): EventCoreRepository {
  const { client, workspaceId } = input;

  return {
    async getEvent(eventId) {
      const result = await client.query<SqlRow>(
        `${canonicalEventSelect()}
         where workspace_id = $1
           and event_id = $2
           and lifecycle_state_v2 is not null`,
        [workspaceId, eventId],
      );
      return result.rows[0] ? recordFromRow(result.rows[0]) : null;
    },
    async listEvents() {
      const result = await client.query<SqlRow>(
        `${canonicalEventSelect()}
         where workspace_id = $1
           and lifecycle_state_v2 is not null
         order by starts_at desc nulls last, event_id`,
        [workspaceId],
      );
      return result.rows.map(recordFromRow);
    },
    async resolveAlias(alias) {
      const result = await client.query<SqlRow>(
        `
          select event_id, alias_type as matched_by
          from event_aliases
          where workspace_id = $1 and normalized_alias = $2
          order by event_id
        `,
        [workspaceId, alias],
      );
      const eventIds = [...new Set(result.rows.map((row) => text(row, "event_id")))];
      if (eventIds.length > 1) {
        throw new EventCoreDataError(
          "EVENT_CORE_ALIAS_COLLISION",
          `Alias ${JSON.stringify(alias)} resolves to multiple events in workspace ${workspaceId}.`,
        );
      }
      const row = result.rows[0];
      if (!row) return null;
      return {
        eventId: text(row, "event_id"),
        matchedBy: text(row, "matched_by") as "event_id" | "public_code" | "legacy_route_id",
        requestedAlias: alias,
      };
    },
  };
}

export function createPostgresEventCoreRepositoryFromRuntime(
  runtime: EventOperationsPostgresRuntime,
): EventCoreRepository {
  return createPostgresEventCoreRepository({
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });
}
