import { NextResponse } from "next/server";

import { createAppointmentMemoService } from "../../../features/appointments/memo-service";
import { createConfiguredAppointmentService } from "../../../features/appointments/runtime";
import type { AppointmentService } from "../../../features/appointments/service";
import { createConfiguredHumanEncounterService } from "../../../features/encounters/runtime";
import type { HumanEncounterService } from "../../../features/encounters/service";
import { failure, success } from "../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";
import { appointmentErrorResponse } from "./handlers";

export interface AppointmentMemoHandlerDependencies {
  appointmentService: () => Pick<AppointmentService, "get"> | null;
  encounterService: () => Pick<HumanEncounterService, "capture"> | null;
  resolveActor: ResolveAuthenticatedApiActor;
}

const configuredDependencies: AppointmentMemoHandlerDependencies = {
  appointmentService: createConfiguredAppointmentService,
  encounterService: createConfiguredHumanEncounterService,
  resolveActor: resolveAuthenticatedApiActor,
};

function text(value: unknown, label: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError("VALIDATION_ERROR", `${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AppError("VALIDATION_ERROR", `${label} is too long.`);
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new AppError("VALIDATION_ERROR", `${label} must be a string.`);
  if (value.length > maxLength) throw new AppError("VALIDATION_ERROR", `${label} is too long.`);
  return value.trim();
}

function contextFor(request: Request) {
  const search = new URL(request.url).searchParams;
  return {
    contactId: text(search.get("contactId"), "contactId"),
    eventId: text(search.get("eventId"), "eventId"),
  };
}

async function serviceFor(dependencies: AppointmentMemoHandlerDependencies) {
  const actor = await dependencies.resolveActor();
  if (!actor) return null;
  const appointments = dependencies.appointmentService();
  const encounters = dependencies.encounterService();
  if (!appointments || !encounters) throw new AppError("SERVICE_UNAVAILABLE", "Appointment memo storage is not configured.");
  return { actor, service: createAppointmentMemoService({ appointments, encounters }) };
}

function memoErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return NextResponse.json(failure(error), { status: getHttpStatusForAppErrorCode(error.code) });
  }
  return appointmentErrorResponse(error);
}

export function createAppointmentMemoGetHandler(dependencies: AppointmentMemoHandlerDependencies = configuredDependencies) {
  return async (request: Request, route: { params: Promise<{ id: string }> }): Promise<Response> => {
    try {
      const boundary = await serviceFor(dependencies);
      if (!boundary) return authenticatedApiActorRequiredResponse("live");
      const [{ id }, memoContext] = await Promise.all([route.params, Promise.resolve(contextFor(request))]);
      const entry = await boundary.service.getEntry({ actorId: boundary.actor.id, appointmentId: text(id, "appointmentId"), ...memoContext });
      return NextResponse.json(success(entry));
    } catch (error) {
      return memoErrorResponse(error);
    }
  };
}

export function createAppointmentMemoPostHandler(dependencies: AppointmentMemoHandlerDependencies = configuredDependencies) {
  return async (request: Request, route: { params: Promise<{ id: string }> }): Promise<Response> => {
    try {
      const boundary = await serviceFor(dependencies);
      if (!boundary) return authenticatedApiActorRequiredResponse("live");
      const [{ id }, body] = await Promise.all([route.params, request.json().catch(() => null)]);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("VALIDATION_ERROR", "The request body must be a JSON object.");
      const value = body as Record<string, unknown>;
      if (value.commitments !== undefined && (!Array.isArray(value.commitments) || value.commitments.length > 20 || value.commitments.some((item) => typeof item !== "string" || item.length > 500))) {
        throw new AppError("VALIDATION_ERROR", "commitments must be an array of at most 20 strings of at most 500 characters.");
      }
      const idempotencyKey = text(request.headers.get("idempotency-key"), "Idempotency-Key header", 96);
      if (!/^[\x21-\x7e]+$/.test(idempotencyKey)) throw new AppError("VALIDATION_ERROR", "Idempotency-Key must contain printable ASCII characters only.");
      const record = await boundary.service.capture({
        actorId: boundary.actor.id,
        appointmentId: text(id, "appointmentId"),
        commitments: value.commitments as readonly string[] | undefined,
        contactId: text(value.contactId, "contactId"),
        eventId: text(value.eventId, "eventId"),
        idempotencyKey,
        nextStep: optionalText(value.nextStep, "nextStep", 1_000),
        noteText: optionalText(value.noteText, "noteText", 5_000),
      });
      return NextResponse.json(success({
        appointmentId: id,
        contactId: record.contactId,
        encounterId: record.encounterId,
        eventId: record.eventId,
        occurredAt: record.observedAt,
        projection: record.projection,
      }), { status: 201 });
    } catch (error) {
      return memoErrorResponse(error);
    }
  };
}

export const getAppointmentMemo = createAppointmentMemoGetHandler();
export const postAppointmentMemo = createAppointmentMemoPostHandler();
