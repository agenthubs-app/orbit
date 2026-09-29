import {
  createConfiguredPostgresLiveRecordStore,
  type LiveRecordCustomRead,
} from "../../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../../shared/storage/live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../../shared/storage/live-record-store";
import { jsDateSafeTimestampSql } from "../../../../shared/storage/postgres-js-date-sql";
import type { LiveRecordSqlClient } from "../../../../shared/storage/postgres-live-record-store";
import type {
  EventRegistration,
  EventRegistrationRosterEntry,
  EventRegistrationRosterFields,
  EventRegistrationStatusRecord,
} from "../contract";
import {
  rosterEntryFromRegistration,
  rosterEntryFromRow,
  rosterEntryLeafColumnsSql,
  rosterEntryShapeSql,
  type RosterEntryRow,
} from "../roster-entry";
import {
  eventRegistrationId,
  eventRegistrationStatusRecord,
  type EventRegistrationProvider,
} from "../service";

export const EVENT_REGISTRATION_COLLECTION = "event_registrations" as const;

interface StoredEventRegistration extends Record<string, unknown> {
  registration: EventRegistration;
  registrationId: string;
}

/**
 * Direct SQL for the lightweight own-registration reads (W0028). `read` must
 * apply the same read-budget gate and in-flight dedupe as `store` reads (the
 * configured store's `customRead`). Without it the provider maps its full reads.
 */
export interface EventRegistrationStatusSql {
  client: LiveRecordSqlClient;
  read: LiveRecordCustomRead;
}

