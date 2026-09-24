import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAuthenticatedApiActorIdentity } from "../../app/api/_shared/authenticated-actor";
import type { LiveAccountSessionGraph } from "../../features/account/storage/account-live-record-provider";
import type { EventRegistrationService } from "../../features/events/registration/service";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { signAdaptiveInterviewQuestion } from "../../features/events/registration/interview-question-token.server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);
const eventId = "event:registration-account-scope-api";
const canonicalActorId = "account:a";
const rawSessionActorId = "profile:a";
const signingSecret = "registration-account-scope-test-secret";

const graph: LiveAccountSessionGraph = {
  accounts: [
    {
      id: "account:a",
      name: "Account A",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    {
      id: "account:b",
      name: "Account B",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
  evidenceIds: ["evidence:account-membership"],
  generatedAt: "2026-07-28T00:00:00.000Z",
  profiles: [
    {
      id: "profile:a",
      accountId: "account:a",
      displayName: "Actor A",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    {
      id: "profile:b",
      accountId: "account:b",
      displayName: "Actor B",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
};

const registrationEvent: EventRecord = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  calendarSyncRequested: false,
  description: "Canonical account-scope route fixture.",
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
  relationshipContext: "Canonical account-scope route contract test.",
  sourceMetadata: {
    calendarSyncRequested: false,
    captureMethod: "manual_form",
    externalNetworkRequested: false,
    importedAt: "2030-01-01T00:00:00.000Z",
    label: "Registration account-scope fixture",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false,
    provider: "test",
    providerRecordId: eventId,
    id: "source:event-registration-account-scope",
    type: "manual",
  },
  startsAt: "2030-03-14T09:30:00.000Z",
  status: "confirmed",
  title: "Registration account-scope fixture",
  venue: "Tokyo",
};

function signedResponse(
  actorId: string,
  field: "targetAttendees" | "valueOffered",
  answer: string,
  questionId: string,
) {
  return {
    answer,
    questionToken: signAdaptiveInterviewQuestion({
      actorId,
      eventId,
      language: "en",
      questionId,
      secret: signingSecret,
      question: {
        acknowledgment: "",
        field,
        options: field === "targetAttendees" ? ["Founders", "Operators"] : ["Advice", "Introductions"],
        prompt: field === "targetAttendees" ? "Who do you want to meet?" : "What can you offer?",
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "account-scope-test-model",
          provider: "account-scope-test-provider",
        },
      },
    }),
  };
}

function signedResponses(actorId: string) {
  return [
    signedResponse(actorId, "targetAttendees", "Founders", "question:target"),
    signedResponse(actorId, "valueOffered", "Advice", "question:value"),
  ];
}

type RouteOptions = {
  sessionUserId?: string;
};

function loadRealRoutes(t: TestContext, options: RouteOptions = {}) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const serviceInputs: Array<{ operation: string; input: unknown }> = [];
  const baseService = createEventRegistrationService({
    now: () => "2030-01-01T00:00:00.000Z",
    provider: createMemoryEventRegistrationProvider(),
  });
  const registrationService: EventRegistrationService = {
    cancel: async (input) => {
      serviceInputs.push({ input, operation: "cancel" });
      return baseService.cancel(input);
    },
    get: async (input) => {
      serviceInputs.push({ input, operation: "get" });
      return baseService.get(input);
    },
    list: async (input) => {
      serviceInputs.push({ input, operation: "list" });
      return baseService.list(input);
    },
    register: async (input) => {
      serviceInputs.push({ input, operation: "register" });
      return baseService.register(input);
    },
  };

  const modules: Record<string, unknown> = {
    [join(projectRoot, "auth.ts")]: {
      auth: async () => {
        calls.push({ operation: "auth" });
        return {
          user: {
            email: "actor-a@example.test",
            id: options.sessionUserId ?? rawSessionActorId,
            name: "Actor A",
          },
        };
      },
    },
    [join(projectRoot, "features/account/storage/account-live-record-provider.ts")]: {
      createConfiguredStorageAccountSessionProvider: () => ({
        readAccountSessionGraph: async (identity: unknown) => {
          calls.push({ input: identity, operation: "sessionGraph" });
          return graph;
        },
      }),
    },
    [join(projectRoot, "shared/storage/live-database-config.ts")]: {
      resolveLiveDatabaseConnectionConfig: () => ({
        workspaceId: "workspace:registration-api-test",
      }),
    },
    [join(projectRoot, "features/events/registration/event-loader.ts")]: {
      loadEventForRegistration: async (id: string, actorId?: string | null) => {
        calls.push({ input: { actorId, eventId: id }, operation: "loadEvent" });
        return id === eventId ? registrationEvent : null;
      },
    },
    [join(projectRoot, "features/events/registration/runtime.ts")]: {
      eventRegistrationRuntimeService: registrationService,
      readRuntimeEventRegistrationWindow: async (id: string) => {
        calls.push({ input: id, operation: "registrationWindow" });
        return { availability: "open" };
      },
    },
    [join(projectRoot, "features/events/admission/registration-control.ts")]: {
      resolveConfiguredEventAdmissionRegistrationControl: async (actorId: string, id: string) => {
        calls.push({ input: { actorId, eventId: id }, operation: "admissionControl" });
        return "legacy";
      },
      resolveConfiguredEventAdmissionRegistrationState: async (actorId: string, id: string) => {
        calls.push({ input: { actorId, eventId: id }, operation: "admissionState" });
        return { state: "legacy" };
      },
    },
    [join(projectRoot, "features/events/experience/runtime.ts")]: {
      createConfiguredEventExperienceService: () => ({
        getPublishedQuestionSet: async () => null,
      }),
    },
    [join(projectRoot, "features/events/registration/question-generator.ts")]: {
      generateEventRegistrationQuestions: async () => ({
        provenance: {
          aiProviderRequested: false,
          externalNetworkRequested: false,
          fallbackReason: "QUESTIONS_NOT_REQUESTED",
          generationMethod: "deterministic-not-requested" as const,
          model: null,
          provider: null,
        },
        questions: [],
      }),
    },
  };

  const routePath = join(
    projectRoot,
    "app/api/events/[id]/registration/route.ts",
  );
  const cancelRoutePath = join(
    projectRoot,
    "app/api/events/[id]/registration/cancel/route.ts",
  );
  const helperPath = join(
    projectRoot,
    "app/api/_shared/authenticated-actor.ts",
  );
  const routeHandlersPath = join(
    projectRoot,
    "app/api/events/[id]/registration/route-handlers.ts",
  );
  const cancelHandlerPath = join(
    projectRoot,
    "app/api/events/[id]/registration/cancel/route-handler.ts",
  );
  const ids = [
    ...Object.keys(modules),
    helperPath,
    routeHandlersPath,
    cancelHandlerPath,
    routePath,
    cancelRoutePath,
  ].map((id) => testRequire.resolve(id));
  const previous = new Map(ids.map((id) => [id, testRequire.cache[id]]));
  const previousMode = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "live";
  t.after(() => {
    if (previousMode === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = previousMode;
    for (const [id, cached] of previous) {
      if (cached) testRequire.cache[id] = cached;
      else delete testRequire.cache[id];
    }
  });

  for (const [id, exports] of Object.entries(modules)) {
    const resolved = testRequire.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[resolved] = replacement;
  }
  delete testRequire.cache[testRequire.resolve(helperPath)];
  testRequire(helperPath);
  delete testRequire.cache[testRequire.resolve(routeHandlersPath)];
  delete testRequire.cache[testRequire.resolve(cancelHandlerPath)];
  delete testRequire.cache[testRequire.resolve(routePath)];
  delete testRequire.cache[testRequire.resolve(cancelRoutePath)];

  const registration = testRequire(routePath) as {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
    POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  const cancel = testRequire(cancelRoutePath) as {
    POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  return { calls, cancel, context: { params: Promise.resolve({ id: eventId }) }, registration, serviceInputs };
}

test("real legacy registration routes use the canonical actor for signed writes, reads, and receipts", async (t) => {
  const previousSecret = process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
  process.env.ORBIT_INTERVIEW_SIGNING_SECRET = signingSecret;
  const { calls, cancel, context, registration, serviceInputs } = loadRealRoutes(t);

  try {
    const first = await registration.POST(
      new Request(`http://orbit.local/api/events/${eventId}/registration`, {
        body: JSON.stringify({ responses: signedResponses(canonicalActorId) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context,
    );
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstBody.data.userId, canonicalActorId);
    assert.equal(firstBody.data.participantProfile.userId, canonicalActorId);
    assert.equal(firstBody.data.mutationReceipt.actorId, canonicalActorId);
    assert.equal(firstBody.data.mutationReceipt.eventId, eventId);
    assert.equal(firstBody.data.mutationReceipt.action, "register");

    const current = await registration.GET(
      new Request(`http://orbit.local/api/events/${eventId}/registration?questions=false`),
      context,
    );
    const currentBody = await current.json();
    assert.equal(current.status, 200);
    assert.equal(currentBody.data.registration.userId, canonicalActorId);
    assert.equal(currentBody.data.registration.mutationReceipt, undefined);

    const cancelled = await cancel.POST(
      new Request(`http://orbit.local/api/events/${eventId}/registration/cancel`, {
        method: "POST",
      }),
      context,
    );
    const cancelledBody = await cancelled.json();
    assert.equal(cancelled.status, 200);
    assert.equal(cancelledBody.data.userId, canonicalActorId);
    assert.equal(cancelledBody.data.status, "cancelled");
    assert.equal(cancelledBody.data.mutationReceipt.actorId, canonicalActorId);
    assert.equal(cancelledBody.data.mutationReceipt.eventId, eventId);

    const afterCancel = await registration.GET(
      new Request(`http://orbit.local/api/events/${eventId}/registration?questions=false`),
      context,
    );
    const afterCancelBody = await afterCancel.json();
    assert.equal(afterCancel.status, 200);
    assert.equal(afterCancelBody.data.registration.status, "cancelled");
    assert.equal(afterCancelBody.data.registration.userId, canonicalActorId);

    for (const call of calls.filter((item) =>
      ["loadEvent", "admissionControl", "admissionState"].includes(item.operation),
    )) {
      assert.equal((call.input as { actorId: string }).actorId, canonicalActorId);
    }
    for (const call of serviceInputs) {
      const input = call.input as { userId?: string };
      assert.equal(input.userId, canonicalActorId, `${call.operation} must stay canonical`);
    }
    assert.equal(
      JSON.stringify(serviceInputs).includes(rawSessionActorId),
      false,
      "raw Auth.js profile subject must not reach the registration service",
    );

    const beforeRejected = serviceInputs.length;
    for (const [label, actorId] of [
      ["raw profile subject", rawSessionActorId],
      ["other account", "account:b"],
    ] as const) {
      const rejected = await registration.POST(
        new Request(`http://orbit.local/api/events/${eventId}/registration`, {
          body: JSON.stringify({ responses: signedResponses(actorId) }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        context,
      );
      const rejectedBody = await rejected.json();
      assert.equal(rejected.status, 422, label);
      assert.equal(rejectedBody.success, false, label);
      assert.equal(serviceInputs.length, beforeRejected, `${label} must be rejected before service access`);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
    else process.env.ORBIT_INTERVIEW_SIGNING_SECRET = previousSecret;
  }
});

test("real legacy registration routes reject sessions without canonical account membership", async (t) => {
  const { cancel, context, registration, serviceInputs, calls } = loadRealRoutes(t, {
    sessionUserId: "profile:unknown",
  });

  const get = await registration.GET(
    new Request(`http://orbit.local/api/events/${eventId}/registration?questions=false`),
    context,
  );
  const post = await registration.POST(
    new Request(`http://orbit.local/api/events/${eventId}/registration`, {
      body: JSON.stringify({ answers: { targetAttendees: "Founders", valueOffered: "Advice" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const cancelled = await cancel.POST(
    new Request(`http://orbit.local/api/events/${eventId}/registration/cancel`, {
      method: "POST",
    }),
    context,
  );

  for (const response of [get, post, cancelled]) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
  assert.deepEqual(serviceInputs, []);
  assert.equal(calls.filter((call) => call.operation === "loadEvent").length, 0);
});

test("release-gate risk: legacy raw-profile registrations stay separate from canonical account reads", async () => {
  const service = createEventRegistrationService({
    now: () => "2030-01-01T00:00:00.000Z",
    provider: createMemoryEventRegistrationProvider(),
  });
  const rawRegistration = await service.register({
    answers: { targetAttendees: "Founders", valueOffered: "Advice" },
    eventId,
    userId: rawSessionActorId,
  });
  assert.equal(rawRegistration.userId, rawSessionActorId);
  assert.equal(
    await service.get({ eventId, userId: canonicalActorId }),
    null,
    "canonical reads do not silently reinterpret a historical raw subject",
  );

  const canonicalRegistration = await service.register({
    answers: { targetAttendees: "Founders", valueOffered: "Advice" },
    eventId,
    userId: canonicalActorId,
  });
  assert.equal(canonicalRegistration.userId, canonicalActorId);
  const registrations = await service.list({ eventId });
  assert.deepEqual(
    registrations.map((registration) => registration.userId).sort(),
    [canonicalActorId, rawSessionActorId].sort(),
  );
});

test("the account-scope fixture maps the raw Auth.js profile subject through the persisted identity graph", () => {
  const actor = resolveAuthenticatedApiActorIdentity({
    graph,
    mode: "live",
    session: {
      email: "actor-a@example.test",
      name: "Actor A",
      userId: rawSessionActorId,
    },
    workspaceId: "workspace:registration-api-test",
  });
  assert.equal(actor?.id, canonicalActorId);
  assert.equal(actor?.profileId, rawSessionActorId);
});
