import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type { AdaptiveNextQuestion } from "./adaptive-interview-service";
import {
  EVENT_PROFILE_FIELD_LABELS,
  type EventInterviewResponseSubmission,
  type EventProfileResponseSnapshot,
  type EventProfileResponseVisibility,
} from "./interview-response-contract";
import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileField,
} from "./contract";

const TOKEN_VERSION = 1;
const PROMPT_VERSION = 1;
const DEFAULT_TOKEN_TTL_MS = 48 * 60 * 60 * 1_000;

interface InterviewQuestionTokenPayload {
  actorId: string;
  eventId: string;
  expiresAt: number;
  field: EventParticipantProfileField;
  issuedAt: number;
  language: "en" | "zh";
  model: string;
  options: readonly { id: string; label: string }[];
  prompt: string;
  promptVersion: number;
  provider: string;
  questionId: string;
  version: typeof TOKEN_VERSION;
}

export class InterviewQuestionTokenError extends Error {
  constructor(
    readonly code:
      | "INTERVIEW_AI_RESULT_REQUIRED"
      | "INTERVIEW_CORE_FIELDS_REQUIRED"
      | "INTERVIEW_QUESTION_TOKEN_EXPIRED"
      | "INTERVIEW_QUESTION_TOKEN_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "InterviewQuestionTokenError";
  }
}

function signingSecret(explicit?: string): string {
  const value =
    explicit ??
    process.env.ORBIT_INTERVIEW_SIGNING_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!value?.trim()) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "A server interview signing secret is required.",
    );
  }
  return value;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPayload(encoded: string): InterviewQuestionTokenPayload {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The interview question token payload is invalid.",
    );
  }
  if (!isRecord(value)) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The interview question token payload is invalid.",
    );
  }
  const field =
    typeof value.field === "string"
      ? (value.field as EventParticipantProfileField)
      : null;
  const options = Array.isArray(value.options)
    ? value.options.flatMap((item, index) => {
        if (!isRecord(item) || typeof item.label !== "string") return [];
        const label = item.label.trim();
        if (!label || label.length > 80) return [];
        return [{ id: `option-${index + 1}`, label }];
      })
    : [];
  if (
    value.version !== TOKEN_VERSION ||
    typeof value.actorId !== "string" ||
    typeof value.eventId !== "string" ||
    typeof value.questionId !== "string" ||
    !field ||
    !EVENT_PARTICIPANT_PROFILE_FIELDS.includes(field) ||
    typeof value.prompt !== "string" ||
    value.prompt.length < 8 ||
    value.prompt.length > 240 ||
    options.length < 2 ||
    options.length > 5 ||
    (value.language !== "en" && value.language !== "zh") ||
    typeof value.provider !== "string" ||
    !value.provider ||
    typeof value.model !== "string" ||
    !value.model ||
    value.promptVersion !== PROMPT_VERSION ||
    typeof value.issuedAt !== "number" ||
    typeof value.expiresAt !== "number"
  ) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The interview question token fields are invalid.",
    );
  }
  return {
    actorId: value.actorId,
    eventId: value.eventId,
    expiresAt: value.expiresAt,
    field,
    issuedAt: value.issuedAt,
    language: value.language,
    model: value.model,
    options,
    prompt: value.prompt,
    promptVersion: PROMPT_VERSION,
    provider: value.provider,
    questionId: value.questionId,
    version: TOKEN_VERSION,
  };
}

