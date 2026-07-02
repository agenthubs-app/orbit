import assert from "node:assert/strict";
import test from "node:test";

import { createLiveEventEncounterNoteService } from "../../features/events/encounter-note/live-service";
import { createGeneratedEventEncounterNoteProvider } from "../../features/events/encounter-note/storage/generated-encounter-note-live-record-provider";
import { EVENT_WORK_RECORD_COLLECTIONS } from "../../features/events/storage/event-work-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live event encounter note generates a note base from generated attendees and persists captured notes", async () => {
  const workspaceId = "workspace:event-encounter-note-generated-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T23:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createGeneratedEventEncounterNoteProvider({
    now: () => "2026-07-01T23:05:00.000Z",
    sourceLabel: "Generated encounter note memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveEventEncounterNoteService({
    now: () => "2026-07-01T23:10:00.000Z",
    provider,
  });

  const preview = await service.createEncounterNote({
    eventId: "event_01",
  });

  assert.equal(preview.success, true);
  assert.equal(preview.data.state, "empty");
  assert.equal(preview.data.event.id, "event_01");
  assert.equal(preview.data.provenance.generationMethod, "live-store-query");
  assert.equal(preview.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(preview.data.provenance.liveNoteStorageExecuted, false);
  assert.equal(
    store.listRecords({
      workspaceId,
      collectionName: EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
    }).length,
    0,
  );

  const captured = await service.createEncounterNote({
    eventId: "event_01",
    contactId: "contact_078",
    noteText: "Discussed Osaka restaurant CRM pilot timing and bilingual channel fit.",
  });

  assert.equal(captured.success, true);
  assert.equal(captured.data.event.id, "event_01");
  assert.match(captured.data.event.name, /東京インバウンド飲食店成長会/);
  assert.equal(captured.data.participant?.contactId, "contact_078");
  assert.equal(captured.data.note?.text, "Discussed Osaka restaurant CRM pilot timing and bilingual channel fit.");
  assert.equal(captured.data.provenance.source, `live-record-store:event-encounter-note:${workspaceId}`);
  assert.equal(
    captured.data.provenance.sourceLabel,
    "Generated encounter note memory live storage",
  );
  assert.equal(captured.data.provenance.generationMethod, "live-store-note-capture");
  assert.equal(captured.data.provenance.liveNoteStorageExecuted, true);
  assert.equal(captured.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(captured.data.provenance.speechToTextRequested, false);
  assert.equal(captured.data.provenance.audioUploadRequested, false);
  assert.equal(captured.data.provenance.aiProviderRequested, false);
  assert.equal(captured.data.encounter?.liveNoteStorageExecuted, true);
  assert.equal(captured.data.evidenceDraft?.liveDatabaseWriteExecuted, true);

  const evidence = await service.createEncounterEvidence({
    eventId: "event_01",
    encounterId: captured.data.encounter?.encounterId,
  });

  assert.equal(evidence.success, true);
  assert.equal(evidence.data.eventId, "event_01");
  assert.equal(evidence.data.encounterId, captured.data.encounter?.encounterId);
  assert.equal(evidence.data.evidence.contactId, "contact_078");
  assert.match(evidence.data.evidence.excerpt, /restaurant CRM pilot/);
  assert.equal(evidence.data.provenance.generationMethod, "live-store-evidence");
  assert.equal(evidence.data.provenance.liveDatabaseWriteExecuted, true);
});
