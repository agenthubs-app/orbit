import { NextResponse } from "next/server";

import { runtimeBoundaryHeaders } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { handleCardRegenerate } from "../../../../../../features/agent/ledger/card-routes";
import { conversationCardHook } from "../../../../../../features/agent-v1/entry/card-document";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// agent-design AG02（设计稿 §5.2「卡片过期」）：重新生成过期的卡。不是决定：沿用原操作意图，
// 按现在的数据出新版本并重置有效期，仍要用户再点确认。
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const result = await handleCardRegenerate({ actionId: id, onCardRevised: conversationCardHook(mode, agentContext.actorId), runtime: agentContext.runtime });
  return NextResponse.json(result.body, { headers: runtimeBoundaryHeaders(mode), status: result.status });
}
