import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createEventAdmissionPolicyGetHandler,
  createEventAdmissionPolicyPutHandler,
} from "../../app/api/events/[id]/admission/policy/handler";
import {
  EventAdmissionError,
  type EventAdmissionPolicy,
} from "../../features/events/admission/contract";
import type { EventAccessService } from "../../features/events/event-access/service";
import type { EventAdmissionService } from "../../features/events/admission/service";

const EVENT_ID = "event:admission-policy-api";
const ACTOR_ID = "actor:admission-policy-editor";
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function policy(overrides: Partial<EventAdmissionPolicy> = {}): EventAdmissionPolicy {
  return {
    admissionMode: "approval_required",
    capacity: 40,
    eventId: EVENT_ID,
    policyVersion: 3,
    profileEditDeadlineAt: "2026-09-02T10:00:00.000Z",
    registrationClosesAt: "2026-09-03T10:00:00.000Z",
    registrationOpensAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
    waitlistEnabled: true,
    ...overrides,
  };
}

function accessService(role: "operations" | "reviewer" | null): EventAccessService {
  return {
    async get(input) {
      const query = input as { eventId: string; subjectActorId: string };
      return {
        eventId: query.eventId,
        owner: false,
        revision: role ? 1 : 0,
        role,
        state: role ? "active" : null,
        subjectActorId: query.subjectActorId,
      };
    },
    async grant() { throw new Error("unused"); },
    async revoke() { throw new Error("unused"); },
  };
}

function ownerAccessService(): EventAccessService {
  return {
    async get(input) {
      const query = input as { eventId: string; subjectActorId: string };
      return {
        eventId: query.eventId,
        owner: true,
        revision: 1,
        role: null,
        state: null,
        subjectActorId: query.subjectActorId,
      };
    },
    async grant() { throw new Error("unused"); },
    async revoke() { throw new Error("unused"); },
  };
}

function admissionService(input: {
  configureError?: unknown;
  onConfigure?: (actorId: string, value: unknown) => void;
  policy?: EventAdmissionPolicy | null;
} = {}): EventAdmissionService {
  return {
    async configurePolicy(actorId, value) {
      input.onConfigure?.(actorId, value);
      if (input.configureError) throw input.configureError;
      return policy({
        ...value,
        policyVersion: (value.expectedPolicyVersion ?? 0) + 1,
        updatedAt: "2026-08-21T10:00:00.000Z",
      });
    },
    async decideApplication() { throw new Error("unused"); },
    async getApplication() { return null; },
    async getApplicationForReview() { return null; },
    async getPolicy() { return input.policy === undefined ? policy() : input.policy; },
    async listApplications() {
      return { items: [], nextCursor: null, total: 0 };
    },
    async submitApplication() { throw new Error("unused"); },
    async withdrawApplication() { throw new Error("unused"); },
  };
}

