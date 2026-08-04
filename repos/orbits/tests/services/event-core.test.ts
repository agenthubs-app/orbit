import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EventCoreDataError,
  type CanonicalEventRecord,
} from "../../features/events/core/contract";
import type { EventCoreRepository } from "../../features/events/core/repository";
import {
  createEventCoreService,
  deriveEventTemporalPhase,
} from "../../features/events/core/service";
import { createPostgresEventCoreRepository } from "../../features/events/core/storage/postgres-repository";
import { buildEventCoreBackfillPlan } from "../../features/events/core/backfill";
import { readEventCoreBackfillCandidates } from "../../features/events/core/backfill-sources";
import type { EventCanonicalResolutionManifest } from "../../features/events/core/migration/contract";

const EMPTY_RESOLUTION_MANIFEST: EventCanonicalResolutionManifest = {
  migrationId: "test-no-conflict-resolutions",
  resolutions: [],
  schemaVersion: 1,
};

const event = {
  archivedAt: null,
  cancelledAt: null,
  description: "An evidence-backed founder and investor salon.",
  endsAt: "2030-05-10T11:00:00.000Z",
  eventId: "event:tokyo-salon-2030",
  eventVersion: 3,
  lifecycleState: "published",
  organizerActorId: "actor:organizer-tokyo",
  publicCode: "TOKYO2030",
  sourcePayload: { sources: ["public_catalogue", "orbit_records/events"] },
  startsAt: "2030-05-10T09:00:00.000Z",
  timezone: "Asia/Tokyo",
  title: "东京创投关系沙龙 / Tokyo Venture Relationship Salon",
  venue: "Marunouchi, Tokyo",
  workspaceId: "workspace:test",
} satisfies CanonicalEventRecord;

function memoryRepository(): EventCoreRepository {
  return {
    async getEvent(eventId) {
      return eventId === event.eventId ? event : null;
    },
    async listEvents() {
      return [event];
    },
    async resolveAlias(alias) {
      if (
        alias === event.eventId.toLowerCase() ||
        alias === event.publicCode?.toLowerCase() ||
        alias === "legacy-salon-route"
      ) {
        return {
          eventId: event.eventId,
          matchedBy:
            alias === "legacy-salon-route"
              ? "legacy_route_id"
              : alias === event.publicCode?.toLowerCase()
                ? "public_code"
                : "event_id",
          requestedAlias: alias,
        };
      }
      return null;
    },
  };
}

test("temporal phase is derived at read time and never stored", () => {
  assert.equal(
    deriveEventTemporalPhase(event.startsAt, event.endsAt, new Date("2030-05-10T08:59:59Z")),
    "upcoming",
  );
  assert.equal(
    deriveEventTemporalPhase(event.startsAt, event.endsAt, new Date("2030-05-10T10:00:00Z")),
    "live",
  );
  assert.equal(
    deriveEventTemporalPhase(event.startsAt, event.endsAt, new Date("2030-05-10T11:00:00Z")),
    "ended",
  );
});

test("event id, public code, and legacy route id resolve to one canonical event", async () => {
  const service = createEventCoreService(memoryRepository());
  const now = new Date("2030-05-10T10:00:00Z");
  const byId = await service.getPublishedEvent(event.eventId, now);
  const byCode = await service.getPublishedEvent(" TOKYO2030 ", now);
  const byLegacyAlias = await service.getPublishedEvent("LEGACY-SALON-ROUTE", now);

  assert.equal(byId?.eventId, event.eventId);
  assert.deepEqual(byCode, byId);
  assert.deepEqual(byLegacyAlias, byId);
  assert.equal(byId?.phase, "live");
});

test("published rows fail closed when canonical fields are incomplete", async () => {
  const repository = memoryRepository();
  repository.getEvent = async () => ({ ...event, title: "" });
  const service = createEventCoreService(repository);

  await assert.rejects(
    service.getPublishedEvent(event.eventId),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_INVALID_PUBLISHED_EVENT",
  );
});

