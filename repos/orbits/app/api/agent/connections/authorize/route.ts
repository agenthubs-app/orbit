import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { AuthorizationRequest } from "../../../../../features/agent-v1/mcp/auth/server";
import type { McpServices } from "../../../../../features/agent-v1/mcp/configured";
import { accountKeyOf, consentView } from "../../../../../features/agent-v1/mcp/views";
import { agentConnectionConsentInputSchema } from "../../../../../shared/api-schema/agent-v1";
import type { AgentConnectionConsentResultContract } from "../../../../../shared/contract/agent-v1";
import { mcpServices, mcpUnavailableResponse, NO_STORE, signedInActor, signInRequiredResponse } from "../../../_shared/mcp-access";

export const dynamic = "force-dynamic";

const invalidRequest = () => NextResponse.json({ error: { code: "VALIDATION_ERROR", context: { reason: "AUTHORIZATION_REQUEST_INVALID" }, message: "This authorization request is no longer valid. Start again from the app that asked." }, success: false }, { headers: NO_STORE, status: 400 });

type Actor = NonNullable<Awaited<ReturnType<typeof signedInActor>>>;

/** What the page shows: the request, who is signed in, and what this client may already do for this account (视觉稿第 3 组). */
async function viewFor(services: McpServices, pending: AuthorizationRequest, actor: Actor) {
  const current = await services.connections.findActive(actor.id, pending.clientId);
  return consentView(pending, { account: { email: actor.email ?? null, id: actor.id, name: actor.name ?? null }, current });
}

// agent-design AG17（设计稿 §5.4「授权范围」；视觉稿第 1–4 组）：同意页用的两个接口，只认登录用户的网页会话。
// GET 读出这次请求是谁发的、请求了什么、现在登录的是谁、这个客户端已经能做什么；POST 是用户在页面上的选择——同意时按用户
// 选的发一次性的授权码，跳回客户端登记的回调地址。页面打开后换了账号（别的标签页里换的），POST 不执行，回 409 和新的页面内容。
export async function GET(request: Request): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  const addresses = services?.addresses(request);
  if (!services || !addresses) return mcpUnavailableResponse();
  const pending = await services.auth.readTicket(new URL(request.url).searchParams.get("request") ?? "", addresses);
  if (!pending) return invalidRequest();
  return NextResponse.json({ data: await viewFor(services, pending, actor), success: true }, { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  const addresses = services?.addresses(request);
  if (!services || !addresses) return mcpUnavailableResponse();
  const parsed = agentConnectionConsentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();
  if (parsed.data.accountKey !== undefined && parsed.data.accountKey !== accountKeyOf(actor.id)) {
    // 视觉稿第 2 组：中途换了账号，不照原来的执行；页面拿新的内容重新出，顶上说明账号变了。
    const pending = await services.auth.readTicket(parsed.data.request, addresses);
    if (!pending) return invalidRequest();
    return NextResponse.json({ data: await viewFor(services, pending, actor), error: { code: "CONFLICT", context: { reason: "ACCOUNT_CHANGED" }, message: "You are signed in to another account now. Look at the account and choose again." }, success: false }, { headers: NO_STORE, status: 409 });
  }
  const language = (await cookies()).get("orbit-lang")?.value;
  const decided = await services.auth.decide({ account: { accountId: actor.id, userId: actor.userId }, decision: parsed.data.decision, locale: language, scopes: parsed.data.scopes, ticket: parsed.data.request }, addresses);
  if (decided.ok === false) {
    if (decided.reason === "TICKET_INVALID") return invalidRequest();
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", context: { reason: "SCOPES_INVALID" }, message: "Choose at least one thing this app may do." }, success: false }, { headers: NO_STORE, status: 400 });
  }
  const data: AgentConnectionConsentResultContract = { redirectTo: decided.redirectTo };
  return NextResponse.json({ data, success: true }, { headers: NO_STORE });
}
