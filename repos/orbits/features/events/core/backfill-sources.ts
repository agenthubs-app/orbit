import { eventCodeFor } from "../public-route-code";
import { readPublicEventCatalogue } from "../public-catalogue";
import type { EventOperationsSqlExecutor } from "../event-operations/storage/postgres-client";
import { EventCoreDataError, type EventLifecycleState } from "./contract";
import type { EventCoreBackfillCandidate } from "./backfill";

type SqlRow = Record<string, unknown>;

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function payloadObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function lifecycleForOrbitRecord(
  row: SqlRow,
  payload: Record<string, unknown>,
): EventLifecycleState {
  const status = optionalText(payload.status)?.toLowerCase();
  const recordLifecycle = optionalText(row.lifecycle_state)?.toLowerCase();
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (recordLifecycle === "archived" || recordLifecycle === "deleted") {
    return "archived";
  }
  return "published";
}

function legacyEventOperationsCandidate(
  row: SqlRow,
): EventCoreBackfillCandidate | null {
  const eventId = String(row.event_id);
  const canonicalPayload = payloadObject(row.source_payload);
  const migrationResolution = canonicalPayload.migrationResolution;
  const isCanonicalPayload =
    migrationResolution !== null &&
    typeof migrationResolution === "object" &&
    typeof (migrationResolution as { migrationId?: unknown }).migrationId ===
      "string";

  if (!isCanonicalPayload) {
    return {
      description: optionalText(row.description),
      endsAt: optionalTimestamp(row.ends_at),
      eventId,
      lifecycleState: optionalText(row.lifecycle_state_v2) as EventLifecycleState | null,
      organizerActorId: optionalText(row.organizer_actor_id),
      publicCode: optionalText(row.public_code),
      source: "event_ops_events",
      sourcePayload: canonicalPayload,
      startsAt: optionalTimestamp(row.starts_at),
      timezone: optionalText(row.timezone),
      title: optionalText(row.title),
      venue: optionalText(row.venue),
    };
  }

  if (!Array.isArray(canonicalPayload.sources)) {
    throw new EventCoreDataError(
      "EVENT_CORE_BACKFILL_CONFLICT",
      `Canonical event ${eventId} is missing source provenance.`,
    );
  }
  const legacySource = canonicalPayload.sources.find(
    (source) =>
      source !== null &&
      typeof source === "object" &&
      (source as { name?: unknown }).name === "event_ops_events",
  ) as { payload?: unknown; snapshot?: unknown } | undefined;

  // A canonical row created for an event that had no legacy event_ops row is
  // derived output, not an additional source on the next planning pass.
  if (!legacySource) return null;
  const snapshot = payloadObject(legacySource.snapshot);
  if (optionalText(snapshot.eventId) !== eventId) {
    throw new EventCoreDataError(
      "EVENT_CORE_BACKFILL_CONFLICT",
      `Canonical event ${eventId} has invalid legacy event_ops provenance.`,
    );
  }
  const aliases = Array.isArray(snapshot.aliases)
    ? snapshot.aliases.filter(
        (alias): alias is { type: "event_id" | "public_code" | "legacy_route_id"; value: string } =>
          alias !== null &&
          typeof alias === "object" &&
          typeof (alias as { value?: unknown }).value === "string" &&
          ["event_id", "public_code", "legacy_route_id"].includes(
            String((alias as { type?: unknown }).type),
          ),
      )
    : [];
  return {
    aliases,
    description: optionalText(snapshot.description),
    endsAt: optionalTimestamp(snapshot.endsAt),
    eventId,
    lifecycleState: optionalText(snapshot.lifecycleState) as EventLifecycleState | null,
    organizerActorId: optionalText(snapshot.organizerActorId),
    publicCode: optionalText(snapshot.publicCode),
    source: "event_ops_events",
    sourcePayload: payloadObject(legacySource.payload),
    startsAt: optionalTimestamp(snapshot.startsAt),
    timezone: optionalText(snapshot.timezone),
    title: optionalText(snapshot.title),
    venue: optionalText(snapshot.venue),
  };
}

