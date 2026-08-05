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
import { signAdaptiveInterviewQuestion } from "../../features/events/registration/interview-question-token.server";
import type { EventParticipantProfileField } from "../../features/events/registration/contract";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

const actor = { id: "user:registration-route-test", name: "Route Tester" };
const eventId = "event_signup_02";
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
  params: Promise.resolve({ id: eventId }),
};

test("event registration routes create cancel and reactivate the same record", async () => {
  const firstResponse = await register(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
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
      `http://orbit.local/api/events/${eventId}/registration/cancel`,
      { method: "POST" },
    ),
    context,
  );
  const cancelBody = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.data.id, firstBody.data.id);
  assert.equal(cancelBody.data.status, "cancelled");

  const reactivatedResponse = await register(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
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
      `http://orbit.local/api/events/${eventId}/registration?language=en&questions=false`,
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

test("legacy registration writes cannot bypass an admission-controlled event", async () => {
  let registrationWrites = 0;
  const guardedService = {
    ...registrationService,
    async cancel(input: { eventId: string; userId: string }) {
      registrationWrites += 1;
      return registrationService.cancel(input);
    },
    async register(input: Parameters<typeof registrationService.register>[0]) {
      registrationWrites += 1;
      return registrationService.register(input);
    },
  };
  const guarded = createEventRegistrationRouteHandlers({
    registrationService: guardedService,
    resolveActor: async () => actor,
    resolveAdmissionControl: async () => "admission",
  });
  const post = await guarded.POST(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
      body: JSON.stringify({ answers: { positioning: "must not persist" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  assert.equal(post.status, 409);

  const cancel = createEventRegistrationCancelRouteHandler({
    registrationService: guardedService,
    resolveActor: async () => actor,
    resolveAdmissionControl: async () => "admission",
  });
  const cancelled = await cancel(
    new Request(`http://orbit.local/api/events/${eventId}/registration/cancel`, {
      method: "POST",
    }),
    context,
  );
  assert.equal(cancelled.status, 409);
  assert.equal(registrationWrites, 0);
});

test("legacy registration writes fail closed when admission control cannot be read", async () => {
  const guarded = createEventRegistrationRouteHandlers({
    registrationService,
    resolveActor: async () => actor,
    resolveAdmissionControl: async () => "unavailable",
  });
  const response = await guarded.POST(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
      body: JSON.stringify({ answers: { positioning: "must not persist" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
});

test("registration accepts only a complete set of actor-bound AI interview responses", async () => {
  const previousSecret = process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
  process.env.ORBIT_INTERVIEW_SIGNING_SECRET =
    "route-test-interview-secret-with-enough-entropy";
  const tokenActor = { id: "user:signed-registration", name: "Signed Tester" };
  const tokenService = createEventRegistrationService({
    provider: createMemoryEventRegistrationProvider(),
  });
  const { POST } = createEventRegistrationRouteHandlers({
    registrationService: tokenService,
    resolveActor: async () => tokenActor,
  });
  const fields = [
    "positioning",
    "targetAttendees",
    "valueOffered",
    "desiredOutcome",
  ] as const satisfies readonly EventParticipantProfileField[];
  const responses = fields.map((field, index) => ({
    answer: `${field} option A`,
    questionToken: signAdaptiveInterviewQuestion({
      actorId: tokenActor.id,
      eventId,
      language: "en",
      question: {
        acknowledgment: "",
        field,
        options: [`${field} option A`, `${field} option B`],
        prompt: `What is your ${field} for this event?`,
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "route-test-model",
          provider: "route-test-provider",
        },
      },
    }),
    ...(index === 0 ? { visibility: "private" } : {}),
  }));

  try {
    const incomplete = await POST(
      new Request(`http://orbit.local/api/events/${eventId}/registration`, {
        body: JSON.stringify({ responses: responses.slice(0, 1) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context,
    );
    assert.equal(incomplete.status, 422);

    const accepted = await POST(
      new Request(`http://orbit.local/api/events/${eventId}/registration`, {
        body: JSON.stringify({ responses }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context,
    );
    const acceptedBody = await accepted.json();
    assert.equal(accepted.status, 200);
    assert.equal(
      acceptedBody.data.participantProfile.answers.desiredOutcome,
      "desiredOutcome option A",
    );
    assert.equal(
      acceptedBody.data.participantProfile.interviewResponses.length,
      4,
    );
    assert.equal(
      acceptedBody.data.participantProfile.interviewResponses.every(
        (response: { visibility: string }) =>
          response.visibility === "event_attendees",
      ),
      true,
    );
    assert.match(
      acceptedBody.data.participantProfile.interviewResponses[0].question.prompt,
      /positioning/,
    );

    const replayedByAnotherActor = createEventRegistrationRouteHandlers({
      registrationService: tokenService,
      resolveActor: async () => ({ id: "user:token-replay" }),
    }).POST;
    const replay = await replayedByAnotherActor(
      new Request(`http://orbit.local/api/events/${eventId}/registration`, {
        body: JSON.stringify({ responses }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context,
    );
    assert.equal(replay.status, 422);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
    } else {
      process.env.ORBIT_INTERVIEW_SIGNING_SECRET = previousSecret;
    }
  }
});
