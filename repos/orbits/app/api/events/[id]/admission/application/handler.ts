import { NextResponse } from "next/server";

import {
  EventAdmissionError,
  type EventAdmissionApplication,
} from "../../../../../../features/events/admission/contract";
import { createConfiguredEventAdmissionJourneyService } from "../../../../../../features/events/admission/journey-runtime";
import {
  EventAdmissionJourneyError,
  type EventAdmissionJourneyService,
} from "../../../../../../features/events/admission/journey-service";
import {
  InterviewQuestionTokenError,
} from "../../../../../../features/events/registration/interview-question-token.server";
import type {
  EventInterviewResponseSubmission,
} from "../../../../../../features/events/registration/interview-response-contract";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

export interface EventAdmissionApplicationRouteContext {
  params: Promise<{ id: string }>;
}

export interface EventAdmissionApplicationHandlerDependencies {
  createService?: () => EventAdmissionJourneyService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function serviceFor(
  dependencies: EventAdmissionApplicationHandlerDependencies,
): EventAdmissionJourneyService {
  const service = (
    dependencies.createService ?? createConfiguredEventAdmissionJourneyService
  )();
  if (!service) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Canonical event admission is temporarily unavailable.",
    );
  }
  return service;
}

function validationError(message = "Event admission request is invalid."): AppError {
  return new AppError("VALIDATION_ERROR", message);
}

function admissionError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof InterviewQuestionTokenError) {
    return validationError(error.message);
  }
  if (error instanceof EventAdmissionJourneyError) {
    switch (error.code) {
      case "ACTOR_REQUIRED":
        return new AppError("UNAUTHORIZED", "Sign in is required.", {
          cause: error,
        });
      case "CANONICAL_EVENT_NOT_FOUND":
      case "EVENT_REFERENCE_REQUIRED":
        return new AppError("NOT_FOUND", error.message, { cause: error });
      case "PROFILE_INCOMPLETE":
      case "PROFILE_INVALID":
        return validationError(error.message);
    }
  }
  if (error instanceof EventAdmissionError) {
    switch (error.code) {
      case "FORBIDDEN":
        return new AppError("FORBIDDEN", error.message, { cause: error });
      case "NOT_CONFIGURED":
        return new AppError("NOT_FOUND", error.message, { cause: error });
      case "CAPACITY_FULL":
      case "INVALID_TRANSITION":
      case "VERSION_CONFLICT":
      case "WINDOW_CLOSED":
        return new AppError("CONFLICT", error.message, { cause: error });
      case "DATA_INVALID":
        return new AppError(
          "SERVICE_UNAVAILABLE",
          "Canonical event admission data is temporarily unavailable.",
          { cause: error },
        );
    }
  }
  return new AppError("INTERNAL_ERROR", "Event admission failed.", {
    cause: error,
  });
}

function errorResponse(error: unknown, mode: FeatureMode): Response {
  const appError = admissionError(error);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      privacy: "authenticated-actor-and-event-scoped",
      service: "canonical-event-admission-journey",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

function eventReference(value: string): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > 200) throw validationError();
  return normalized;
}

async function exactApplicationBody(
  request: Request,
): Promise<readonly EventInterviewResponseSubmission[]> {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") throw validationError();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validationError();
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw validationError();
  }
  const body = raw as Record<string, unknown>;
  if (
    Reflect.ownKeys(body).length !== 1 ||
    !Reflect.has(body, "responses") ||
    !Array.isArray(body.responses) ||
    body.responses.length === 0
  ) {
    throw validationError();
  }
  return body.responses.map((rawResponse) => {
    if (
      !rawResponse ||
      typeof rawResponse !== "object" ||
      Array.isArray(rawResponse)
    ) {
      throw validationError();
    }
    const response = rawResponse as Record<string, unknown>;
    const keys = Reflect.ownKeys(response);
    if (
      keys.length !== 2 ||
      !keys.includes("answer") ||
      !keys.includes("questionToken") ||
      typeof response.answer !== "string" ||
      !response.answer.trim() ||
      typeof response.questionToken !== "string" ||
      !response.questionToken.trim()
    ) {
      throw validationError();
    }
    return {
      answer: response.answer,
      questionToken: response.questionToken,
    };
  });
}

async function exactWithdrawalBody(request: Request): Promise<number> {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") throw validationError();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validationError();
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw validationError();
  }
  const body = raw as Record<string, unknown>;
  if (
    Reflect.ownKeys(body).length !== 1 ||
    !Number.isSafeInteger(body.expectedApplicationVersion) ||
    Number(body.expectedApplicationVersion) < 1
  ) {
    throw validationError();
  }
  return Number(body.expectedApplicationVersion);
}

function responseFor(
  application: EventAdmissionApplication,
  mode: FeatureMode,
): Response {
  return NextResponse.json(success(application), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}

export function createEventAdmissionApplicationPostHandler(
  dependencies: EventAdmissionApplicationHandlerDependencies = {},
) {
  return async function POST(
    request: Request,
    context: EventAdmissionApplicationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor?.id?.trim()) return authenticatedApiActorRequiredResponse(mode);
    try {
      const reference = eventReference((await context.params).id);
      const submissions = await exactApplicationBody(request);
      const application = await serviceFor(dependencies).apply({
        actorId: actor.id,
        displayName: actor.name,
        eventReference: reference,
        responses: submissions,
      });
      return responseFor(application, mode);
    } catch (error) {
      return errorResponse(error, mode);
    }
  };
}

export function createEventAdmissionApplicationGetHandler(
  dependencies: EventAdmissionApplicationHandlerDependencies = {},
) {
  return async function GET(
    _request: Request,
    context: EventAdmissionApplicationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor?.id?.trim()) return authenticatedApiActorRequiredResponse(mode);
    try {
      const state = await serviceFor(dependencies).getState({
        actorId: actor.id,
        eventReference: eventReference((await context.params).id),
      });
      return NextResponse.json(success(state.application), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    } catch (error) {
      return errorResponse(error, mode);
    }
  };
}

export function createEventAdmissionApplicationDeleteHandler(
  dependencies: EventAdmissionApplicationHandlerDependencies = {},
) {
  return async function DELETE(
    request: Request,
    context: EventAdmissionApplicationRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor?.id?.trim()) return authenticatedApiActorRequiredResponse(mode);
    try {
      const expectedApplicationVersion = await exactWithdrawalBody(request);
      const application = await serviceFor(dependencies).withdraw({
        actorId: actor.id,
        eventReference: eventReference((await context.params).id),
        expectedApplicationVersion,
      });
      return responseFor(application, mode);
    } catch (error) {
      return errorResponse(error, mode);
    }
  };
}
