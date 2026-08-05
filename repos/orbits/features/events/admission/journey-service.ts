import type { EventCoreService } from "../core/service";
import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileAnswers,
  type EventParticipantProfileField,
} from "../registration/contract";
import {
  EVENT_PROFILE_CORE_FIELDS,
  answersFromProfileResponses,
  type EventInterviewResponseSubmission,
  type EventProfileResponseSnapshot,
} from "../registration/interview-response-contract";
import { verifyInterviewResponseSubmissions } from "../registration/interview-question-token.server";
import type {
  EventAdmissionApplication,
  EventAdmissionPolicy,
} from "./contract";
import type { EventAdmissionService } from "./service";

export type EventAdmissionJourneyErrorCode =
  | "ACTOR_REQUIRED"
  | "CANONICAL_EVENT_NOT_FOUND"
  | "EVENT_REFERENCE_REQUIRED"
  | "PROFILE_INCOMPLETE"
  | "PROFILE_INVALID";

export class EventAdmissionJourneyError extends Error {
  constructor(
    readonly code: EventAdmissionJourneyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EventAdmissionJourneyError";
  }
}

export interface ApplyForEventAdmissionInput {
  actorId: string;
  displayName?: string | null;
  eventReference: string;
  responses: readonly EventInterviewResponseSubmission[];
}

export interface WithdrawEventAdmissionJourneyInput {
  actorId: string;
  eventReference: string;
  expectedApplicationVersion: number;
}

export interface GetEventAdmissionJourneyStateInput {
  actorId: string;
  eventReference: string;
}

export interface EventAdmissionJourneyState {
  admissionControlled: boolean;
  application: EventAdmissionApplication | null;
  eventId: string;
  policy: EventAdmissionPolicy | null;
}

export interface EventAdmissionJourneyService {
  apply(
    input: ApplyForEventAdmissionInput,
  ): Promise<EventAdmissionApplication>;
  getState(
    input: GetEventAdmissionJourneyStateInput,
  ): Promise<EventAdmissionJourneyState>;
  withdraw(
    input: WithdrawEventAdmissionJourneyInput,
  ): Promise<EventAdmissionApplication>;
}

function requiredIdentity(
  value: string,
  field: "actor" | "event reference",
): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) {
    throw new EventAdmissionJourneyError(
      field === "actor" ? "ACTOR_REQUIRED" : "EVENT_REFERENCE_REQUIRED",
      `An authenticated ${field} is required for event admission.`,
    );
  }
  return normalized;
}

function completeVerifiedProfile(input: {
  displayName?: string | null;
  responses: readonly EventProfileResponseSnapshot[];
}): {
  answers: EventParticipantProfileAnswers;
  displayName?: string;
  interviewResponses: readonly EventProfileResponseSnapshot[];
} {
  if (!Array.isArray(input.responses) || input.responses.length === 0) {
    throw new EventAdmissionJourneyError(
      "PROFILE_INCOMPLETE",
      "Server-verified adaptive interview responses are required.",
    );
  }
  const answeredFields = new Set<EventParticipantProfileField>();
  const responseIds = new Set<string>();
  const questionIds = new Set<string>();
  for (const response of input.responses) {
    if (
      !EVENT_PARTICIPANT_PROFILE_FIELDS.includes(response.field) ||
      answeredFields.has(response.field) ||
      !response.responseId?.trim() ||
      responseIds.has(response.responseId) ||
      !response.questionId?.trim() ||
      questionIds.has(response.questionId) ||
      response.questionSource !== "ai_adaptive" ||
      response.answerSource !== "participant" ||
      response.visibility !== "event_attendees" ||
      !response.question ||
      !response.generation ||
      response.generation.method !== "orbit-agent-model-adaptive" ||
      !response.answer.displayText.trim()
    ) {
      throw new EventAdmissionJourneyError(
        "PROFILE_INVALID",
        "Admission accepts only unique server-verified AI adaptive interview responses.",
      );
    }
    answeredFields.add(response.field);
    responseIds.add(response.responseId);
    questionIds.add(response.questionId);
  }
  const missingCore = EVENT_PROFILE_CORE_FIELDS.filter(
    (field) => !answeredFields.has(field),
  );
  if (missingCore.length > 0) {
    throw new EventAdmissionJourneyError(
      "PROFILE_INCOMPLETE",
      `Core event profile fields are unanswered: ${missingCore.join(", ")}.`,
    );
  }
  const answers = answersFromProfileResponses(input.responses);
  for (const field of answeredFields) {
    if (!answers[field]?.trim()) {
      throw new EventAdmissionJourneyError(
        "PROFILE_INVALID",
        `Verified event profile answer ${field} is invalid.`,
      );
    }
  }
  const displayName = input.displayName?.normalize("NFC").trim().slice(0, 200);
  return {
    answers,
    ...(displayName ? { displayName } : {}),
    // Preserve every question the server verified. Optional adaptive answers
    // are neither dropped nor synthesized when a participant was not asked.
    interviewResponses: input.responses.map((response) =>
      JSON.parse(JSON.stringify(response)) as EventProfileResponseSnapshot,
    ),
  };
}

export function createEventAdmissionJourneyService(input: {
  admissionService: EventAdmissionService;
  eventCoreService: EventCoreService;
  now?: () => Date;
  verifyResponses?: (input: {
    actorId: string;
    eventId: string;
    responses: readonly EventInterviewResponseSubmission[];
  }) => readonly EventProfileResponseSnapshot[];
}): EventAdmissionJourneyService {
  const now = input.now ?? (() => new Date());
  const verifyResponses =
    input.verifyResponses ?? verifyInterviewResponseSubmissions;

  async function canonicalEventId(eventReference: string): Promise<string> {
    const reference = requiredIdentity(eventReference, "event reference");
    const event = await input.eventCoreService.getPublishedEvent(reference, now());
    if (!event) {
      throw new EventAdmissionJourneyError(
        "CANONICAL_EVENT_NOT_FOUND",
        "A published canonical event is required for admission.",
      );
    }
    return event.eventId;
  }

  return {
    async apply(application) {
      const actorId = requiredIdentity(application.actorId, "actor");
      const eventId = await canonicalEventId(application.eventReference);
      const interviewResponses = verifyResponses({
        actorId,
        eventId,
        responses: application.responses,
      });
      return input.admissionService.submitApplication(actorId, {
        eventId,
        profilePayload: completeVerifiedProfile({
          displayName: application.displayName,
          responses: interviewResponses,
        }),
      });
    },
    async getState(query) {
      const actorId = requiredIdentity(query.actorId, "actor");
      const eventId = await canonicalEventId(query.eventReference);
      const [policy, application] = await Promise.all([
        input.admissionService.getPolicy(eventId),
        input.admissionService.getApplication(actorId, eventId),
      ]);
      return {
        admissionControlled: policy !== null,
        application,
        eventId,
        policy,
      };
    },
    async withdraw(withdrawal) {
      const actorId = requiredIdentity(withdrawal.actorId, "actor");
      const eventId = await canonicalEventId(withdrawal.eventReference);
      return input.admissionService.withdrawApplication(
        actorId,
        eventId,
        withdrawal.expectedApplicationVersion,
      );
    },
  };
}
