import { NextResponse } from "next/server";

import { mcpServices, mcpUnavailableResponse, NO_STORE } from "../../api/_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4「授权」）：授权端点。只核对请求（客户端在名单上、回调地址是它登记的、带 PKCE S256、
// resource 是本 MCP 端点），然后把浏览器带到 Orbit 的同意页（/app/settings/…，未登录由 proxy 先带去登录）。
// 这里不读会话、不发授权码；授权码只在用户登录后在同意页上点了同意才发。
export async function GET(request: Request): Promise<Response> {
  const services = mcpServices();
  const addresses = services?.addresses(request);
  if (!services || !addresses) return mcpUnavailableResponse();
  const outcome = await services.auth.authorize(new URL(request.url).searchParams, addresses);
  if (outcome.kind === "refused") {
    // 客户端或回调地址不可信时不跳转，直接说明（RFC 6749 §4.1.2.1）。
    return NextResponse.json({ error: outcome.error, error_description: outcome.description }, { headers: NO_STORE, status: outcome.status });
  }
  return NextResponse.redirect(outcome.location, { headers: NO_STORE, status: 302 });
}
