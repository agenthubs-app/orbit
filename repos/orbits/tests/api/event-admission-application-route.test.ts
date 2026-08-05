import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventAdmissionApplicationDeleteHandler,
  createEventAdmissionApplicationGetHandler,
  createEventAdmissionApplicationPostHandler,
} from "../../app/api/events/[id]/admission/application/handler";
import type { EventAdmissionApplication } from "../../features/events/admission/contract";
import type { EventAdmissionJourneyService } from "../../features/events/admission/journey-service";

const eventReference = "JOURNEY01";
const actorId = "account:journey-api";

function application(
  status: EventAdmissionApplication["status"],
): EventAdmissionApplication {
  return {
    actorId,
    applicationVersion: status === "admitted" ? 1 : 2,
    decidedAt: null,
    decisionActorId: null,
    eventId: "event:canonical:journey-api",
    policyVersion: 1,
    profilePayload: { answers: {} },
    status,
    submittedAt: "2026-08-05T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:00.000Z",
  };
}

function context(id = eventReference) {
  return { params: Promise.resolve({ id }) };
}

function service(input: {
  current?: EventAdmissionApplication | null;
  onApply?: (value: unknown) => void;
  onWithdraw?: (value: unknown) => void;
} = {}): EventAdmissionJourneyService {
  return {
    async apply(value) {
      input.onApply?.(value);
      return application("admitted");
    },
    async getState(value) {
      return {
        admissionControlled: true,
        application: input.current ?? null,
        eventId: "event:canonical:journey-api",
        policy: {
          admissionMode: "instant",
          capacity: 10,
          eventId: "event:canonical:journey-api",
          policyVersion: 1,
          profileEditDeadlineAt: "2026-08-31T00:00:00.000Z",
          registrationClosesAt: "2026-08-31T00:00:00.000Z",
          registrationOpensAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          waitlistEnabled: true,
        },
      };
    },
    async withdraw(value) {
      input.onWithdraw?.(value);
      return application("withdrawn");
    },
  };
}

test("application API authenticates before parsing or constructing admission storage", async () => {
  let serviceCreations = 0;
  const handler = createEventAdmissionApplicationPostHandler({
    createService() {
      serviceCreations += 1;
      return service();
    },
    resolveActor: async () => null,
  });
  const response = await handler(
    new Request("http://orbit.test/application", {
      body: JSON.stringify({ answers: { positioning: "raw answer" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context(),
  );

  assert.equal(response.status, 401);
  assert.equal(serviceCreations, 0);
});

test("application API accepts only exact signed-response submissions and forwards server identity", async () => {
  let observed: unknown;
  const handler = createEventAdmissionApplicationPostHandler({
    createService: () => service({ onApply(value) { observed = value; } }),
    resolveActor: async () => ({ id: actorId, name: "森 爱子" }),
  });
  const responses = [
    { answer: "Cross-border operator", questionToken: "signed-positioning" },
    { answer: "Enterprise buyers", questionToken: "signed-target" },
    { answer: "Market-entry evidence", questionToken: "signed-value" },
    { answer: "Two qualified meetings", questionToken: "signed-outcome" },
  ];
  const response = await handler(
    new Request("http://orbit.test/application", {
      body: JSON.stringify({ responses }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
    }),
    context(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    actorId,
    displayName: "森 爱子",
    eventReference,
    responses,
  });

  for (const body of [
    { answers: { positioning: "raw answer" } },
    { responses, visibility: "private" },
    { responses: [{ answer: "raw answer", questionToken: "signed", field: "positioning" }] },
  ]) {
    const invalid = await handler(
      new Request("http://orbit.test/application", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      context(),
    );
    assert.equal(invalid.status, 400);
  }
});

test("withdraw API binds the authenticated actor and route event reference", async () => {
  let observed: unknown;
  const handler = createEventAdmissionApplicationDeleteHandler({
    createService: () => service({ onWithdraw(value) { observed = value; } }),
    resolveActor: async () => ({ id: actorId }),
  });
  const response = await handler(
    new Request("http://orbit.test/application", {
      body: JSON.stringify({ expectedApplicationVersion: 1 }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    }),
    context(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    actorId,
    eventReference,
    expectedApplicationVersion: 1,
  });
  const payload = await response.json() as { data: EventAdmissionApplication };
  assert.equal(payload.data.status, "withdrawn");
});

test("withdraw API rejects missing, invalid, or extra concurrency fields", async () => {
  let calls = 0;
  const handler = createEventAdmissionApplicationDeleteHandler({
    createService: () => service({ onWithdraw() { calls += 1; } }),
    resolveActor: async () => ({ id: actorId }),
  });

  for (const body of [
    {},
    { expectedApplicationVersion: 0 },
    { expectedApplicationVersion: 1, actorId: "spoofed" },
  ]) {
    const response = await handler(
      new Request("http://orbit.test/application", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
      context(),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("application GET restores the current actor state and returns success null before applying", async () => {
  for (const status of [
    "pending_review",
    "waitlisted",
    "rejected",
    "withdrawn",
  ] as const) {
    const currentHandler = createEventAdmissionApplicationGetHandler({
      createService: () => service({ current: application(status) }),
      resolveActor: async () => ({ id: actorId }),
    });
    const current = await currentHandler(
      new Request("http://orbit.test/application"),
      context(),
    );
    assert.equal(current.status, 200);
    assert.equal(
      ((await current.json()) as { data: EventAdmissionApplication }).data.status,
      status,
    );
  }

  const emptyHandler = createEventAdmissionApplicationGetHandler({
    createService: () => service({ current: null }),
    resolveActor: async () => ({ id: actorId }),
  });
  const empty = await emptyHandler(
    new Request("http://orbit.test/application"),
    context(),
  );
  assert.equal(empty.status, 200);
  assert.equal(((await empty.json()) as { data: unknown }).data, null);
});

test("application API fails closed when the canonical journey runtime is unavailable", async () => {
  const handler = createEventAdmissionApplicationGetHandler({
    createService: () => null,
    resolveActor: async () => ({ id: actorId }),
  });
  const response = await handler(
    new Request("http://orbit.test/application"),
    context(),
  );
  assert.equal(response.status, 503);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "SERVICE_UNAVAILABLE");
});
