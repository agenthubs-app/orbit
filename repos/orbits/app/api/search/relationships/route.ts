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

// relationship search route 支持自然语言和结构化过滤组合搜索。
// route 负责兼容 query/form/json 三种输入；检索、排序和解释由 search service 负责。
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

  // URL 支持 ?industry=a,b 和 ?industries=a&industries=b 两种写法。
  return values.flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function readFormList(formData: FormData, fieldName: string): string[] {
  // FormData 可能有多个同名字段，也可能每个字段里再用逗号分隔。
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
  // JSON 兼容字符串和字符串数组，其他类型忽略。
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
  // body 显式提供过滤项时覆盖 query 中的同类条件。
  return bodyInput.length > 0 ? bodyInput : requestInput;
}

function readQueryInput(searchParams: URLSearchParams): RelationshipNaturalSearchInput {
  // queryInput 是基础输入，form/json body 可以覆盖或补充。
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
    // 表单路径服务搜索页面提交；字段名支持单数和复数别名。
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

    // JSON 顶层必须是对象；数组/primitive 交给 service 的 invalid body 分支。
    if (!isRecord(parsedBody)) {
      return null;
    }

    // JSON 路径兼容 filters/singular/plural 多种字段名，降低前端迁移成本。
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
  // search failure 统一映射成 AppError/envelope。
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
  // POST 承载复杂搜索条件；route 不直接执行检索算法。
  const mode = resolveFeatureMode();
  const searchService = createRelationshipNaturalSearchService();
  const input = await readRelationshipSearchInput(request);
  const result = input
    ? searchService.queryRelationships(input)
    : searchService.invalidQueryBody();

  return responseForResult(result, mode);
}
