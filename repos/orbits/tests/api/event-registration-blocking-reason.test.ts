import assert from "node:assert/strict";
import test from "node:test";
import { createEventRegistrationRouteHandlers } from "../../app/api/events/[id]/registration/route-handlers";
import { createEventRegistrationService, createMemoryEventRegistrationProvider } from "../../features/events/registration/service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";

function handlers(readRegistrationWindow: () => Promise<unknown>) {
  return createEventRegistrationRouteHandlers({
    loadEvent: async () => ({ ...mockEventRecords[0]!, id: "event:reason", status: "confirmed",
      startsAt: "2026-10-20T10:00:00Z", endsAt: "2026-10-20T12:00:00Z" }),
    now: () => new Date("2026-09-16T12:00:00Z"),
    getPublishedQuestionSet: async () => { throw new Error("questions=false must not read or generate questions"); },
    registrationService: createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() }),
    resolveActor: async () => ({ id: "actor:reason" }),
    readRegistrationWindow,
  } as Parameters<typeof createEventRegistrationRouteHandlers>[0]);
}

test("successful read propagates the actual configuration reason without generating questions", async () => {
  const { GET } = handlers(async () => ({ availability: "unavailable", blockingReason: "configuration_required" }));
  const response = await GET(new Request("http://orbit.local/registration?questions=false"), { params: Promise.resolve({ id: "event:reason" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.eligibility.state, "unavailable");
  assert.equal(body.data.eligibility.reason, "unavailable");
  assert.equal(body.data.eligibility.blockingReason, "configuration_required");
  assert.deepEqual(body.data.eligibility.allowedActions, []);
  assert.deepEqual(body.data.questionSet.questions, []);
});

test("a failed window read stays a 503 instead of inventing a configuration reason", async () => {
  const { GET } = handlers(async () => { throw new Error("private connection detail"); });
  const response = await GET(new Request("http://orbit.local/registration?questions=false"), { params: Promise.resolve({ id: "event:reason" }) });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(body), /private connection detail|configuration_required/);
});
test("a default registration read cannot generate questions when configuration blocks submission", async () => {
  const { GET } = handlers(async () => ({ availability: "unavailable", blockingReason: "configuration_required" }));
  const response = await GET(new Request("http://orbit.local/registration"), { params: Promise.resolve({ id: "event:reason" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.eligibility.blockingReason, "configuration_required");
  assert.deepEqual(body.data.questionSet.questions, []);
  assert.equal(body.data.questionSet.provenance.aiProviderRequested, false);
});
