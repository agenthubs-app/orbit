import assert from "node:assert/strict";
import test from "node:test";

import {
  GET as getRegistration,
  POST as register,
} from "../../app/api/events/[id]/registration/route";
import { POST as cancelRegistration } from "../../app/api/events/[id]/registration/cancel/route";

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
  const response = await cancelRegistration(
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
