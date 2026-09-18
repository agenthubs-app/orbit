import { NextResponse } from "next/server";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  createProfileSignalReviewQueueService,
  profileSignalReviewQueueFailureContext,
  profileSignalReviewQueueFailureToAppError,
} from "../../../../../../features/profile/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

interface DismissSuggestionRouteContext { params: Promise<{ id: string }> }

async function optionalMutationId(request: Request): Promise<string | undefined> {
  if (!request.headers.get("content-type") && !request.headers.get("content-length")) return undefined;
  let value: unknown;
  try { value = await request.json(); } catch { throw new AppError("VALIDATION_ERROR", "A valid mutationId is required."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Reflect.ownKeys(value).length !== 1) {
    throw new AppError("VALIDATION_ERROR", "A valid mutationId is required.");
  }
  const mutationId = (value as Record<string, unknown>).mutationId;
  if (typeof mutationId !== "string" || !mutationId.trim()) throw new AppError("VALIDATION_ERROR", "A valid mutationId is required.");
  return mutationId.trim();
}

export function createProfileSuggestionDismissPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request, context: DismissSuggestionRouteContext): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    let mutationId: string | undefined;
    try { mutationId = await optionalMutationId(request); } catch (error) {
      return NextResponse.json(failure(error, { boundary: "developer-admin", mode, privacy: "actor-scoped-profile-signals", provenance: "Profile suggestion decision request validation", service: "profile-signal-review-queue" }), {
        headers: runtimeBoundaryHeaders(mode), status: 400,
      });
    }
    const { id } = await context.params;
    const result = await createProfileSignalReviewQueueService().dismissUpdateSuggestion(id, { actorId: actor.id, mutationId, language: new URL(request.url).searchParams.get("language") });
    if (result.success === false) {
      const appError = profileSignalReviewQueueFailureToAppError(result);
      return NextResponse.json(failure(appError, profileSignalReviewQueueFailureContext(result, mode)), {
        headers: runtimeBoundaryHeaders(mode), status: getHttpStatusForAppErrorCode(appError.code),
      });
    }
    return NextResponse.json(success(result.data), { headers: runtimeBoundaryHeaders(mode), status: 200 });
  };
}
