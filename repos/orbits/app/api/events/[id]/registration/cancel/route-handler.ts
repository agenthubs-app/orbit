import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import { eventRegistrationRuntimeService } from "../../../../../../features/events/registration/runtime";
import type { EventRegistrationService } from "../../../../../../features/events/registration/service";
import type { ResolveEventAdmissionRegistrationControl } from "../../../../../../features/events/admission/registration-control";
import { EventRegistrationWindowError } from "../../../../../../features/events/registration/deadline-gated-service";

interface EventRegistrationCancelRouteContext {
  params: Promise<{ id: string }>;
}

async function cancellationPrecondition(request: Request): Promise<{
  expectedRegistrationVersion: string | null;
} | null> {
  if (!request.body) return null;
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new AppError("VALIDATION_ERROR", "Cancellation must be submitted as JSON.");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "The cancellation request is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "The cancellation request is invalid.");
  }
  const body = value as Record<string, unknown>;
  if (
    Reflect.ownKeys(body).some(
      (key) => key !== "expectedRegistrationVersion" && key !== "intent",
    ) ||
    body.intent !== "cancel" ||
    (body.expectedRegistrationVersion !== null &&
      (typeof body.expectedRegistrationVersion !== "string" ||
        !body.expectedRegistrationVersion.trim()))
  ) {
    throw new AppError("VALIDATION_ERROR", "The cancellation request is invalid.");
  }
  return {
    expectedRegistrationVersion:
      typeof body.expectedRegistrationVersion === "string"
        ? body.expectedRegistrationVersion.trim()
        : null,
  };
}

export function createEventRegistrationCancelRouteHandler(input: {
  registrationService?: EventRegistrationService;
  resolveAdmissionControl?: ResolveEventAdmissionRegistrationControl;
  resolveActor: () => Promise<{ id: string } | null>;
}) {
  const registrationService =
    input.registrationService ?? eventRegistrationRuntimeService;
  return async function POST(
    request: Request,
    context: EventRegistrationCancelRouteContext,
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
    const admissionControl = input.resolveAdmissionControl
      ? await input.resolveAdmissionControl(actor.id, id)
      : "legacy";
    if (admissionControl !== "legacy") {
      return NextResponse.json(
        failure(
          new AppError(
            admissionControl === "admission" ? "CONFLICT" : "SERVICE_UNAVAILABLE",
            admissionControl === "admission"
              ? "This event uses admission withdrawal; direct registration cancellation is disabled."
              : "The event admission state is temporarily unavailable; no registration was changed.",
          ),
        ),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: admissionControl === "admission" ? 409 : 503,
        },
      );
    }
    let precondition;
    try {
      precondition = await cancellationPrecondition(request);
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError("VALIDATION_ERROR", "The cancellation request is invalid.");
      return NextResponse.json(failure(appError), {
        headers: runtimeBoundaryHeaders(mode),
        status: 422,
      });
    }
    const existing = await registrationService.get({
      eventId: id,
      userId: actor.id,
    });
    if (
      existing?.status === "rsvped" &&
      precondition?.expectedRegistrationVersion &&
      precondition.expectedRegistrationVersion !== existing.updatedAt
    ) {
      return NextResponse.json(
        failure(
          new AppError(
            "CONFLICT",
            "The registration changed before cancellation. Refresh before trying again.",
          ),
        ),
        { headers: runtimeBoundaryHeaders(mode), status: 409 },
      );
    }
    let registration;
    try {
      registration = existing?.status === "cancelled"
        ? existing
        : await registrationService.cancel({ eventId: id, userId: actor.id });
    } catch (error) {
      if (!(error instanceof EventRegistrationWindowError)) throw error;
      return NextResponse.json(failure(new AppError(
        "SERVICE_UNAVAILABLE",
        "Event registration cancellation is temporarily unavailable; no registration was changed.",
        { cause: error },
      )), { headers: runtimeBoundaryHeaders(mode), status: 503 });
    }
    if (!registration) {
      return NextResponse.json(
        failure(
          new AppError(
            "NOT_FOUND",
            "No event registration exists to cancel.",
          ),
        ),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: 404,
        },
      );
    }

    return NextResponse.json(success({
      ...registration,
      mutationReceipt: {
        action: "cancel" as const,
        actorId: actor.id,
        eventId: registration.eventId,
        recordId: registration.id,
        registrationVersion: registration.updatedAt,
      },
    }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
