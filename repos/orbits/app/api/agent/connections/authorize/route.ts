import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { consentView } from "../../../../../features/agent-v1/mcp/views";
import { agentConnectionConsentInputSchema } from "../../../../../shared/api-schema/agent-v1";
import type { AgentConnectionConsentResultContract } from "../../../../../shared/contract/agent-v1";
import { mcpServices, mcpUnavailableResponse, NO_STORE, signedInActor, signInRequiredResponse } from "../../../_shared/mcp-access";

export const dynamic = "force-dynamic";

const invalidRequest = () => NextResponse.json({ error: { code: "VALIDATION_ERROR", context: { reason: "AUTHORIZATION_REQUEST_INVALID" }, message: "This authorization request is no longer valid. Start again from the app that asked." }, success: false }, { headers: NO_STORE, status: 400 });

// agent-design AG17（设计稿 §5.4「授权范围」）：同意页用的两个接口，只认登录用户的网页会话。
// GET 读出这次请求是谁发的、请求了什么；POST 是用户在页面上的选择——同意时按用户勾的范围发一次性的授权码，跳回客户端登记的回调地址。
export async function GET(request: Request): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  const addresses = services?.addresses(request);
  if (!services || !addresses) return mcpUnavailableResponse();
  const pending = await services.auth.readTicket(new URL(request.url).searchParams.get("request") ?? "", addresses);
  if (!pending) return invalidRequest();
  return NextResponse.json({ data: consentView(pending), success: true }, { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const actor = await signedInActor();
  if (!actor) return signInRequiredResponse();
  const services = mcpServices();
  const addresses = services?.addresses(request);
  if (!services || !addresses) return mcpUnavailableResponse();
  const parsed = agentConnectionConsentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();
  const language = (await cookies()).get("orbit-lang")?.value;
  const decided = await services.auth.decide({ account: { accountId: actor.id, userId: actor.userId }, decision: parsed.data.decision, locale: language, scopes: parsed.data.scopes, ticket: parsed.data.request }, addresses);
  if (decided.ok === false) {
    if (decided.reason === "TICKET_INVALID") return invalidRequest();
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", context: { reason: "SCOPES_INVALID" }, message: "Choose at least one thing this app may do." }, success: false }, { headers: NO_STORE, status: 400 });
  }
  const data: AgentConnectionConsentResultContract = { redirectTo: decided.redirectTo };
  return NextResponse.json({ data, success: true }, { headers: NO_STORE });
}
