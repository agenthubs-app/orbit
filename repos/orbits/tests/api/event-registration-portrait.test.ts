import assert from "node:assert/strict";
import test from "node:test";
import { createPortraitGetHandler, createPortraitPostHandler } from "../../app/api/events/[id]/registration/portrait/route-handlers";
import { createRegistrationInterviewPostHandler, createRegistrationPersonaPostHandler } from "../../app/api/events/[id]/registration/adaptive-handlers";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createEventRegistrationRouteHandlers } from "../../app/api/events/[id]/registration/route-handlers";
import { createEventRegistrationService, createMemoryEventRegistrationProvider } from "../../features/events/registration/service";
import { verifyPortraitRegistrationQuestion } from "../../features/events/registration/portrait/generation-token.server";

const context = { params: Promise.resolve({ id: "event" }) };
test("portrait API denies anonymous requests before acquiring a storage runtime", async () => {
  const noRuntime = () => { throw new Error("Anonymous request must not allocate storage."); };
  const get = createPortraitGetHandler(async () => null, noRuntime);
  const post = createPortraitPostHandler(async () => null, noRuntime);
  for (const response of [await get(new Request("https://orbit.test/api/events/event/registration/portrait"), context), await post(new Request("https://orbit.test/api/events/event/registration/portrait", { method: "POST", body: "{}" }), context)]) {
    assert.equal(response.status, 401);
    assert.equal((await response.json()).success, false);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
});
test("portrait API refuses forged save fields and ambiguous subject query before any database read", async () => {
  const noRuntime = () => { throw new Error("Invalid request must not allocate storage."); };
  const get = createPortraitGetHandler(async () => ({ id: "self" }), noRuntime);
  const post = createPortraitPostHandler(async () => ({ id: "self" }), noRuntime);
  for (const query of ["?actorId=a&actorId=b", "?actorId=", "?workspaceId=other"]) {
    assert.equal((await get(new Request(`https://orbit.test/api/events/event/registration/portrait${query}`), context)).status, 422);
  }
  for (const body of ["invalid json", JSON.stringify({ mutationId: "save", expectedPortraitVersion: null, generationToken: "token", actorId: "other" }), JSON.stringify({ mutationId: "save", expectedPortraitVersion: 0, generationToken: "token" })]) {
    assert.equal((await post(new Request("https://orbit.test/api/events/event/registration/portrait", { method: "POST", body }), context)).status, 422);
  }
});
test("portrait API reports unavailable durable storage without bootstrapping a memory result", async () => {
  const get = createPortraitGetHandler(async () => ({ id: "self" }), () => null);
  const response = await get(new Request("https://orbit.test/api/events/event/registration/portrait"), context);
  assert.equal(response.status, 503);
  const envelope = await response.json();
  assert.equal(envelope.success, false);
  assert.equal(envelope.error.code, "SERVICE_UNAVAILABLE");
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

test("adaptive endpoints route explicit portrait modes without falling through to legacy transcript generation", async () => {
  const actor = async () => ({ id: "self" });
  const event = async () => ({ ...mockEventRecords[0], id: "event", status: "confirmed" as const });
  const persona = createRegistrationPersonaPostHandler(actor, event, () => null);
  const interview = createRegistrationInterviewPostHandler(actor, event, () => null);
  const preview = await persona(new Request("https://orbit.test/api/events/event/registration/persona", { method: "POST", body: JSON.stringify({ mode: "portrait-preview", responses: [{ kind: "signed_question", questionToken: "first", portraitAdaptiveToken: "first-workspace", answer: "A" }, { kind: "signed_question", questionToken: "second", portraitAdaptiveToken: "second-workspace", answer: "B" }] }) }), context);
  assert.equal(preview.status, 503);
  const invalidRenew = await interview(new Request("https://orbit.test/api/events/event/registration/interview", { method: "POST", body: JSON.stringify({ mode: "renew-stored-question", source: "profile", sourceVersion: "old", responseId: "response:1" }) }), context);
  assert.equal(invalidRenew.status, 422);
});

test("portrait interview requires durable workspace scope before any question generation while default interview keeps its original path", async () => {
  let acquired = 0;
  const handler = createRegistrationInterviewPostHandler(async () => ({ id: "self" }), async () => ({ ...mockEventRecords[0], id: "event", status: "confirmed" as const }), () => { acquired += 1; return null; });
  const response = await handler(new Request("https://orbit.test/api/events/event/registration/interview", { method: "POST", body: JSON.stringify({ mode: "portrait-interview", language: "en", transcript: [] }) }), context);
  assert.equal(response.status, 503);
  assert.equal(acquired, 1);
  assert.equal((await response.json()).error.context.portraitCode, "PORTRAIT_STORAGE_UNAVAILABLE");
});

test("formal registration GET signs portrait proofs only on explicit opt-in and preserves the original published questions", async () => {
  const previousSecret = process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
  process.env.ORBIT_INTERVIEW_SIGNING_SECRET = "synthetic-formal-get-secret";
  try {
    const service = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
    let reads = 0;
    const questions = (["target_attendees", "value_offered"] as const).map((intent) => ({ id: intent, intent, participantProfileField: intent === "target_attendees" ? "targetAttendees" as const : "valueOffered" as const, prompt: intent === "target_attendees" ? "Which builders would you like to meet?" : "What can you share with those builders?", options: ["Hardware", "Software"], required: true }));
    const { GET } = createEventRegistrationRouteHandlers({ registrationService: service, resolveActor: async () => ({ id: "self" }), loadEvent: async () => ({ ...mockEventRecords[0], id: "event", startsAt: "2030-01-01T09:00:00.000Z", endsAt: "2030-01-01T12:00:00.000Z", status: "confirmed" }), getPublishedQuestionSet: async () => ({ hash: "published-hash", questionSetVersion: 2, track: "v1", questions }), getPortraitProofSource: async () => {
      reads += 1;
      return { workspaceId: "test", snapshot: { eventExists: true, access: { owner: false, role: null, state: null }, sourceRegistrationVersion: null, eventSourceVersion: "2026-09-17T09:00:00.000Z", questionSetHash: "published-hash", questionSetVersion: 2 } };
    } });
    const ordinary = await GET(new Request("https://orbit.test/api/events/event/registration"), context);
    const oldQuestions = (await ordinary.json()).data.questionSet.questions;
    assert.deepEqual(oldQuestions, questions);
    assert.equal(reads, 0);
    const proofResponse = await GET(new Request("https://orbit.test/api/events/event/registration?portraitProofs=true"), context);
    assert.equal(proofResponse.status, 200);
    const proofQuestions = (await proofResponse.json()).data.questionSet.questions;
    assert.equal(reads, 1);
    assert.equal(typeof proofQuestions[0].portraitQuestionToken, "string");
    const verified = verifyPortraitRegistrationQuestion({ workspaceId: "test", actorId: "self", eventId: "event", portraitQuestionToken: proofQuestions[0].portraitQuestionToken, secret: "synthetic-formal-get-secret" });
    assert.deepEqual(verified.question, questions[0]);
    const noQuestions = await GET(new Request("https://orbit.test/api/events/event/registration?portraitProofs=true&questions=false"), context);
    assert.deepEqual((await noQuestions.json()).data.questionSet.questions, []);
    assert.equal(reads, 1);
    assert.equal(await service.get({ eventId: "event", userId: "self" }), null);
  } finally {
    if (previousSecret === undefined) delete process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
    else process.env.ORBIT_INTERVIEW_SIGNING_SECRET = previousSecret;
  }
});
