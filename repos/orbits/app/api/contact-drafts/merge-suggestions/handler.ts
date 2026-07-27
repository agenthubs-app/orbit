import { NextResponse } from "next/server";

import {
  duplicateMergeFailureContext,
  duplicateMergeFailureToAppError,
} from "../../../../features/acquisition/merge-contract";
import { createDuplicateMergeServiceForActor } from "../../../../features/acquisition/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export function createDuplicateMergeSuggestionsGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(request: Request): Promise<Response> {
    // 该接口只读，不执行合并动作，但联系人候选必须按服务端 actor 隔离。
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const searchParams = new URL(request.url).searchParams;
    const mergeService = createDuplicateMergeServiceForActor(actor.id, mode);
    const result = await mergeService.listMergeSuggestions({
      scenario: searchParams.get("scenario"),
    });

    if (result.success === false) {
      const appError = duplicateMergeFailureToAppError(result);

      return NextResponse.json(
        failure(appError, duplicateMergeFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