function context() {
  return { params: Promise.resolve({ id: EVENT_ID }) };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    admissionMode: "approval_required",
    capacity: 20,
    expectedPolicyVersion: 3,
    profileEditDeadlineAt: "2026-09-02T10:00:00.000Z",
    registrationClosesAt: "2026-09-03T10:00:00.000Z",
    registrationOpensAt: "2026-09-01T10:00:00.000Z",
    waitlistEnabled: true,
    ...overrides,
  };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("admission policy read requires admission.read and returns the current version", async () => {
  let calls = 0;
  const unauthenticated = createEventAdmissionPolicyGetHandler({
    createAccessService: () => accessService("reviewer"),
    createService() { calls += 1; return admissionService(); },
    resolveActor: async () => null,
  });
  assert.equal((await unauthenticated(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`),
    context(),
  )).status, 401);
  assert.equal(calls, 0);

  const get = createEventAdmissionPolicyGetHandler({
    createAccessService: () => accessService("reviewer"),
    createService: () => admissionService(),
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  const response = await get(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`),
    context(),
  );
  const payload = (await body(response)).data as {
    policy: EventAdmissionPolicy;
    policyVersion: number;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.policyVersion, 3);
  assert.deepEqual(payload.policy, policy());
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("admission policy writes are owner-only and preserve the exact versioned command", async () => {
  let configureCalls = 0;
  const forbidden = createEventAdmissionPolicyPutHandler({
    createAccessService: () => accessService("operations"),
    createService() { configureCalls += 1; return admissionService(); },
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  assert.equal((await forbidden(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`, {
      body: JSON.stringify(command()),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context(),
  )).status, 403);
  assert.equal(configureCalls, 0);

  let observed: unknown;
  const put = createEventAdmissionPolicyPutHandler({
    createAccessService: () => ownerAccessService(),
    createService: () => admissionService({
      onConfigure(actorId, value) {
        assert.equal(actorId, ACTOR_ID);
        observed = value;
      },
    }),
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  const response = await put(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`, {
      body: JSON.stringify(command()),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "PUT",
    }),
    context(),
  );
  const payload = (await body(response)).data as { policyVersion: number };

  assert.equal(response.status, 200);
  assert.equal(payload.policyVersion, 4);
  assert.deepEqual(observed, { ...command(), eventId: EVENT_ID });
});

test("policy route rejects invalid time ordering and reports canonical version conflicts safely", async () => {
  let configureCalls = 0;
  const validation = createEventAdmissionPolicyPutHandler({
    createAccessService: () => ownerAccessService(),
    createService() { configureCalls += 1; return admissionService(); },
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  const invalid = await validation(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`, {
      body: JSON.stringify(command({
        profileEditDeadlineAt: "2026-09-04T10:00:00.000Z",
      })),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context(),
  );
  assert.equal(invalid.status, 400);
  assert.equal(configureCalls, 0);

  const conflict = createEventAdmissionPolicyPutHandler({
    createAccessService: () => ownerAccessService(),
    createService: () => admissionService({
      configureError: new EventAdmissionError(
        "VERSION_CONFLICT",
        "private policy version detail",
      ),
    }),
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  const conflictResponse = await conflict(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`, {
      body: JSON.stringify(command()),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context(),
  );
  const conflictBody = await body(conflictResponse);
  assert.equal(conflictResponse.status, 409);
  assert.equal((conflictBody.error as { code?: string }).code, "CONFLICT");
  assert.doesNotMatch(JSON.stringify(conflictBody), /private policy version detail/u);

  const unavailable = createEventAdmissionPolicyGetHandler({
    createAccessService: () => accessService("reviewer"),
    createService: () => null,
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  assert.equal((await unavailable(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`),
    context(),
  )).status, 503);
});

test("policy route exposes activation prerequisites as safe configuration conflicts", async () => {
  const notConfigured = createEventAdmissionPolicyPutHandler({
    createAccessService: () => ownerAccessService(),
    createService: () => admissionService({
      configureError: new EventAdmissionError(
        "NOT_CONFIGURED",
        "private missing Event Operations configuration detail",
      ),
    }),
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  const notConfiguredResponse = await notConfigured(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`, {
      body: JSON.stringify(command()),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context(),
  );
  const notConfiguredBody = await body(notConfiguredResponse);
  assert.equal(notConfiguredResponse.status, 409);
  assert.match(
    String((notConfiguredBody.error as { message?: string }).message),
    /Configure the event operations schedule/u,
  );
  assert.doesNotMatch(
    JSON.stringify(notConfiguredBody),
    /private missing Event Operations configuration detail/u,
  );

  const blocked = createEventAdmissionPolicyPutHandler({
    createAccessService: () => ownerAccessService(),
    createService: () => admissionService({
      configureError: new EventAdmissionError(
        "ACTIVATION_BLOCKED",
        "private legacy membership detail",
      ),
    }),
    resolveActor: async () => ({ id: ACTOR_ID }),
  });
  const blockedResponse = await blocked(
    new Request(`http://orbit.test/api/events/${EVENT_ID}/admission/policy`, {
      body: JSON.stringify(command()),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context(),
  );
  const blockedBody = await body(blockedResponse);
  assert.equal(blockedResponse.status, 409);
  assert.match(
    String((blockedBody.error as { message?: string }).message),
    /legacy registration migration/u,
  );
  assert.doesNotMatch(JSON.stringify(blockedBody), /private legacy membership detail/u);
});

test("admission policy API is canonical-capability scoped with no legacy fallback", () => {
  const sources = [
    "app/api/events/[id]/admission/policy/handler.ts",
    "app/api/events/[id]/admission/policy/route.ts",
    "app/(app)/app/events/[id]/operations/admission/page.tsx",
  ].map((file) => readFileSync(join(projectRoot, file), "utf8"));
  const source = sources.join("\n");

  assert.match(source, /"admission\.read"/u);
  assert.match(source, /"roles\.manage"/u);
  assert.match(source, /createConfiguredEventCoreService/u);
  assert.match(source, /expectedPolicyVersion/u);
  assert.doesNotMatch(source, /readPublicEventCatalogue|mockEventRecords|legacyEvent/u);
});
