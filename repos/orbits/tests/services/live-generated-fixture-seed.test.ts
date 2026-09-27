import { writeAsOwner } from "../support/live-record-owner-fixture";
import assert from "node:assert/strict";
import test from "node:test";

import {
  MOCK_FIXTURE_COLLECTION_NAMES,
  defaultMockFixtures,
  type MockFixtureCollectionName,
} from "../../shared/mock/fixtures";
import {
  GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS,
  belowNotificationContentThreshold,
  seedGeneratedRelationshipFixturesIntoLiveStore,
  verifyGeneratedRelationshipFixturesInLiveStore,
} from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

// Sprint 0104: the retired legacy chat collections are no longer seeded.
const RETIRED_LEGACY_CHAT_COLLECTIONS = ["conversations", "messages"] as const;
const LIVE_SEED_COLLECTIONS = MOCK_FIXTURE_COLLECTION_NAMES.filter(
  (name) => !(RETIRED_LEGACY_CHAT_COLLECTIONS as readonly string[]).includes(name),
);

function fixtureCollection(name: MockFixtureCollectionName) {
  return defaultMockFixtures[name];
}

// Sprint 0086 (f069df7e6): the seed no longer writes generated "复核与 X 的下一步"
// notifications, which have no verifiable target; a fresh seed must not recreate them.
function seededFixtureCollection(name: MockFixtureCollectionName) {
  const records = fixtureCollection(name) as unknown as readonly { readonly [key: string]: unknown }[];
  return name === "notifications"
    ? records.filter((record) => !belowNotificationContentThreshold(record))
    : records;
}

function expectedFixtureRecordCount(): number {
  return LIVE_SEED_COLLECTIONS.reduce(
    (total, collectionName) => total + seededFixtureCollection(collectionName).length,
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
    LIVE_SEED_COLLECTIONS,
  );
  assert.equal(firstSeed.totalRecords, expectedTotalRecords);
  assert.equal(secondSeed.totalRecords, expectedTotalRecords);
  assert.deepEqual(seededCollections, [...LIVE_SEED_COLLECTIONS]);
  for (const collectionName of RETIRED_LEGACY_CHAT_COLLECTIONS) {
    assert.equal(
      store.listRecords({ limit: "unbounded", workspaceId, collectionName }).length,
      0,
      `${collectionName} is a retired legacy chat collection and must not be seeded`,
    );
  }

  for (const collectionName of LIVE_SEED_COLLECTIONS) {
    const fixtureRecords = seededFixtureCollection(collectionName) as readonly { id: string }[];
    const liveRecords = store.listRecords({
      limit: "unbounded",
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

  assert.equal(store.listRecords({ limit: "unbounded", workspaceId }).length, expectedTotalRecords);
  const subThresholdNotifications = (fixtureCollection("notifications") as unknown as readonly { readonly [key: string]: unknown }[])
    .filter((record) => belowNotificationContentThreshold(record));
  assert.ok(subThresholdNotifications.length > 0, "the fixtures still carry sub-threshold notifications to exclude");
  for (const record of subThresholdNotifications) {
    assert.equal(
      store.getRecord({ workspaceId, collectionName: "notifications", recordId: String(record.id) }),
      null,
      `sub-threshold notification ${String(record.id)} must not be seeded`,
    );
  }

  const event01 = store.getRecord({
    workspaceId,
    collectionName: "events",
    recordId: "event_01",
  });
  assert.equal(event01?.payload.name, defaultMockFixtures.events[0].name);
  assert.match(
    event01?.searchText ?? "",
    new RegExp(defaultMockFixtures.events[0].name),
  );

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
  assert.equal(
    contact001?.payload.displayName,
    defaultMockFixtures.contacts[0]?.displayName,
  );
  assert.equal(contact001?.userId, defaultMockFixtures.accounts[0]?.id);
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
  const expectedTask001 = defaultMockFixtures.tasks.find(
    (task) => task.id === "task_001",
  );
  assert.equal(task001?.payload.contactId, expectedTask001?.contactId);
  assert.ok(
    defaultMockFixtures.contacts.some(
      (contact) => contact.id === task001?.payload.contactId,
    ),
  );


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

test("generated fixture verification rejects records owned by another account", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:generated-fixture-live-seed-owner-test";
  const now = () => "2026-07-01T15:00:00.000Z";

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now,
    store,
    workspaceId,
  });

  const contact = store.getRecord({
    workspaceId,
    collectionName: "contacts",
    recordId: "contact_001",
  });

  assert.ok(contact);
  await writeAsOwner(store, {
    ...contact,
    userId: "account:other",
    updatedAt: now(),
  });

  const verification = await verifyGeneratedRelationshipFixturesInLiveStore({
    store,
    workspaceId,
  });

  assert.equal(verification.success, false);
  assert.match(
    verification.failures.join(" "),
    /contacts: 1 generated fixture records have an invalid account owner/u,
  );
});

test("generated fixture verification rejects any corrupted generated event name", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId =
    "workspace:generated-fixture-live-seed-event-corruption-test";
  const now = () => "2026-07-01T15:00:00.000Z";

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now,
    store,
    workspaceId,
  });

  const event = store.getRecord({
    workspaceId,
    collectionName: "events",
    recordId: "event_02",
  });

  assert.ok(event);

  store.upsertRecord({
    ...event,
    payload: {
      ...event.payload,
      name: "Corrupted event name",
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
      /events event_02 name should match defaultMockFixtures/,
    );
  }
});

// Sprint 0104: the retired legacy chat collections are not seeded any more.
test("generated live seed does not write the retired legacy chat collections", async () => {
  const store = createMemoryLiveRecordStore();
  const workspaceId = "workspace:generated-fixture-live-seed-legacy-chat-test";
  const result = await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-09-27T00:00:00.000Z",
    store,
    workspaceId,
  });

  for (const collectionName of RETIRED_LEGACY_CHAT_COLLECTIONS) {
    assert.equal(
      store.listRecords({ limit: "unbounded", workspaceId, collectionName }).length,
      0,
      `${collectionName} must not be seeded`,
    );
    assert.equal(
      result.collections.some((collection) => collection.collectionName === collectionName),
      false,
    );
  }
  assert.ok(store.listRecords({ limit: "unbounded", workspaceId, collectionName: "contacts" }).length > 0);
});
