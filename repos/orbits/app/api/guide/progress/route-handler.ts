import { NextResponse } from "next/server";

import { readStartGuideForActor, type StartGuideRead } from "../../../../features/guide/progress";
import { deriveStartGuideFlags } from "../../../../features/guide/start-steps";
import { createProfileService } from "../../../../features/profile/service-factory";
import { success, failure, runtimeBoundaryHeaders } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError } from "../../../../shared/errors/app-error";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";

export function createGuideProgressRouteHandler(dependencies: {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readGoal?: (actorId: string) => Promise<string>;
  readGuide?: (input: { actorId: string; relationshipGoal: string; userId?: string | null }) => Promise<StartGuideRead>;
} = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readGoal = dependencies.readGoal ?? (async (actorId: string) => {
    const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
    if (!result.success) throw new Error("Profile unavailable");
    return result.data.profile?.relationshipGoal ?? "";
  });
  const readGuide = dependencies.readGuide ?? readStartGuideForActor;
  return async function GET(): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await resolveActor();
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
    try {
      const relationshipGoal = await readGoal(actor.id);
      const guide = await readGuide({ actorId: actor.id, relationshipGoal, userId: actor.userId });
      if (guide.kind !== "ready") throw new AppError("SERVICE_UNAVAILABLE", "Guide progress is unavailable.");
      const flags = deriveStartGuideFlags({
        confirmedContacts: guide.snapshot.confirmedContacts,
        grandfathered: guide.snapshot.grandfathered,
        hasActivePlan: guide.snapshot.hasActivePlan,
        relationshipGoal,
        step1Skipped: guide.snapshot.step1Skipped,
      });
      return NextResponse.json(success({
        snapshot: guide.snapshot,
        relationshipGoal,
        flags,
        completed: Object.values(flags).filter(Boolean).length,
      }), { headers, status: 200 });
    } catch {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Guide progress is unavailable.")), { headers, status: 503 });
    }
  };
}