test("incomplete drafts remain readable with a null temporal phase", async () => {
  const draft: CanonicalEventRecord = {
    ...event,
    description: null,
    endsAt: null,
    eventId: "event:draft-incomplete",
    lifecycleState: "draft",
    publicCode: null,
    startsAt: null,
    timezone: null,
    title: null,
    venue: null,
  };
  const repository = memoryRepository();
  repository.getEvent = async () => draft;
  repository.listEvents = async () => [draft, event];
  repository.resolveAlias = async () => ({
    eventId: draft.eventId,
    matchedBy: "event_id",
    requestedAlias: draft.eventId,
  });
  const service = createEventCoreService(repository);

  const loaded = await service.getEvent(draft.eventId);
  assert.equal(loaded?.lifecycleState, "draft");
  assert.equal(loaded?.title, null);
  assert.equal(loaded?.phase, null);
  assert.equal((await service.listEvents())[0]?.phase, null);
  assert.equal(await service.getPublishedEvent(draft.eventId), null);
});

test("PostgreSQL mapper preserves nullable draft metadata", async () => {
  const repository = createPostgresEventCoreRepository({
    workspaceId: "workspace:test",
    client: {
      async query<TRow = Record<string, unknown>>() {
        const rows = [{
          archived_at: null,
          cancelled_at: null,
          description: null,
          ends_at: null,
          event_id: "event:postgres-draft",
          event_version: 1,
          lifecycle_state_v2: "draft",
          organizer_actor_id: "actor:draft-owner",
          public_code: null,
          source_payload: {},
          starts_at: null,
          timezone: null,
          title: null,
          venue: null,
          workspace_id: "workspace:test",
        }];
        return { rowCount: 1, rows: rows as unknown as TRow[] };
      },
    },
  });

  const records = await repository.listEvents();
  assert.equal(records[0]?.title, null);
  assert.equal(records[0]?.startsAt, null);
  assert.equal(records[0]?.endsAt, null);
});

test("PostgreSQL alias resolver deduplicates same-event matches and fails on cross-event collisions", async () => {
  let rows: Record<string, unknown>[] = [
    { event_id: event.eventId, matched_by: "event_id", match_rank: 1 },
    { event_id: event.eventId, matched_by: "public_code", match_rank: 2 },
  ];
  const repository = createPostgresEventCoreRepository({
    workspaceId: "workspace:test",
    client: {
      async query<TRow = Record<string, unknown>>(text: string) {
        assert.match(text, /from event_aliases/i);
        assert.doesNotMatch(text, /from event_ops_events/i);
        return { rowCount: rows.length, rows: rows as unknown as TRow[] };
      },
    },
  });

  assert.deepEqual(await repository.resolveAlias("tokyo2030"), {
    eventId: event.eventId,
    matchedBy: "event_id",
    requestedAlias: "tokyo2030",
  });

  rows = [
    { event_id: event.eventId, matched_by: "event_id", match_rank: 1 },
    { event_id: "event:collision", matched_by: "public_code", match_rank: 2 },
  ];
  await assert.rejects(
    repository.resolveAlias("tokyo2030"),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_ALIAS_COLLISION",
  );
});

