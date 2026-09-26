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

// accept update suggestion route 用于接受一条 profile 更新建议。
// route 只使用 path 中的 suggestion id；应用规则和状态变更在 signal review service 中。
interface AcceptSuggestionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export function createProfileSuggestionAcceptPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(
    request: Request,
    context: AcceptSuggestionRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    let mutationId: string | undefined;
    try {
      mutationId = await readProfileSuggestionMutationId(request);
    } catch (error) {
      return profileSuggestionValidationErrorResponse(error, mode);
    }
    const signalService = createProfileSignalReviewQueueService();
    const { id } = await context.params;
    const result = await signalService.acceptUpdateSuggestion(id, {
      actorId: actor.id,
      mutationId,
      language: new URL(request.url).searchParams.get("language"),
    });

    return profileSuggestionDecisionResponse(result, mode);
  };
}
