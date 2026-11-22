import { NextResponse } from "next/server";

import { runtimeBoundaryHeaders } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { handleCardRecheck } from "../../../../../../features/agent/ledger/card-routes";
import { conversationCardHook } from "../../../../../../features/agent-v1/entry/card-document";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// agent-design AG07（设计稿 §7「同步后按最新数据重出差异」）：客户端同步完自己的修改后请服务端再看一遍这张卡。
// 不是决定、不写业务数据：卡上显示过的值变了，就按现在的数据出新版本并标出变化的那一行，仍要用户再点确认。
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const result = await handleCardRecheck({ actionId: id, onCardRevised: conversationCardHook(mode, agentContext.actorId), runtime: agentContext.runtime });
  return NextResponse.json(result.body, { headers: runtimeBoundaryHeaders(mode), status: result.status });
}
