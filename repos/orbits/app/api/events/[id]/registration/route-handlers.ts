import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import type { EventParticipantProfileAnswers } from "../../../../../features/events/registration/contract";
import {
  answersFromProfileResponses,
  missingCoreProfileFields,
  type EventInterviewResponseSubmission,
  type EventProfileResponseSnapshot,
} from "../../../../../features/events/registration/interview-response-contract";
import {
  InterviewQuestionTokenError,
  verifyInterviewResponseSubmissions,
} from "../../../../../features/events/registration/interview-question-token.server";
import { EventRegistrationWindowError } from "../../../../../features/events/registration/deadline-gated-service";
import { loadEventForRegistration } from "../../../../../features/events/registration/event-loader";
import { generateEventRegistrationQuestions } from "../../../../../features/events/registration/question-generator";
import { eventRegistrationRuntimeService } from "../../../../../features/events/registration/runtime";
import type { EventRegistrationService } from "../../../../../features/events/registration/service";
import type { ResolveEventAdmissionRegistrationControl } from "../../../../../features/events/admission/registration-control";

interface EventRegistrationRouteContext {
  params: Promise<{ id: string }>;
}

type RegistrationActor = { id: string; name?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRegistrationPayload(
  request: Request,
  input: { actorId: string; eventId: string },
): Promise<{
  answers: EventParticipantProfileAnswers;
  interviewResponses: readonly EventProfileResponseSnapshot[];
}> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return { answers: {}, interviewResponses: [] };
  }

  try {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) return { answers: {}, interviewResponses: [] };
    if (Array.isArray(body.responses)) {
      const submissions = body.responses.flatMap((value) => {
        if (
          !isRecord(value) ||
          typeof value.answer !== "string" ||
          typeof value.questionToken !== "string"
        ) {
          return [];
        }
        return [
          {
            answer: value.answer,
            questionToken: value.questionToken,
          } satisfies EventInterviewResponseSubmission,
        ];
      });
      if (submissions.length !== body.responses.length) {
        throw new InterviewQuestionTokenError(
          "INTERVIEW_QUESTION_TOKEN_INVALID",
          "Every interview response must include a question token and answer.",
        );
      }
      const interviewResponses = verifyInterviewResponseSubmissions({
        actorId: input.actorId,
        eventId: input.eventId,
        responses: submissions,
      });
      const missingCore = missingCoreProfileFields(interviewResponses);
      if (missingCore.length > 0) {
        throw new InterviewQuestionTokenError(
          "INTERVIEW_CORE_FIELDS_REQUIRED",
          `Core event profile fields are still unanswered: ${missingCore.join(", ")}.`,
        );
      }
      return {
        answers: answersFromProfileResponses(interviewResponses),
        interviewResponses,
      };
    }
    return {
      answers: isRecord(body.answers)
        ? (body.answers as EventParticipantProfileAnswers)
        : {},
      interviewResponses: [],
    };
  } catch (error) {
    if (error instanceof InterviewQuestionTokenError) throw error;
    return { answers: {}, interviewResponses: [] };
  }
}

function errorResponse(error: AppError, status: number): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(failure(error), {
    headers: runtimeBoundaryHeaders(mode),
    status,
  });
}

export function createEventRegistrationRouteHandlers(input: {
  loadEvent?: typeof loadEventForRegistration;
  registrationService?: EventRegistrationService;
  resolveAdmissionControl?: ResolveEventAdmissionRegistrationControl;
  resolveActor: () => Promise<RegistrationActor | null>;
}) {
  const registrationService =
    input.registrationService ?? eventRegistrationRuntimeService;
  const loadEvent = input.loadEvent ?? loadEventForRegistration;
  async function GET(
    request: Request,
    context: EventRegistrationRouteContext,
  ): Promise<Response> {
    const actor = await input.resolveActor();
    if (!actor?.id) {
      return NextResponse.json(
        failure(new AppError("UNAUTHORIZED", "Sign in is required.")),
        { status: 401 },
      );
    }

    const mode = resolveFeatureMode();
    const { id } = await context.params;
    const event = await loadEvent(id, actor.id);
    if (!event) {
      return errorResponse(
        new AppError("NOT_FOUND", "The event could not be found."),
        404,
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const shouldGenerateQuestions = searchParams.get("questions") !== "false";
    const registration = await registrationService.get({
      eventId: event.id,
      userId: actor.id,
    });
    const questionSet = shouldGenerateQuestions
      ? await generateEventRegistrationQuestions({
          event,
          language: searchParams.get("language") === "en" ? "en" : "zh",
        })
      : {
          provenance: {
            aiProviderRequested: false,
            externalNetworkRequested: false,
            fallbackReason: "QUESTIONS_NOT_REQUESTED",
            generationMethod: "deterministic-not-requested" as const,
            model: null,
            provider: null,
          },
          questions: [],
        };

    return NextResponse.json(success({ questionSet, registration }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  async function POST(
    request: Request,
    context: EventRegistrationRouteContext,
  ): Promise<Response> {
    const actor = await input.resolveActor();
    if (!actor?.id) {
      return NextResponse.json(
        failure(new AppError("UNAUTHORIZED", "Sign in is required.")),
        { status: 401 },
      );
    }

    const mode = resolveFeatureMode();
    const { id } = await context.params;
    const event = await loadEvent(id, actor.id);
    if (!event) {
      return errorResponse(
        new AppError("NOT_FOUND", "The event could not be found."),
        404,
      );
    }
    if (!["confirmed", "imported"].includes(event.status)) {
      return errorResponse(
        new AppError("CONFLICT", "This event is not open for registration."),
        409,
      );
    }

    const admissionControl = input.resolveAdmissionControl
      ? await input.resolveAdmissionControl(actor.id, event.id)
      : "legacy";
    if (admissionControl === "admission") {
      return errorResponse(
        new AppError(
          "CONFLICT",
          "This event uses the admission application flow; direct registration is disabled.",
        ),
        409,
      );
    }
    if (admissionControl === "unavailable") {
      return errorResponse(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "The event admission state is temporarily unavailable; no registration was changed.",
        ),
        503,
      );
    }

    let registration;
    try {
      const payload = await readRegistrationPayload(request, {
        actorId: actor.id,
        eventId: event.id,
      });
      registration = await registrationService.register({
        answers: payload.answers,
        displayName: actor.name,
        eventId: event.id,
        interviewResponses: [...payload.interviewResponses],
        userId: actor.id,
      });
    } catch (error) {
      if (error instanceof InterviewQuestionTokenError) {
        return errorResponse(
          new AppError("VALIDATION_ERROR", error.message),
          422,
        );
      }
      if (error instanceof EventRegistrationWindowError) {
        const unavailable = [
          "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
          "EVENT_REGISTRATION_WINDOW_INVALID",
        ].includes(error.code);
        return errorResponse(
          new AppError(
            unavailable ? "SERVICE_UNAVAILABLE" : "CONFLICT",
            error.message,
          ),
          unavailable ? 503 : 409,
        );
      }
      throw error;
    }

    return NextResponse.json(success(registration), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  return { GET, POST };
}
