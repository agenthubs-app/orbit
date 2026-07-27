import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  businessCardScanOcrFailureContext,
  businessCardScanOcrFailureToAppError,
} from "../../../../features/acquisition/business-card-contract";
import {
  BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX,
  businessCardReviewFailureContext,
  businessCardReviewFailureToAppError,
  type BusinessCardReviewedFields,
} from "../../../../features/acquisition/business-card-review-contract";
import {
  createBusinessCardReviewService,
  createBusinessCardScanOcrService,
} from "../../../../features/acquisition/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export interface ContactDraftLookupRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type PatchBody = {
  reviewedFields?: Partial<BusinessCardReviewedFields>;
  scenario?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function actorLabel(actor: AuthenticatedApiActor): string {
  return actor.name?.trim() || actor.email?.trim() || actor.id;
}

function parseReviewedFields(
  value: unknown,
): Partial<BusinessCardReviewedFields> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    displayName:
      typeof value.displayName === "string" ? value.displayName : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    organization:
      typeof value.organization === "string" ? value.organization : undefined,
    email: typeof value.email === "string" ? value.email : undefined,
    phone: typeof value.phone === "string" ? value.phone : undefined,
  };
}

async function readPatchBody(request: Request): Promise<PatchBody> {
  try {
    const body = await request.json();

    if (!isRecord(body)) {
      return {};
    }

    return {
      reviewedFields: parseReviewedFields(body.reviewedFields),
      scenario: typeof body.scenario === "string" ? body.scenario : undefined,
    };
  } catch {
    return {};
  }
}

export function createContactDraftGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function GET(
    request: Request,
    context: ContactDraftLookupRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const { id } = await context.params;
    const scenario = new URL(request.url).searchParams.get("scenario");

    if (id.startsWith(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX)) {
      const reviewService = createBusinessCardReviewService(mode);
      const result = await reviewService.getReviewDraft({
        actorId: actor.id,
        draftId: id,
        scenario,
      });

      if (result.success === false) {
        const appError = businessCardReviewFailureToAppError(result);

        return NextResponse.json(
          failure(appError, businessCardReviewFailureContext(result, mode)),
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
    }

    const scanService = createBusinessCardScanOcrService(mode);
    const result = await scanService.getBusinessCardDraft({
      actorId: actor.id,
      draftId: id,
      scenario,
    });

    if (result.success === false) {
      const appError = businessCardScanOcrFailureToAppError(result);

      return NextResponse.json(
        failure(appError, businessCardScanOcrFailureContext(result, mode)),
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

export function createContactDraftPatchHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function PATCH(
    request: Request,
    context: ContactDraftLookupRouteContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const { id } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const body = await readPatchBody(request);
    const reviewService = createBusinessCardReviewService(mode);
    const result = await reviewService.updateReviewDraft({
      actorId: actor.id,
      draftId: id,
      reviewedFields: body.reviewedFields,
      reviewerLabel: actorLabel(actor),
      scenario: searchParams.get("scenario") ?? body.scenario,
    });

    if (result.success === false) {
      const appError = businessCardReviewFailureToAppError(result);

      return NextResponse.json(
        failure(appError, businessCardReviewFailureContext(result, mode)),
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
