import { NextResponse } from "next/server";
import { resolveAuthenticatedApiActor } from "../_shared/authenticated-actor";
import { readRelationshipTaskSummaries } from "../../../features/connections/lifecycle/task-list";
import { AppError } from "../../../shared/errors/app-error";
import { success } from "../../../shared/api/envelope";
import { lifecycleErrorResponse } from "../connections/[id]/lifecycle/handler";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  try {
    const actor = await resolveAuthenticatedApiActor();
    if (!actor) throw new AppError("UNAUTHORIZED", "Sign in to access this resource.");
    return NextResponse.json(success({ tasks: await readRelationshipTaskSummaries(actor.id) }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return lifecycleErrorResponse(error); }
}