export interface EventRegistrationLiveRecordProviderOptions {
  now?: () => string;
  source?: string;
  statusSql?: EventRegistrationStatusSql;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function isStoredEventRegistration(
  value: Record<string, unknown>,
): value is StoredEventRegistration {
  const registration = value.registration;

  return (
    typeof value.registrationId === "string" &&
    typeof registration === "object" &&
    registration !== null &&
    !Array.isArray(registration) &&
    typeof (registration as Record<string, unknown>).id === "string" &&
    typeof (registration as Record<string, unknown>).eventId === "string" &&
    typeof (registration as Record<string, unknown>).userId === "string"
  );
}

// The full read parses every row of the user through `rowToRecord` and
// `isStoredEventRegistration`. The status SQL keeps that failure behaviour:
// a row the full read could not parse is still returned (flagged
// `unreadable`), wherever its event is, so the lightweight read rejects too.
//   * created_at / updated_at must parse to a valid JS Date;
//   * occurred_at / deleted_at may be null or ±infinity (read as null) but a
//     finite value outside the JS Date range makes `toISOString` throw;
//   * a JSON `null` payload makes `isStoredEventRegistration` throw;
//   * a JSON string payload is `JSON.parse`d by the full read, so its text is
//     returned and handled exactly as the full read handles it.
const LEGACY_ROW_UNREADABLE = `(
      not coalesce(${jsDateSafeTimestampSql("created_at")}, false)
      or not coalesce(${jsDateSafeTimestampSql("updated_at")}, false)
      or coalesce(isfinite(occurred_at) and not ${jsDateSafeTimestampSql("occurred_at")}, false)
      or coalesce(isfinite(deleted_at) and not ${jsDateSafeTimestampSql("deleted_at")}, false)
      or jsonb_typeof(payload) = 'null'
    )`;
// Same structure checks as `isStoredEventRegistration`; status is not checked.
const LEGACY_STORED_REGISTRATION = `(
      jsonb_typeof(payload -> 'registrationId') = 'string'
      and jsonb_typeof(payload -> 'registration') = 'object'
      and jsonb_typeof(payload #> '{registration,id}') = 'string'
      and jsonb_typeof(payload #> '{registration,eventId}') = 'string'
      and jsonb_typeof(payload #> '{registration,userId}') = 'string'
    )`;
const LEGACY_STATUS_COLUMNS = (eventIdColumn: string) => `
      ${eventIdColumn} as event_id,
      case when jsonb_typeof(payload #> '{registration,status}') = 'string'
        then payload #>> '{registration,status}' end as status,
      case
        when ${LEGACY_ROW_UNREADABLE} then 'unreadable'
        when jsonb_typeof(payload) = 'string' then 'payload:' || (payload #>> '{}')
      end as issue`;

// Rows come back in the full read's order (newest first) so a duplicate event
// id resolves to the same record once the caller keys them by event id.
const LEGACY_STATUSES_FOR_USER_SQL = `
    select ${LEGACY_STATUS_COLUMNS("payload #>> '{registration,eventId}'")}
    from orbit_records
    where workspace_id = $1
      and collection_name = '${EVENT_REGISTRATION_COLLECTION}'
      and user_id = $2
      and lifecycle_state <> 'deleted'
      and (
        (${LEGACY_STORED_REGISTRATION}
          and payload #>> '{registration,userId}' = $2
          and payload #>> '{registration,eventId}' = any($3::text[]))
        or ${LEGACY_ROW_UNREADABLE}
        or jsonb_typeof(payload) = 'string'
      )
    order by coalesce(occurred_at, updated_at) desc, updated_at desc
  `;

// `getRegistration` reads one record by id and only then checks it; the event
// id column is null when those checks fail.
const LEGACY_STATUS_SQL = `
    select ${LEGACY_STATUS_COLUMNS(`case when ${LEGACY_STORED_REGISTRATION}
        and payload #>> '{registration,eventId}' = $3
        and payload #>> '{registration,userId}' = $4
        and payload #>> '{registration,id}' = payload ->> 'registrationId'
        then payload #>> '{registration,eventId}' end`)}
    from orbit_records
    where workspace_id = $1
      and collection_name = '${EVENT_REGISTRATION_COLLECTION}'
      and record_id = $2
      and lifecycle_state <> 'deleted'
    limit 1
  `;

// Whole-event roster projection (W0029), for the anonymous preview: the full
// read's WHERE and ORDER BY (`listRecords` with target event, not deleted).
// Rows the full read cannot parse come back flagged in `k` ('unreadable', or
// the text of a JSON-string payload); rows `isStoredEventRegistration` or the
// event id check would drop are not returned at all. For the rest `k` is the
// rsvped row's profile shape and the leaves stay jsonb (see roster-entry.ts).
const LEGACY_PROFILE = "(payload #> '{registration,participantProfile}')";
const LEGACY_RSVPED = `(payload #> '{registration,status}') = '"rsvped"'::jsonb`;
const LEGACY_ROSTER_SQL = (fields: EventRegistrationRosterFields) => `
    select
      case when jsonb_typeof(payload #> '{registration,status}') = 'string'
        then payload #>> '{registration,status}' end as s,
      case
        when ${LEGACY_ROW_UNREADABLE} then 'unreadable'
        when jsonb_typeof(payload) = 'string' then 'payload:' || (payload #>> '{}')
        else ${rosterEntryShapeSql(LEGACY_PROFILE, LEGACY_RSVPED)}
      end as k,
      ${rosterEntryLeafColumnsSql(LEGACY_PROFILE, `(${LEGACY_RSVPED})`, fields)}
    from orbit_records
    where workspace_id = $1
      and collection_name = '${EVENT_REGISTRATION_COLLECTION}'
      and lifecycle_state <> 'deleted'
      and target_type = 'event'
      and target_id = $2
      and (
        (${LEGACY_STORED_REGISTRATION}
          and payload #>> '{registration,eventId}' = $2)
        or ${LEGACY_ROW_UNREADABLE}
        or jsonb_typeof(payload) = 'string'
      )
    order by coalesce(occurred_at, updated_at) desc, updated_at desc
  `;

interface LegacyStatusRow {
  event_id: string | null;
  issue: string | null;
  status: string | null;
}

class UnreadableEventRegistrationRecordError extends Error {
  constructor() {
    super("An event registration record could not be read.");
    this.name = "UnreadableEventRegistrationRecordError";
  }
}

/** The full read's parse of a JSON-string payload, or the lightweight row. */
function legacyStatusRowPayload(row: LegacyStatusRow): Record<string, unknown> | null {
  if (row.issue === "unreadable") throw new UnreadableEventRegistrationRecordError();
  if (row.issue?.startsWith("payload:")) {
    return JSON.parse(row.issue.slice("payload:".length)) as Record<string, unknown>;
  }
  return null;
}

function recordFor(input: {
  now: string;
  registration: EventRegistration;
  source: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const registration = clone(input.registration);

  return {
    collectionName: EVENT_REGISTRATION_COLLECTION,
    createdAt: registration.registeredAt,
    evidenceIds: [`event:${registration.eventId}`, `user:${registration.userId}`],
    lifecycleState: "active",
    occurredAt: registration.updatedAt,
    payload: {
      registration,
      registrationId: registration.id,
    },
    provider: input.source,
    providerRecordId: registration.id,
    recordId: registration.id,
    searchText: [
      registration.eventId,
      registration.userId,
      registration.status,
      ...Object.values(registration.participantProfile.answers),
    ].join(" "),
    sourceId: `source:${registration.id}`,
    sourceLabel: "Orbit event registration",
    sourceType: "manual",
    targetId: registration.eventId,
    targetType: "event",
    updatedAt: registration.updatedAt || input.now,
    userId: registration.userId,
    workspaceId: input.workspaceId,
  };
}

export function createEventRegistrationLiveRecordProvider({
  now = () => new Date().toISOString(),
  source = "live-record-store:event-registration",
  statusSql,
  store,
  workspaceId,
}: EventRegistrationLiveRecordProviderOptions): EventRegistrationProvider {
  const provider: EventRegistrationProvider = {
    async getRegistration(eventId, userId) {
      const record = await store.getRecord({
        collectionName: EVENT_REGISTRATION_COLLECTION,
        recordId: eventRegistrationId(eventId, userId),
        workspaceId,
      });

      if (!record || !isStoredEventRegistration(record.payload)) {
        return null;
      }

      const registration = record.payload.registration;

      if (
        registration.eventId !== eventId ||
        registration.userId !== userId ||
        registration.id !== record.payload.registrationId
      ) {
        return null;
      }

      return clone(registration);
    },
    async listRegistrations(eventId) {
      const records = await store.listRecords({
        limit: "unbounded",
        collectionName: EVENT_REGISTRATION_COLLECTION,
        targetId: eventId,
        targetType: "event",
        workspaceId,
      });

      return records.flatMap((record) => {
        if (!isStoredEventRegistration(record.payload)) return [];
        const registration = record.payload.registration;
        return registration.eventId === eventId ? [clone(registration)] : [];
      });
    },
    async listRegistrationRosterEntries(eventId, fields) {
      if (!statusSql) {
        return (await provider.listRegistrations(eventId)).map((registration) =>
          rosterEntryFromRegistration(registration, fields),
        );
      }
      const rows = await statusSql.read({
        collectionName: EVENT_REGISTRATION_COLLECTION,
        key: JSON.stringify(["listRegistrationRosterEntries", workspaceId, eventId, fields]),
        read: async () =>
          (await statusSql.client.query<RosterEntryRow>(LEGACY_ROSTER_SQL(fields), [
            workspaceId,
            eventId,
          ])).rows,
      });
      const entries: EventRegistrationRosterEntry[] = [];
      for (const row of rows) {
        if (row.k === "unreadable") throw new UnreadableEventRegistrationRecordError();
        if (row.k?.startsWith("payload:")) {
          // The full read parses a JSON-string payload, then checks it.
          const payload = JSON.parse(row.k.slice("payload:".length)) as Record<string, unknown>;
          if (isStoredEventRegistration(payload) && payload.registration.eventId === eventId) {
            entries.push(rosterEntryFromRegistration(clone(payload.registration), fields));
          }
          continue;
        }
        entries.push(rosterEntryFromRow(row, fields));
      }
      return entries;
    },
    async listRegistrationsForUser(userId, eventIds) {
      if (eventIds.length === 0) return [];
      const selectedEventIds = new Set(eventIds);
      const records = await store.listRecords({
        limit: "unbounded",
        collectionName: EVENT_REGISTRATION_COLLECTION,
        userId,
        workspaceId,
      });

      return records.flatMap((record) => {
        if (!isStoredEventRegistration(record.payload)) return [];
        const registration = record.payload.registration;
        return registration.userId === userId &&
          selectedEventIds.has(registration.eventId)
          ? [clone(registration)]
          : [];
      });
    },
    async listRegistrationStatusesForUser(userId, eventIds) {
      if (eventIds.length === 0) return [];
      if (!statusSql) {
        return (await provider.listRegistrationsForUser(userId, eventIds)).map(
          eventRegistrationStatusRecord,
        );
      }
      const selectedEventIds = [...new Set(eventIds)].sort();
      const rows = await statusSql.read({
        collectionName: EVENT_REGISTRATION_COLLECTION,
        key: JSON.stringify(["listRegistrationStatusesForUser", workspaceId, userId, selectedEventIds]),
        read: async () =>
          (await statusSql.client.query<LegacyStatusRow>(LEGACY_STATUSES_FOR_USER_SQL, [
            workspaceId,
            userId,
            selectedEventIds,
          ])).rows,
      });
      const selected = new Set(selectedEventIds);
      const statuses: EventRegistrationStatusRecord[] = [];
      for (const row of rows) {
        const payload = legacyStatusRowPayload(row) as Record<string, unknown>;
        if (row.issue === null) {
          statuses.push({ eventId: row.event_id!, status: row.status });
        } else if (isStoredEventRegistration(payload)) {
          const registration = payload.registration;
          if (registration.userId === userId && selected.has(registration.eventId)) {
            statuses.push(eventRegistrationStatusRecord(registration));
          }
        }
      }
      return statuses;
    },
    async getRegistrationStatus(eventId, userId) {
      if (!statusSql) {
        const registration = await provider.getRegistration(eventId, userId);
        return registration ? eventRegistrationStatusRecord(registration) : null;
      }
      const recordId = eventRegistrationId(eventId, userId);
      const rows = await statusSql.read({
        collectionName: EVENT_REGISTRATION_COLLECTION,
        key: JSON.stringify(["getRegistrationStatus", workspaceId, recordId, eventId, userId]),
        read: async () =>
          (await statusSql.client.query<LegacyStatusRow>(LEGACY_STATUS_SQL, [
            workspaceId,
            recordId,
            eventId,
            userId,
          ])).rows,
      });
      const row = rows[0];
      if (!row) return null;
      const payload = legacyStatusRowPayload(row) as Record<string, unknown>;
      if (row.issue === null) {
        return row.event_id === null ? null : { eventId: row.event_id, status: row.status };
      }
      if (!isStoredEventRegistration(payload)) return null;
      const registration = payload.registration;
      return registration.eventId === eventId &&
        registration.userId === userId &&
        registration.id === payload.registrationId
        ? eventRegistrationStatusRecord(registration)
        : null;
    },
    async saveRegistration(registration) {
      const next = clone(registration);

      await store.upsertRecord(
        recordFor({
          now: now(),
          registration: next,
          source,
          workspaceId,
        }),
      );

      return clone(next);
    },
  };

  return provider;
}

interface EventRegistrationRuntimeGlobal {
  __orbitEventRegistrationStore?: LiveRecordStoreLike<Record<string, unknown>>;
}

const runtimeGlobal = globalThis as typeof globalThis &
  EventRegistrationRuntimeGlobal;
const fallbackMemoryStore =
  runtimeGlobal.__orbitEventRegistrationStore ??
  createMemoryLiveRecordStore<Record<string, unknown>>();
runtimeGlobal.__orbitEventRegistrationStore = fallbackMemoryStore;

export function createConfiguredEventRegistrationProvider(): EventRegistrationProvider {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >();

  if (configured) {
    return createEventRegistrationLiveRecordProvider({
      source: `postgres-live-record-store:event-registration:${configured.workspaceId}`,
      statusSql: { client: configured.client, read: configured.customRead },
      store: configured.store,
      workspaceId: configured.workspaceId,
    });
  }

  return createEventRegistrationLiveRecordProvider({
    source: "memory-live-record-store:event-registration:local-runtime",
    store: fallbackMemoryStore,
    workspaceId: "workspace:local-runtime",
  });
}
