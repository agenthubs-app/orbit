/**
 * agent-design AG17（视觉稿第 1–4 组）：Claude、Codex 把用户带来的同意页。没有导航，只决定给不给、给哪些。
 *
 * 内容在服务端读好再出页（请求是谁发的、现在登录的是谁、这个客户端已经能做什么），第一次绘制就是完整的一页，不先出骨架再换。
 * 有意不进读取缓存：每次都要按现在登录的账号核对（web-no-flash-and-cache-rules 二、4「有意不缓存的页面」）。
 * 没登录时 proxy 先带去登录（登录框多一行，D8），登录后回到这里。
 */
import { CONSENT_PAGE_PATH } from "../../../../../../features/agent-v1/mcp/auth/config";
import { consentView } from "../../../../../../features/agent-v1/mcp/views";
import { mcpServices, requestOrigin, signedInActor } from "../../../../../api/_shared/mcp-access";
import { ConsentPage, type ConsentInitial } from "../../../orbit-2026/agent-connections/ConsentPage";

export const dynamic = "force-dynamic";

async function initialState(params: { request?: string | string[]; unsupported?: string | string[] }): Promise<ConsentInitial> {
  if (params.unsupported) return { kind: "unsupported" };
  const ticket = Array.isArray(params.request) ? params.request[0] : params.request;
  if (!ticket) return { kind: "stale", clientName: null };
  const actor = await signedInActor();
  const services = mcpServices();
  const origin = await requestOrigin();
  const addresses = services && origin ? services.addresses(new Request(`${origin}${CONSENT_PAGE_PATH}`)) : null;
  if (!actor || !services || !addresses) return { kind: "unavailable", ticket };
  const pending = await services.auth.readTicket(ticket, addresses);
  if (!pending) return { kind: "stale", clientName: null };
  const current = await services.connections.findActive(actor.id, pending.clientId);
  return { kind: "ready", ticket, view: consentView(pending, { account: { email: actor.email ?? null, id: actor.id, name: actor.name ?? null }, current }) };
}

export default async function AgentConnectionConsentPage({ searchParams }: { searchParams: Promise<{ request?: string | string[]; unsupported?: string | string[] }> }) {
  return <ConsentPage initial={await initialState(await searchParams)} />;
}
