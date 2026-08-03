import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventRegistrationRouteHandlers,
} from "../../app/api/events/[id]/registration/route-handlers";
import { createEventRegistrationCancelRouteHandler } from "../../app/api/events/[id]/registration/cancel/route-handler";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";

const actor = { id: "user:registration-route-test", name: "Route Tester" };
const registrationService = createEventRegistrationService({
  provider: createMemoryEventRegistrationProvider(),
});
const { GET: getRegistration, POST: register } =
  createEventRegistrationRouteHandlers({
    registrationService,
    resolveActor: async () => actor,
  });
const cancelRegistration = createEventRegistrationCancelRouteHandler({
  registrationService,
  resolveActor: async () => actor,
});

const context = {
  params: Promise.resolve({ id: "demo-event-1" }),
};

test("event registration routes create cancel and reactivate the same record", async () => {
  const firstResponse = await register(
    new Request("http://orbit.local/api/events/demo-event-1/registration", {
      body: JSON.stringify({
        answers: {
          desiredOutcome: "Meet a climate operator",
          positioning: "Building Orbit",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const firstBody = await firstResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.equal(firstBody.success, true);
  assert.equal(firstBody.data.status, "rsvped");

  const cancelResponse = await cancelRegistration(
    new Request(
      "http://orbit.local/api/events/demo-event-1/registration/cancel",
      { method: "POST" },
    ),
    context,
  );
  const cancelBody = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.data.id, firstBody.data.id);
  assert.equal(cancelBody.data.status, "cancelled");

  const reactivatedResponse = await register(
    new Request("http://orbit.local/api/events/demo-event-1/registration", {
      body: JSON.stringify({
        answers: { desiredOutcome: "Meet two climate operators" },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const reactivatedBody = await reactivatedResponse.json();

  assert.equal(reactivatedResponse.status, 200);
  assert.equal(reactivatedBody.data.id, firstBody.data.id);
  assert.equal(reactivatedBody.data.status, "rsvped");
  assert.ok(reactivatedBody.data.reactivatedAt);

  const stateResponse = await getRegistration(
    new Request(
      "http://orbit.local/api/events/demo-event-1/registration?language=en&questions=false",
    ),
    context,
  );
  const stateBody = await stateResponse.json();

  assert.equal(stateResponse.status, 200);
  assert.equal(stateBody.data.registration.id, firstBody.data.id);
  assert.deepEqual(stateBody.data.questionSet.questions, []);
});

test("cancelling without a registration returns a stable not-found envelope", async () => {
  const cancelWithoutRegistration = createEventRegistrationCancelRouteHandler({
    registrationService,
    resolveActor: async () => ({ id: "user:no-registration" }),
  });
  const response = await cancelWithoutRegistration(
    new Request(
      "http://orbit.local/api/events/demo-event-2/registration/cancel",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-event-2" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
});

test("event registration route rejects requests without an authenticated actor", async () => {
  const { GET } = createEventRegistrationRouteHandlers({
    resolveActor: async () => null,
  });
  const response = await GET(
    new Request(
      "http://orbit.local/api/events/demo-event-1/registration?questions=false",
    ),
    context,
  );
  assert.equal(response.status, 401);
});
