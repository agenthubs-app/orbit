import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  aiProviderFailureContext,
  aiProviderFailureToAppError,
  type AiProviderMessageDraftInput,
  type AiProviderResult,
} from "../../../../../shared/ai/provider";
import { createAiProviderService } from "../../../../../shared/ai/service-factory";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// mock message-draft 是共享 AI provider 的演示入口。
// 它不直接拼 prompt 或调用模型，只把 HTTP body 整理成 AiProviderMessageDraftInput。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 空 body 或非法 JSON 回落为空对象，让 provider service 返回可解释的校验结果。
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): readonly string[] | null {
  // sourceEvidenceIds 只保留字符串，避免非 evidence 值进入 AI provider 输入。
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}

async function readInput(
  request: Request,
): Promise<AiProviderMessageDraftInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  // relationshipContext 兼容 context 旧字段，便于前端迁移期间保持 API 稳定。
  return {
    desiredOutcome: readString(body.desiredOutcome),
    promptTemplateId: readString(body.promptTemplateId),
    recipientName: readString(body.recipientName),
    relationshipContext:
      readString(body.relationshipContext) ?? readString(body.context),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    sourceEvidenceIds: readStringArray(body.sourceEvidenceIds),
  };
}

function responseForResult(
  result: AiProviderResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // provider failure 统一转成共享 AppError，不向 API 调用方暴露 provider 内部形状。
  if (result.success === false) {
    const appError = aiProviderFailureToAppError(result);

    return NextResponse.json(
      failure(appError, aiProviderFailureContext(result, mode)),
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
  // route 只负责选择当前 AI provider service；mock/live 差异由 factory 决定。
  const mode = resolveFeatureMode();
  const service = createAiProviderService();
  const result = service.draftMessage(await readInput(request));

  return responseForResult(result, mode);
}
