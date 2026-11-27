import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { aiMonthlyLimitResponse, configuredDraftAssistLedger, createDraftAssistRunner } from "../../../../features/ai-quota/draft-assist";
import { createSeekSuggestionService } from "../../../../features/profile/seek-suggestion-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 新用户引导「我在寻找」的 ✦ 建议：只读已保存资料，只返回候选里的标签，不写库。
export async function POST(request: Request): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: { code: "ACTOR_REQUIRED", message: "Sign in before requesting suggestions." } },
      { status: 401 },
    );
  }
  let body: { candidates?: unknown; goal?: unknown; language?: unknown } = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as typeof body;
  } catch {
    // 空 body 由服务返回 CANDIDATES_REQUIRED。
  }
  // 2026-11-27 隐藏月上限：一次建议 = 一次 draft_assist 操作（账本不可用照常生成）。
  const ledgered = createDraftAssistRunner({ actorId: actor.id, gate: configuredDraftAssistLedger(), kind: "seek" });
  const result = await createSeekSuggestionService({ runModel: ledgered.run }).suggest({
    actorId: actor.id,
    candidates: body.candidates,
    goal: typeof body.goal === "string" ? body.goal : null,
    language: typeof body.language === "string" ? body.language : null,
  });
  await ledgered.finish(result.success === true ? "succeeded" : "failed");
  if (ledgered.refusal() === "quota") return aiMonthlyLimitResponse();
  const status = result.success === true
    ? 200
    : result.error.code === "CANDIDATES_REQUIRED"
      ? 400
      : result.error.code === "PROFILE_REQUIRED"
        ? 409
        : result.error.code === "MODEL_API_KEY_MISSING"
          ? 503
          : 422;
  return NextResponse.json(result, { status });
}
