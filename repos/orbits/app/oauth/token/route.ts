import { NextResponse } from "next/server";

import { mcpServices, NO_STORE } from "../../api/_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4「授权」）：令牌端点。公开客户端（没有密钥），靠授权码加 PKCE；刷新令牌每次轮换，
// 旧的再用一次就结束整条连接。请求体是 application/x-www-form-urlencoded（RFC 6749 §4.1.3）。
export async function POST(request: Request): Promise<Response> {
  const services = mcpServices();
  const addresses = services?.addresses(request);
  if (!services || !addresses) return NextResponse.json({ error: "temporarily_unavailable", error_description: "External connections are not set up on this server." }, { headers: NO_STORE, status: 503 });
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "The body must be form-encoded." }, { headers: NO_STORE, status: 400 });
  }
  const result = await services.auth.token(form, addresses);
  return NextResponse.json(result.body, { headers: { ...NO_STORE, pragma: "no-cache" }, status: result.status });
}
