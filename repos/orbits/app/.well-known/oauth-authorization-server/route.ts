import { NextResponse } from "next/server";

import { mcpAddresses } from "../../../features/agent-v1/mcp/auth/config";
import { authorizationServerMetadata } from "../../../features/agent-v1/mcp/auth/server";

export const dynamic = "force-dynamic";

// agent-design AG17：RFC 8414 的授权服务器元数据（授权端点、令牌端点、只支持 S256、公开客户端、接受客户端身份文档）。
export async function GET(request: Request): Promise<Response> {
  const addresses = mcpAddresses(request);
  if (!addresses) return NextResponse.json({ error: "External connections are not set up on this server." }, { status: 503 });
  return NextResponse.json(authorizationServerMetadata(addresses), { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } });
}
