import { NextResponse } from "next/server";

import {
  SyncCursorError,
} from "../../../features/sync/cursor";
import {
  SYNC_DEFAULT_LIMIT,
  SYNC_MAX_LIMIT,
  SyncReadError,
  createConfiguredIncrementalSyncReadService,
  type IncrementalSyncReadService,
} from "../../../features/sync/read-service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

export interface SyncRouteDependencies {
  createService?: () => IncrementalSyncReadService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function parseLimit(url: URL): number {
  if (!url.searchParams.has("limit")) return SYNC_DEFAULT_LIMIT;
  const raw = url.searchParams.get("limit");
  if (!raw || !/^\d+$/.test(raw)) {
    throw new AppError("VALIDATION_ERROR", "limit must be an integer between 1 and 200.");
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SYNC_MAX_LIMIT) {
    throw new AppError("VALIDATION_ERROR", "limit must be an integer between 1 and 200.");
  }
  return limit;
}

function unavailableResponse(mode: ReturnType<typeof resolveFeatureMode>): Response {
  return NextResponse.json(
    failure(new AppError("SERVICE_UNAVAILABLE", "Sync is temporarily unavailable.")),
    { headers: runtimeBoundaryHeaders(mode), status: 503 },
  );
}

export function createSyncRouteHandlers(
  dependencies: SyncRouteDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const createService = dependencies.createService ?? createConfiguredIncrementalSyncReadService;
  return {
    async GET(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);
      if (!actor.workspaceId) return unavailableResponse(mode);
      const service = createService();
      if (!service) return unavailableResponse(mode);
      try {
        const url = new URL(request.url);
        const hasCursor = url.searchParams.has("cursor");
        const cursor = url.searchParams.get("cursor") ?? "";
        const data = await service.readPage({
          actorId: actor.id,
          workspaceId: actor.workspaceId,
          limit: parseLimit(url),
          ...(hasCursor ? { cursor } : {}),
        });
        if (data.workspaceId !== actor.workspaceId) return unavailableResponse(mode);
        return NextResponse.json(success(data), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      } catch (error) {
        if (error instanceof SyncCursorError && error.code === "SYNC_RESET_REQUIRED") {
          return NextResponse.json(
            failure(
              new AppError("CONFLICT", "Sync cursor must be reset."),
              { syncErrorCode: "SYNC_RESET_REQUIRED" },
            ),
            { headers: runtimeBoundaryHeaders(mode), status: 409 },
          );
        }
        if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
          return NextResponse.json(failure(error), {
            headers: runtimeBoundaryHeaders(mode),
            status: 400,
          });
        }
        const cause = error instanceof SyncReadError ? error : undefined;
        return NextResponse.json(
          failure(new AppError(
            "SERVICE_UNAVAILABLE",
            "Sync is temporarily unavailable.",
            { cause: cause ?? error },
          )),
          { headers: runtimeBoundaryHeaders(mode), status: 503 },
        );
      }
    },
  };
}
