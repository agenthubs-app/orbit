import { NextResponse } from "next/server";

import { success, failure, runtimeBoundaryHeaders } from "../../../../shared/api/envelope";
import { contactNeedsMatchesPayloadSchema } from "../../../../shared/api-schema/contact-needs";
import { resolveFeatureMode, type FeatureMode } from "../../../../shared/config/feature-mode";
import { AppError } from "../../../../shared/errors/app-error";
import { createConfiguredContactNeedsService } from "../../../../features/contact-needs/service-factory";
import {
  contactNeedsFailureAppCode,
  contactNeedsFailureMessage,
  contactNeedsFailureStatus,
  type ContactNeedsService,
} from "../../../../features/contact-needs/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export interface ContactNeedsRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  createService?: (mode: FeatureMode) => ContactNeedsService;
}

export function createContactNeedsGetHandler(dependencies: ContactNeedsRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const resolveMode = dependencies.resolveMode ?? resolveFeatureMode;
  const createService = dependencies.createService ?? createConfiguredContactNeedsService;
  return async function GET(_request: Request): Promise<Response> {
    const mode = resolveMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const result = await createService(mode).getMatches({ actorId: actor.id });
    if (result.success === true) {
      const parsed = contactNeedsMatchesPayloadSchema.safeParse(result.data);
      if (!parsed.success) {
        return NextResponse.json(
          failure(new AppError("INTERNAL_ERROR", "The contact needs response is invalid."), {
            contactNeedsErrorCode: "CONTACT_NEEDS_CONTRACT_MISMATCH",
            mode,
          }),
          { status: 500, headers: runtimeBoundaryHeaders(mode) },
        );
      }
      return NextResponse.json(success(parsed.data), { status: 200, headers: runtimeBoundaryHeaders(mode) });
    }
    const status = contactNeedsFailureStatus(result.error.code);
    return NextResponse.json(
      failure(new AppError(
        contactNeedsFailureAppCode(result.error.code),
        contactNeedsFailureMessage(result.error.code),
      ), { contactNeedsErrorCode: result.error.code, mode }),
      { status, headers: runtimeBoundaryHeaders(mode) },
    );
  };
}
