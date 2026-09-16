import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { createAssociationOptionsService } from "../../../../features/personal-schedule/association-options";
import { createAssociationSummaryReader } from "../../../../features/personal-schedule/association-summary-reader";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import { personalScheduleAssociationOptionsPageSchema } from "../../../../shared/api-schema/personal-schedule-associations";
import { AppError } from "../../../../shared/errors/app-error";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { taskErrorResponse, taskSuccessResponse } from "../../tasks/route-support";
import type { PersonalScheduleAssociationKind } from "../../../../shared/contract/personal-schedule-associations";

export function createAssociationOptionsGetHandler(kind: PersonalScheduleAssociationKind, dependencies?: { resolveActor?: ResolveAuthenticatedApiActor; service?: ReturnType<typeof createAssociationOptionsService> }) {
  return async (request: Request): Promise<Response> => {
    const actor = await (dependencies?.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const params = new URL(request.url).searchParams;
      const allowed = new Set(["q", "cursor", "limit"]);
      if ([...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1)) throw new AppError("VALIDATION_ERROR", "Invalid association search parameters.");
      const q = params.get("q") ?? "";
      const rawLimit = params.get("limit") ?? "20";
      const limit = Number(rawLimit);
      const cursor = params.get("cursor") ?? undefined;
      if (q.length > 200 || !/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 20 || (cursor !== undefined && (!cursor || cursor.length > 2048))) throw new AppError("VALIDATION_ERROR", "Invalid association search parameters.");
      let service = dependencies?.service;
      if (!service) {
        const runtime = createConfiguredPostgresLiveRecordStore();
        if (!runtime) throw new AppError("SERVICE_UNAVAILABLE", "Association storage is not configured.");
        service = createAssociationOptionsService(createAssociationSummaryReader(runtime));
      }
      const result = personalScheduleAssociationOptionsPageSchema.parse(await service({ actorId: actor.id, kind, q, limit, ...(cursor ? { cursor } : {}) }));
      if (result.actorId !== actor.id || result.kind !== kind) throw new Error("Invalid association response scope.");
      return taskSuccessResponse(result);
    } catch (error) {
      // Only these fixed service validation failures are safe business errors.
      if (error instanceof Error && ["Invalid association cursor.", "Invalid association search input."].includes(error.message)) return taskErrorResponse(new AppError("VALIDATION_ERROR", error.message));
      if (error instanceof Error && error.message === "Association choices changed. Search again.") return taskErrorResponse(new AppError("CONFLICT", error.message));
      return taskErrorResponse(error);
    }
  };
}
