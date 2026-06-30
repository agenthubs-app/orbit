import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  chatWritingAssistFailureContext,
  chatWritingAssistFailureToAppError,
  type ChatWritingAssistInput,
  type ChatWritingAssistResult,
} from "../../../../../features/chat/assist-contract";
import { createChatWritingAssistService } from "../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// followup-draft 是 Chat 写作辅助入口，用于生成关系跟进草稿。
// route 只解析 JSON/body 字段；草稿规则、隐私边界和 mock/live 差异在 service 层。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 非法 JSON 回落为空对象，让 writing assist service 返回明确的缺字段状态。
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

async function readInput(request: Request): Promise<ChatWritingAssistInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  // contextNote 兼容 note 旧字段，便于调用方逐步迁移。
  return {
    contextNote: readString(body.contextNote) ?? readString(body.note),
    conversationId: readString(body.conversationId),
    organization: readString(body.organization),
    participantName: readString(body.participantName),
    preferredWindow: readString(body.preferredWindow),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    sourceText: readString(body.sourceText),
  };
}

function responseForResult(
  result: ChatWritingAssistResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // 写作辅助失败统一转 AppError，避免页面直接依赖 assist contract 的内部错误形状。
  if (result.success === false) {
    const appError = chatWritingAssistFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatWritingAssistFailureContext(result, mode)),
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
  // route 不直接调用 AI provider；是否使用 mock/live 由 ChatWritingAssistService 决定。
  const mode = resolveFeatureMode();
  const service = createChatWritingAssistService();
  const result = service.draftFollowup(await readInput(request));

  return responseForResult(result, mode);
}
