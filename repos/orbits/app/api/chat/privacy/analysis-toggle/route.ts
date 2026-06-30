import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  chatPrivacyControlsFailureContext,
  chatPrivacyControlsFailureToAppError,
  type ChatAnalysisOptInInput,
  type ChatPrivacyControlsResult,
} from "../../../../../features/chat/privacy-contract";
import { createChatPrivacyControlsService } from "../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

type BodyRecord = Record<string, unknown>;

// analysis-toggle 是用户显式打开/关闭聊天分析的入口。
// route 负责兼容 JSON、form-urlencoded 和 query 输入；持久化语义由 service 决定。
function isRecord(value: unknown): value is BodyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | null {
  // 支持布尔值和表单字符串，其他输入保留为 null 交给 service 判断。
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function readEnabled(
  body: BodyRecord,
  searchParams: URLSearchParams,
): boolean | null {
  // body.enabled 优先，便于 POST 明确覆盖 URL 上的演示参数。
  if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
    return readBoolean(body.enabled);
  }

  const queryEnabled = searchParams.get("enabled");

  if (queryEnabled !== null) {
    return readBoolean(queryEnabled);
  }

  return false;
}

async function readBody(request: Request): Promise<BodyRecord> {
  const contentType = request.headers.get("content-type") ?? "";

  // 非 JSON body 按 URLSearchParams 解析，覆盖普通表单提交场景。
  try {
    const bodyText = await request.text();

    if (!bodyText.trim()) {
      return {};
    }

    if (contentType.includes("application/json")) {
      const body = JSON.parse(bodyText) as unknown;

      return isRecord(body) ? body : {};
    }

    return Object.fromEntries(new URLSearchParams(bodyText));
  } catch {
    return {};
  }
}

async function readInput(request: Request): Promise<ChatAnalysisOptInInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readBody(request);
  const enabled = readEnabled(body, searchParams);

  // conversationId 只从 query 读取，避免 body 中误带 id 改变目标会话。
  return {
    conversationId: searchParams.get("conversationId"),
    enabled,
    scenario: searchParams.get("scenario") ?? String(body.scenario ?? ""),
  };
}

function responseForResult(
  result: ChatPrivacyControlsResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  // 隐私控制失败使用统一 envelope，前端只需要处理 AppError。
  if (result.success === false) {
    const appError = chatPrivacyControlsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatPrivacyControlsFailureContext(result, mode)),
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
  // 修改分析开关只调用 privacy service，不在 route 层启动任何 AI 分析。
  const mode = resolveFeatureMode();
  const service = createChatPrivacyControlsService();
  const result = service.setAnalysisOptIn(await readInput(request));

  return responseForResult(result, mode);
}
