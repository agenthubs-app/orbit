import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { createContactsListSearchAndFilterService } from "../../../../features/contacts/service-factory";
import {
  contactsListSearchFailureContext,
  contactsListSearchFailureToAppError,
} from "../../../../features/contacts/service";
import type { ContactsListSearchFilterInput } from "../../../../features/contacts/contract";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSearchParamsList(
  searchParams: URLSearchParams,
  singularName: string,
  pluralName: string,
): string[] {
  const values = [
    ...searchParams.getAll(singularName),
    ...searchParams.getAll(pluralName),
  ];

  return values.flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function readFormList(formData: FormData, fieldName: string): string[] {
  return formData
    .getAll(fieldName)
    .flatMap((value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    );
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

function readJsonList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function mergeList(
  requestInput: readonly string[],
  bodyInput: readonly string[],
): readonly string[] {
  return bodyInput.length > 0 ? bodyInput : requestInput;
}

async function readContactsSearchInput(
  request: Request,
): Promise<ContactsListSearchFilterInput> {
  const url = new URL(request.url);
  const queryInput: ContactsListSearchFilterInput = {
    query: url.searchParams.get("query"),
    scenario: url.searchParams.get("scenario"),
    sourceFilters: readSearchParamsList(url.searchParams, "source", "sources"),
    statusFilters: readSearchParamsList(url.searchParams, "status", "statuses"),
    tagFilters: readSearchParamsList(url.searchParams, "tag", "tags"),
    valueFilters: readSearchParamsList(url.searchParams, "value", "values"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const sourceFilters = [
      ...readFormList(formData, "source"),
      ...readFormList(formData, "sources"),
    ];
    const statusFilters = [
      ...readFormList(formData, "status"),
      ...readFormList(formData, "statuses"),
    ];
    const tagFilters = [
      ...readFormList(formData, "tag"),
      ...readFormList(formData, "tags"),
    ];
    const valueFilters = [
      ...readFormList(formData, "value"),
      ...readFormList(formData, "values"),
    ];

    return {
      ...queryInput,
      query: readFormText(formData, "query") ?? queryInput.query,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
      sourceFilters: mergeList(queryInput.sourceFilters ?? [], sourceFilters),
      statusFilters: mergeList(queryInput.statusFilters ?? [], statusFilters),
      tagFilters: mergeList(queryInput.tagFilters ?? [], tagFilters),
      valueFilters: mergeList(queryInput.valueFilters ?? [], valueFilters),
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
    query: typeof body.query === "string" ? body.query : queryInput.query,
    scenario:
      typeof body.scenario === "string" ? body.scenario : queryInput.scenario,
    sourceFilters: mergeList(
      queryInput.sourceFilters ?? [],
      readJsonList(body.sourceFilters ?? body.sources ?? body.source),
    ),
    statusFilters: mergeList(
      queryInput.statusFilters ?? [],
      readJsonList(body.statusFilters ?? body.statuses ?? body.status),
    ),
    tagFilters: mergeList(
      queryInput.tagFilters ?? [],
      readJsonList(body.tagFilters ?? body.tags ?? body.tag),
    ),
    valueFilters: mergeList(
      queryInput.valueFilters ?? [],
      readJsonList(body.valueFilters ?? body.values ?? body.value),
    ),
  };
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const contactsService = createContactsListSearchAndFilterService();
  const result = contactsService.searchContacts(
    await readContactsSearchInput(request),
  );

  if (result.success === false) {
    const appError = contactsListSearchFailureToAppError(result);

    return NextResponse.json(
      failure(appError, contactsListSearchFailureContext(result, mode)),
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
