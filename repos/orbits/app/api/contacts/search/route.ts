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

// 联系人搜索同时支持 query string、form 和 JSON。
// route 的职责是把多种 HTTP 表达统一成 ContactsListSearchFilterInput；
// 排序、过滤、local-remote 数据来源和 provenance 都由 contacts service 负责。
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

  // URL 支持 ?tag=a,b 和 ?tags=a&tags=b 两种写法，最后统一成干净数组。
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
  // JSON 兼容字符串和字符串数组，其他类型被忽略而不是在 route 层抛错。
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
  // body 中显式提供过滤条件时覆盖 query，方便 POST 表单表达完整搜索状态。
  return bodyInput.length > 0 ? bodyInput : requestInput;
}

async function readContactsSearchInput(
  request: Request,
): Promise<ContactsListSearchFilterInput> {
  const url = new URL(request.url);
  // queryInput 是基础输入；form/json body 可以在后面覆盖对应字段。
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
    // 表单路径服务普通页面提交；字段名支持单数和复数两种命名。
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

  // JSON 路径服务前端 fetch；兼容 sourceFilters/sources/source 等别名。
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
  // 搜索是读操作但用 POST 承载复杂过滤条件；响应仍是标准 success/failure envelope。
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
