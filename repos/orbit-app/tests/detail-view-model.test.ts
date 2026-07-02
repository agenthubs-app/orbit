import assert from "node:assert/strict";
import test from "node:test";
import { contactDetailPath, eventDetailPath } from "../src/api/endpoints";
import { contactDetailToSummary } from "../src/view-models/contacts";
import { eventDetailToSummary } from "../src/view-models/events";

test("detail endpoint helpers URL-encode ids", () => {
  assert.equal(eventDetailPath("event/with space"), "/api/events/event%2Fwith%20space");
  assert.equal(
    contactDetailPath("contact/with space"),
    "/api/contacts/contact%2Fwith%20space"
  );
});

test("eventDetailToSummary maps event detail payloads", () => {
  const summary = eventDetailToSummary({
    event: {
      description: "Private founder dinner",
      id: "event-1",
      nextAction: "Prepare three introductions.",
      recommendedPreparation: "Review attendee context.",
      relationshipContext: "Climate network",
      startsAt: "2026-07-04T10:00:00.000Z",
      status: "confirmed",
      title: "Tokyo founder salon",
      venue: "Shibuya"
    }
  });

  assert.deepEqual(summary, {
    description: "Private founder dinner",
    id: "event-1",
    location: "Shibuya",
    nextAction: "Prepare three introductions.",
    preparation: "Review attendee context.",
    relationshipContext: "Climate network",
    startsAt: "Jul 4, 2026, 10:00",
    status: "confirmed",
    title: "Tokyo founder salon"
  });
});

test("contactDetailToSummary maps contact detail payloads", () => {
  const summary = contactDetailToSummary({
    contact: {
      displayName: "Maya Chen",
      id: "contact-1",
      lastInteractionAt: "2026-07-01T09:00:00.000Z",
      location: "Tokyo",
      nextAction: "Send the storage intro.",
      organization: "Northstar",
      profileSnippet: "Invests in climate infrastructure.",
      relationshipContext: "Warm investor relationship",
      role: "Partner",
      status: "needs_follow_up"
    }
  });

  assert.deepEqual(summary, {
    id: "contact-1",
    lastInteractionAt: "2026-07-01T09:00:00.000Z",
    location: "Tokyo",
    name: "Maya Chen",
    nextAction: "Send the storage intro.",
    organization: "Northstar",
    relationship: "Warm investor relationship",
    role: "Partner",
    status: "needs_follow_up"
  });
});
