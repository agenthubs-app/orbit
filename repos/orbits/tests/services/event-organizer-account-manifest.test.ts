import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_ORGANIZER_ACCOUNT_MANIFEST,
  EVENT_ORGANIZER_ASSIGNMENTS,
  eventOrganizerManifestHash,
  validateEventOrganizerManifest,
} from "../../features/events/organizer-accounts/manifest";

const expectedEventIds = [
  "demo-event-1",
  "demo-event-2",
  "event:manual:founder-investor-salon",
  "event_01",
  "event_02",
  "event_03",
  "event_04",
  "event_05",
  "event_06",
  "event_07",
  "event_08",
  "event_09",
  "event_10",
  "event_signup_01",
  "event_signup_02",
  "event_signup_03",
].sort();

test("reviewed organizer manifest contains the approved accounts and assignments", () => {
  assert.equal(EVENT_ORGANIZER_ACCOUNT_MANIFEST.length, 13);
  assert.equal(EVENT_ORGANIZER_ASSIGNMENTS.length, 16);
  assert.deepEqual(
    EVENT_ORGANIZER_ASSIGNMENTS.filter((item) => item.organizerKey === "xiaoyu")
      .map((item) => item.eventId)
      .sort(),
    ["event_02", "event_08", "event_signup_02"],
  );
  assert.deepEqual(
    EVENT_ORGANIZER_ASSIGNMENTS.map((item) => item.eventId).sort(),
    expectedEventIds,
  );
  assert.deepEqual(
    EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter(
      (item) => item.relationship === "existing_contact",
    ).map((item) => item.contactId).sort(),
    ["contact_003", "contact_005", "contact_027", "contact_066", "contact_085", "contact_090"],
  );
  assert.equal(
    EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter(
      (item) => item.relationship === "outside_network",
    ).length,
    7,
  );
  assert.ok(
    EVENT_ORGANIZER_ACCOUNT_MANIFEST.every(
      (item) => item.relationship === "outside_network" ? item.contactId === null : item.contactId !== null,
    ),
  );
  assert.equal(
    new Set(EVENT_ORGANIZER_ACCOUNT_MANIFEST.map((item) => item.email.trim().toLowerCase())).size,
    EVENT_ORGANIZER_ACCOUNT_MANIFEST.length,
  );
});

test("reviewed organizer manifest is valid, immutable, and hashable", () => {
  assert.equal(validateEventOrganizerManifest().state, "valid");
  assert.match(eventOrganizerManifestHash(), /^[a-f0-9]{64}$/u);
  assert.ok(Object.isFrozen(EVENT_ORGANIZER_ACCOUNT_MANIFEST));
  assert.ok(Object.isFrozen(EVENT_ORGANIZER_ACCOUNT_MANIFEST[0]));
  assert.ok(Object.isFrozen(EVENT_ORGANIZER_ASSIGNMENTS));
  assert.ok(Object.isFrozen(EVENT_ORGANIZER_ASSIGNMENTS[0]));
});
