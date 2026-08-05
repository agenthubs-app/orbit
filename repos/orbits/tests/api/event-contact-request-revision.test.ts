import assert from "node:assert/strict";
import test from "node:test";

import { createEventOperationsContactRequestWithdrawPostHandler } from "../../app/api/events/[id]/operations/handlers";
import type { EventOperationsService } from "../../features/events/event-operations/service";

const EVENT_ID = "event:revision-api";
const ACTOR_ID = "actor:requester";
const REQUEST_ID = "request:revision-api";

function access() {
  return {
    getRegistration: async () => ({
      eventId: EVENT_ID,
      status: "rsvped",
      userId: ACTOR_ID,
    } as never),
    loadEvent: async () => ({ id: EVENT_ID } as never),
    resolveActor: async () => ({ id: ACTOR_ID, name: "Requester" }),
  };
}

test("withdraw endpoint requires and forwards the lifecycle revision", async () => {
  let observed: unknown;
  const service = {
    withdrawContactRequest: async (input: unknown) => {
      observed = input;
      return { requestId: REQUEST_ID, revision: 2, status: "withdrawn" };
    },
  } as unknown as EventOperationsService;
  const handler = createEventOperationsContactRequestWithdrawPostHandler({
    createService: () => service,
    registeredAccess: access(),
  });

  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/contact-requests/${REQUEST_ID}/withdraw`, {
      body: JSON.stringify({ expectedRevision: 1 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID, requestId: REQUEST_ID }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    actorId: ACTOR_ID,
    eventId: EVENT_ID,
    expectedRevision: 1,
    requestId: REQUEST_ID,
  });

  const invalid = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/contact-requests/${REQUEST_ID}/withdraw`, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID, requestId: REQUEST_ID }) },
  );
  assert.equal(invalid.status, 400);
});
