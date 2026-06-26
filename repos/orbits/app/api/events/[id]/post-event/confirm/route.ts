import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  postEventReviewFailureContext,
  postEventReviewFailureToAppError,
  type ConfirmPostEventContactsInput,
} from "../../../../../../features/events/post-event-contract";
import { createPostEventContactReviewService } from "../../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface PostEventReviewConfirmRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

function splitContactDraftIds(value?: string | null): readonly string[] | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value
    .split(",")
    .map((contactDraftId) => contactDraftId.trim())
    .filter(Boolean);
}

async function readPostEventReviewConfirmInput(
  request: Request,
  eventId: string,
): Promise<ConfirmPostEventContactsInput> {
  const url = new URL(request.url);
  const queryInput: ConfirmPostEventContactsInput = {
    contactDraftIds: splitContactDraftIds(url.searchParams.get("contactDraftIds")),
    eventId,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      contactDraftIds:
        splitContactDraftIds(readFormText(formData, "contactDraftIds")) ??
        queryInput.contactDraftIds,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return queryInput;
  }

  const body = isRecord(parsedBody) ? parsedBody : {};
  const bodyContactDraftIds = Array.isArray(body.contactDraftIds)
    ? body.contactDraftIds.filter(
        (contactDraftId): contactDraftId is string =>
          typeof contactDraftId === "string" && contactDraftId.trim() !== "",
      )
    : undefined;

  return {
    ...queryInput,
    contactDraftIds: bodyContactDraftIds ?? queryInput.contactDraftIds,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(
  request: Request,
  context: PostEventReviewConfirmRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const postEventReviewService = createPostEventContactReviewService();
  const result = postEventReviewService.confirmPostEventContacts(
    await readPostEventReviewConfirmInput(request, id),
  );

  if (result.success === false) {
    const appError = postEventReviewFailureToAppError(result);

    return NextResponse.json(
      failure(appError, postEventReviewFailureContext(result, mode)),
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
