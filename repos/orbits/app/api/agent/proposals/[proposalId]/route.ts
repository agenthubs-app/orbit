import { NextResponse } from "next/server";

import { proposalResponse } from "../../../../../features/agent-v1/mcp/views";
import { mcpServices, mcpUnavailableResponse, NO_STORE, signedInActor, signInRequiredResponse } from "../../../_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4「确认链接」；视觉稿 D7）：确认链接页读的接口。链接里只有一个编号；这里用登录账号核对它是不是这条提议的主人。
// 别的账号拿到真链接、谁拿到打错的链接，得到的是同一个回答（同样的状态、代码和文字，之前做同样的读取），看不出链接真不真、是谁的。
// 确认、否决仍走账本的决定接口（/api/agent/ledger/[id]/transition），那个接口按登录账号自己的账本找卡，别的账号找不到这张卡。
export async function GET(_request: Request, context: { params: Promise<{ proposalId: string }> }): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  if (!services) return mcpUnavailableResponse();
  const { proposalId } = await context.params;
  const answer = await proposalResponse({ now: () => new Date().toISOString(), proposals: services.proposals, runtime: services.runtimeFor(actor.id) }, { accountId: actor.id, proposalId });
  return NextResponse.json(answer.body, { headers: NO_STORE, status: answer.status });
}
