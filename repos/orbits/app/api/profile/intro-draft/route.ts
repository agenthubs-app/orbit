import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { createProfileIntroDraftService } from "../../../../features/profile/intro-draft-service";

export const dynamic = "force-dynamic";
// 模型超时 45 秒，最多重试一次；函数本身要活得比单次调用久。
export const maxDuration = 60;

// 新用户引导：起草「关于我」与「一句话介绍」。只返回草稿，不写资料。
export async function POST(request: Request): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: { code: "ACTOR_REQUIRED", message: "Sign in before generating an introduction." } },
      { status: 401 },
    );
  }

  let language: string | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && typeof (body as { language?: unknown }).language === "string") {
      language = (body as { language: string }).language;
    }
  } catch {
    // 空 body 按中文生成。
  }

  const result = await createProfileIntroDraftService().createDraft({ actorId: actor.id, language });
  const status = result.success === true
    ? 200
    : result.error.code === "PROFILE_REQUIRED"
      ? 409
      : result.error.code === "MODEL_API_KEY_MISSING"
        ? 503
        : 422;
  return NextResponse.json(result, { status });
}
