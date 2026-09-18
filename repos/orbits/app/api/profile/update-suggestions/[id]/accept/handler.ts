import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import { AppError } from "../../../../../../shared/errors/app-error";
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

// accept update suggestion route 用于接受一条 profile 更新建议。
// route 只使用 path 中的 suggestion id；应用规则和状态变更在 signal review service 中。
interface AcceptSuggestionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

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
    try { mutationId = await optionalMutationId(request); } catch (error) {
      return NextResponse.json(failure(error, { boundary: "developer-admin", mode, privacy: "actor-scoped-profile-signals", provenance: "Profile suggestion decision request validation", service: "profile-signal-review-queue" }), {
        headers: runtimeBoundaryHeaders(mode), status: 400,
      });
    }
    const signalService = createProfileSignalReviewQueueService();
    const { id } = await context.params;
    const result = await signalService.acceptUpdateSuggestion(id, {
      actorId: actor.id,
      mutationId,
      language: new URL(request.url).searchParams.get("language"),
    });

    if (result.success === false) {
      const appError = profileSignalReviewQueueFailureToAppError(result);

      return NextResponse.json(
        failure(appError, profileSignalReviewQueueFailureContext(result, mode)),
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
