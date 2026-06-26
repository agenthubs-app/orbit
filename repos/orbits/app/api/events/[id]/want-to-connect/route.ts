import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  wantConnectFailureContext,
  wantConnectFailureToAppError,
  type WantConnectIntentInput,
} from "../../../../../features/events/want-connect-contract";
import { createWantConnectService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface WantConnectRouteContext {
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

async function readWantConnectInput(
  request: Request,
  eventId: string,
): Promise<WantConnectIntentInput> {
  const url = new URL(request.url);
  const queryInput: WantConnectIntentInput = {
    actorContactId: url.searchParams.get("actorContactId"),
    eventId,
    scenario: url.searchParams.get("scenario"),
    targetContactId:
      url.searchParams.get("targetContactId") ?? "contact:priya-shah",
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      ...queryInput,
      actorContactId:
        readFormText(formData, "actorContactId") ??
        queryInput.actorContactId,
      targetContactId:
        readFormText(formData, "targetContactId") ??
        queryInput.targetContactId,
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

  return {
    ...queryInput,
    actorContactId:
      typeof body.actorContactId === "string"
        ? body.actorContactId
        : queryInput.actorContactId,
    targetContactId:
      typeof body.targetContactId === "string"
        ? body.targetContactId
        : queryInput.targetContactId,
  };
}

export async function POST(
  request: Request,
  context: WantConnectRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const wantConnectService = createWantConnectService();
  const result = wantConnectService.createWantToConnectIntent(
    await readWantConnectInput(request, id),
  );

  if (result.success === false) {
    const appError = wantConnectFailureToAppError(result);

    return NextResponse.json(
      failure(appError, wantConnectFailureContext(result, mode)),
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
