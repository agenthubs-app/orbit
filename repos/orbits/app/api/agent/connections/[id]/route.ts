import { NextResponse } from "next/server";

import { mcpServices, mcpUnavailableResponse, NO_STORE, signedInActor, signInRequiredResponse } from "../../../_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4）：撤销一条连接。先把连接标为已撤销（它的下一次调用就被拒），
// 再把它提过、还没人确认的修改作废；已经确认执行的保留。别人的连接和不存在的编号回答相同。
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  if (!services) return mcpUnavailableResponse();
  const { id } = await context.params;
  const revoked = await services.revoke({ accountId: actor.id, connectionId: id });
  if (!revoked) return NextResponse.json({ error: { code: "NOT_FOUND", message: "No such connection." }, success: false }, { headers: NO_STORE, status: 404 });
  return NextResponse.json({ data: { id: revoked.connection.id, revokedAt: revoked.connection.revokedAt, voidedProposals: revoked.voided }, success: true }, { headers: NO_STORE });
}
