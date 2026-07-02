import assert from "node:assert/strict";
import test from "node:test";

import { createLiveEventAttendeeRosterService } from "../../features/events/attendee-roster/live-service";
import { createGeneratedEventAttendeeRosterProvider } from "../../features/events/attendee-roster/storage/generated-attendee-roster-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live event attendee roster generates roster payloads from generated attendee records", async () => {
  const workspaceId = "workspace:event-attendee-roster-generated-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T21:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createGeneratedEventAttendeeRosterProvider({
    now: () => "2026-07-01T21:05:00.000Z",
    sourceLabel: "Generated attendee memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveEventAttendeeRosterService({
    now: () => "2026-07-01T21:10:00.000Z",
    provider,
  });

  const roster = await service.getAttendeeRoster({ eventId: "event_01" });

  assert.equal(roster.success, true);
  assert.equal(roster.data.event.id, "event_01");
  assert.match(roster.data.event.name, /東京インバウンド飲食店成長会/);
  assert.equal(roster.data.attendees.length, 50);
  assert.equal(roster.data.attendees[0]?.attendeeId, "participant_001");
  assert.equal(roster.data.attendees[0]?.displayName, "中村 沙也香");
  assert.equal(roster.data.attendees[0]?.organizerFeedRequested, false);
  assert.equal(roster.data.attendees[0]?.externalLookupExecuted, false);
  assert.equal(roster.data.attendees[0]?.databaseWriteExecuted, false);
  assert.equal(roster.data.attendees[0]?.aiProviderRequested, false);
  assert.equal(roster.data.provenance.source, `live-record-store:event-attendee-roster:${workspaceId}`);
  assert.equal(roster.data.provenance.sourceLabel, "Generated attendee memory live storage");
  assert.equal(roster.data.provenance.generationMethod, "live-store-query");
  assert.equal(roster.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(roster.data.provenance.organizerFeedRequested, false);

  const knownOnly = await service.getAttendeeRoster({
    eventId: "event_01",
    knownContactOnly: true,
  });

  assert.equal(knownOnly.success, true);
  assert.equal(knownOnly.data.attendees.length, 17);
  assert.ok(
    knownOnly.data.attendees.every(
      (attendee) => attendee.knownContactMarker.isKnownContact,
    ),
  );

  const imported = await service.importAttendeeRoster({
    eventId: "event_01",
  });

  assert.equal(imported.success, true);
  assert.equal(imported.data.importBatch.liveDatabaseWriteExecuted, true);
  assert.equal(imported.data.attendees.length, 50);
  assert.ok(
    imported.data.attendees.every(
      (attendee) => attendee.databaseWriteExecuted === true,
    ),
  );
  assert.equal(
    imported.data.importBatch.recommendationCandidateIds.length,
    imported.data.eligibleRecommendationPool.length,
  );
});
