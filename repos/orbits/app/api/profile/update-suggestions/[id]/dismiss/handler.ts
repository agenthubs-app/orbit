import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { createProfileSignalReviewQueueService } from "../../../../../../features/profile/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";
import {
  profileSuggestionDecisionResponse,
  profileSuggestionValidationErrorResponse,
  readProfileSuggestionMutationId,
} from "../../route-support";

interface DismissSuggestionRouteContext { params: Promise<{ id: string }> }

export function createProfileSuggestionDismissPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request, context: DismissSuggestionRouteContext): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    let mutationId: string | undefined;
    try {
      mutationId = await readProfileSuggestionMutationId(request);
    } catch (error) {
      return profileSuggestionValidationErrorResponse(error, mode);
    }
    const { id } = await context.params;
    const result = await createProfileSignalReviewQueueService().dismissUpdateSuggestion(id, { actorId: actor.id, mutationId, language: new URL(request.url).searchParams.get("language") });
    return profileSuggestionDecisionResponse(result, mode);
  };
}
