import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";
import { aiMonthlyLimitResponse, configuredDraftAssistLedger, createDraftAssistRunner } from "../../../../../features/ai-quota/draft-assist";
import { createAiEmailDraftService } from "../../../../../features/chat/ai-email-draft-service";

export const dynamic = "force-dynamic";
// 草稿生成允许 45 秒的模型超时，函数本身要活得比它久。
export const maxDuration = 60;

function readString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export async function POST(request: Request): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ACTOR_REQUIRED",
          message: "Sign in before generating an AI email draft.",
        },
      },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};

  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid JSON is handled as an empty request and fails closed in the service.
  }

  // 2026-11-27 隐藏月上限：一次草稿 = 一次 draft_assist 操作（账本不可用照常生成）。
  const ledgered = createDraftAssistRunner({ actorId: actor.id, gate: configuredDraftAssistLedger(), kind: "email" });
  const result = await createAiEmailDraftService({ runModel: ledgered.run }).createDraft({
    actorId: actor.id,
    contactId: readString(body.contactId),
    language: readString(body.language),
    organization: readString(body.organization),
    purpose: readString(body.purpose),
    recipientName: readString(body.recipientName),
  });
  await ledgered.finish(result.success === true ? "succeeded" : "failed");
  if (ledgered.refusal() === "quota") return aiMonthlyLimitResponse(ledgered.quotaDetail());
  const status =
    result.success === true
      ? 200
      : result.error.code === "CONTACT_NOT_FOUND"
        ? 404
        : 422;

  return NextResponse.json(result, {
    status,
  });
}
