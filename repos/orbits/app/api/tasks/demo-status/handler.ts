import { NextResponse } from "next/server";

import { readTaskDemoDecisionForActor } from "../../../(app)/app/tasks/task-demo-decision";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { AppError } from "../../../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

/** Task reads the same actor-scoped demo decision as the guide and Home. */
export function createTaskDemoStatusHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  readDemo?: typeof readTaskDemoDecisionForActor;
} = {}) {
  return async function GET(): Promise<Response> {
    const headers = runtimeBoundaryHeaders("live");
    const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return NextResponse.json(failure(new AppError("UNAUTHORIZED", "Sign in to access this resource.")), { headers, status: 401 });
    try {
      const view = await (deps.readDemo ?? readTaskDemoDecisionForActor)({ actorId: actor.id, userId: actor.userId ?? null });
      return NextResponse.json(success({ inDemo: view !== null, view }), { headers, status: 200 });
    } catch {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Task demo status is unavailable.")), { headers, status: 503 });
    }
  };
}
