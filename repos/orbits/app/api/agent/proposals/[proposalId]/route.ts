import { NextResponse } from "next/server";

import { proposalView } from "../../../../../features/agent-v1/mcp/views";
import { mcpServices, mcpUnavailableResponse, NO_STORE, signedInActor, signInRequiredResponse } from "../../../_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4「确认链接」）：确认链接页读的接口。链接里只有一个编号；这里用登录账号核对它是不是这条提议的主人。
// 不是主人和编号不存在回答相同，响应里没有任何记录内容。确认、否决仍走账本的决定接口（/api/agent/ledger/[id]/transition），
// 那个接口按登录账号自己的账本找卡，别的账号找不到这张卡。
export async function GET(_request: Request, context: { params: Promise<{ proposalId: string }> }): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  if (!services) return mcpUnavailableResponse();
  const { proposalId } = await context.params;
  const view = await proposalView({ now: () => new Date().toISOString(), proposals: services.proposals, runtime: services.runtimeFor(actor.id) }, { accountId: actor.id, proposalId });
  if (!view) {
    return NextResponse.json({ error: { code: "NOT_FOUND", context: { reason: "PROPOSAL_NOT_FOR_THIS_ACCOUNT" }, message: "This link cannot be opened with the account you are signed in to." }, success: false }, { headers: NO_STORE, status: 404 });
  }
  return NextResponse.json({ data: view, success: true }, { headers: NO_STORE });
}
