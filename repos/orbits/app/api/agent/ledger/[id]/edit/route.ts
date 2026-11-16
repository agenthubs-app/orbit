import { NextResponse } from "next/server";

import { runtimeBoundaryHeaders } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { handleCardEdit } from "../../../../../../features/agent/ledger/card-routes";
import { conversationCardHook } from "../../../../../../features/agent-v1/entry/card-document";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// agent-design AG06（设计稿 §5.1「去掉一项…只生成新版本」）：在卡上去掉一项。不是决定：
// 按卡上看到的版本与哈希，剩下的项按现在的数据重新冻结成下一版，仍要用户点确认。
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await handleCardEdit({ actionId: id, body: body ?? {}, onCardRevised: conversationCardHook(mode, agentContext.actorId), runtime: agentContext.runtime });
  return NextResponse.json(result.body, { headers: runtimeBoundaryHeaders(mode), status: result.status });
}
