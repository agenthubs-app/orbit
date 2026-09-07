import assert from "node:assert/strict";
import test from "node:test";

import type { EventCoreService } from "../../features/events/core/service";
import {
  createCanonicalEventCorePreEventBriefOrbitAdapter,
  createPreEventBriefCandidateCollector,
} from "../../features/orbit-ai/workflows/pre-event-brief-candidate-source";
import type { RelationshipNaturalSearchService } from "../../features/search/service";

const NOW = "2030-05-10T08:00:00.000Z";
const CANONICAL_EVENT = {
  archivedAt: null,
  cancelledAt: null,
  description: "Canonical Event Core schedule",
  endsAt: "2030-05-10T11:00:00.000Z",
  eventId: "event-core-reminder",
  eventVersion: 7,
  lifecycleState: "published" as const,
  organizerActorId: "organizer-a",
  phase: "upcoming" as const,
  publicCode: "CORE-7",
  sourcePayload: { evidenceIds: ["evidence:core:7"] },
  startsAt: "2030-05-10T10:00:00.000Z",
  timezone: "Asia/Tokyo",
  title: "Canonical schedule",
  venue: "Tokyo",
  workspaceId: "workspace-a",
};

test("live pre-event collector uses Event Core event version, schedule, and timezone", async () => {
  let legacyRead = false;
  const eventCore = {
    async listPublishedEvents() {
      return [CANONICAL_EVENT];
    },
  } as unknown as EventCoreService;
  const relationships = {
    async queryRelationships() {
      return { data: { results: [] }, success: true };
    },
  } as unknown as RelationshipNaturalSearchService;
  const canonical = createCanonicalEventCorePreEventBriefOrbitAdapter({
    eventCore,
    relationships,
  });
  const collector = createPreEventBriefCandidateCollector({
    actorId: "actor-a",
    external: {
      async listCalendarEvents() {
        return [];
      },
      async listRelationshipSignals() {
        return [];
      },
    },
    orbit: {
      async listEvents(context) {
        if (context.actorId === "legacy") legacyRead = true;
        return canonical.listEvents(context);
      },
      async listRelationships(event, context) {
        return canonical.listRelationships(event, context);
      },
    },
    now: () => NOW,
  });
  const candidates = await collector.collect({ now: NOW });
  assert.equal(legacyRead, false);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].eventId, CANONICAL_EVENT.eventId);
  assert.equal(candidates[0].startsAt, CANONICAL_EVENT.startsAt);
  assert.equal(candidates[0].endsAt, CANONICAL_EVENT.endsAt);
  assert.equal(candidates[0].eventVersion, CANONICAL_EVENT.eventVersion);
  assert.equal(candidates[0].timeZone, CANONICAL_EVENT.timezone);
  assert.equal(
    candidates[0].eventRevision,
    "7:2030-05-10T10:00:00.000Z:2030-05-10T11:00:00.000Z:Asia/Tokyo",
  );
  assert.equal(candidates[0].evidenceIds?.[0], "evidence:core:7");
});
