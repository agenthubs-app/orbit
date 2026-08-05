import { NextResponse } from "next/server";

import { createConfiguredConfirmedEventFollowupService } from "../../../../../../features/events/confirmed-followup/runtime";
import type { ConfirmedEventFollowupService, ConfirmedFollowupSourceKind } from "../../../../../../features/events/confirmed-followup/service";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../../shared/api/envelope";
import type { FeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../../../shared/errors/app-error";
import { withRegisteredEventAccess, type RegisteredEventAccessDependencies } from "../../registered-event-access";

interface Context {
  params: Promise<{ id: string }>;
}

interface Dependencies extends RegisteredEventAccessDependencies {
  now?: () => string;
  service?: ConfirmedEventFollowupService | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function serviceFor(
  dependencies: Dependencies,
  actorId: string,
): ConfirmedEventFollowupService | null {
  return dependencies.service === undefined
    ? createConfiguredConfirmedEventFollowupService(actorId)
    : dependencies.service;
}

function unavailable(mode: FeatureMode): Response {
  const error = new AppError("SERVICE_UNAVAILABLE", "Confirmed event follow-up storage is not configured.");
  return NextResponse.json(failure(error), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(error.code),
  });
}

function requireEnded(endsAt: string, now: string): void {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end) || end > Date.parse(now)) {
    throw new AppError("CONFLICT", "Confirmed follow-ups become available after the event ends.");
  }
}

export function createConfirmedEventFollowupsGetHandler(
  dependencies: Dependencies = {},
) {
  return withRegisteredEventAccess(async function getConfirmedEventFollowups(
    _request: Request,
    _context: Context,
    access,
  ): Promise<Response> {
    const service = serviceFor(dependencies, access.actor.id);
    if (!service) return unavailable(access.mode);
    try {
      requireEnded(access.event.endsAt, dependencies.now?.() ?? new Date().toISOString());
      return NextResponse.json(success(await service.list({
        actorId: access.actor.id,
        eventId: access.eventId,
      })), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: 200,
      });
    } catch (cause) {
      const error = toAppError(cause);
      return NextResponse.json(failure(error), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: getHttpStatusForAppErrorCode(error.code),
      });
    }
  }, dependencies);
}

export function createConfirmedEventFollowupsPostHandler(
  dependencies: Dependencies = {},
) {
  return withRegisteredEventAccess(async function confirmEventFollowup(
    request: Request,
    _context: Context,
    access,
  ): Promise<Response> {
    const service = serviceFor(dependencies, access.actor.id);
    if (!service) return unavailable(access.mode);
    try {
      requireEnded(access.event.endsAt, dependencies.now?.() ?? new Date().toISOString());
      if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
        throw new AppError("VALIDATION_ERROR", "An application/json request body is required.");
      }
      const body = record(await request.json().catch(() => null));
      const allowedKeys = new Set(["dueAt", "encounterId", "sourceIndex", "sourceKind"]);
      if (body && Object.keys(body).some((key) => !allowedKeys.has(key))) {
        throw new AppError("VALIDATION_ERROR", "The request contains unsupported fields.");
      }
      const sourceKind: ConfirmedFollowupSourceKind | null = body?.sourceKind === "next_step" || body?.sourceKind === "commitment"
        ? body.sourceKind
        : null;
      if (!body || typeof body.encounterId !== "string" || !sourceKind || !Number.isSafeInteger(body.sourceIndex)) {
        throw new AppError("VALIDATION_ERROR", "encounterId, sourceKind, and sourceIndex are required.");
      }
      if (body.dueAt !== undefined && body.dueAt !== null && typeof body.dueAt !== "string") {
        throw new AppError("VALIDATION_ERROR", "dueAt must be null or an ISO date-time string.");
      }
      const data = await service.confirm({
        actorId: access.actor.id,
        dueAt: typeof body.dueAt === "string" ? body.dueAt : null,
        encounterId: body.encounterId,
        eventId: access.eventId,
        sourceIndex: body.sourceIndex as number,
        sourceKind,
      });
      return NextResponse.json(success(data), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: 201,
      });
    } catch (cause) {
      const error = toAppError(cause);
      return NextResponse.json(failure(error), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: getHttpStatusForAppErrorCode(error.code),
      });
    }
  }, dependencies);
}
