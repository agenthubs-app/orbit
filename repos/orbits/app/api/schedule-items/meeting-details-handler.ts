import { NextResponse } from "next/server";

import {
  createConfiguredOrbitScheduleMeetingDetailsService,
  OrbitScheduleMeetingDetailsError,
  type OrbitScheduleMeetingDetailsService,
} from "../../../features/events/orbit-schedule-meeting-details";
import { failure, success } from "../../../shared/api/envelope";
import { AppError } from "../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

type Context = { params: Promise<{ id: string }> };

export function createScheduleMeetingDetailsHandlers(dependencies?: {
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: () => OrbitScheduleMeetingDetailsService | null;
}) {
  async function boundary() {
    const actor = await (dependencies?.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return null;
    const service = (dependencies?.service ?? createConfiguredOrbitScheduleMeetingDetailsService)();
    if (!service) throw new AppError("SERVICE_UNAVAILABLE", "Schedule storage is not configured.");
    return { actor, service };
  }

  function errorResponse(error: unknown): Response {
    if (error instanceof OrbitScheduleMeetingDetailsError) {
      const code = error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "CONFLICT" ? "CONFLICT" : "VALIDATION_ERROR";
      const status = code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400;
      return NextResponse.json(failure(new AppError(code, error.message)), { status });
    }
    if (error instanceof AppError) return NextResponse.json(failure(error), { status: error.code === "SERVICE_UNAVAILABLE" ? 503 : 400 });
    return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Meeting details are temporarily unavailable.")), { status: 503 });
  }

  return {
    async GET(_request: Request, context: Context): Promise<Response> {
      try {
        const resolved = await boundary();
        if (!resolved) return authenticatedApiActorRequiredResponse("live");
        const { id } = await context.params;
        return NextResponse.json(success(await resolved.service.get({ actorId: resolved.actor.id, meetingId: id })));
      } catch (error) { return errorResponse(error); }
    },
    async PATCH(request: Request, context: Context): Promise<Response> {
      try {
        const resolved = await boundary();
        if (!resolved) return authenticatedApiActorRequiredResponse("live");
        const [{ id }, raw] = await Promise.all([context.params, request.json().catch(() => null)]);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OrbitScheduleMeetingDetailsError("VALIDATION_ERROR", "The request body must be a JSON object.");
        const body = raw as Record<string, unknown>;
        const key = request.headers.get("idempotency-key");
        if (typeof body.details !== "string" || body.details.length > 5_000 || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1 || !key || key !== key.trim() || key.length > 96 || !/^[\x21-\x7e]+$/.test(key)) {
          throw new OrbitScheduleMeetingDetailsError("VALIDATION_ERROR", "Meeting details request is invalid.");
        }
        const result = await resolved.service.updateDetails({ actorId: resolved.actor.id, details: body.details, expectedVersion: Number(body.expectedVersion), idempotencyKey: key, meetingId: id });
        return NextResponse.json(success({ ...result.appointment, replayed: result.replayed }));
      } catch (error) { return errorResponse(error); }
    },
  };
}
