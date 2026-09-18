import assert from "node:assert/strict";
import test from "node:test";
import type { PortraitAnswerProof } from "../../shared/contract/event-registration-portrait";

import {
  portraitAnswerProofSchema,
  portraitSaveInputSchema,
} from "../../shared/api-schema/event-registration-portrait";
import { readPortraitAnswerProofs } from "../../features/events/registration/portrait/answer-proofs";
import { PortraitError } from "../../features/events/registration/portrait/contract";
import { signPortraitRegistrationQuestion } from "../../features/events/registration/portrait/generation-token.server";
import { signAdaptiveInterviewQuestion } from "../../features/events/registration/interview-question-token.server";
import { signPortraitAdaptiveQuestion } from "../../features/events/registration/portrait/adaptive-question-token.server";

const scope = { workspaceId: "test", actorId: "self", eventId: "event" };
const now = Date.parse("2026-09-17T10:00:00.000Z");
const secret = "synthetic-proof-secret-not-production";

test("portrait save accepts a first-save CAS and rejects client-owned persona or actor", () => {
  const body = { mutationId: "save:1", expectedPortraitVersion: null, generationToken: "signed-result" };
  assert.deepEqual(portraitSaveInputSchema.parse(body), body);
  for (const extra of [{ actorId: "other" }, { persona: { tagline: "forged" } }, { provenance: {} }]) {
    assert.equal(portraitSaveInputSchema.safeParse({ ...body, ...extra }).success, false);
  }
  for (const version of [0, -1, 1.5, "1"]) {
    assert.equal(portraitSaveInputSchema.safeParse({ ...body, expectedPortraitVersion: version }).success, false);
  }
  assert.equal(portraitSaveInputSchema.safeParse({ ...body, expectedPortraitVersion: 3 }).success, true);
});

test("portrait proof preserves its distinct authority domain and rejects client question text", () => {
  const proofs = [
    { kind: "signed_question", questionToken: "adaptive-proof", portraitAdaptiveToken: "workspace-proof", answer: "A" },
    { kind: "registration_question", portraitQuestionToken: "core-proof", answer: "B" },
    { kind: "stored_response", source: "registration", responseId: "legacy:targetAttendees", sourceVersion: "2026-09-17T09:00:00.000Z", answer: "C" },
    { kind: "stored_response", source: "portrait", responseId: "response:1", sourceVersion: "2", answer: "D" },
  ];
  for (const proof of proofs) {
    assert.deepEqual(portraitAnswerProofSchema.parse(proof), proof);
    assert.equal(portraitAnswerProofSchema.safeParse({ ...proof, prompt: "Client forged question" }).success, false);
    assert.equal(portraitAnswerProofSchema.safeParse({ ...proof, answer: "  " }).success, false);
    assert.equal(portraitAnswerProofSchema.safeParse({ ...proof, answer: "x".repeat(1001) }).success, false);
  }
  assert.equal(portraitAnswerProofSchema.safeParse({ ...proofs[1], kind: "signed_question" }).success, false);
  assert.equal(portraitAnswerProofSchema.safeParse({ ...proofs[2], source: "profile" }).success, false);
});

