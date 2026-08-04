import { createHash } from "node:crypto";

import { EventCoreDataError, type EventAliasType, type EventLifecycleState } from "./contract";
import { normalizeEventAlias } from "./alias-resolver";
import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
} from "../event-operations/storage/postgres-client";
import type {
  EventCanonicalConflictResolution,
  EventCanonicalResolutionField,
  EventCanonicalResolutionManifest,
} from "./migration/contract";

export interface EventCoreBackfillCandidate {
  aliases?: readonly { type: EventAliasType; value: string }[];
  description?: string | null;
  endsAt?: string | null;
  eventId: string;
  lifecycleState?: EventLifecycleState | null;
  organizerActorId?: string | null;
  publicCode?: string | null;
  source: string;
  sourcePayload: Readonly<Record<string, unknown>>;
  startsAt?: string | null;
  timezone?: string | null;
  title?: string | null;
  venue?: string | null;
}

export interface EventCoreBackfillEvent {
  aliases: readonly { type: EventAliasType; value: string }[];
  contentHash: string;
  description: string;
  endsAt: string;
  eventId: string;
  lifecycleState: EventLifecycleState;
  organizerActorId: string;
  publicCode: string | null;
  sourcePayload: Readonly<Record<string, unknown>>;
  startsAt: string;
  timezone: string;
  title: string;
  venue: string;
}

export interface EventCoreBackfillPlan {
  count: number;
  events: readonly EventCoreBackfillEvent[];
  hash: string;
  migrationId: string;
  resolutionCount: number;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function eventCanonicalValueDigest(value: unknown): string {
  return hash(value);
}

function normalizedOptional(value: string | null | undefined): string | null {
  const normalized = value?.normalize("NFC").trim() ?? "";
  return normalized || null;
}

function normalizedTimestamp(value: string | null | undefined): string | null {
  const text = normalizedOptional(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new EventCoreDataError(
      "EVENT_CORE_BACKFILL_CONFLICT",
      `Backfill timestamp ${JSON.stringify(value)} is invalid.`,
    );
  }
  return new Date(parsed).toISOString();
}

function oneValue<TValue>(input: {
  eventId: string;
  field: EventCanonicalResolutionField;
  resolutionByKey: ReadonlyMap<string, EventCanonicalConflictResolution>;
  consumedResolutionKeys: Set<string>;
  values: readonly { source: string; value: TValue | null }[];
}): TValue | null {
  const present = input.values.filter(
    (item): item is { source: string; value: TValue } => item.value !== null,
  );
  if (present.length === 0) return null;
  const serialized = new Map(
    present.map((item) => [JSON.stringify(item.value), item]),
  );
  if (serialized.size > 1) {
    const key = `${input.eventId}\u0000${input.field}`;
    const resolution = input.resolutionByKey.get(key);
    if (!resolution) {
      throw new EventCoreDataError(
        "EVENT_CORE_BACKFILL_CONFLICT",
        `Event ${input.eventId} has conflicting ${input.field}: ${present
          .map((item) => `${item.source}=${JSON.stringify(item.value)}`)
          .join(", ")}.`,
      );
    }
    const selected = present.find(
      (item) => item.source === resolution.selectedSource,
    );
    if (!selected) {
      throw new EventCoreDataError(
        "EVENT_CORE_BACKFILL_CONFLICT",
        `Resolution ${input.eventId}.${input.field} selected source ${resolution.selectedSource} is absent.`,
      );
    }
    const observedDigests = present
      .map((item) => ({
        digest: eventCanonicalValueDigest(item.value),
        source: item.source,
      }))
      .sort((left, right) =>
        left.source.localeCompare(right.source) ||
        left.digest.localeCompare(right.digest),
      );
    const expectedDigests = [...resolution.sourceValueDigests].sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        left.digest.localeCompare(right.digest),
    );
    if (
      JSON.stringify(stableValue(observedDigests)) !==
      JSON.stringify(stableValue(expectedDigests))
    ) {
      throw new EventCoreDataError(
        "EVENT_CORE_BACKFILL_CONFLICT",
        `Resolution ${input.eventId}.${input.field} source value digest mismatch.`,
      );
    }
    input.consumedResolutionKeys.add(key);
    return selected.value;
  }
  return present[0]!.value;
}

