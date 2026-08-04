import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileAnswers,
} from "../contract";
import { compareUtf16CodeUnits } from "./contract";

export type ProfileContractAnswerTransformResult =
  | {
      afterParticipantAnswers: EventParticipantProfileAnswers | null;
      afterRegistrationAnswers: EventParticipantProfileAnswers;
      deletionPaths: readonly string[];
      kind: "candidate" | "unchanged";
    }
  | {
      code:
        | "ANSWER_MAP_INVALID"
        | "ANSWER_MAP_MISMATCH"
        | "ANSWER_VALUE_INVALID";
      kind: "invalid";
      message: string;
    };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function transformMap(input: {
  allowMissing?: boolean;
  path: "participant.profileAnswers" | "registrationProfile.answers";
  value: unknown;
}):
  | {
      answers: EventParticipantProfileAnswers | null;
      deletionPaths: readonly string[];
      kind: "valid";
    }
  | { code: "ANSWER_MAP_INVALID" | "ANSWER_VALUE_INVALID"; kind: "invalid"; message: string } {
  if (input.allowMissing && input.value === undefined) {
    return { answers: null, deletionPaths: [], kind: "valid" };
  }
  const value = object(input.value);
  if (!value) {
    return {
      code: "ANSWER_MAP_INVALID",
      kind: "invalid",
      message: "Canonical profile answers must be an object.",
    };
  }
  const answers: EventParticipantProfileAnswers = {};
  const deletionPaths: string[] = [];
  for (const [field, answer] of Object.entries(value)) {
    if (!EVENT_PARTICIPANT_PROFILE_FIELDS.includes(field as never)) {
      return {
        code: "ANSWER_MAP_INVALID",
        kind: "invalid",
        message: "Canonical profile answers contain an unknown field.",
      };
    }
    if (typeof answer !== "string") {
      return {
        code: "ANSWER_VALUE_INVALID",
        kind: "invalid",
        message: "Canonical profile answer values must be strings.",
      };
    }
    if (answer.trim().length === 0) {
      deletionPaths.push(`${input.path}.${field}`);
      continue;
    }
    if (answer.trim() !== answer || answer.length > 1_000) {
      return {
        code: "ANSWER_VALUE_INVALID",
        kind: "invalid",
        message: "Non-empty canonical profile answers must already be normalized.",
      };
    }
    answers[field as keyof EventParticipantProfileAnswers] = answer;
  }
  return { answers, deletionPaths, kind: "valid" };
}

export function transformCanonicalProfileAnswerMaps(input: {
  participantAnswers: unknown;
  registrationAnswers: unknown;
}): ProfileContractAnswerTransformResult {
  const participant = transformMap({
    allowMissing: true,
    path: "participant.profileAnswers",
    value: input.participantAnswers,
  });
  if (participant.kind === "invalid") return participant;
  const registration = transformMap({
    path: "registrationProfile.answers",
    value: input.registrationAnswers,
  });
  if (registration.kind === "invalid") return registration;
  for (const field of EVENT_PARTICIPANT_PROFILE_FIELDS) {
    if (
      participant.answers !== null &&
      participant.answers[field] !== registration.answers![field]
    ) {
      return {
        code: "ANSWER_MAP_MISMATCH",
        kind: "invalid",
        message: "Canonical participant and registration answer maps do not agree.",
      };
    }
  }
  const deletionPaths = [
    ...participant.deletionPaths,
    ...registration.deletionPaths,
  ].sort(compareUtf16CodeUnits);
  return {
    afterParticipantAnswers: participant.answers,
    afterRegistrationAnswers: registration.answers!,
    deletionPaths,
    kind: deletionPaths.length > 0 ? "candidate" : "unchanged",
  };
}