test("canonical id and public code resolve only after their alias rows exist", async () => {
  const aliases = new Map<string, Record<string, unknown>>();
  const repository = createPostgresEventCoreRepository({
    workspaceId: "workspace:test",
    client: {
      async query<TRow = Record<string, unknown>>(
        _text: string,
        values?: readonly unknown[],
      ) {
        const row = aliases.get(String(values?.[1]));
        const rows = row ? [row] : [];
        return { rowCount: rows.length, rows: rows as unknown as TRow[] };
      },
    },
  });

  assert.equal(await repository.resolveAlias(event.eventId.toLowerCase()), null);
  assert.equal(await repository.resolveAlias(event.publicCode.toLowerCase()), null);
  aliases.set(event.eventId.toLowerCase(), {
    event_id: event.eventId,
    matched_by: "event_id",
  });
  aliases.set(event.publicCode.toLowerCase(), {
    event_id: event.eventId,
    matched_by: "public_code",
  });
  assert.equal(
    (await repository.resolveAlias(event.eventId.toLowerCase()))?.eventId,
    event.eventId,
  );
  assert.equal(
    (await repository.resolveAlias(event.publicCode.toLowerCase()))?.eventId,
    event.eventId,
  );
  aliases.delete(event.eventId.toLowerCase());
  aliases.delete(event.publicCode.toLowerCase());
  assert.equal(await repository.resolveAlias(event.eventId.toLowerCase()), null);
  assert.equal(await repository.resolveAlias(event.publicCode.toLowerCase()), null);
});

test("backfill plan has deterministic count/hash and rejects source conflicts", () => {
  const base = {
    description: event.description,
    endsAt: event.endsAt,
    eventId: event.eventId,
    lifecycleState: event.lifecycleState,
    organizerActorId: event.organizerActorId,
    publicCode: event.publicCode,
    startsAt: event.startsAt,
    timezone: event.timezone,
    title: event.title,
    venue: event.venue,
  };
  const candidates = [
    {
      ...base,
      aliases: [{ type: "legacy_route_id" as const, value: "legacy-salon-route" }],
      source: "public_catalogue",
      sourcePayload: { evidenceIds: ["evidence:catalogue:tokyo"] },
    },
    {
      ...base,
      source: "orbit_records/events",
      sourcePayload: { recordId: event.eventId, revision: 7 },
    },
  ];
  const first = buildEventCoreBackfillPlan(
    candidates,
    EMPTY_RESOLUTION_MANIFEST,
  );
  const second = buildEventCoreBackfillPlan(
    [...candidates].reverse(),
    EMPTY_RESOLUTION_MANIFEST,
  );

  assert.equal(first.count, 1);
  assert.equal(first.hash, second.hash);
  assert.equal(first.events[0]?.contentHash, second.events[0]?.contentHash);
  assert.deepEqual(
    first.events[0]?.aliases.map((alias) => alias.value),
    [event.eventId, event.publicCode, "legacy-salon-route"],
  );

  assert.throws(
    () => buildEventCoreBackfillPlan(
      [
        candidates[0]!,
        { ...candidates[1]!, title: "A conflicting event title" },
      ],
      EMPTY_RESOLUTION_MANIFEST,
    ),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_BACKFILL_CONFLICT" &&
      /conflicting title/.test(error.message),
  );
});

test("backfill aliases fail closed on workspace-wide collisions", () => {
  assert.throws(
    () => buildEventCoreBackfillPlan(
      [
        {
          ...event,
          aliases: [{ type: "legacy_route_id", value: "shared-route" }],
          source: "source:a",
          sourcePayload: {},
        },
        {
          ...event,
          aliases: [{ type: "legacy_route_id", value: "SHARED-ROUTE" }],
          eventId: "event:another",
          publicCode: "ANOTHER2030",
          source: "source:b",
          sourcePayload: {},
        },
      ],
      EMPTY_RESOLUTION_MANIFEST,
    ),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_ALIAS_COLLISION",
  );
});

test("backfill fails closed when sources claim different owners", () => {
  const candidates = [
    {
      ...event,
      source: "source:owner-a",
      sourcePayload: {},
    },
    {
      ...event,
      organizerActorId: "actor:different-owner",
      source: "source:owner-b",
      sourcePayload: {},
    },
  ];
  assert.throws(
    () => buildEventCoreBackfillPlan(
      candidates,
      EMPTY_RESOLUTION_MANIFEST,
    ),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_BACKFILL_CONFLICT" &&
      /conflicting organizerActorId/.test(error.message),
  );
});

