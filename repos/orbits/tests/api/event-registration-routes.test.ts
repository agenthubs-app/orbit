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
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

const actor = { id: "user:registration-route-test", name: "Route Tester" };
const eventId = "event_signup_02";
const registrationService = createEventRegistrationService({
  provider: createMemoryEventRegistrationProvider(),
});
const registrationEvent: EventRecord = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  calendarSyncRequested: false,
  description: "Deterministic registration route fixture.",
  emailProviderRequested: false,
  endsAt: "2030-03-14T12:00:00.000Z",
  evidence: [],
  externalNetworkRequested: false,
  id: eventId,
  liveDatabaseWriteExecuted: false,
  nextAction: "Complete registration",
  notificationDelivered: false,
  organizerFeedRequested: false,
  recommendedPreparation: "Answer both participant-profile questions.",
  relationshipContext: "Route-level registration contract test.",
  sourceMetadata: {
    calendarSyncRequested: false,
    captureMethod: "manual_form",
    externalNetworkRequested: false,
    importedAt: "2030-01-01T00:00:00.000Z",
    label: "Registration route fixture",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false,
    provider: "test",
    providerRecordId: eventId,
    id: "source:event-registration-route",
    type: "manual",
  },
  startsAt: "2030-03-14T09:30:00.000Z",
  status: "confirmed",
  title: "Registration route fixture",
  venue: "Tokyo",
};
const loadRegistrationEvent = async (id: string) =>
  id === eventId ? registrationEvent : null;
const noPublishedQuestionSet = async () => null;
const { GET: getRegistration, POST: register } =
  createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
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
          targetAttendees: "Climate operators",
          valueOffered: "A working relationship graph",
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
        answers: {
          targetAttendees: "Two climate operators",
          valueOffered: "A working relationship graph",
        },
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

test("plain registration answers cannot bypass the two required questions", async () => {
  const response = await register(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
      body: JSON.stringify({
        answers: { targetAttendees: "Climate operators" },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.success, false);
  assert.match(body.error.message, /valueOffered/);
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
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
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

test("event registration closes exactly when the event starts", async () => {
  let writes = 0;
  const startedEvent = {
    ...registrationEvent,
    startsAt: "2030-03-14T09:30:00.000Z",
  };
  const guarded = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: async () => startedEvent,
    now: () => new Date("2030-03-14T09:30:00.000Z"),
    registrationService: {
      ...registrationService,
      async register(input) {
        writes += 1;
        return registrationService.register(input);
      },
    },
    resolveActor: async () => actor,
  });
  const response = await guarded.POST(
    new Request("http://orbit.local/api/events/event_signup_02/registration", {
      body: JSON.stringify({
        answers: {
          targetAttendees: "Climate operators",
          valueOffered: "A working relationship graph",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "CONFLICT");
  assert.match(body.error.message, /closes when the event starts/i);
  assert.equal(writes, 0);
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
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
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
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
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
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
    registrationService: tokenService,
    resolveActor: async () => tokenActor,
  });
  const fields = [
    "targetAttendees",
    "valueOffered",
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
      acceptedBody.data.participantProfile.answers.valueOffered,
      "valueOffered option A",
    );
    assert.equal(
      acceptedBody.data.participantProfile.interviewResponses.length,
      2,
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
      /targetAttendees/,
    );

    const replayedByAnotherActor = createEventRegistrationRouteHandlers({
      getPublishedQuestionSet: noPublishedQuestionSet,
      loadEvent: loadRegistrationEvent,
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

test("registration merges unsigned seeded answers under verified responses", async () => {
  const previousSecret = process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
  process.env.ORBIT_INTERVIEW_SIGNING_SECRET =
    "route-test-interview-secret-with-enough-entropy";
  const tokenActor = { id: "user:seeded-registration", name: "Seeded Tester" };
  const tokenService = createEventRegistrationService({
    provider: createMemoryEventRegistrationProvider(),
  });
  const { POST } = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
    registrationService: tokenService,
    resolveActor: async () => tokenActor,
  });
  // 非必答画像字段仍可随两项报名回答一起保存；签名回答始终覆盖同字段
  // 的未签名 seed，报名边界只要求「想认识谁 / 能提供什么」。
  const signedResponse = {
    answer: "desiredOutcome option A",
    questionToken: signAdaptiveInterviewQuestion({
      actorId: tokenActor.id,
      eventId,
      language: "zh",
      question: {
        acknowledgment: "",
        field: "desiredOutcome",
        options: ["desiredOutcome option A", "desiredOutcome option B"],
        prompt: "What outcome do you want from this event?",
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "route-test-model",
          provider: "route-test-provider",
        },
      },
    }),
  };

  try {
    const accepted = await POST(
      new Request(`http://orbit.local/api/events/${eventId}/registration`, {
        body: JSON.stringify({
          answers: {
            // 已验证字段的 seeded 值绝不覆盖签名回答。
            desiredOutcome: "seeded must not override",
            positioning: "创始人 @ Orbit",
            targetAttendees: "硬件供应链的创始人",
            valueOffered: "海外渠道资源",
          },
          responses: [signedResponse],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context,
    );
    const acceptedBody = await accepted.json();
    assert.equal(accepted.status, 200);
    const answers = acceptedBody.data.participantProfile.answers;
    assert.equal(answers.desiredOutcome, "desiredOutcome option A");
    assert.equal(answers.positioning, "创始人 @ Orbit");
    assert.equal(answers.targetAttendees, "硬件供应链的创始人");
    assert.equal(answers.valueOffered, "海外渠道资源");
    const snapshots = acceptedBody.data.participantProfile.interviewResponses;
    assert.equal(snapshots.length, 4);
    const byField = new Map(
      snapshots.map((snapshot: { field: string }) => [snapshot.field, snapshot]),
    );
    assert.equal(
      (byField.get("desiredOutcome") as { questionSource: string }).questionSource,
      "ai_adaptive",
    );
    for (const field of ["positioning", "targetAttendees", "valueOffered"]) {
      assert.equal(
        (byField.get(field) as { questionSource: string }).questionSource,
        "legacy_unknown",
      );
    }

    const missingCore = await POST(
      new Request(`http://orbit.local/api/events/${eventId}/registration`, {
        body: JSON.stringify({
          answers: { positioning: "创始人 @ Orbit" },
          responses: [signedResponse],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context,
    );
    assert.equal(missingCore.status, 422);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
    } else {
      process.env.ORBIT_INTERVIEW_SIGNING_SECRET = previousSecret;
    }
  }
});
