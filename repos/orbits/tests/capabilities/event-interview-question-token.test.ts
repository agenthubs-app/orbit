import assert from "node:assert/strict";
import test from "node:test";

import type { AdaptiveNextQuestion } from "../../features/events/registration/adaptive-interview-service";
import {
  InterviewQuestionTokenError,
  signAdaptiveInterviewQuestion,
  verifyInterviewResponseSubmissions,
} from "../../features/events/registration/interview-question-token.server";
import {
  answersFromProfileResponses,
  missingCoreProfileFields,
} from "../../features/events/registration/interview-response-contract";
import type { EventParticipantProfileField } from "../../features/events/registration/contract";

const secret = "test-interview-secret-with-enough-entropy";
const now = Date.parse("2026-08-04T08:00:00.000Z");

function question(field: EventParticipantProfileField): AdaptiveNextQuestion {
  return {
    acknowledgment: "",
    field,
    options: [`${field} option A`, `${field} option B`],
    prompt: `How would you answer the ${field} question for this event?`,
    provenance: {
      fallbackReason: null,
      generationMethod: "orbit-agent-model-adaptive",
      model: "gemini-test",
      provider: "gemini",
    },
  };
}

function token(field: EventParticipantProfileField) {
  return signAdaptiveInterviewQuestion({
    actorId: "actor:li",
    eventId: "event:tokyo",
    language: "en",
    now: () => now,
    question: question(field),
    questionId: `question:${field}`,
    secret,
  });
}

test("verified AI question tokens produce immutable response snapshots and answer projection", () => {
  const fields = [
    "positioning",
    "targetAttendees",
    "valueOffered",
    "desiredOutcome",
    "energyStyle",
  ] as const;
  const responses = verifyInterviewResponseSubmissions({
    actorId: "actor:li",
    eventId: "event:tokyo",
    now: () => now + 1_000,
    secret,
    responses: fields.map((field, index) => ({
      answer: index === 4 ? "I listen first, then go deep." : `${field} option A`,
      questionToken: token(field),
    })),
  });

  assert.deepEqual(missingCoreProfileFields(responses), []);
  assert.equal(responses[0]?.question?.prompt.includes("positioning"), true);
  assert.deepEqual(responses[0]?.answer.selectedOptionIds, ["option-1"]);
  assert.equal(responses[4]?.answer.customText, "I listen first, then go deep.");
  assert.equal(responses[4]?.visibility, "event_attendees");
  assert.equal(responses.every((response) => response.questionSource === "ai_adaptive"), true);
  assert.equal(answersFromProfileResponses(responses).desiredOutcome, "desiredOutcome option A");
});

test("question tokens reject tampering and cross-actor replay", () => {
  const original = token("positioning");
  const tampered = `${original.slice(0, -1)}${original.endsWith("a") ? "b" : "a"}`;

  for (const input of [
    { actorId: "actor:li", questionToken: tampered },
    { actorId: "actor:other", questionToken: original },
  ]) {
    assert.throws(
      () =>
        verifyInterviewResponseSubmissions({
          actorId: input.actorId,
          eventId: "event:tokyo",
          now: () => now + 1_000,
          responses: [{ answer: "positioning option A", questionToken: input.questionToken }],
          secret,
        }),
      (error) =>
        error instanceof InterviewQuestionTokenError &&
        error.code === "INTERVIEW_QUESTION_TOKEN_INVALID",
    );
  }
});

test("deterministic fallback questions cannot be signed", () => {
  assert.throws(
    () =>
      signAdaptiveInterviewQuestion({
        actorId: "actor:li",
        eventId: "event:tokyo",
        language: "en",
        question: {
          ...question("positioning"),
          provenance: {
            fallbackReason: "MODEL_FAILED",
            generationMethod: "deterministic-fallback",
            model: null,
            provider: null,
          },
        },
        secret,
      }),
    (error) =>
      error instanceof InterviewQuestionTokenError &&
      error.code === "INTERVIEW_AI_RESULT_REQUIRED",
  );
});
