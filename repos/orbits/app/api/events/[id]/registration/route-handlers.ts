import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import type { EventParticipantProfileAnswers } from "../../../../../features/events/registration/contract";
import { EventRegistrationWindowError } from "../../../../../features/events/registration/deadline-gated-service";
import { loadEventForRegistration } from "../../../../../features/events/registration/event-loader";
import { generateEventRegistrationQuestions } from "../../../../../features/events/registration/question-generator";
import { eventRegistrationRuntimeService } from "../../../../../features/events/registration/runtime";
import type { EventRegistrationService } from "../../../../../features/events/registration/service";

interface EventRegistrationRouteContext {
  params: Promise<{ id: string }>;
}

type RegistrationActor = { id: string; name?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readAnswers(
  request: Request,
): Promise<EventParticipantProfileAnswers> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return {};
  }

  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) && isRecord(body.answers)
      ? (body.answers as EventParticipantProfileAnswers)
      : {};
  } catch {
    return {};
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
  registrationService?: EventRegistrationService;
  resolveActor: () => Promise<RegistrationActor | null>;
}) {
  const registrationService =
    input.registrationService ?? eventRegistrationRuntimeService;
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
    const event = await loadEventForRegistration(id, actor.id);
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
    const event = await loadEventForRegistration(id, actor.id);
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

    let registration;
    try {
      registration = await registrationService.register({
        answers: await readAnswers(request),
        displayName: actor.name,
        eventId: event.id,
        userId: actor.id,
      });
    } catch (error) {
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
