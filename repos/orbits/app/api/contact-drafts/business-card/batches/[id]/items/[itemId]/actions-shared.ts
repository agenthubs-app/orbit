import { NextResponse } from "next/server";

import {
  createConfiguredBusinessCardBatchService,
  type BusinessCardBatchService,
} from "../../../../../../../../features/acquisition/business-card-batch-service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../../../_shared/authenticated-actor";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/** skip 与 retry 只差一个 service 方法调用；共享同一个 handler 工厂。 */
export function createBusinessCardBatchItemActionHandler(
  action: "retry" | "skip",
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  service: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
) {
  return async function POST(_request: Request, context: RouteContext): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    if (!service) {
      const error = new AppError(
        "SERVICE_UNAVAILABLE",
        "Business-card batch import requires a configured live database.",
      );

      return NextResponse.json(failure(error), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(error.code),
      });
    }

    const { id, itemId } = await context.params;
    const input = {
      actorId: actor.id,
      batchId: id,
      itemId,
      now: new Date().toISOString(),
    };

    try {
      if (action === "skip") {
        await service.skipItem(input);
      } else {
        await service.retryItem(input);
      }
    } catch (error) {
      const appError = new AppError(
        "CONFLICT",
        error instanceof Error ? error.message : `Batch item ${action} failed.`,
      );

      return NextResponse.json(failure(appError), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      });
    }

    return NextResponse.json(success({ state: action === "skip" ? "skipped" : "pending" }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