export function signAdaptiveInterviewQuestion(input: {
  actorId: string;
  eventId: string;
  language: "en" | "zh";
  now?: () => number;
  question: AdaptiveNextQuestion;
  questionId?: string;
  secret?: string;
  ttlMs?: number;
}): string {
  if (
    input.question.provenance.generationMethod !==
      "orbit-agent-model-adaptive" ||
    input.question.provenance.fallbackReason !== null ||
    !input.question.provenance.model ||
    !input.question.provenance.provider
  ) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_AI_RESULT_REQUIRED",
      "Only a validated AI-generated interview question can be signed.",
    );
  }
  const issuedAt = (input.now ?? Date.now)();
  const payload: InterviewQuestionTokenPayload = {
    actorId: input.actorId.trim(),
    eventId: input.eventId.trim(),
    expiresAt: issuedAt + (input.ttlMs ?? DEFAULT_TOKEN_TTL_MS),
    field: input.question.field,
    issuedAt,
    language: input.language,
    model: input.question.provenance.model,
    options: input.question.options.map((label, index) => ({
      id: `option-${index + 1}`,
      label,
    })),
    prompt: input.question.prompt,
    promptVersion: PROMPT_VERSION,
    provider: input.question.provenance.provider,
    questionId: input.questionId ?? randomUUID(),
    version: TOKEN_VERSION,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, signingSecret(input.secret)).toString("base64url")}`;
}

function verifiedPayload(input: {
  actorId: string;
  eventId: string;
  now: number;
  questionToken: string;
  secret?: string;
}): InterviewQuestionTokenPayload {
  const [encoded, encodedSignature, ...extra] = input.questionToken.split(".");
  if (!encoded || !encodedSignature || extra.length > 0) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The interview question token is malformed.",
    );
  }
  const actual = Buffer.from(encodedSignature, "base64url");
  const expected = signature(encoded, signingSecret(input.secret));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The interview question token signature is invalid.",
    );
  }
  const payload = readPayload(encoded);
  if (
    payload.actorId !== input.actorId.trim() ||
    payload.eventId !== input.eventId.trim()
  ) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The interview question token belongs to another actor or event.",
    );
  }
  if (payload.expiresAt < input.now) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_EXPIRED",
      "The interview question token has expired.",
    );
  }
  return payload;
}

function responseVisibility(
  value: EventProfileResponseVisibility | undefined,
): EventProfileResponseVisibility {
  return value === "matching_only" || value === "private"
    ? value
    : "event_attendees";
}

export function verifyInterviewResponseSubmissions(input: {
  actorId: string;
  eventId: string;
  now?: () => number;
  responses: readonly EventInterviewResponseSubmission[];
  secret?: string;
}): readonly EventProfileResponseSnapshot[] {
  if (input.responses.length === 0 || input.responses.length > 8) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "Between one and eight interview responses are required.",
    );
  }
  const now = (input.now ?? Date.now)();
  const fields = new Set<EventParticipantProfileField>();
  const questionIds = new Set<string>();
  return input.responses.map((submission) => {
    const payload = verifiedPayload({
      actorId: input.actorId,
      eventId: input.eventId,
      now,
      questionToken: submission.questionToken,
      secret: input.secret,
    });
    const answer = submission.answer.trim().slice(0, 1_000);
    if (!answer || fields.has(payload.field) || questionIds.has(payload.questionId)) {
      throw new InterviewQuestionTokenError(
        "INTERVIEW_QUESTION_TOKEN_INVALID",
        "Interview answers must be non-empty and questions cannot repeat.",
      );
    }
    fields.add(payload.field);
    questionIds.add(payload.questionId);
    const selected = payload.options.find((option) => option.label === answer);
    return {
      answer: {
        customText: selected ? null : answer,
        displayText: answer,
        selectedOptionIds: selected ? [selected.id] : [],
      },
      answerSource: "participant" as const,
      answeredAt: new Date(now).toISOString(),
      field: payload.field,
      generation: {
        method: "orbit-agent-model-adaptive" as const,
        model: payload.model,
        promptVersion: payload.promptVersion,
        provider: payload.provider,
      },
      question: {
        fieldLabel: EVENT_PROFILE_FIELD_LABELS[payload.field],
        inputKind: "single_choice_with_custom" as const,
        language: payload.language,
        options: payload.options,
        prompt: payload.prompt,
      },
      questionId: payload.questionId,
      questionSource: "ai_adaptive" as const,
      responseId: `response:${payload.questionId}`,
      visibility: responseVisibility(submission.visibility),
    };
  });
}
