import assert from "node:assert/strict";
import test from "node:test";

import { createEventEncounterPostHandler } from "../../app/api/events/[id]/encounters/handlers";
import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";
import { eventOwnerTestDependencies } from "./event-owner-test-dependencies";

const createEncounterNote = createEventEncounterPostHandler(
  eventOwnerTestDependencies,
);

test.beforeEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test.afterEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

test("a persisted encounter note triggers follow-up proposals without saving the note twice", async () => {
  const response = await createEncounterNote(
    new Request("http://localhost/api/events/demo-event-1/encounters", {
      body: JSON.stringify({
        contactId: "contact:priya-shah",
        noteText: "Priya asked for a storage pilot introduction.",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );

  assert.equal(response.status, 201);
  const actions = await createOrbitAgentRuntimeService().listActions({});
  const followupActions = actions.filter(
    (action) => action.workflowKey === "post_event_followup_v1",
  );
  assert.equal(followupActions.length, 3);
  assert.deepEqual(
    new Set(
      followupActions.flatMap((action) =>
        action.operations.map((operation) => operation.operationType),
      ),
    ),
    new Set([
      "save_message_draft",
      "create_followup_task",
      "create_followup_reminder",
    ]),
  );
  assert.equal(
    followupActions.some((action) =>
      action.operations.some(
        (operation) => operation.operationType === "save_meeting_note",
      ),
    ),
    false,
  );
});
