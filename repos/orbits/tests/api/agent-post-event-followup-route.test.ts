import assert from "node:assert/strict";
import test from "node:test";

import { createPostEventFollowupPostHandler } from "../../app/api/events/[id]/post-event/followup/handler";
import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import { resetOrbitAgentRuntimeServicesForTests } from "../../features/agent/runtime/service-factory";
import type { ContactListItem } from "../../features/contacts/contract";
import { mockContactsListFixture } from "../../features/contacts/fixtures";
import { createMockContactsListSearchAndFilterService } from "../../features/contacts/mock-service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import type { EventRegistration } from "../../features/events/registration/contract";

const registeredActor = {
  email: "operator@example.test",
  id: "actor:test-operator",
  name: "Test Operator",
};

function registrationFor(eventId: string): EventRegistration {
  const timestamp = "2026-07-29T00:00:00.000Z";
  const participantProfileId = `profile:${eventId}:${registeredActor.id}`;

  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${registeredActor.id}`,
    participantProfile: {
      answers: {},
      createdAt: timestamp,
      eventId,
      id: participantProfileId,
      updatedAt: timestamp,
      userId: registeredActor.id,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt: timestamp,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: "rsvped",
    updatedAt: timestamp,
    userId: registeredActor.id,
  };
}

const createPostEventFollowup = createPostEventFollowupPostHandler(
  {
    getRegistration: async ({ eventId }) => registrationFor(eventId),
    loadEvent: async (eventId) =>
      mockEventRecords.find((event) => event.id === eventId) ?? null,
    resolveActor: async () => registeredActor,
  },
);

test.beforeEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test.afterEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test("registered mock catalogue attendees can start follow-up", async () => {
  let observedContactsActorId: string | null = null;
  const contactsService = createMockContactsListSearchAndFilterService();
  const handler = createPostEventFollowupPostHandler({
    getRegistration: async ({ eventId }) => registrationFor(eventId),
    loadEvent: async (eventId) =>
      mockEventRecords.find((event) => event.id === eventId) ?? null,
    listContacts: (input) => {
      observedContactsActorId = input?.actorId?.trim() || null;
      return contactsService.listContacts(input);
    },
    resolveActor: async () => registeredActor,
  });
  const response = await handler(
    new Request(
      "http://localhost/api/events/demo-event-1/post-event/followup",
      {
        body: JSON.stringify({
          contactId: "demo-contact-1",
          contactName: "Kenji Watanabe",
          noteText: "目录活动结束后继续讨论储能试点。",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );

  assert.equal(response.status, 201);
  assert.equal(observedContactsActorId, registeredActor.id);
  const body = await response.json();
  assert.equal(body.data.artifact.eventId, "demo-event-1");
  assert.ok(body.data.actions.length > 0);
});

test("follow-up rejects an attendee without an active registration", async () => {
  const handler = createPostEventFollowupPostHandler({
    getRegistration: async () => null,
    loadEvent: async (eventId) =>
      mockEventRecords.find((event) => event.id === eventId) ?? null,
    resolveActor: async () => registeredActor,
  });
  const response = await handler(
    new Request(
      "http://localhost/api/events/demo-event-1/post-event/followup",
      {
        body: JSON.stringify({
          contactId: "demo-contact-1",
          noteText: "This must not start a workflow.",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "FORBIDDEN");
  assert.equal(
    body.error.message,
    "An active registration is required for this event capability.",
  );
  assert.equal(
    body.error.context.privacy,
    "active-event-registration-required",
  );
});

test("confirmed post-event notes execute before the mock route returns", async () => {
  const response = await createPostEventFollowup(
    new Request(
      "http://localhost/api/events/demo-event-1/post-event/followup",
      {
        body: JSON.stringify({
          contactId: "demo-contact-1",
          contactName: "Kenji Watanabe",
          eventTitle: "Climate founders dinner",
          noteText: "Kenji 希望下周继续讨论储能试点。",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  const note = body.data.actions.find((action: { title: string }) =>
    action.title.startsWith("保存会面笔记"),
  );
  const draft = body.data.actions.find((action: { title: string }) =>
    action.title.startsWith("准备跟进草稿"),
  );
  assert.equal(note.status, "completed");
  assert.equal(draft.status, "completed");
  assert.match(
    body.data.artifact.summary,
    /关系背景：Met at the climate founders dinner/,
  );
  assert.match(body.data.artifact.summary, /已有下一步：Send Kenji/);
  assert.match(
    body.data.artifact.messageDraft,
    /Kenji 希望下周继续讨论储能试点/,
  );
  assert.ok(
    body.data.artifact.evidenceIds.includes("evidence:contacts-list-kenji"),
  );
});

test("client-provided duplicate ids cannot force merge review", async () => {
  const response = await createPostEventFollowup(
    new Request(
      "http://localhost/api/events/demo-event-1/post-event/followup",
      {
        body: JSON.stringify({
          contactId: "demo-contact-1",
          contactName: "Kenji Watanabe",
          duplicateContactIds: ["demo-contact-duplicate"],
          eventTitle: "Climate founders dinner",
          noteText: "Kenji 希望下周继续讨论储能试点。",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.artifact.contactResolution, "resolved");
  assert.ok(body.data.actions.length > 0);
});

test("server-verified duplicates pause writes and explicit candidate selection resumes", async () => {
  const contacts = mockContactsListFixture.contacts as ContactListItem[];
  const kenji = contacts.find(
    (contact) => contact.id === "contact:kenji-watanabe",
  );
  assert.ok(kenji);
  const duplicate: ContactListItem = {
    ...kenji,
    id: "contact:kenji-watanabe-imported",
    organization: "Aster Grid APAC",
  };
  contacts.push(duplicate);

  try {
    const createRequest = (resolvedContactId?: string) =>
      createPostEventFollowup(
        new Request(
          "http://localhost/api/events/demo-event-1/post-event/followup",
          {
            body: JSON.stringify({
              contactId: "contact:kenji-watanabe",
              contactName: "Client supplied name is ignored",
              eventTitle: "Climate founders dinner",
              noteText: "Kenji 希望下周继续讨论储能试点。",
              resolvedContactId,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        ),
        { params: Promise.resolve({ id: "demo-event-1" }) },
      );

    const reviewResponse = await createRequest();
    assert.equal(reviewResponse.status, 201);
    const reviewBody = await reviewResponse.json();
    assert.equal(reviewBody.data.run.status, "waiting_for_input");
    assert.equal(
      reviewBody.data.artifact.contactResolution,
      "merge_review_required",
    );
    assert.deepEqual(reviewBody.data.actions, []);
    assert.deepEqual(
      reviewBody.data.contactCandidates.map(
        (contact: { id: string }) => contact.id,
      ),
      ["contact:kenji-watanabe", "contact:kenji-watanabe-imported"],
    );

    const resumedResponse = await createRequest(duplicate.id);
    assert.equal(resumedResponse.status, 201);
    const resumedBody = await resumedResponse.json();
    assert.equal(resumedBody.data.artifact.contactResolution, "resolved");
    assert.equal(resumedBody.data.artifact.contactId, duplicate.id);
    assert.ok(resumedBody.data.actions.length > 0);
    assert.equal(
      resumedBody.data.actions.some(
        (action: { status: string }) =>
          action.status === "awaiting_confirmation",
      ),
      true,
    );
  } finally {
    contacts.splice(
      contacts.findIndex((contact) => contact.id === duplicate.id),
      1,
    );
  }
});
