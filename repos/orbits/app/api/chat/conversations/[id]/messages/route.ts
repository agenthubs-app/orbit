import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  chatConversationMockFailureContext,
  chatConversationMockFailureToAppError,
  type ChatSendMessageInput,
  type ChatSendMessageResult,
} from "../../../../../../features/chat/service";
import {
  CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY,
} from "../../../../../../features/chat/fixtures";
import { createChatConversationMessageService } from "../../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

// 这个 route 是旧 Chat 会话里的“发送一条消息”入口。
// 它解析 path id、body 和 scenario，然后交给 chat conversation message service；
// Orbit AI live agent 有独立 /api/ai/conversations 路径，不在这里直接调用模型。
interface ChatConversationMessagesRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

interface JsonBodyRead {
  hasBody: boolean;
  value: JsonRecord;
}

// body 读取需要保留“是否真的传了 body”这个信息：
// 没传 body 时用默认 mock 文本，传了空/非法 body 时让 service 做校验。
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonBodyRead> {
  const text = await request.text();

  // 空请求体代表 demo 入口，可使用默认消息启动 mock 场景。
  if (!text.trim()) {
    return {
      hasBody: false,
      value: {},
    };
  }

  try {
    const body = JSON.parse(text) as unknown;

    return {
      hasBody: true,
      value: isRecord(body) ? body : {},
    };
  } catch {
    return {
      hasBody: true,
      value: {},
    };
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readInput(
  request: Request,
  conversationId: string,
): Promise<ChatSendMessageInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;
  const messageBody = readString(body.value.body);

  // query scenario 优先级高于 body scenario，便于浏览器直接切换场景。
  return {
    body:
      messageBody ??
      (body.hasBody ? null : CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY),
    conversationId,
    scenario: searchParams.get("scenario") ?? readString(body.value.scenario),
  };
}

function responseForResult(
  result: ChatSendMessageResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // 统一把 feature failure 映射为 AppError/envelope，避免 route 泄露内部错误形状。
  if (result.success === false) {
    const appError = chatConversationMockFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatConversationMockFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  // 新消息创建成功返回 201；pending/其他状态仍返回 200，表示请求被服务接受。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: result.data.state === "success" ? 201 : 200,
  });
}

export async function POST(
  request: Request,
  context: ChatConversationMessagesRouteContext,
): Promise<Response> {
  // Next App Router 的动态 params 是 Promise，先 await 后再进入 service。
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const service = createChatConversationMessageService();
  const result = await service.sendMessage(await readInput(request, id));

  return responseForResult(result, mode);
}
