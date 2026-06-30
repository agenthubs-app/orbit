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

// 手动创建联系人草稿支持 form 和 JSON 两种提交方式。
// route 只把 HTTP 字段整理成 ManualContactCreationInput；
// 去重、草稿状态、provenance 和错误语义由 acquisition service 负责。
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

  // 表单提交通常把 tags 放在逗号分隔字符串里，这里统一清理空白和空项。
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

  // HTML form 和 multipart 都走 FormData，便于页面表单和文件上传入口复用。
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

  // 非 JSON/form 的请求只保留 scenario，让 service 产出可解释的默认或失败状态。
  if (!contentType.includes("application/json")) {
    return { scenario };
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return { scenario };
  }

  // JSON body 允许 source 作为结构化对象传入，其他字段只接受明确类型。
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
  // 手动创建草稿是“创建资源”语义：success 返回 201，其余状态返回 200。
  const mode = resolveFeatureMode();
  const manualService = createManualContactCreationService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = manualService.createManualContactDraft(
    await readManualContactCreationInput(request, scenario),
  );

  if (result.success === false) {
    // acquisition contract 的失败码在这里收敛到共享 AppError/envelope。
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
