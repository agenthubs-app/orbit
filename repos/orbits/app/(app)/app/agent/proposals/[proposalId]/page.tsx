/**
 * agent-design AG17（设计稿 §5.4「确认链接」；视觉稿第 5、6 组）：外部助手给的确认链接打开的页面。
 *
 * 链接里只有一个随机编号。服务端按现在登录的账号读：是这个账号的提议才有内容；别的账号和打错的编号得到同一页（D7），
 * 页面上没有关于这条修改的任何字。内容在服务端读好再出页，第一次绘制就是完整的卡（不先出骨架再换）；
 * 有意不进读取缓存：每次都按登录账号核对。没登录时 proxy 先带去登录（登录框多一行「有一条修改等你确认」）。
 */
import { proposalView } from "../../../../../../features/agent-v1/mcp/views";
import { mcpServices, signedInActor } from "../../../../../api/_shared/mcp-access";
import { ProposalConfirmPage, type ProposalPageInitial } from "../../../orbit-2026/agent-connections/ProposalConfirm";

export const dynamic = "force-dynamic";

async function initialState(proposalId: string): Promise<ProposalPageInitial> {
  const actor = await signedInActor();
  const services = mcpServices();
  if (!actor || !services) return { kind: "unavailable" };
  const view = /^prop_[A-Za-z0-9_-]{16,80}$/u.test(proposalId) ? await proposalView({ now: () => new Date().toISOString(), proposals: services.proposals, runtime: services.runtimeFor(actor.id) }, { accountId: actor.id, proposalId }) : null;
  return view ? { kind: "found", view } : { account: { email: actor.email ?? null, name: actor.name ?? null }, kind: "not_here" };
}

export default async function AgentProposalPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  return <ProposalConfirmPage initial={await initialState(decodeURIComponent(proposalId))} />;
}
