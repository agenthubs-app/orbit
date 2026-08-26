import { NextResponse } from "next/server";

import {
  createConfiguredBusinessCardBatchService,
  type BusinessCardBatchService,
} from "../../../../../../features/acquisition/business-card-batch-service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

type RouteContext = { params: Promise<{ id: string }> };

export function createBusinessCardBatchDetailHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  service: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
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

    const { id } = await context.params;
    const detail = await service.getBatch(actor.id, id);

    if (!detail) {
      const error = new AppError("NOT_FOUND", `Business-card batch ${id} was not found.`);

      return NextResponse.json(failure(error), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(error.code),
      });
    }

    // 处理中不下发 extraction，控制轮询响应体积；ready 后确认界面需要全量。
    const items =
      detail.batch.status === "processing"
        ? detail.items.map(({ extraction: _extraction, ...rest }) => rest)
        : detail.items;

    return NextResponse.json(success({ batch: detail.batch, items }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
