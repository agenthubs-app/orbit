import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { FollowupTaskGenerationGenerateInput } from "../../../../features/followups/contract";
import { createFollowupTaskGenerationService } from "../../../../features/followups/service-factory";
import {
  followupTaskGenerationFailureContext,
  followupTaskGenerationFailureToAppError,
} from "../../../../features/followups/service";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

// tasks/generate route 根据关系上下文生成 follow-up 任务候选。
// route 只解析 JSON 输入；任务触发规则和去重由 followup task service 负责。
async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 空 body 或非法 JSON 回落为空对象，让 service 处理默认生成策略。
  try {
    const body = (await request.json()) as unknown;

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as JsonRecord;
    }
  } catch {
    return {};
  }

  return {};
}

function readStringArray(value: unknown): readonly string[] | null {
  // triggerKinds 兼容数组和逗号字符串。
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
}

function readNumber(value: unknown): number | null {
  // limit 兼容 JSON number 和字符串。
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readInput(
  request: Request,
): Promise<FollowupTaskGenerationGenerateInput> {
  const body = await readJsonBody(request);
  const searchParams = new URL(request.url).searchParams;

  // scenario query 优先，方便 URL 直接切换 mock 状态。
  return {
    connectionId: readString(body.connectionId),
    limit: readNumber(body.limit),
    scenario: searchParams.get("scenario") ?? readString(body.scenario),
    triggerKinds: readStringArray(body.triggerKinds),
  };
}

export async function POST(request: Request): Promise<Response> {
  // generateTasks 生成可复核任务候选，不在 route 层创建真实提醒或通知。
  const mode = resolveFeatureMode();
  const taskService = createFollowupTaskGenerationService();
  const result = taskService.generateTasks(await readInput(request));

  if (result.success === false) {
    // follow-up task failure 统一映射成 AppError/envelope。
    const appError = followupTaskGenerationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, followupTaskGenerationFailureContext(result, mode)),
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
