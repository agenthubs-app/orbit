import { NextResponse } from "next/server";

import { failure, success } from "../../../../shared/api/envelope";
import { schedulingAvailabilitySchema, schedulingAvailabilityUpdateInputSchema } from "../../../../shared/api-schema/scheduling-availability";
import { AppError, getHttpStatusForAppErrorCode, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../../shared/errors/app-error";
import {
  createConfiguredSchedulingAvailabilityStore,
  type SchedulingAvailabilityStore,
} from "../../../../features/scheduling/availability-store";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

// contact-reach R40 (DESIGN D4): GET/PUT /api/scheduling/availability. Signed-in
// only, the caller's own record only, never cached. A client that cannot read it
// (5xx / offline) uses DEFAULT_SCHEDULING_AVAILABILITY and keeps going.
const HEADERS = { "Cache-Control": "private, no-store" } as const;

function reply(error: AppError, context?: Record<string, string>): Response {
  return NextResponse.json(failure(error, context), { headers: HEADERS, status: getHttpStatusForAppErrorCode(error.code) });
}

export interface SchedulingAvailabilityRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  /** null → storage unavailable (503). */
  store?: () => SchedulingAvailabilityStore | null;
}

export function createSchedulingAvailabilityRouteHandlers(dependencies: SchedulingAvailabilityRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const resolveStore = dependencies.store ?? createConfiguredSchedulingAvailabilityStore;
  const run = async (actorId: string, operation: (actorId: string, store: SchedulingAvailabilityStore) => Promise<unknown>): Promise<Response> => {
    const store = resolveStore();
    if (!store) return reply(new AppError("SERVICE_UNAVAILABLE", "Scheduling availability storage is unavailable."), { reason: "SCHEDULING_AVAILABILITY_UNCONFIGURED" });
    try {
      const data = schedulingAvailabilitySchema.parse(await operation(actorId, store));
      return NextResponse.json(success(data), { headers: HEADERS });
    } catch {
      console.error(JSON.stringify({ event: "scheduling_availability_route_failed", code: "STORAGE_ERROR" }));
      return reply(new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE));
    }
  };
  return {
    async GET(): Promise<Response> {
      const actor = await resolveActor();
      if (!actor?.id) return reply(new AppError("UNAUTHORIZED", "Sign in to access this resource."));
      return run(actor.id, (actorId, store) => store.get(actorId));
    },
    async PUT(request: Request): Promise<Response> {
      const actor = await resolveActor();
      if (!actor?.id) return reply(new AppError("UNAUTHORIZED", "Sign in to access this resource."));
      const parsed = schedulingAvailabilityUpdateInputSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return reply(new AppError("VALIDATION_ERROR", "The request body is not valid."), { field: parsed.error.issues[0]?.path.join(".") || "body" });
      return run(actor.id, (actorId, store) => store.put(actorId, parsed.data));
    },
  };
}
