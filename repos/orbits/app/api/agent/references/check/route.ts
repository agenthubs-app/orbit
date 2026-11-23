import { NextResponse } from "next/server";

import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import { agentReferenceCheckInputSchema } from "../../../../../shared/api-schema/agent-v1";
import { configuredRecordAccess } from "../../../../../features/agent-v1/domains/configured";
import { checkReferences } from "../../../../../features/agent-v1/references/search";
import { agentRequestUnauthorizedResponse, resolveAgentRequestContext } from "../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// agent-design AG11（视觉稿 D7）：已选的记录现在还打不打得开（草稿恢复时、发送前）。与每一轮服务端的核对相同，
// 只回答能否打开和名字；打不开的照样可以发，回答里会请用户重新选。不读内容给客户端，不经模型。
export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const headers = { ...runtimeBoundaryHeaders(mode), "cache-control": "no-store" };
  const context = await resolveAgentRequestContext(mode);
  if (!context?.actorId) return agentRequestUnauthorizedResponse();
  const parsed = agentReferenceCheckInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "The references are not valid.")), { headers, status: 400 });
  const access = configuredRecordAccess();
  if (!access) return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Records cannot be read right now.")), { headers, status: 503 });
  const result = await checkReferences(access, context.actorId, parsed.data.references);
  return NextResponse.json(success(result), { headers, status: 200 });
}
