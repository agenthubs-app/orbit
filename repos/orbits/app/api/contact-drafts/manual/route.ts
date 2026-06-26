import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  manualContactCreationFailureContext,
  manualContactCreationFailureToAppError,
  type ManualContactCreationInput,
} from "../../../../features/acquisition/manual-contract";
import { createManualContactCreationService } from "../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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

function readFormTags(formData: FormData): readonly string[] | undefined {
  const value = readFormText(formData, "tags");

  if (value === undefined) {
    return undefined;
  }

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

async function readManualContactCreationInput(
  request: Request,
  scenario: string | null,
): Promise<ManualContactCreationInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const sourceLabel = readFormText(formData, "source");

    return {
      scenario,
      source: sourceLabel ? { label: sourceLabel } : undefined,
      note: readFormText(formData, "note"),
      tags: readFormTags(formData),
      followUpHint: readFormText(formData, "followUpHint"),
    };
  }

  if (!contentType.includes("application/json")) {
    return { scenario };
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return { scenario };
  }

  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};
  const source = isRecord(body.source) ? body.source : undefined;

  return {
    scenario,
    source,
    note: typeof body.note === "string" ? body.note : undefined,
    tags: isStringArray(body.tags) ? body.tags : undefined,
    followUpHint:
      typeof body.followUpHint === "string" ? body.followUpHint : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const manualService = createManualContactCreationService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = manualService.createManualContactDraft(
    await readManualContactCreationInput(request, scenario),
  );

  if (result.success === false) {
    const appError = manualContactCreationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, manualContactCreationFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: result.data.state === "success" ? 201 : 200,
  });
}
