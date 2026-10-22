import assert from "node:assert/strict";
import test from "node:test";

import { createRegistrationInterviewPostHandler, createRegistrationPersonaPostHandler } from "../../app/api/events/[id]/registration/adaptive-handlers";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";

// LF13: the adaptive interview's questions and the older persona route used to call the model with no ledger and no cap.
// Both now reserve first; a used-up quota answers 409 AI_LIMIT and an unusable ledger 503 — with no provider request.
const routeContext = { params: Promise.resolve({ id: "demo-event-1" }) };
const loadEvent = async (eventId: string) => mockEventRecords.find((event) => event.id === eventId) ?? null;
const resolveActor = async () => ({ id: "actor:participant" });
const transcript = [{ answer: "Meet storage operators", field: "positioning", prompt: "What is your goal?" }];
const reserved: { purpose: string; pool: string }[] = [];
const gate = (reservation: unknown): AiQuotaGate => ({
  reserve: async (input: { purpose: string; pool: string }) => { reserved.push({ purpose: input.purpose, pool: input.pool }); return reservation; },
  beginCall: async () => ({ callId: "c" }), endCall: async () => undefined, finish: async () => undefined,
} as unknown as AiQuotaGate);
const post = (path: string) => new Request(`https://orbit.test/api/events/demo-event-1/registration/${path}`, { body: JSON.stringify({ language: "en", transcript }), headers: { "content-type": "application/json" }, method: "POST" });

async function noProvider<T>(run: () => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("no provider request may be sent"); }) as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

test("a used-up quota: 409 AI_LIMIT from both routes, answers kept, no provider request", async () => {
  reserved.length = 0;
  const exhausted = () => gate({ ok: false, reason: "daily_limit", limit: "purpose" });
  const [question, persona] = await noProvider(() => Promise.all([
    createRegistrationInterviewPostHandler(resolveActor, loadEvent, () => null, exhausted)(post("interview"), routeContext),
    createRegistrationPersonaPostHandler(resolveActor, loadEvent, () => null, exhausted)(post("persona"), routeContext),
  ]));
  for (const response of [question, persona]) {
    assert.equal(response.status, 409);
    const body = await response.json() as { error: { code: string; context?: { reason?: string } } };
    assert.equal(body.error.context?.reason, "AI_LIMIT");
  }
  assert.deepEqual(reserved.sort((a, b) => a.purpose.localeCompare(b.purpose)), [
    { pool: "system", purpose: "event_registration_interview" },
    { pool: "system", purpose: "event_registration_question" },
  ]);
});

test("an unusable ledger: 503 and no provider request", async () => {
  const broken = () => ({ ...gate(null), reserve: async () => { throw new Error("check constraint"); } }) as unknown as AiQuotaGate;
  const response = await noProvider(() => createRegistrationInterviewPostHandler(resolveActor, loadEvent, () => null, broken)(post("interview"), routeContext));
  assert.equal(response.status, 503);
});
