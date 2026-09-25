import { NextResponse } from "next/server";
import {
  createConfiguredContactPipelinePageReader,
  type ContactPipelinePageReader,
} from "../../../../features/contacts/pipeline-page-reader";
import { CONTACT_PIPELINE_STAGES, type ContactPipelineStage } from "../../../../features/contacts/pipeline-contract";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export function createContactPipelinePageGetHandler(dependencies: {
  reader?: ContactPipelinePageReader | null;
  resolveActor?: ResolveAuthenticatedApiActor;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const headers = { ...runtimeBoundaryHeaders(mode), "Cache-Control": "private, no-store" };

    try {
      const params = new URL(request.url).searchParams;
      const keys = [...params.keys()];
      if (keys.some(key => !["stage", "limit", "cursor"].includes(key)) ||
        [...new Set(keys)].some(key => params.getAll(key).length !== 1) ||
        !params.has("stage") || !CONTACT_PIPELINE_STAGES.includes(params.get("stage") as ContactPipelineStage)) {
        throw new AppError("VALIDATION_ERROR", "Select a valid pipeline stage and reload the first page.");
      }
      const stage = params.get("stage") as ContactPipelineStage;
      const limit = params.has("limit") ? Number(params.get("limit")) : 20;
      const cursor = params.get("cursor");
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20 || (params.has("cursor") && (!cursor || cursor.length > 4096))) {
        throw new AppError("VALIDATION_ERROR", "The contact pipeline page request is invalid.");
      }
      const reader = dependencies.reader === undefined
        ? createConfiguredContactPipelinePageReader()
        : dependencies.reader;
      if (!reader) throw new AppError("SERVICE_UNAVAILABLE", "The contact pipeline is temporarily unavailable.");
      const data = await reader.page({ stage, limit, cursor }, actor.id, actor.workspaceId);
      return NextResponse.json(success(data), { status: 200, headers });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const safe = error instanceof AppError
        ? error
        : code === "CONTACT_PIPELINE_INPUT_INVALID" || code === "CONTACT_PIPELINE_CURSOR_INVALID"
          ? new AppError("VALIDATION_ERROR", "The contact pipeline page request is invalid.")
          : code === "CONTACT_PIPELINE_CONNECTION_AMBIGUOUS" || code === "CONTACT_PIPELINE_CONTACT_AMBIGUOUS"
            ? new AppError("CONFLICT", "Resolve duplicate relationship records before loading this stage.")
            : new AppError("SERVICE_UNAVAILABLE", "The contact pipeline is temporarily unavailable.");
      return NextResponse.json(failure(safe, {
        boundary: "runtime",
        mode,
        privacy: "actor-private-contact-pipeline",
        provenance: "Contact pipeline actor-owned page reader",
        service: "contact-pipeline-page",
      }), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
