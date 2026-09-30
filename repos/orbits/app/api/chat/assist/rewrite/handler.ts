import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import { rewritePolitely } from "../../../../../features/chat/polite-rewrite";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  // 非法 JSON 回落为空对象，由改写规则返回稳定的输入校验结果。
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

// rewrite 是网页收件箱的礼貌改写入口：只按请求里的文字生成可复核的建议，
// 不读取任何对话记录，不调用 AI，也不发送。
export function createChatRewritePostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const body = await readJsonBody(request);
    // sourceText 兼容 text 旧字段，减少调用方升级成本。
    const result = rewritePolitely({
      conversationId: readString(body.conversationId),
      organization: readString(body.organization),
      participantName: readString(body.participantName),
      sourceText: readString(body.sourceText) ?? readString(body.text),
    });

    if (result.success === false) {
      return NextResponse.json(
        failure(new AppError("VALIDATION_ERROR", result.error.message), {
          boundary: "runtime",
          mode,
          privacy: "request-only-rewrite",
          provenance: "The rewrite rule validated the submitted draft text.",
          service: "polite-rewrite",
        }),
        { headers: runtimeBoundaryHeaders(mode), status: 400 },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
