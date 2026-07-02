import assert from "node:assert/strict";
import test from "node:test";

import {
  MOCK_FIXTURE_COLLECTION_NAMES,
  defaultMockFixtures,
  type MockFixtureCollectionName,
} from "../../shared/mock/fixtures";
import {
  GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS,
  seedGeneratedRelationshipFixturesIntoLiveStore,
  verifyGeneratedRelationshipFixturesInLiveStore,
} from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function fixtureCollection(name: MockFixtureCollectionName) {
  return defaultMockFixtures[name];
}

function expectedFixtureRecordCount(): number {
  return MOCK_FIXTURE_COLLECTION_NAMES.reduce(
    (total, collectionName) => total + fixtureCollection(collectionName).length,
    0,
  );
}

test("generated relationship live seed writes every default mock fixture collection", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:generated-fixture-live-seed-test";
  const now = () => "2026-07-01T15:00:00.000Z";
  const expectedTotalRecords = expectedFixtureRecordCount();
  const seededCollections: string[] = [];

  const firstSeed = await seedGeneratedRelationshipFixturesIntoLiveStore({
    now,
    onCollectionSeeded: (collection) => {
      seededCollections.push(collection.collectionName);
    },
    store,
    workspaceId,
  });
  const secondSeed = await seedGeneratedRelationshipFixturesIntoLiveStore({
    now,
    store,
    workspaceId,
  });

  assert.deepEqual(
    GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS.map(
      (collection) => collection.collectionName,
    ),
    MOCK_FIXTURE_COLLECTION_NAMES,
  );
  assert.equal(firstSeed.totalRecords, expectedTotalRecords);
  assert.equal(secondSeed.totalRecords, expectedTotalRecords);
  assert.deepEqual(seededCollections, [...MOCK_FIXTURE_COLLECTION_NAMES]);

  for (const collectionName of MOCK_FIXTURE_COLLECTION_NAMES) {
    const fixtureRecords = fixtureCollection(collectionName);
    const liveRecords = store.listRecords({
      workspaceId,
      collectionName,
    });

    assert.equal(
      liveRecords.length,
      fixtureRecords.length,
      `${collectionName} live record count should match defaultMockFixtures`,
    );
    assert.deepEqual(
      liveRecords.map((record) => record.recordId).sort(),
      fixtureRecords.map((record) => record.id).sort(),
      `${collectionName} record ids should be stable fixture ids`,
    );
  }

  assert.equal(store.listRecords({ workspaceId }).length, expectedTotalRecords);

  const event01 = store.getRecord({
    workspaceId,
    collectionName: "events",
    recordId: "event_01",
  });
  assert.equal(event01?.payload.name, defaultMockFixtures.events[0].name);
  assert.match(event01?.searchText ?? "", /東京インバウンド飲食店成長会/);

  const signup01 = store.getRecord({
    workspaceId,
    collectionName: "events",
    recordId: "event_signup_01",
  });
  assert.equal(signup01?.targetType, "event");

  const contact001 = store.getRecord({
    workspaceId,
    collectionName: "contacts",
    recordId: "contact_001",
  });
  assert.equal(contact001?.payload.displayName, "佐藤 健一");
  assert.equal(contact001?.sourceType, "qr_scan");
  assert.deepEqual(contact001?.evidenceIds, ["evidence:contact:001"]);

  const evidenceEvent01 = store.getRecord({
    workspaceId,
    collectionName: "evidence",
    recordId: "evidence:event:01",
  });
  assert.equal(evidenceEvent01?.sourceType, "event_import");
  assert.match(evidenceEvent01?.searchText ?? "", /飲食店オーナー/);

  const attendeeEvent01 = store.getRecord({
    workspaceId,
    collectionName: "attendees",
    recordId: "participant_001",
  });
  assert.equal(attendeeEvent01?.targetType, "attendee");
  assert.equal(attendeeEvent01?.targetId, "participant_001");
  assert.equal(attendeeEvent01?.payload.eventId, "event_01");

  const intentEvent01 = store.getRecord({
    workspaceId,
    collectionName: "eventParticipantIntents",
    recordId: "intent_001",
  });
  assert.equal(intentEvent01?.targetType, "event");
  assert.equal(intentEvent01?.targetId, "event_01");
  assert.equal(intentEvent01?.payload.eventId, "event_01");

  const task001 = store.getRecord({
    workspaceId,
    collectionName: "tasks",
    recordId: "task_001",
  });
  assert.equal(task001?.targetType, "task");
  assert.equal(task001?.payload.contactId, "contact_021");

  const conversation001 = store.getRecord({
    workspaceId,
    collectionName: "conversations",
    recordId: "conversation_001",
  });
  assert.equal(conversation001?.targetType, "conversation");

  const message001 = store.getRecord({
    workspaceId,
    collectionName: "messages",
    recordId: "message_0001",
  });
  assert.equal(message001?.targetType, "message");
  assert.equal(message001?.targetId, "message_0001");
  assert.equal(message001?.payload.conversationId, "conversation_001");

  const agentAction001 = store.getRecord({
    workspaceId,
    collectionName: "agentActions",
    recordId: "agent_action_001",
  });
  assert.equal(agentAction001?.targetType, "agent_action");
  assert.equal(agentAction001?.payload.confirmationRequired, true);

  const verification = await verifyGeneratedRelationshipFixturesInLiveStore({
    store,
    workspaceId,
  });
  assert.equal(verification.success, true);
  assert.equal(verification.totalRecords, expectedTotalRecords);
});

test("generated fixture verification rejects corrupted key record payloads", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:generated-fixture-live-seed-corruption-test";
  const now = () => "2026-07-01T15:00:00.000Z";

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now,
    store,
    workspaceId,
  });

  const attendee = store.getRecord({
    workspaceId,
    collectionName: "attendees",
    recordId: "participant_001",
  });

  assert.ok(attendee);

  store.upsertRecord({
    ...attendee,
    payload: {
      ...attendee.payload,
      eventId: "event_other",
    },
    updatedAt: now(),
  });

  const verification = await verifyGeneratedRelationshipFixturesInLiveStore({
    store,
    workspaceId,
  });

  assert.equal(verification.success, false);

  if (verification.success === false) {
    assert.match(
      verification.failures.join("\n"),
      /attendees participant_001 eventId should be event_01/,
    );
  }
});