test("backfill command runs Event Core migrations before reading candidates", () => {
  const source = readFileSync(
    new URL("../../scripts/backfill-event-core.ts", import.meta.url),
    "utf8",
  );
  const migrationCall = source.indexOf(
    "await runEventCoreMigrations(migrationPool)",
  );
  const candidateRead = source.indexOf("await readEventCoreBackfillCandidates(");

  assert.ok(migrationCall >= 0);
  assert.ok(candidateRead > migrationCall);
});

test("backfill source reader excludes deleted orbit event records", async () => {
  const queries: string[] = [];
  await readEventCoreBackfillCandidates({
    client: {
      async query<TRow = Record<string, unknown>>(text: string) {
        queries.push(text);
        return { rowCount: 0, rows: [] as TRow[] };
      },
    },
    defaultTimezone: "Asia/Tokyo",
    publicOwnerActorId: "account:test-owner",
    workspaceId: "workspace:test",
  });

  const orbitRecordsQuery = queries.find((query) =>
    query.includes("from orbit_records"),
  );
  assert.match(orbitRecordsQuery ?? "", /lifecycle_state\s*<>\s*'deleted'/i);
});

test("ownerless public sources reuse an existing canonical owner claim", async () => {
  let queryIndex = 0;
  const candidates = await readEventCoreBackfillCandidates({
    client: {
      async query<TRow = Record<string, unknown>>() {
        queryIndex += 1;
        const rows = queryIndex === 1
          ? [{
              event_id: "event_signup_01",
              organizer_actor_id: "actor:existing-owner",
              source_payload: {},
            }]
          : [];
        return { rowCount: rows.length, rows: rows as unknown as TRow[] };
      },
    },
    defaultTimezone: "Asia/Tokyo",
    publicOwnerActorId: "actor:public-migration-owner",
    workspaceId: "workspace:test",
  });

  const publicCandidate = candidates.find(
    (candidate) =>
      candidate.eventId === "event_signup_01" &&
      candidate.source === "public_catalogue",
  );
  assert.equal(publicCandidate?.organizerActorId, "actor:existing-owner");
});

test("three ownerless active records carry explicit operator assignment evidence", async () => {
  const ownerlessIds = ["event:ownerless:a", "event:ownerless:b", "event:ownerless:c"];
  const candidates = await readEventCoreBackfillCandidates({
    client: {
      async query<TRow = Record<string, unknown>>(text: string) {
        const rows = text.includes("from orbit_records")
          ? ownerlessIds.map((recordId, index) => ({
              evidence_ids: [],
              lifecycle_state: "active",
              payload: {
                endsAt: `2030-01-0${index + 1}T12:00:00.000Z`,
                startsAt: `2030-01-0${index + 1}T10:00:00.000Z`,
                title: `Ownerless event ${index + 1}`,
              },
              record_id: recordId,
              source_id: `source:${recordId}`,
              user_id: null,
            }))
          : [];
        return { rowCount: rows.length, rows: rows as unknown as TRow[] };
      },
    },
    defaultTimezone: "Asia/Tokyo",
    publicOwnerActorId: "actor:explicit-operator-owner",
    workspaceId: "workspace:test",
  });

  const ownerlessCandidates = candidates.filter(
    (candidate) =>
      candidate.source === "orbit_records/events" &&
      ownerlessIds.includes(candidate.eventId),
  );
  assert.equal(ownerlessCandidates.length, 3);
  for (const candidate of ownerlessCandidates) {
    assert.equal(candidate.organizerActorId, "actor:explicit-operator-owner");
    assert.deepEqual(candidate.sourcePayload.operatorMigrationAssignment, {
      assignmentSource: "EVENT_CORE_PUBLIC_OWNER_ACTOR_ID",
      field: "organizerActorId",
      reasonCode: "EXPLICIT_OPERATOR_WORKSPACE_PUBLIC_OWNER",
      value: "actor:explicit-operator-owner",
    });
  }
});
