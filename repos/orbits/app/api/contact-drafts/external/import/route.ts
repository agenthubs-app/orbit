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

// external import route 将外部来源候选转成待确认联系人草稿。
// route 只解析 sourceKind/scenario；权限、导入范围和草稿生成由 external import service 决定。
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
  // queryInput 是默认输入；form/json body 可以覆盖 sourceKind/scenario。
  const queryInput: ExternalContactsImportInput = {
    sourceKind: url.searchParams.get("sourceKind") ?? undefined,
    scenario: url.searchParams.get("scenario"),
  };
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    // 表单路径服务页面上“从外部来源导入”的提交。
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

  // JSON 路径只接收来源选择，不在 route 层访问真实外部账号。
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
  // importExternalContacts 返回草稿/候选结果；外部副作用边界留在 service。
  const runtimeMode = process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE;
  const mode = resolveFeatureMode(runtimeMode);
  const importService = createExternalContactsImportService(mode);
  const result = await importService.importExternalContacts(
    await readExternalContactsImportInput(request),
  );

  if (result.success === false) {
    // external import failure 统一映射为 AppError/envelope。
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
