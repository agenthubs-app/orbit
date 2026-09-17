import assert from "node:assert/strict";
import test from "node:test";

import type { PortraitGeneration } from "../../shared/contract/event-registration-portrait";
import { PortraitTokenError, signPortraitGeneration, verifyPortraitGeneration, signPortraitRegistrationQuestion, verifyPortraitRegistrationQuestion, type PortraitRegistrationQuestionProof } from "../../features/events/registration/portrait/generation-token.server";
import { verifyInterviewResponseSubmissions } from "../../features/events/registration/interview-question-token.server";

const secret = "synthetic-portrait-test-secret-not-production";
const now = Date.parse("2026-09-17T10:00:00.000Z");
const scope = { workspaceId: "workspace:test", actorId: "actor:self", eventId: "event:test" };
const generation: PortraitGeneration = {
  sourceEventVersion: "event-core-postgres:event:test:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null,
  answersVersion: "a".repeat(64), sourceRegistrationVersion: null, generatedAt: new Date(now).toISOString(),
  persona: {
    energyStyle: "Listening first", industryTags: ["Robotics"], offering: "Prototype reviews",
    openers: ["What are you building?"], seeking: "Hardware collaborators", tagline: "Robotics prototyping",
    tags: ["Prototyping"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic-model", provider: "synthetic-runner" },
  },
  sourceAnswers: [
    { responseId: "legacy:targetAttendees", field: "targetAttendees", label: { en: "Who to meet", zh: "希望认识的人" }, answer: "Hardware collaborators", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "2026-09-17T09:00:00.000Z" },
    { responseId: "legacy:valueOffered", field: "valueOffered", label: { en: "Value offered", zh: "能够提供的价值" }, answer: "Prototype reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "2026-09-17T09:00:00.000Z" },
  ],
};

test("portrait token preserves the server result without making legacy questions into AI", () => {
  const generationToken = signPortraitGeneration({ ...scope, generation, secret, now: () => now });
  assert.deepEqual(verifyPortraitGeneration({ ...scope, generationToken, secret, now: () => now + 1 }), generation);
  assert.throws(() => verifyInterviewResponseSubmissions({ actorId: scope.actorId, eventId: scope.eventId, responses: [{ answer: "A", questionToken: generationToken }], secret, now: () => now }));
});

test("portrait token refuses altered result, cross-workspace/actor/event replay, and expiry", () => {
  const generationToken = signPortraitGeneration({ ...scope, generation, secret, now: () => now });
  const [encoded, signature] = generationToken.split(".");
  const altered = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  altered.generation.persona.tagline = "Forged client result";
  const tampered = `${Buffer.from(JSON.stringify(altered)).toString("base64url")}.${signature}`;
  for (const override of [
    { generationToken: tampered }, { workspaceId: "workspace:other" }, { actorId: "actor:other" }, { eventId: "event:other" },
    { now: () => now + 48 * 60 * 60 * 1000 },
  ]) assert.throws(() => verifyPortraitGeneration({ ...scope, generationToken, secret, now: () => now, ...override }));
});

test("portrait token cannot sign a fallback persona or a missing core answer", () => {
  const invalid = (error: unknown) => error instanceof PortraitTokenError && error.code === "PORTRAIT_GENERATION_INVALID";
  assert.throws(() => signPortraitGeneration({ ...scope, generation: { ...generation, sourceAnswers: generation.sourceAnswers.slice(0, 1) }, secret, now: () => now }), invalid);
  assert.throws(() => signPortraitGeneration({ ...scope, generation: { ...generation, persona: { ...generation.persona, provenance: { ...generation.persona.provenance, generationMethod: "deterministic-fallback" } } } as unknown as PortraitGeneration, secret, now: () => now }), invalid);
});

test("formal portrait question proof retains original question and deterministic provenance without becoming admission authority", () => {
  const proof: PortraitRegistrationQuestionProof = {
    ...scope, language: "zh", eventSourceVersion: "2026-09-17T09:00:00.000Z", sourceRegistrationVersion: null,
    questionSetHash: "formal-hash", questionSetVersion: 2,
    question: { id: "target_attendees", intent: "target_attendees", participantProfileField: "targetAttendees", required: true, prompt: "Which hardware collaborators are you hoping to meet at this event, and what would you discuss?", options: ["Hardware founders", "Prototype builders"] },
    provenance: { aiProviderRequested: false, externalNetworkRequested: false, fallbackReason: "provider-not-configured", generationMethod: "deterministic-fallback", model: null, provider: null },
  };
  const portraitQuestionToken = signPortraitRegistrationQuestion({ ...proof, secret, now: () => now });
  assert.deepEqual(verifyPortraitRegistrationQuestion({ ...scope, portraitQuestionToken, secret, now: () => now + 1 }), proof);
  const generationToken = signPortraitGeneration({ ...scope, generation, secret, now: () => now });
  assert.throws(() => verifyPortraitRegistrationQuestion({ ...scope, portraitQuestionToken: generationToken, secret, now: () => now }));
  assert.throws(() => verifyPortraitGeneration({ ...scope, generationToken: portraitQuestionToken, secret, now: () => now }));
  assert.throws(() => verifyInterviewResponseSubmissions({ actorId: scope.actorId, eventId: scope.eventId, responses: [{ answer: "Hardware founders", questionToken: portraitQuestionToken }], secret, now: () => now }));
  for (const override of [{ actorId: "other" }, { eventId: "other" }, { workspaceId: "other" }, { now: () => now + 48 * 60 * 60 * 1000 }]) {
    assert.throws(() => verifyPortraitRegistrationQuestion({ ...scope, portraitQuestionToken, secret, now: () => now, ...override }));
  }
});
