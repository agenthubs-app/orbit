import { NextResponse } from "next/server";

import { mcpAddresses } from "../../../features/agent-v1/mcp/auth/config";
import { protectedResourceMetadata } from "../../../features/agent-v1/mcp/auth/server";

export const dynamic = "force-dynamic";

// agent-design AG17：RFC 9728 的资源元数据（MCP 端点是谁、它的授权服务器在哪、有哪些范围）。公开文档，不含用户数据。
export async function GET(request: Request): Promise<Response> {
  const addresses = mcpAddresses(request);
  if (!addresses) return NextResponse.json({ error: "External connections are not set up on this server." }, { status: 503 });
  return NextResponse.json(protectedResourceMetadata(addresses), { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } });
}
