import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { readHomeGuideProgress } from "../../../../features/home/guide-progress";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import type { GuideRealProgress } from "../../../../shared/compute/guide-real-progress";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

export function createHomeGuideProgressHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  readProgress?: typeof readHomeGuideProgress;
} = {}) {
  return async function GET(): Promise<Response> {
    const headers = runtimeBoundaryHeaders("live");
    const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) {
      const error = new AppError("UNAUTHORIZED", "Sign in to access this resource.");
      return NextResponse.json(failure(error), { headers, status: getHttpStatusForAppErrorCode(error.code) });
    }
    const progress: GuideRealProgress = await (deps.readProgress ?? readHomeGuideProgress)({ actorId: actor.id, userId: actor.userId });
    if (progress.kind === "unavailable") {
      const error = new AppError("SERVICE_UNAVAILABLE", "Guide progress cannot be read right now.");
      return NextResponse.json(failure(error, { reason: "GUIDE_PROGRESS_UNAVAILABLE" }), { headers, status: 503 });
    }
    return NextResponse.json(success(progress), { headers, status: 200 });
  };
}

export const GET = createHomeGuideProgressHandler();
