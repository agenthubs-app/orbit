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
  businessCardReviewFailureContext,
  businessCardReviewFailureToAppError,
  type BusinessCardReviewedFields,
} from "../../../../features/acquisition/business-card-review-contract";
import { createBusinessCardReviewService } from "../../../../features/acquisition/service-factory";
import { createBusinessCardScanOcrService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

interface ContactDraftLookupRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type PatchBody = {
  reviewedFields?: Partial<BusinessCardReviewedFields>;
  reviewerLabel?: string;
  scenario?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      reviewerLabel:
        typeof body.reviewerLabel === "string" ? body.reviewerLabel : undefined,
      scenario: typeof body.scenario === "string" ? body.scenario : undefined,
    };
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  context: ContactDraftLookupRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const scanService = createBusinessCardScanOcrService();
  const result = scanService.getBusinessCardDraft({
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
}

export async function PATCH(
  request: Request,
  context: ContactDraftLookupRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const body = await readPatchBody(request);
  const reviewService = createBusinessCardReviewService();
  const result = reviewService.updateReviewDraft({
    draftId: id,
    reviewedFields: body.reviewedFields,
    reviewerLabel: body.reviewerLabel,
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
}
