import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import { loadEventForRegistration } from "../../../../../features/events/registration/event-loader";
import { generateEventRegistrationQuestions } from "../../../../../features/events/registration/question-generator";
import {
  CURRENT_EVENT_REGISTRATION_USER_ID,
  eventRegistrationRuntimeService,
} from "../../../../../features/events/registration/runtime";
import type { EventParticipantProfileAnswers } from "../../../../../features/events/registration/contract";

export const dynamic = "force-dynamic";

interface EventRegistrationRouteContext {
  params: Promise<{ id: string }>;
}

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

export async function GET(
  request: Request,
  context: EventRegistrationRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const event = await loadEventForRegistration(id);

  if (!event) {
    return errorResponse(
      new AppError("NOT_FOUND", "The event could not be found."),
      404,
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const shouldGenerateQuestions = searchParams.get("questions") !== "false";
  const registration = await eventRegistrationRuntimeService.get({
    eventId: event.id,
    userId: CURRENT_EVENT_REGISTRATION_USER_ID,
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

export async function POST(
  request: Request,
  context: EventRegistrationRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const event = await loadEventForRegistration(id);

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

  const registration = await eventRegistrationRuntimeService.register({
    answers: await readAnswers(request),
    eventId: event.id,
    userId: CURRENT_EVENT_REGISTRATION_USER_ID,
  });

  return NextResponse.json(success(registration), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}

