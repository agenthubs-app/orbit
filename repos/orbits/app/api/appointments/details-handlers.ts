import { NextResponse } from "next/server";

import { createConfiguredAppointmentService } from "../../../features/appointments/runtime";
import type { AppointmentService } from "../../../features/appointments/service";
import { failure, success } from "../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";
import { appointmentErrorResponse, publicAppointment } from "./handlers";

export interface AppointmentDetailsHandlerDependencies {
  appointmentService: () => Pick<AppointmentService, "updateDetails"> | null;
  resolveActor: ResolveAuthenticatedApiActor;
}

const configuredDependencies: AppointmentDetailsHandlerDependencies = {
  appointmentService: createConfiguredAppointmentService,
  resolveActor: resolveAuthenticatedApiActor,
};

function validationError(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message);
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return NextResponse.json(failure(error), { status: getHttpStatusForAppErrorCode(error.code) });
  }
  return appointmentErrorResponse(error);
}

export function createAppointmentDetailsPatchHandler(dependencies: AppointmentDetailsHandlerDependencies = configuredDependencies) {
  return async (request: Request, route: { params: Promise<{ id: string }> }): Promise<Response> => {
    try {
      const actor = await dependencies.resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const service = dependencies.appointmentService();
      if (!service) throw new AppError("SERVICE_UNAVAILABLE", "Appointment storage is not configured.");
      const [{ id }, rawBody] = await Promise.all([route.params, request.json().catch(() => null)]);
      if (typeof id !== "string" || !id.trim() || id.length > 256) throw validationError("appointmentId is invalid.");
      if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) throw validationError("The request body must be a JSON object.");
      const body = rawBody as Record<string, unknown>;
      if (typeof body.details !== "string" || body.details.length > 5_000) throw validationError("details must be a string of at most 5000 characters.");
      if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw validationError("expectedVersion must be a positive integer.");
      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey || idempotencyKey !== idempotencyKey.trim() || idempotencyKey.length > 96 || !/^[\x21-\x7e]+$/.test(idempotencyKey)) throw validationError("A printable ASCII Idempotency-Key header of at most 96 characters is required.");
      const result = await service.updateDetails({
        actorId: actor.id,
        appointmentId: id.trim(),
        details: body.details,
        expectedVersion: Number(body.expectedVersion),
        idempotencyKey,
      });
      return NextResponse.json(success({ ...publicAppointment(result.appointment, actor.id), replayed: result.replayed }));
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const patchAppointmentDetails = createAppointmentDetailsPatchHandler();
