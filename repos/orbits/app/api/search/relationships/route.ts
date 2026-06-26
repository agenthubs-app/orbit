import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { createRelationshipNaturalSearchService } from "../../../../features/search/service-factory";
import {
  relationshipNaturalSearchFailureContext,
  relationshipNaturalSearchFailureToAppError,
} from "../../../../features/search/service";
import type {
  RelationshipNaturalSearchInput,
  RelationshipNaturalSearchResult,
} from "../../../../features/search/contract";

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

function readQueryInput(searchParams: URLSearchParams): RelationshipNaturalSearchInput {
  return {
    businessIntent: searchParams.get("businessIntent"),
    followUpStatusFilters: readSearchParamsList(
      searchParams,
      "followUpStatus",
      "followUpStatuses",
    ),
    industryFilters: readSearchParamsList(searchParams, "industry", "industries"),
    query: searchParams.get("query"),
    scenario: searchParams.get("scenario"),
    sourceFilters: readSearchParamsList(searchParams, "source", "sources"),
    valueTypeFilters: readSearchParamsList(
      searchParams,
      "valueType",
      "valueTypes",
    ),
  };
}

async function readRelationshipSearchInput(
  request: Request,
): Promise<RelationshipNaturalSearchInput | null> {
  const url = new URL(request.url);
  const queryInput = readQueryInput(url.searchParams);
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const industries = [
      ...readFormList(formData, "industry"),
      ...readFormList(formData, "industries"),
    ];
    const sources = [
      ...readFormList(formData, "source"),
      ...readFormList(formData, "sources"),
    ];
    const valueTypes = [
      ...readFormList(formData, "valueType"),
      ...readFormList(formData, "valueTypes"),
    ];
    const followUpStatuses = [
      ...readFormList(formData, "followUpStatus"),
      ...readFormList(formData, "followUpStatuses"),
    ];

    return {
      ...queryInput,
      businessIntent:
        readFormText(formData, "businessIntent") ?? queryInput.businessIntent,
      followUpStatusFilters: mergeList(
        queryInput.followUpStatusFilters ?? [],
        followUpStatuses,
      ),
      industryFilters: mergeList(queryInput.industryFilters ?? [], industries),
      query: readFormText(formData, "query") ?? queryInput.query,
      scenario: readFormText(formData, "scenario") ?? queryInput.scenario,
      sourceFilters: mergeList(queryInput.sourceFilters ?? [], sources),
      valueTypeFilters: mergeList(
        queryInput.valueTypeFilters ?? [],
        valueTypes,
      ),
    };
  }

  if (!contentType.includes("application/json")) {
    return queryInput;
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return queryInput;
  }

  try {
    const parsedBody: unknown = JSON.parse(rawBody);

    if (!isRecord(parsedBody)) {
      return null;
    }

    return {
      ...queryInput,
      businessIntent:
        typeof parsedBody.businessIntent === "string"
          ? parsedBody.businessIntent
          : queryInput.businessIntent,
      followUpStatusFilters: mergeList(
        queryInput.followUpStatusFilters ?? [],
        readJsonList(
          parsedBody.followUpStatusFilters ??
            parsedBody.followUpStatuses ??
            parsedBody.followUpStatus,
        ),
      ),
      industryFilters: mergeList(
        queryInput.industryFilters ?? [],
        readJsonList(
          parsedBody.industryFilters ??
            parsedBody.industries ??
            parsedBody.industry,
        ),
      ),
      query:
        typeof parsedBody.query === "string" ? parsedBody.query : queryInput.query,
      scenario:
        typeof parsedBody.scenario === "string"
          ? parsedBody.scenario
          : queryInput.scenario,
      sourceFilters: mergeList(
        queryInput.sourceFilters ?? [],
        readJsonList(parsedBody.sourceFilters ?? parsedBody.sources ?? parsedBody.source),
      ),
      valueTypeFilters: mergeList(
        queryInput.valueTypeFilters ?? [],
        readJsonList(
          parsedBody.valueTypeFilters ??
            parsedBody.valueTypes ??
            parsedBody.valueType,
        ),
      ),
    };
  } catch {
    return null;
  }
}

function responseForResult(
  result: RelationshipNaturalSearchResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = relationshipNaturalSearchFailureToAppError(result);

    return NextResponse.json(
      failure(appError, relationshipNaturalSearchFailureContext(result, mode)),
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

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchService = createRelationshipNaturalSearchService();
  const input = await readRelationshipSearchInput(request);
  const result = input
    ? searchService.queryRelationships(input)
    : searchService.invalidQueryBody();

  return responseForResult(result, mode);
}
