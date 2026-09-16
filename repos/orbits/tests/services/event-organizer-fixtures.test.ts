import assert from "node:assert/strict";
import test from "node:test";

import {
  MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES,
  MOCK_EVENT_ORGANIZER_ASSIGNMENTS,
  validateMockEventOrganizerFixtures,
} from "../../shared/mock/event-organizer-fixtures";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

test("mock event fixtures have a complete organizer/account/profile projection", () => {
  assert.deepEqual(validateMockEventOrganizerFixtures(), []);

  const organizerIds = new Set(defaultMockFixtures.organizers.map((organizer) => organizer.id));
  const accountIds = new Set(defaultMockFixtures.accounts.map((account) => account.id));
  const profileAccountIds = new Set(defaultMockFixtures.profiles.map((profile) => profile.accountId));
  const assignmentByEventId = new Map<string, string>(
    MOCK_EVENT_ORGANIZER_ASSIGNMENTS.map((assignment) => [assignment.eventId, assignment.organizerKey]),
  );
  const organizerByKey = new Map<string, (typeof MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES)[number]>(
    MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES.map((organizer) => [organizer.key, organizer]),
  );

  assert.equal(defaultMockFixtures.organizers.length, 14);
  for (const event of defaultMockFixtures.events) {
    const organizerKey = assignmentByEventId.get(event.id);
    assert.ok(organizerKey, `missing mock organizer assignment for ${event.id}`);
    const organizer = organizerByKey.get(organizerKey!);
    assert.ok(organizer, `missing mock organizer identity for ${event.id}`);
    assert.equal(event.organizerId, organizer!.organizerId);
    assert.ok(organizerIds.has(event.organizerId!));
    assert.ok(accountIds.has(organizer!.accountId));
    assert.ok(profileAccountIds.has(organizer!.accountId));
  }
});

test("mock organizer assignments do not reuse an event or create an unowned organizer", () => {
  const assignedEventIds = new Set(MOCK_EVENT_ORGANIZER_ASSIGNMENTS.map((assignment) => assignment.eventId));
  assert.equal(assignedEventIds.size, MOCK_EVENT_ORGANIZER_ASSIGNMENTS.length);
  assert.equal(
    defaultMockFixtures.events.filter((event) => !event.organizerId).length,
    0,
  );
});
