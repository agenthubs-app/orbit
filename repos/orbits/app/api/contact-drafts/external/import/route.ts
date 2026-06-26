import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  externalContactsImportFailureContext,
  externalContactsImportFailureToAppError,
  type ExternalContactsImportInput,
} from "../../../../../features/acquisition/external-import-contract";
import { createExternalContactsImportService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

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

async function readExternalContactsImportInput(
  request: Request,
): Promise<ExternalContactsImportInput> {
  const url = new URL(request.url);
  const queryInput: ExternalContactsImportInput = {
    sourceKind: url.searchParams.get("sourceKind") ?? undefined,
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
      sourceKind:
        readFormText(formData, "sourceKind") ?? queryInput.sourceKind,
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

  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    ...queryInput,
    sourceKind:
      typeof body.sourceKind === "string"
        ? body.sourceKind
        : queryInput.sourceKind,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const importService = createExternalContactsImportService();
  const result = importService.importExternalContacts(
    await readExternalContactsImportInput(request),
  );

  if (result.success === false) {
    const appError = externalContactsImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, externalContactsImportFailureContext(result, mode)),
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
