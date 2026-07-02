import assert from "node:assert/strict";
import test from "node:test";

import { createLiveWantConnectService } from "../../features/events/want-connect/live-service";
import { createGeneratedWantConnectProvider } from "../../features/events/want-connect/storage/generated-want-connect-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live want-connect generates on-site match context from generated attendees and persists intent", async () => {
  const workspaceId = "workspace:want-connect-generated-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T00:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createGeneratedWantConnectProvider({
    now: () => "2026-07-02T00:05:00.000Z",
    sourceLabel: "Generated want-connect memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveWantConnectService({
    now: () => "2026-07-02T00:10:00.000Z",
    provider,
  });

  const matches = await service.listMatches({ eventId: "event_01" });

  assert.equal(matches.success, true);
  assert.equal(matches.data.event.id, "event_01");
  assert.match(matches.data.event.name, /東京インバウンド飲食店成長会/);
  assert.equal(matches.data.matches.length, 1);
  assert.deepEqual(matches.data.matches[0]?.participantContactIds, [
    "contact:operator",
    "contact_078",
  ]);
  assert.match(
    matches.data.matches[0]?.successNotice.message ?? "",
    /曾伟/,
  );
  assert.equal(
    matches.data.provenance.source,
    `live-record-store:want-connect:${workspaceId}`,
  );
  assert.equal(
    matches.data.provenance.sourceLabel,
    "Generated want-connect memory live storage",
  );
  assert.equal(matches.data.provenance.generationMethod, "live-store-query");
  assert.equal(matches.data.provenance.realtimePresenceRequested, false);
  assert.equal(matches.data.provenance.peerNotificationDelivered, false);
  assert.equal(matches.data.provenance.externalMessageSent, false);
  assert.equal(matches.data.provenance.notificationProviderRequested, false);
  assert.equal(matches.data.provenance.modelProviderRequested, false);

  const intent = await service.createWantToConnectIntent({
    actorContactId: "contact:operator",
    eventId: "event_01",
    targetContactId: "contact_078",
  });

  assert.equal(intent.success, true);
  assert.equal(intent.data.intent?.actorContactId, "contact:operator");
  assert.equal(intent.data.intent?.targetContactId, "contact_078");
  assert.equal(intent.data.intent?.peerNotificationDelivered, false);
  assert.equal(intent.data.intent?.externalMessageSent, false);
  assert.equal(intent.data.provenance.generationMethod, "live-store-intent");
  assert.equal(intent.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(intent.data.provenance.realtimePresenceRequested, false);
  assert.equal(intent.data.provenance.peerNotificationDelivered, false);
  assert.equal(intent.data.provenance.externalMessageSent, false);
});
