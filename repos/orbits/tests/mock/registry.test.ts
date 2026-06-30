/**
 * 共享 mock registry/state store 测试。
 *
 * 锁住 fixture variant 注册、reset、clone-on-read 和状态更新语义。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MOCK_FIXTURE_VARIANT,
  getMockFixtureVariant,
  listMockFixtureVariants,
  registerMockFixtureVariant,
  resetMockFixtureRegistry,
} from "../../shared/mock/registry";
import { createMockStateStore } from "../../shared/mock/state-store";
import {
  defaultMockFixtures,
  type MockRuntimeFixtures,
} from "../../shared/mock/fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function ids(records: readonly { id: string }[]): Set<string> {
  return new Set(records.map((record) => record.id));
}

function assertEvidenceIdsExist(
  label: string,
  evidenceIds: readonly string[],
  evidenceIdSet: Set<string>,
): void {
  assert.ok(evidenceIds.length > 0, `${label} must include evidence ids`);

  for (const evidenceId of evidenceIds) {
    assert.ok(
      evidenceIdSet.has(evidenceId),
      `${label} references missing evidence ${evidenceId}`,
    );
  }
}

test("mock registry exposes typed fixture registration, lookup, and reset helpers", () => {
  resetMockFixtureRegistry();

  const variantFixtures: MockRuntimeFixtures = {
    ...defaultMockFixtures,
    id: "fixture_variant_test",
    label: "Variant test graph",
  };

  registerMockFixtureVariant({
    variant: "variant-test",
    label: "Variant test",
    description: "A test-only variant registered through the typed registry.",
    fixtures: variantFixtures,
  });

  assert.deepEqual(
    listMockFixtureVariants().map((variant) => variant.variant),
    [DEFAULT_MOCK_FIXTURE_VARIANT, "variant-test"],
  );
  assert.equal(getMockFixtureVariant("variant-test").label, "Variant test graph");

  const mutableLookup = getMockFixtureVariant("variant-test");
  mutableLookup.contacts[0].displayName = "Mutated outside the registry";

  assert.equal(
    getMockFixtureVariant("variant-test").contacts[0].displayName,
    defaultMockFixtures.contacts[0].displayName,
  );

  resetMockFixtureRegistry();

  assert.deepEqual(
    listMockFixtureVariants().map((variant) => variant.variant),
    [DEFAULT_MOCK_FIXTURE_VARIANT],
  );
  assert.throws(
    () => getMockFixtureVariant("variant-test"),
    /Mock fixture variant "variant-test" is not registered/,
  );
});

test("mock state store clones reads, writes, updates, and resets deterministically", () => {
  const store = createMockStateStore({
    records: [
      {
        id: "record_1",
        count: 1,
      },
    ],
  });

  const firstRead = store.getState();
  firstRead.records[0].count = 99;
  assert.equal(store.getState().records[0].count, 1);

  const updatedState = store.updateState((draft) => {
    draft.records[0].count += 1;
  });

  assert.equal(updatedState.records[0].count, 2);
  updatedState.records[0].count = 1000;
  assert.equal(store.getState().records[0].count, 2);

  const replacedState = store.replaceState({
    records: [
      {
        id: "record_2",
        count: 5,
      },
    ],
  });

  assert.equal(replacedState.records[0].id, "record_2");
  replacedState.records[0].count = 6;
  assert.equal(store.getState().records[0].count, 5);

  store.reset();
  assert.deepEqual(store.getState(), {
    records: [
      {
        id: "record_1",
        count: 1,
      },
    ],
  });
});

test("default mock fixtures seed every Sprint 6 relationship runtime collection", () => {
  const fixtures = getMockFixtureVariant();

  assert.equal(fixtures.id, defaultMockFixtures.id);
  assert.ok(fixtures.accounts.length > 0, "accounts must be seeded");
  assert.ok(fixtures.profiles.length > 0, "profiles must be seeded");
  assert.ok(fixtures.events.length > 0, "events must be seeded");
  assert.ok(fixtures.attendees.length > 0, "attendees must be seeded");
  assert.ok(fixtures.contacts.length > 0, "contacts must be seeded");
  assert.ok(fixtures.connections.length > 0, "connections must be seeded");
  assert.ok(fixtures.evidence.length > 0, "evidence must be seeded");
  assert.ok(fixtures.tasks.length > 0, "tasks must be seeded");
  assert.ok(fixtures.conversations.length > 0, "conversations must be seeded");
  assert.ok(fixtures.messages.length > 0, "messages must be seeded");
  assert.ok(fixtures.dashboards.length > 0, "dashboards must be seeded");
  assert.ok(fixtures.agentActions.length > 0, "agent actions must be seeded");
  assert.ok(fixtures.permissions.length > 0, "permissions must be seeded");
  assert.ok(fixtures.notifications.length > 0, "notifications must be seeded");
});

test("default mock fixtures keep cross-reference consistency across relationship data", () => {
  const fixtures = getMockFixtureVariant();
  const accountIds = ids(fixtures.accounts);
  const profileIds = ids(fixtures.profiles);
  const eventIds = ids(fixtures.events);
  const attendeeIds = ids(fixtures.attendees);
  const contactIds = ids(fixtures.contacts);
  const connectionIds = ids(fixtures.connections);
  const conversationIds = ids(fixtures.conversations);
  const evidenceIds = ids(fixtures.evidence);

  for (const profile of fixtures.profiles) {
    assert.ok(accountIds.has(profile.accountId), `${profile.id} account exists`);
  }

  for (const evidence of fixtures.evidence) {
    assert.ok(
      profileIds.has(evidence.createdBy),
      `${evidence.id} creator profile exists`,
    );
  }

  for (const event of fixtures.events) {
    assertEvidenceIdsExist(event.id, event.evidenceIds, evidenceIds);
  }

  for (const attendee of fixtures.attendees) {
    assert.ok(eventIds.has(attendee.eventId), `${attendee.id} event exists`);
    assertEvidenceIdsExist(attendee.id, attendee.evidenceIds, evidenceIds);

    if (attendee.contactId) {
      assert.ok(contactIds.has(attendee.contactId), `${attendee.id} contact exists`);
    }
  }

  for (const contact of fixtures.contacts) {
    assertEvidenceIdsExist(contact.id, contact.evidenceIds, evidenceIds);
  }

  for (const connection of fixtures.connections) {
    assert.ok(accountIds.has(connection.accountId), `${connection.id} account exists`);
    assert.ok(contactIds.has(connection.contactId), `${connection.id} contact exists`);
    assertEvidenceIdsExist(connection.id, connection.evidenceIds, evidenceIds);
  }

  for (const task of fixtures.tasks) {
    assert.ok(task.contactId && contactIds.has(task.contactId), `${task.id} contact exists`);
    assert.ok(
      task.connectionId && connectionIds.has(task.connectionId),
      `${task.id} connection exists`,
    );
    assertEvidenceIdsExist(task.id, task.evidenceIds, evidenceIds);
  }

  for (const conversation of fixtures.conversations) {
    assert.ok(
      conversation.participantContactIds.every((contactId) =>
        contactIds.has(contactId),
      ),
      `${conversation.id} contacts exist`,
    );
    assertEvidenceIdsExist(conversation.id, conversation.evidenceIds, evidenceIds);
  }

  for (const message of fixtures.messages) {
    assert.ok(
      conversationIds.has(message.conversationId),
      `${message.id} conversation exists`,
    );
    assertEvidenceIdsExist(message.id, message.evidenceIds, evidenceIds);
  }

  for (const dashboard of fixtures.dashboards) {
    assert.ok(accountIds.has(dashboard.accountId), `${dashboard.id} account exists`);
    assertEvidenceIdsExist(dashboard.id, dashboard.evidenceIds, evidenceIds);

    for (const item of dashboard.items) {
      assertEvidenceIdsExist(item.id, item.evidenceIds, evidenceIds);
    }
  }

  for (const agentAction of fixtures.agentActions) {
    assertEvidenceIdsExist(agentAction.id, agentAction.evidenceIds, evidenceIds);
  }

  for (const permission of fixtures.permissions) {
    assertEvidenceIdsExist(permission.id, permission.evidenceIds, evidenceIds);
  }

  for (const notification of fixtures.notifications) {
    assertEvidenceIdsExist(notification.id, notification.evidenceIds, evidenceIds);
  }

  assert.ok(
    fixtures.attendees.some((attendee) => attendeeIds.has(attendee.id)),
    "attendee ids are stable and enumerable",
  );
});

test("developer mock registry route documents variants, seeded collections, and live handoff", () => {
  const source = readFileSync(
    join(projectRoot, "app/dev/foundation/mock-registry/page.tsx"),
    "utf8",
  );

  assert.match(source, /Shared mock runtime/i);
  assert.match(source, /Variant lookup/i);
  assert.match(source, /Seeded collections/i);
  assert.match(source, /Reset helpers/i);
  assert.match(source, /Mock-to-live handoff/i);
  assert.match(source, /createMockStateStore/);
  assert.match(source, /getMockFixtureVariant/);
  assert.match(source, /listMockFixtureVariants/);
  assert.match(source, /shared\/mock\/registry\.ts/);
  assert.match(source, /shared\/mock\/state-store\.ts/);
  assert.match(source, /shared\/mock\/fixtures\.ts/);
  assert.match(
    source,
    /shared\/mock\/create-the-shared-mock-runtime-used-by-every-capability-sprint\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("mock-to-live notes name the runtime switch and replacement provider obligations", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "shared/mock/create-the-shared-mock-runtime-used-by-every-capability-sprint/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.match(source, /ORBIT_FEATURE_MODE/);
  assert.match(source, /live-account-provider/);
  assert.match(source, /live-event-provider/);
  assert.match(source, /live-contact-provider/);
  assert.match(source, /privacy/i);
  assert.match(source, /provenance/i);
  assert.match(source, /replacement tests/i);
});
