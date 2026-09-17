import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../../_shared/authenticated-actor";
import type { createEventRegistrationPortraitService } from "../../../../../../features/events/registration/portrait/service";
import { createEventRegistrationPortraitRuntime } from "../../../../../../features/events/registration/portrait/runtime";
import { PortraitError } from "../../../../../../features/events/registration/portrait/contract";
import { portraitSaveInputSchema } from "../../../../../../shared/api-schema/event-registration-portrait";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode, type FeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../../../../../shared/errors/app-error";
import type { PortraitSaveBody } from "../../../../../../shared/contract/event-registration-portrait";

export type PortraitService = ReturnType<typeof createEventRegistrationPortraitService>;
export interface PortraitRouteContext { params: Promise<{ id: string }> }
export function portraitErrorResponse(error: unknown, mode: FeatureMode): Response {
  const known = error instanceof PortraitError;
  const status = known ? error.status : 503;
  const code: AppErrorCode = status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : status === 422 ? "VALIDATION_ERROR" : "SERVICE_UNAVAILABLE";
  return Response.json(failure(new AppError(code, known ? error.message : "Portrait storage is unavailable."), { portraitCode: known ? error.code : "PORTRAIT_STORAGE_UNAVAILABLE" }), { status, headers: runtimeBoundaryHeaders(mode) });
}
export function createPortraitGetHandler(resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor, getService: () => PortraitService | null = () => createEventRegistrationPortraitRuntime()?.service ?? null) {
  return async (request: Request, context: PortraitRouteContext): Promise<Response> => {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    try {
      const query = new URL(request.url).searchParams;
      const subjectId = query.get("actorId") ?? undefined;
      if ([...query.keys()].some((key) => key !== "actorId") || query.getAll("actorId").length > 1 || subjectId !== undefined && (!subjectId.trim() || subjectId.length > 256)) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "A single non-empty portrait subject is required.");
      const { id } = await context.params;
      if (!id.trim() || id.length > 256) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "A valid event ID is required.");
      const service = getService();
      if (!service) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait storage is unavailable.");
      return Response.json(success(await service.read({ actorId: actor.id, eventId: id, subjectId })), { headers: runtimeBoundaryHeaders(mode) });
    } catch (error) { return portraitErrorResponse(error, mode); }
  };
}
export function createPortraitPostHandler(resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor, getService: () => PortraitService | null = () => createEventRegistrationPortraitRuntime()?.service ?? null) {
  return async (request: Request, context: PortraitRouteContext): Promise<Response> => {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    try {
      const body = portraitSaveInputSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "Only a signed preview, mutation ID and expected portrait version can be saved.");
      const { id } = await context.params;
      if (!id.trim() || id.length > 256) throw new PortraitError(422, "PORTRAIT_INPUT_INVALID", "A valid event ID is required.");
      const service = getService();
      if (!service) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait storage is unavailable.");
      return Response.json(success(await service.save({ actorId: actor.id, eventId: id, mutation: body.data as PortraitSaveBody })), { headers: runtimeBoundaryHeaders(mode) });
    } catch (error) { return portraitErrorResponse(error, mode); }
  };
}