function required(value: string | null, eventId: string, field: string): string {
  if (value) return value;
  throw new EventCoreDataError(
    "EVENT_CORE_BACKFILL_CONFLICT",
    `Event ${eventId} cannot be backfilled without ${field}.`,
  );
}

export function buildEventCoreBackfillPlan(
  candidates: readonly EventCoreBackfillCandidate[],
  manifest: EventCanonicalResolutionManifest,
): EventCoreBackfillPlan {
  if (manifest.schemaVersion !== 1 || !manifest.migrationId.trim()) {
    throw new EventCoreDataError(
      "EVENT_CORE_BACKFILL_CONFLICT",
      "Event canonical resolution manifest identity is invalid.",
    );
  }
  const resolutionByKey = new Map<string, EventCanonicalConflictResolution>();
  for (const resolution of manifest.resolutions) {
    const key = `${resolution.eventId.trim()}\u0000${resolution.field}`;
    if (
      !resolution.eventId.trim() ||
      !resolution.selectedSource.trim() ||
      !resolution.reasonCode.trim() ||
      !resolution.rationale.trim() ||
      resolutionByKey.has(key)
    ) {
      throw new EventCoreDataError(
        "EVENT_CORE_BACKFILL_CONFLICT",
        `Resolution manifest ${manifest.migrationId} has an invalid or duplicate entry ${key}.`,
      );
    }
    resolutionByKey.set(key, resolution);
  }
  const consumedResolutionKeys = new Set<string>();
  const groups = new Map<string, EventCoreBackfillCandidate[]>();
  for (const candidate of candidates) {
    const eventId = candidate.eventId.trim();
    if (!eventId) {
      throw new EventCoreDataError(
        "EVENT_CORE_BACKFILL_CONFLICT",
        `Backfill source ${candidate.source} has an empty event id.`,
      );
    }
    groups.set(eventId, [...(groups.get(eventId) ?? []), candidate]);
  }

  const aliasOwners = new Map<string, string>();
  const events = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([eventId, sources]) => {
      const orderedSources = [...sources].sort((left, right) =>
        left.source.localeCompare(right.source) ||
        hash(left.sourcePayload).localeCompare(hash(right.sourcePayload)),
      );
      const value = <TValue>(
        field: EventCanonicalResolutionField,
        read: (candidate: EventCoreBackfillCandidate) => TValue | null,
      ) => oneValue({
        consumedResolutionKeys,
        eventId,
        field,
        resolutionByKey,
        values: orderedSources.map((candidate) => ({
          source: candidate.source,
          value: read(candidate),
        })),
      });
      const publicCode = value("publicCode", (item) => normalizedOptional(item.publicCode));
      const title = required(value("title", (item) => normalizedOptional(item.title)), eventId, "title");
      const startsAt = required(value("startsAt", (item) => normalizedTimestamp(item.startsAt)), eventId, "startsAt");
      const endsAt = required(value("endsAt", (item) => normalizedTimestamp(item.endsAt)), eventId, "endsAt");
      const organizerActorId = required(
        value("organizerActorId", (item) => normalizedOptional(item.organizerActorId)),
        eventId,
        "organizerActorId",
      );
      const lifecycleState = value("lifecycleState", (item) => item.lifecycleState ?? null);
      if (!lifecycleState) {
        throw new EventCoreDataError(
          "EVENT_CORE_BACKFILL_CONFLICT",
          `Event ${eventId} cannot be backfilled without lifecycleState.`,
        );
      }
      if (Date.parse(startsAt) >= Date.parse(endsAt)) {
        throw new EventCoreDataError(
          "EVENT_CORE_BACKFILL_CONFLICT",
          `Event ${eventId} has a non-positive time range.`,
        );
      }

      const aliases = [
        { type: "event_id" as const, value: eventId },
        ...(publicCode ? [{ type: "public_code" as const, value: publicCode }] : []),
        ...orderedSources.flatMap((source) => source.aliases ?? []),
      ].filter((alias, index, all) =>
        all.findIndex((item) => normalizeEventAlias(item.value) === normalizeEventAlias(alias.value)) === index,
      );
      for (const alias of aliases) {
        const key = normalizeEventAlias(alias.value);
        const owner = aliasOwners.get(key);
        if (owner && owner !== eventId) {
          throw new EventCoreDataError(
            "EVENT_CORE_ALIAS_COLLISION",
            `Alias ${JSON.stringify(alias.value)} belongs to both ${owner} and ${eventId}.`,
          );
        }
        aliasOwners.set(key, eventId);
      }

      const merged = {
        aliases,
        description: value("description", (item) => normalizedOptional(item.description)) ?? "",
        endsAt,
        eventId,
        lifecycleState,
        organizerActorId,
        publicCode,
        sourcePayload: {
          migrationResolution: {
            migrationId: manifest.migrationId,
            resolutions: manifest.resolutions
              .filter((resolution) => resolution.eventId === eventId)
              .filter((resolution) =>
                consumedResolutionKeys.has(
                  `${resolution.eventId}\u0000${resolution.field}`,
                ),
              )
              .sort((left, right) => left.field.localeCompare(right.field)),
            schemaVersion: manifest.schemaVersion,
          },
          sources: orderedSources.map((source) => ({
            name: source.source,
            payload: source.sourcePayload,
            snapshot: {
              aliases: source.aliases ?? [],
              description: normalizedOptional(source.description),
              endsAt: normalizedTimestamp(source.endsAt),
              eventId,
              lifecycleState: source.lifecycleState ?? null,
              organizerActorId: normalizedOptional(source.organizerActorId),
              publicCode: normalizedOptional(source.publicCode),
              startsAt: normalizedTimestamp(source.startsAt),
              timezone: normalizedOptional(source.timezone),
              title: normalizedOptional(source.title),
              venue: normalizedOptional(source.venue),
            },
          })),
        },
        startsAt,
        timezone: required(value("timezone", (item) => normalizedOptional(item.timezone)), eventId, "timezone"),
        title,
        venue: value("venue", (item) => normalizedOptional(item.venue)) ?? "",
      };
      return { ...merged, contentHash: hash(merged) };
    });

  const unconsumed = [...resolutionByKey.keys()].filter(
    (key) => !consumedResolutionKeys.has(key),
  );
  if (unconsumed.length > 0) {
    throw new EventCoreDataError(
      "EVENT_CORE_BACKFILL_CONFLICT",
      `Resolution manifest ${manifest.migrationId} has unconsumed entries: ${unconsumed.join(", ")}.`,
    );
  }
  const planIdentity = {
    events,
    migrationId: manifest.migrationId,
    resolutionCount: consumedResolutionKeys.size,
    schemaVersion: manifest.schemaVersion,
  };
  return {
    count: events.length,
    events,
    hash: hash(planIdentity),
    migrationId: manifest.migrationId,
    resolutionCount: consumedResolutionKeys.size,
  };
}

