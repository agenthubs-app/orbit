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
import { createDeadlineGatedEventRegistrationService } from "../../features/events/registration/deadline-gated-service";

loadLocalEnv();

test("cancellation returns a readable configuration failure without changing an importing membership", async () => {
  const base = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
  const canonical = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
  const active = await base.register({ eventId: "event:importing", userId: "actor:owner" });
  const handler = createEventRegistrationCancelRouteHandler({
    registrationService: createDeadlineGatedEventRegistrationService({
      baseService: base, canonicalService: canonical,
      windowProvider: { async getEnrollment() { return { state: "legacy_importing" }; } },
    }),
    resolveActor: async () => ({ id: "actor:owner" }),
  });
  const response = await handler(new Request("http://orbit.local/cancel", { method: "POST" }),
    { params: Promise.resolve({ id: "event:importing" }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SERVICE_UNAVAILABLE");
  assert.deepEqual(await base.get({ eventId: "event:importing", userId: "actor:owner" }), active);
});

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

test("explicit reactivation rejects a stale registration version and preserves the cancelled record", async () => {
  const service = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
  await service.register({ eventId, userId: actor.id, answers: { targetAttendees: "Partners", valueOffered: "Experience" } });
  const cancelled = await service.cancel({ eventId, userId: actor.id });
  assert.ok(cancelled);
  const { POST } = createEventRegistrationRouteHandlers({ loadEvent: loadRegistrationEvent, getPublishedQuestionSet: noPublishedQuestionSet,
    registrationService: service, resolveActor: async () => actor });
  const response = await POST(new Request("http://orbit.local/registration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    intent: "reactivate", expectedRegistrationVersion: "2000-01-01T00:00:00Z", answers: { targetAttendees: "Partners", valueOffered: "Experience" }
  }) }), context);
  assert.equal(response.status, 409);
  assert.deepEqual(await service.get({ eventId, userId: actor.id }), cancelled);
});

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
  assert.deepEqual(firstBody.data.mutationReceipt, {
    action: "register",
    actorId: actor.id,
    eventId,
    recordId: firstBody.data.id,
    registrationVersion: firstBody.data.updatedAt,
  });

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
  assert.equal(cancelBody.data.mutationReceipt.action, "cancel");
  assert.equal(cancelBody.data.mutationReceipt.registrationVersion, cancelBody.data.updatedAt);

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
  assert.equal(reactivatedBody.data.mutationReceipt.action, "reactivate");

  const duplicateResponse = await register(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
      body: JSON.stringify({
        answers: {
          targetAttendees: "Two climate operators",
          valueOffered: "A working relationship graph",
        },
        intent: "reactivate",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const duplicateBody = await duplicateResponse.json();
  assert.equal(duplicateResponse.status, 200);
  assert.equal(duplicateBody.data.id, reactivatedBody.data.id);
  assert.equal(duplicateBody.data.updatedAt, reactivatedBody.data.updatedAt);
  assert.equal(duplicateBody.data.mutationReceipt.action, "reactivate");

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

test("registration GET returns the server-evaluated allowed actions and record version", async () => {
  const provider = createMemoryEventRegistrationProvider();
  const service = createEventRegistrationService({
    now: () => "2026-09-15T01:00:00.000Z",
    provider,
  });
  await service.register({
    answers: {
      targetAttendees: "Climate operators",
      valueOffered: "A working relationship graph",
    },
    eventId,
    userId: actor.id,
  });
  const { GET } = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
    now: () => new Date("2026-09-15T01:00:00.000Z"),
    readRegistrationAvailability: async () => "open",
    registrationService: service,
    resolveActor: async () => actor,
    resolveAdmissionState: async () => ({ state: "legacy" }),
  });

  const response = await GET(
    new Request(`http://orbit.local/api/events/${eventId}/registration?questions=false`),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data.eligibility.allowedActions, ["update", "cancel"]);
  assert.equal(body.data.eligibility.state, "registered");
  assert.equal(body.data.eligibility.evaluatedAt, "2026-09-15T01:00:00.000Z");
  assert.equal(body.data.eligibility.registrationVersion, body.data.registration.updatedAt);
});

test("registration GET fails closed with a JSON envelope when admission state cannot be read", async () => {
  const { GET } = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: noPublishedQuestionSet,
    loadEvent: loadRegistrationEvent,
    registrationService,
    resolveActor: async () => actor,
    async resolveAdmissionState() {
      throw new Error("synthetic admission read failure");
    },
  });

  const response = await GET(
    new Request(`http://orbit.local/api/events/${eventId}/registration?questions=false`),
    context,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
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

test("versioned cancellation rejects stale active state but accepts an idempotent retry", async () => {
  let now = "2026-09-15T01:00:00.000Z";
  const service = createEventRegistrationService({
    now: () => now,
    provider: createMemoryEventRegistrationProvider(),
  });
  const active = await service.register({ eventId, userId: actor.id });
  const handler = createEventRegistrationCancelRouteHandler({
    registrationService: service,
    resolveActor: async () => actor,
  });
  const request = (expectedRegistrationVersion: string, intent = "cancel") =>
    new Request(`http://orbit.local/api/events/${eventId}/registration/cancel`, {
      body: JSON.stringify({ expectedRegistrationVersion, intent }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

  const stale = await handler(request("version:stale"), context);
  assert.equal(stale.status, 409);
  assert.equal((await service.get({ eventId, userId: actor.id }))?.status, "rsvped");

  const invalid = await handler(request(active.updatedAt, "withdraw"), context);
  assert.equal(invalid.status, 422);

  now = "2026-09-15T01:01:00.000Z";
  const first = await handler(request(active.updatedAt), context);
  const firstBody = await first.json();
  const retry = await handler(request(active.updatedAt), context);
  const retryBody = await retry.json();
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retryBody.data.id, firstBody.data.id);
  assert.equal(retryBody.data.updatedAt, firstBody.data.updatedAt);
  assert.equal(retryBody.data.mutationReceipt.registrationVersion, firstBody.data.updatedAt);
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