export async function readEventCoreBackfillCandidates(input: {
  client: EventOperationsSqlExecutor;
  defaultTimezone: string;
  publicOwnerActorId: string;
  workspaceId: string;
}): Promise<readonly EventCoreBackfillCandidate[]> {
  const [operationRows, recordRows] = await Promise.all([
    input.client.query<SqlRow>(
      `select * from event_ops_events where workspace_id = $1 order by event_id`,
      [input.workspaceId],
    ),
    input.client.query<SqlRow>(
      `select * from orbit_records
       where workspace_id = $1
         and collection_name = 'events'
         and lifecycle_state <> 'deleted'
       order by record_id`,
      [input.workspaceId],
    ),
  ]);
  const operationCandidates = operationRows.rows
    .map(legacyEventOperationsCandidate)
    .filter((candidate): candidate is EventCoreBackfillCandidate => candidate !== null);
  const knownOwners = new Map<string, Set<string>>();
  const rememberOwner = (eventId: unknown, owner: unknown) => {
    const normalizedEventId = optionalText(eventId);
    const normalizedOwner = optionalText(owner);
    if (!normalizedEventId || !normalizedOwner) return;
    const owners = knownOwners.get(normalizedEventId) ?? new Set<string>();
    owners.add(normalizedOwner);
    knownOwners.set(normalizedEventId, owners);
  };
  operationCandidates.forEach((candidate) =>
    rememberOwner(candidate.eventId, candidate.organizerActorId),
  );
  recordRows.rows.forEach((row) => rememberOwner(row.record_id, row.user_id));
  const migrationOwnerFor = (eventId: string): {
    actorId: string | null;
    assignment: Readonly<Record<string, unknown>> | null;
  } => {
    const owners = [...(knownOwners.get(eventId) ?? [])];
    if (owners.length === 1) {
      return { actorId: owners[0]!, assignment: null };
    }
    if (owners.length > 1) {
      return { actorId: null, assignment: null };
    }
    return {
      actorId: input.publicOwnerActorId,
      assignment: {
        assignmentSource: "EVENT_CORE_PUBLIC_OWNER_ACTOR_ID",
        field: "organizerActorId",
        reasonCode: "EXPLICIT_OPERATOR_WORKSPACE_PUBLIC_OWNER",
        value: input.publicOwnerActorId,
      },
    };
  };
  const candidates: EventCoreBackfillCandidate[] = [...operationCandidates];

  const catalogue = readPublicEventCatalogue();
  catalogue.events.forEach((event, index) => {
    const migrationOwner = migrationOwnerFor(event.id);
    candidates.push({
      aliases: [{ type: "legacy_route_id", value: eventCodeFor(event, index) }],
      description: event.description ?? null,
      endsAt: event.endsAt ?? event.startsAt,
      eventId: event.id,
      lifecycleState: "published",
      organizerActorId:
        event.organizerId ?? migrationOwner.actorId,
      publicCode: eventCodeFor(event, index),
      source: "public_catalogue",
      sourcePayload: {
        evidenceIds: event.evidenceIds,
        generatedAt: catalogue.generatedAt,
        ...(event.organizerId || !migrationOwner.assignment
          ? {}
          : { operatorMigrationAssignment: migrationOwner.assignment }),
        source: event.source,
      },
      startsAt: event.startsAt,
      timezone: input.defaultTimezone,
      title: event.name,
      venue: event.location ?? null,
    });
  });

  for (const row of recordRows.rows) {
    const payload = payloadObject(row.payload);
    const startsAt = optionalTimestamp(payload.startsAt) ?? optionalTimestamp(row.occurred_at);
    const recordOwner = optionalText(row.user_id);
    const migrationOwner = migrationOwnerFor(String(row.record_id));
    candidates.push({
      description: optionalText(payload.description),
      endsAt: optionalTimestamp(payload.endsAt) ?? startsAt,
      eventId: String(row.record_id),
      lifecycleState: lifecycleForOrbitRecord(row, payload),
      // Workspace-public legacy records legitimately have no user_id. The
      // operator-supplied public owner is the explicit migration owner for
      // those records; it is never inferred from another source row.
      organizerActorId:
        recordOwner ?? migrationOwner.actorId,
      publicCode: optionalText(payload.publicCode),
      source: "orbit_records/events",
      sourcePayload: {
        evidenceIds: Array.isArray(row.evidence_ids) ? row.evidence_ids : [],
        ...(!recordOwner && migrationOwner.assignment
          ? { operatorMigrationAssignment: migrationOwner.assignment }
          : {}),
        provider: row.provider,
        recordId: row.record_id,
        sourceId: row.source_id,
      },
      startsAt,
      timezone: optionalText(payload.timezone) ?? input.defaultTimezone,
      title: optionalText(payload.title) ?? optionalText(payload.name),
      venue: optionalText(payload.venue) ?? optionalText(payload.location),
    });
  }

  return candidates;
}
