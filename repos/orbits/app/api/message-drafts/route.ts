import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import {
  messageDraftGeneratorFailureContext,
  messageDraftGeneratorFailureToAppError,
  type MessageDraftGeneratorCreateInput,
  type MessageDraftGeneratorResult,
} from "../../../features/followups/message-draft-contract";
import { createMessageDraftGeneratorService } from "../../../features/followups/service-factory";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// message-drafts route 创建一条 follow-up 消息草稿。
// route 只解析 JSON 字段；草稿模板、语气和证据来源由 message draft service 负责。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 空 body 或非法 JSON 回落为空对象，由 service 返回缺字段/默认状态。
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

async function readInput(
  request: Request,
): Promise<MessageDraftGeneratorCreateInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  // scenario query 优先于 body，便于通过 URL 复现 mock 分支。
  return {
    channel: readString(body.channel),
    contextNote: readString(body.contextNote),
    draftKind: readString(body.draftKind),
    organization: readString(body.organization),
    recipientName: readString(body.recipientName),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
  };
}

function responseForResult(
  result: MessageDraftGeneratorResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // draft failure 统一映射成 AppError/envelope。
  if (result.success === false) {
    const appError = messageDraftGeneratorFailureToAppError(result);

    return NextResponse.json(
      failure(appError, messageDraftGeneratorFailureContext(result, mode)),
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
  // createDraft 只生成可复核草稿，不直接发送消息。
  const mode = resolveFeatureMode();
  const draftService = createMessageDraftGeneratorService();
  const result = draftService.createDraft(await readInput(request));

  return responseForResult(result, mode);
}
