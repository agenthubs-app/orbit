import { NextResponse } from "next/server";

import { connectionView, scopeOptions } from "../../../../features/agent-v1/mcp/views";
import type { AgentConnectionListContract } from "../../../../shared/contract/agent-v1";
import { mcpServices, mcpUnavailableResponse, NO_STORE, signedInActor, signInRequiredResponse } from "../../_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4「用户怎样管理连接」）：登录用户自己的外部连接——哪个客户端、能读什么、能提什么、上次什么时候用过。
// 只认网页会话；外部客户端的令牌到不了这里（proxy 对没有会话的 /api/ 请求一律 401）。
export async function GET(): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  if (!services) return mcpUnavailableResponse();
  const data: AgentConnectionListContract = { connections: (await services.connections.list(actor.id)).map(connectionView), options: scopeOptions() };
  return NextResponse.json({ data, success: true }, { headers: NO_STORE });
}
