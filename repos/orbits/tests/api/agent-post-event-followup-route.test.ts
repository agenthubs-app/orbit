import assert from "node:assert/strict";
import test from "node:test";

import { POST as createPostEventFollowup } from "../../app/api/events/[id]/post-event/followup/route";
import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import { resetOrbitAgentRuntimeServicesForTests } from "../../features/agent/runtime/service-factory";

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
