import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
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
  let body: { candidates?: unknown; language?: unknown } = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as typeof body;
  } catch {
    // 空 body 由服务返回 CANDIDATES_REQUIRED。
  }
  const result = await createSeekSuggestionService().suggest({
    actorId: actor.id,
    candidates: body.candidates,
    language: typeof body.language === "string" ? body.language : null,
  });
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
