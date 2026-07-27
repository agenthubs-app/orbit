import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
  RUNTIME_BOUNDARY_HEADER_VALUES,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";
import type {
  AsyncConversationCreateFromDraftInput,
  AsyncConversationCreateResult,
  AsyncConversationInput,
  AsyncConversationWorkspaceResult,
} from "../../../../features/chat/service";
import { createAsyncRelationshipConversationService } from "../../../../features/chat/service-factory";

// 关系收件箱面板的数据入口：返回 async correspondence workspace（inbox + 选中线程 +
// 草稿回复 + 上下文）。传 conversationId 选中某条线程。
//
// 该服务当前只有 mock 实现（见
// features/chat/ASYNC_CONVERSATION_MOCK_TO_LIVE.md）。只有显式 mock runtime
// 才能读取预览数据；live/hybrid 必须失败关闭，不能把 fixture 当成真实收件箱。
// 所有 mock side effect 保持 false：不发送、不通知、不写日历、不落库、不联网。
export const dynamic = "force-dynamic";

function readInput(request: Request): AsyncConversationInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    conversationId: searchParams.get("conversationId"),
  };
}

function responseForResult(
  result: AsyncConversationWorkspaceResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = new AppError(
      result.error.appCode,
      result.error.message,
    );

    return NextResponse.json(
      failure(appError, {
        boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
        asyncConversationErrorCode: result.error.code,
        mode,
        privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
        provenance:
          "Async relationship conversation failure came from the explicit mock correspondence preview boundary.",
        service: `async-relationship-conversation-${mode}`,
      }),
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

function unavailableResponse(
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  const appError = new AppError(
    "SERVICE_UNAVAILABLE",
    "Relationship inbox is unavailable because no live asynchronous conversation provider is configured.",
  );

  return NextResponse.json(
    failure(appError, {
      availableModes: "mock",
      boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
      capabilityId: "async-relationship-conversation",
      mode,
      privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
      provenance:
        "No mock correspondence data was returned outside explicit mock runtime.",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();

  if (mode !== "mock") {
    return unavailableResponse(mode);
  }

  const service = createAsyncRelationshipConversationService("mock");
  const result = await service.getCorrespondenceWorkspace(readInput(request));

  return responseForResult(result, mode);
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
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

function createResponseForResult(
  result: AsyncConversationCreateResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = new AppError(result.error.appCode, result.error.message);

    return NextResponse.json(
      failure(appError, {
        boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
        asyncConversationErrorCode: result.error.code,
        mode,
        privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
        provenance:
          "Async relationship conversation create-from-draft failure came from the explicit mock correspondence preview boundary.",
        service: `async-relationship-conversation-${mode}`,
      }),
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

// draft→thread 写入入口：从确认后的消息草稿发起一个新的对话线程（本地 staged 预览）。
export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();

  if (mode !== "mock") {
    return unavailableResponse(mode);
  }

  const body = await readJsonBody(request);
  const input: AsyncConversationCreateFromDraftInput = {
    contactId: readString(body.contactId),
    participantName: readString(body.participantName),
    organization: readString(body.organization),
    subject: readString(body.subject),
    body: readString(body.body),
    sourceLabel: readString(body.sourceLabel),
  };
  const service = createAsyncRelationshipConversationService("mock");
  const result = await service.createConversationFromDraft(input);

  return createResponseForResult(result, mode);
}
