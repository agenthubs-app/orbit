import { NextResponse } from "next/server";

import { runtimeBoundaryHeaders } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { readCard } from "../../../../../features/agent/ledger/card-routes";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

// agent-design AG02（设计稿附录 D「action-preview」）：按编号取单张卡，返回当前版本、哈希和逐项状态。只读。
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const agentContext = await resolveAgentRequestContext(mode);
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const result = await readCard({ actionId: id, runtime: agentContext.runtime });
  return NextResponse.json(result.body, { headers: runtimeBoundaryHeaders(mode), status: result.status });
}
