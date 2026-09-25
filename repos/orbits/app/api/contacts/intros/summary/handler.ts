import { NextResponse } from "next/server";
import {
  createConfiguredContactIntrosSummaryReader,
  type ContactIntrosSummaryReader,
} from "../../../../../features/contacts/contact-intros-summary-reader";
import { contactIntrosSummarySchema } from "../../../../../shared/api-schema/contact-intros-summary";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

export function createContactIntrosSummaryGetHandler(dependencies: {
  reader?: ContactIntrosSummaryReader | null;
  resolveActor?: ResolveAuthenticatedApiActor;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const headers = { ...runtimeBoundaryHeaders(mode), "Cache-Control": "private, no-store" };

    try {
      if (new URL(request.url).searchParams.size > 0) {
        throw new AppError("VALIDATION_ERROR", "This summary route does not accept query parameters.");
      }
      const reader = dependencies.reader === undefined
        ? createConfiguredContactIntrosSummaryReader()
        : dependencies.reader;
      if (!reader) throw new AppError("SERVICE_UNAVAILABLE", "Contact introduction summary storage is not configured.");
      const data = contactIntrosSummarySchema.parse(await reader.read(actor.id, actor.workspaceId));
      return NextResponse.json(success(data), { headers, status: 200 });
    } catch (error) {
      const appError = error instanceof AppError ? error : toAppError(error);
      const safe = appError.code === "VALIDATION_ERROR"
        ? appError
        : new AppError("SERVICE_UNAVAILABLE", "Contact introduction summary is unavailable.");
      return NextResponse.json(
        failure(safe, {
          boundary: "runtime",
          mode,
          privacy: "actor-private-contact-introductions",
          provenance: "Contact introductions summary reader",
          service: "contact-intros-summary",
        }),
        { headers, status: getHttpStatusForAppErrorCode(safe.code) },
      );
    }
  };
}
