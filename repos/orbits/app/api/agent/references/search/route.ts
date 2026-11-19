import { NextResponse } from "next/server";

import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import { agentReferenceSearchQuerySchema } from "../../../../../shared/api-schema/agent-v1";
import { configuredRecordAccess } from "../../../../../features/agent-v1/domains/configured";
import { searchReferences } from "../../../../../features/agent-v1/references/search";
import { agentRequestUnauthorizedResponse, resolveAgentRequestContext } from "../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// agent-design AG11（设计稿 §3.6、§10「@ 选择器」）：两端 @ 选择器的搜索。只查本人的六类记录（联系人、笔记、待办、日程、
// 活动、我去过），每类最多 5 条；只读，不经模型，结果不缓存（no-store）。
export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const headers = { ...runtimeBoundaryHeaders(mode), "cache-control": "no-store" };
  const context = await resolveAgentRequestContext(mode);
  if (!context?.actorId) return agentRequestUnauthorizedResponse();
  const url = new URL(request.url);
  const parsed = agentReferenceSearchQuerySchema.safeParse({ kind: url.searchParams.get("kind") ?? undefined, q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "The search words or kind are not valid.")), { headers, status: 400 });
  const access = configuredRecordAccess();
  if (!access) return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Records cannot be read right now.")), { headers, status: 503 });
  const result = await searchReferences(access, context.actorId, { kind: parsed.data.kind, query: parsed.data.q });
  return NextResponse.json(success(result), { headers, status: 200 });
}
