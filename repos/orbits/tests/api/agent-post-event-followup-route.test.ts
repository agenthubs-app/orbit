import assert from "node:assert/strict";
import test from "node:test";

import { POST as createPostEventFollowup } from "../../app/api/events/[id]/post-event/followup/route";
import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import { resetOrbitAgentRuntimeServicesForTests } from "../../features/agent/runtime/service-factory";
import type { ContactListItem } from "../../features/contacts/contract";
import { mockContactsListFixture } from "../../features/contacts/fixtures";

test.beforeEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test.afterEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test("confirmed post-event notes execute before the mock route returns", async () => {
  const response = await createPostEventFollowup(
    new Request("http://localhost/api/events/demo-event-1/post-event/followup", {
      body: JSON.stringify({
        contactId: "demo-contact-1",
        contactName: "Kenji Watanabe",
        eventTitle: "Climate founders dinner",
        noteText: "Kenji 希望下周继续讨论储能试点。",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  const note = body.data.actions.find(
    (action: { title: string }) => action.title.startsWith("保存会面笔记"),
  );
  const draft = body.data.actions.find(
    (action: { title: string }) => action.title.startsWith("准备跟进草稿"),
  );
  assert.equal(note.status, "completed");
  assert.equal(draft.status, "completed");
  assert.match(body.data.artifact.summary, /关系背景：Met at the climate founders dinner/);
  assert.match(body.data.artifact.summary, /已有下一步：Send Kenji/);
  assert.match(body.data.artifact.messageDraft, /Kenji 希望下周继续讨论储能试点/);
  assert.ok(
    body.data.artifact.evidenceIds.includes(
      "evidence:contacts-list-kenji",
    ),
  );
});

test("client-provided duplicate ids cannot force merge review", async () => {
  const response = await createPostEventFollowup(
    new Request("http://localhost/api/events/demo-event-1/post-event/followup", {
      body: JSON.stringify({
        contactId: "demo-contact-1",
        contactName: "Kenji Watanabe",
        duplicateContactIds: ["demo-contact-duplicate"],
        eventTitle: "Climate founders dinner",
        noteText: "Kenji 希望下周继续讨论储能试点。",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
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
