import { NextResponse } from "next/server";

import { readContactValueInsightLines, readContactValueLines, VALUE_LINES_MAX_IDS } from "../../../../features/contacts/insights/value-lines";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";

/**
 * W0061（D61）：`GET /api/contacts/value-lines?ids=a,b&lang=zh`——首页今日要事人物事项与候选卡重取用的
 * 「TA 能帮你」一句话（本人范围、只读、0 次模型调用）。
 *
 * - ids 逗号分隔、去重，最多 20 个；他人或不存在的 id 静默丢弃（不返回）。
 * - lang 取 zh／en（其余按 en），只返回这一种语言的文字（D39 窄读）。
 * - `fields=insight`（候选卡重取）：不读联系人资料，只返回本人有洞察行的 id。
 * - 不 import 生成器、执行器、配额（`tests/architecture/contact-value-line-read-paths.test.ts`）。
 */
export interface ContactValueLinesDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readLines?: typeof readContactValueLines;
  /** `fields=insight`（候选卡重取）：只读洞察，不读联系人资料。 */
  readInsightLines?: typeof readContactValueInsightLines;
}

export function parseValueLineIds(raw: string | null): string[] | null {
  const ids = [...new Set((raw ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (ids.some((id) => id.length > 512)) return null;
  return ids.length > VALUE_LINES_MAX_IDS ? null : ids;
}

export function createContactValueLinesHandler(dependencies: ContactValueLinesDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readLines = dependencies.readLines ?? readContactValueLines;
  const readInsightLines = dependencies.readInsightLines ?? readContactValueInsightLines;
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await resolveActor().catch(() => null);
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
    const params = new URL(request.url).searchParams;
    const ids = parseValueLineIds(params.get("ids"));
    if (ids === null) {
      return NextResponse.json(failure(new AppError("VALIDATION_ERROR", `ids must list at most ${VALUE_LINES_MAX_IDS} contact ids.`)), { headers, status: 400 });
    }
    const language = params.get("lang") === "zh" ? "zh" : "en";
    if (!ids.length) return NextResponse.json(success({ lines: [] }), { headers });
    try {
      const read = params.get("fields") === "insight" ? readInsightLines : readLines;
      const lines = await read({ actorId: actor.id, contactIds: ids, language });
      return NextResponse.json(success({ lines }), { headers });
    } catch {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Value lines are temporarily unavailable.")), { headers, status: 503 });
    }
  };
}