test("portrait answers require workspace-bound adaptive proof even when both workspaces legally contain actor and event", () => {
  const snapshot = { eventExists: true, access: { owner: false, role: null, state: null }, sourceRegistrationVersion: null };
  const responses = (["targetAttendees", "valueOffered"] as const).map((field) => {
    const questionToken = signAdaptiveInterviewQuestion({ ...scope, language: "en", question: { acknowledgment: "", field, prompt: "What should people know about you?", options: ["Builders", "Reviews"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, provider: "synthetic", model: "synthetic" } }, secret, now: () => now });
    return { kind: "signed_question" as const, answer: "Builders", questionToken, portraitAdaptiveToken: signPortraitAdaptiveQuestion({ ...scope, questionToken, secret, now: () => now }) };
  });
  assert.equal(readPortraitAnswerProofs({ ...scope, responses, snapshot, portrait: null, secret, now: () => now }).length, 2);
  assert.throws(() => readPortraitAnswerProofs({ ...scope, workspaceId: "another-legal-workspace", responses, snapshot, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 422);
  const rawV1 = responses.map(({ portraitAdaptiveToken, ...response }) => response);
  assert.throws(() => readPortraitAnswerProofs({ ...scope, responses: rawV1 as unknown as readonly PortraitAnswerProof[], snapshot, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 422);
});

test("stored proof reconstructs trusted legacy fields and rejects stale versions or duplicate fields", () => {
  const snapshot = { eventExists: true, sourceRegistrationFingerprint: "c".repeat(64), access: { owner: false, role: null, state: null }, sourceRegistrationVersion: "2026-09-17T09:00:00.000Z", registrationProfile: { id: "profile", userId: "self", eventId: "event", createdAt: "2026-09-17T09:00:00.000Z", updatedAt: "2026-09-17T09:00:00.000Z", answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } };
  const responses = ["targetAttendees", "valueOffered"].map((field) => ({ kind: "stored_response" as const, source: "registration" as const, responseId: `legacy:${field}`, sourceVersion: snapshot.sourceRegistrationFingerprint, answer: field === "targetAttendees" ? "Changed answer" : "Reviews" }));
  const result = readPortraitAnswerProofs({ ...scope, responses, snapshot, portrait: null, secret, now: () => now });
  assert.deepEqual(result.map((item) => [item.field, item.answer, item.question, item.questionSource]), [["targetAttendees", "Changed answer", null, "legacy_unknown"], ["valueOffered", "Reviews", null, "legacy_unknown"]]);
  assert.equal(snapshot.registrationProfile.answers.targetAttendees, "Builders");
  assert.throws(() => readPortraitAnswerProofs({ ...scope, responses, snapshot: { ...snapshot, sourceRegistrationFingerprint: null }, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 503);
  assert.throws(() => readPortraitAnswerProofs({ ...scope, responses: responses.map(response => ({ ...response, sourceVersion: snapshot.sourceRegistrationVersion })), snapshot, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 409);
  assert.throws(() => readPortraitAnswerProofs({ ...scope, responses: [{ ...responses[0], sourceVersion: "old" }, responses[1]], snapshot, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 409);
  assert.throws(() => readPortraitAnswerProofs({ ...scope, responses: [responses[0], responses[0]], snapshot, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 422);
});

test("unregistered core formal proofs generate trusted answers without saving registration, but reject changed source", () => {
  const snapshot = { eventExists: true, access: { owner: false, role: null, state: null }, sourceRegistrationVersion: null, eventSourceVersion: "2026-09-17T09:00:00.000Z", questionSetHash: "published-hash", questionSetVersion: 2, registrationProfile: null };
  const responses = (["target_attendees", "value_offered"] as const).map((intent) => ({
    kind: "registration_question" as const, answer: intent === "target_attendees" ? "Builders" : "Reviews",
    portraitQuestionToken: signPortraitRegistrationQuestion({ ...scope, question: { id: intent, intent, participantProfileField: intent === "target_attendees" ? "targetAttendees" : "valueOffered", prompt: intent === "target_attendees" ? "Who do you want to meet?" : "What can you offer?", options: ["Builders", "Reviews"], required: true }, language: "en", eventSourceVersion: snapshot.eventSourceVersion, sourceRegistrationVersion: null, questionSetHash: snapshot.questionSetHash, questionSetVersion: 2, provenance: { generationMethod: "deterministic-fallback", fallbackReason: "not-configured", aiProviderRequested: false, externalNetworkRequested: false, model: null, provider: null }, secret, now: () => now }),
  }));
  const result = readPortraitAnswerProofs({ ...scope, responses, snapshot, portrait: null, secret, now: () => now });
  assert.deepEqual(result.map((item) => [item.field, item.question?.prompt, item.generation?.method]), [["targetAttendees", "Who do you want to meet?", "deterministic-fallback"], ["valueOffered", "What can you offer?", "deterministic-fallback"]]);
  assert.equal(snapshot.registrationProfile, null);
  for (const change of [{ questionSetHash: "changed" }, { questionSetVersion: 3 }, { eventSourceVersion: "2026-09-17T09:01:00.000Z" }]) {
    assert.throws(() => readPortraitAnswerProofs({ ...scope, responses, snapshot: { ...snapshot, ...change }, portrait: null, secret, now: () => now }), (error: unknown) => error instanceof PortraitError && error.status === 409);
  }
});

// Sprint 0081: the real "答完第八题生成不了画像" shape — two answers prefilled from the
// registration plus six signed interview answers. This mixed request is what the
// screen sends once a participant has already answered the formal questions, and
// it must be accepted. The one rejection that does apply is a repeated field: the
// adaptive interview must never re-ask something the registration already covered.
function mixedPortraitRequest(extra: readonly PortraitAnswerProof[] = []) {
  const registrationProfile = {
    id: `event-participant-profile:${scope.eventId}:${scope.actorId}`,
    createdAt: "2026-09-17T08:00:00.000Z",
    userId: scope.actorId,
    eventId: scope.eventId,
    updatedAt: "2026-09-17T09:00:00.000Z",
    answers: { targetAttendees: "餐饮连锁的运营负责人", valueOffered: "入境客数据与渠道资源" },
    interviewResponses: [],
  };
  const snapshot = {
    eventExists: true,
    access: { owner: false, role: null, state: null },
    sourceRegistrationVersion: "1",
    sourceRegistrationFingerprint: "fingerprint:1",
    registrationProfile,
  };
  const prefilled: PortraitAnswerProof[] = (["targetAttendees", "valueOffered"] as const).map((field) => ({
    kind: "stored_response",
    source: "registration",
    responseId: `legacy:${field}`,
    sourceVersion: "fingerprint:1",
    answer: registrationProfile.answers[field],
  }));
  const interviewed: PortraitAnswerProof[] = (["desiredOutcome", "positioning", "industry", "energyStyle", "followUpPreference", "experienceHighlight"] as const).map((field) => {
    const questionToken = signAdaptiveInterviewQuestion({ ...scope, language: "zh", question: { acknowledgment: "", field, prompt: `关于${field}，请具体说明你的情况。`, options: ["选项一", "选项二"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "deepseek-v4-flash", provider: "deepseek" } }, secret, now: () => now });
    return { kind: "signed_question", answer: `${field} 的具体回答`, questionToken, portraitAdaptiveToken: signPortraitAdaptiveQuestion({ ...scope, questionToken, secret, now: () => now }) };
  });
  return { snapshot, responses: [...prefilled, ...interviewed, ...extra] };
}

test("eight answers mixing prefilled registration proofs with signed interview proofs are accepted", () => {
  const { snapshot, responses } = mixedPortraitRequest();
  const trusted = readPortraitAnswerProofs({ ...scope, responses, snapshot, portrait: null, secret, now: () => now });
  assert.equal(trusted.length, 8, "all eight answers survive verification");
  assert.deepEqual(
    trusted.filter((answer) => answer.source === "registration").map((answer) => answer.field).sort(),
    ["targetAttendees", "valueOffered"],
    "the two prefilled core answers keep their registration provenance",
  );
  assert.equal(new Set(trusted.map((answer) => answer.field)).size, 8, "every field appears once");
});

test("a field the registration already answered cannot be asked again by the interview", () => {
  const questionToken = signAdaptiveInterviewQuestion({ ...scope, language: "zh", question: { acknowledgment: "", field: "valueOffered", prompt: "你能为对方提供什么？", options: ["选项一", "选项二"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "deepseek-v4-flash", provider: "deepseek" } }, secret, now: () => now });
  const duplicate: PortraitAnswerProof = { kind: "signed_question", answer: "重复字段的回答", questionToken, portraitAdaptiveToken: signPortraitAdaptiveQuestion({ ...scope, questionToken, secret, now: () => now }) };
  const { snapshot, responses } = mixedPortraitRequest([duplicate]);
  assert.throws(
    () => readPortraitAnswerProofs({ ...scope, responses, snapshot, portrait: null, secret, now: () => now }),
    (error: unknown) => error instanceof PortraitError && error.status === 422 && error.code === "PORTRAIT_INPUT_INVALID",
    "a duplicate field is refused with the code the client now shows",
  );
});