async function currentVersion(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
): Promise<{
  contentHash: string | null;
  organizerActorId: string;
  version: number;
} | null> {
  const result = await executor.query<{
    content_hash: string | null;
    event_version: number;
    organizer_actor_id: string;
  }>(
    `select e.event_version, e.organizer_actor_id, v.content_hash
     from event_ops_events e
     left join event_event_versions v
       on v.workspace_id = e.workspace_id
      and v.event_id = e.event_id
      and v.event_version = e.event_version
     where e.workspace_id = $1 and e.event_id = $2
     for update of e`,
    [workspaceId, eventId],
  );
  const row = result.rows[0];
  return row
    ? {
        contentHash: row.content_hash,
        organizerActorId: row.organizer_actor_id,
        version: Number(row.event_version),
      }
    : null;
}

function verificationTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function verificationJson(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Readonly<Record<string, unknown>>
    : {};
}

export async function applyEventCoreBackfillPlan(input: {
  client: EventOperationsPostgresClient;
  now?: string;
  plan: EventCoreBackfillPlan;
  workspaceId: string;
}): Promise<{ count: number; hash: string }> {
  const now = input.now ?? new Date().toISOString();
  return input.client.transaction(async (transaction) => {
    await transaction.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`event-core-backfill:${input.workspaceId}`],
    );
    for (const event of input.plan.events) {
      const current = await currentVersion(transaction, input.workspaceId, event.eventId);
      if (current && current.organizerActorId !== event.organizerActorId) {
        throw new EventCoreDataError(
          "EVENT_CORE_BACKFILL_CONFLICT",
          `Event ${event.eventId} owner changed after planning; backfill stopped.`,
        );
      }
      if (current?.contentHash === event.contentHash) continue;
      const version = current
        ? current.contentHash === null
          ? 1
          : current.version + 1
        : 1;
      await transaction.query(
        `insert into event_ops_events (
           workspace_id, event_id, organizer_actor_id, lifecycle_state,
           revision, created_at, updated_at, public_code, title, description,
           venue, timezone, starts_at, ends_at, lifecycle_state_v2,
           source_payload, cancelled_at, archived_at, event_version
         ) values (
           $1, $2, $3, 'active', 1, $4, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13::jsonb,
           case when $12 = 'cancelled' then $4::timestamptz else null end,
           case when $12 = 'archived' then $4::timestamptz else null end,
           $14
         )
         on conflict (workspace_id, event_id) do update set
           public_code = excluded.public_code,
           title = excluded.title,
           description = excluded.description,
           venue = excluded.venue,
           timezone = excluded.timezone,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           lifecycle_state_v2 = excluded.lifecycle_state_v2,
           source_payload = excluded.source_payload,
           cancelled_at = excluded.cancelled_at,
           archived_at = excluded.archived_at,
           event_version = excluded.event_version,
           updated_at = excluded.updated_at`,
        [
          input.workspaceId, event.eventId, event.organizerActorId, now,
          event.publicCode, event.title, event.description, event.venue,
          event.timezone, event.startsAt, event.endsAt, event.lifecycleState,
          JSON.stringify(event.sourcePayload), version,
        ],
      );
      await transaction.query(
        `insert into event_event_versions (
           workspace_id, event_id, event_version, public_code, title,
           description, venue, timezone, starts_at, ends_at,
           lifecycle_state_v2, source_payload, cancelled_at, archived_at,
           organizer_actor_id, content_hash, created_at
         ) select
           workspace_id, event_id, event_version, public_code, title,
           description, venue, timezone, starts_at, ends_at,
           lifecycle_state_v2, source_payload, cancelled_at, archived_at,
           organizer_actor_id, $3, $4
         from event_ops_events
         where workspace_id = $1 and event_id = $2`,
        [input.workspaceId, event.eventId, event.contentHash, now],
      );
      for (const alias of event.aliases) {
        const normalizedAlias = normalizeEventAlias(alias.value);
        const existingAlias = await transaction.query<{ event_id: string }>(
          `select event_id from event_aliases
           where workspace_id = $1 and normalized_alias = $2
           for update`,
          [input.workspaceId, normalizedAlias],
        );
        if (
          existingAlias.rows[0] &&
          existingAlias.rows[0].event_id !== event.eventId
        ) {
          throw new EventCoreDataError(
            "EVENT_CORE_ALIAS_COLLISION",
            `Alias ${JSON.stringify(alias.value)} already belongs to ${existingAlias.rows[0].event_id}.`,
          );
        }
        await transaction.query(
          `insert into event_aliases (
             workspace_id, normalized_alias, alias_value, alias_type,
             event_id, source_payload, created_at
           ) values ($1, $2, $3, $4, $5, $6::jsonb, $7)
           on conflict (workspace_id, normalized_alias) do update set
             alias_value = excluded.alias_value,
             alias_type = excluded.alias_type,
             source_payload = excluded.source_payload
           where event_aliases.event_id = excluded.event_id`,
          [
            input.workspaceId,
            normalizedAlias,
            alias.value,
            alias.type,
            event.eventId,
            JSON.stringify({ backfillHash: input.plan.hash }),
            now,
          ],
        );
      }
    }
    for (const event of input.plan.events) {
      const persisted = await transaction.query<Record<string, unknown>>(
        `select
           e.event_id, e.organizer_actor_id, e.public_code, e.title,
           e.description, e.venue, e.timezone, e.starts_at, e.ends_at,
           e.lifecycle_state_v2, e.source_payload, e.event_version,
           v.content_hash
         from event_ops_events e
         join event_event_versions v
           on v.workspace_id = e.workspace_id
          and v.event_id = e.event_id
          and v.event_version = e.event_version
         where e.workspace_id = $1 and e.event_id = $2`,
        [input.workspaceId, event.eventId],
      );
      const row = persisted.rows[0];
      if (!row) {
        throw new EventCoreDataError(
          "EVENT_CORE_BACKFILL_CONFLICT",
          `Event ${event.eventId} was not persisted with a current version.`,
        );
      }
      const actualEvent = {
        description: String(row.description ?? ""),
        endsAt: verificationTimestamp(row.ends_at),
        eventId: String(row.event_id),
        lifecycleState: String(row.lifecycle_state_v2),
        organizerActorId: String(row.organizer_actor_id),
        publicCode: row.public_code === null ? null : String(row.public_code),
        sourcePayload: verificationJson(row.source_payload),
        startsAt: verificationTimestamp(row.starts_at),
        timezone: String(row.timezone),
        title: String(row.title),
        venue: String(row.venue ?? ""),
      };
      const expectedEvent = {
        description: event.description,
        endsAt: event.endsAt,
        eventId: event.eventId,
        lifecycleState: event.lifecycleState,
        organizerActorId: event.organizerActorId,
        publicCode: event.publicCode,
        sourcePayload: event.sourcePayload,
        startsAt: event.startsAt,
        timezone: event.timezone,
        title: event.title,
        venue: event.venue,
      };
      if (
        String(row.content_hash) !== event.contentHash ||
        hash(actualEvent) !== hash(expectedEvent)
      ) {
        throw new EventCoreDataError(
          "EVENT_CORE_BACKFILL_CONFLICT",
          `Event ${event.eventId} persisted verification mismatch.`,
        );
      }
      const persistedAliases = await transaction.query<{
        alias_type: string;
        alias_value: string;
        normalized_alias: string;
      }>(
        `select normalized_alias, alias_value, alias_type
         from event_aliases
         where workspace_id = $1 and event_id = $2
         order by normalized_alias`,
        [input.workspaceId, event.eventId],
      );
      const actualAliases = persistedAliases.rows.map((alias) => ({
        normalizedAlias: alias.normalized_alias,
        type: alias.alias_type,
        value: alias.alias_value,
      }));
      const expectedAliases = event.aliases
        .map((alias) => ({
          normalizedAlias: normalizeEventAlias(alias.value),
          type: alias.type,
          value: alias.value,
        }))
        .sort((left, right) =>
          left.normalizedAlias.localeCompare(right.normalizedAlias),
        );
      if (hash(actualAliases) !== hash(expectedAliases)) {
        throw new EventCoreDataError(
          "EVENT_CORE_BACKFILL_CONFLICT",
          `Event ${event.eventId} persisted alias verification mismatch.`,
        );
      }
    }
    return { count: input.plan.count, hash: input.plan.hash };
  });
}
