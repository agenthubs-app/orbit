import { mcpServices } from "../api/_shared/mcp-access";

export const dynamic = "force-dynamic";

// agent-design AG17（设计稿 §5.4；视觉稿 D11 短地址）：MCP 端点，也就是用户抄进 Claude、Codex 的那个地址（orbitailink.com/connect）。
// 它就是端点本身，不是别名：令牌的受众绑定在这个地址上。放在 /api/ 之外：proxy 的会话检查只管 /api/ 和 /app/，
// 没有浏览器会话的外部客户端要拿到的是 MCP 授权规范要求的质询（401 带 resource_metadata），不是 proxy 的普通 401。
// 这里只认本服务签发、受众是本端点的令牌；会话 cookie 在这里不起作用。
function unavailable(): Response {
  return new Response(JSON.stringify({ error: { code: -32603, message: "External connections are not set up on this server." }, jsonrpc: "2.0" }), { headers: { "cache-control": "no-store", "content-type": "application/json" }, status: 503 });
}

export async function POST(request: Request): Promise<Response> {
  const services = mcpServices();
  return services ? services.endpoint.post(request) : unavailable();
}

// 没有可打开的流，也没有要结束的会话（2026-07-28 版）。
export async function GET(): Promise<Response> {
  const services = mcpServices();
  return services ? services.endpoint.methodNotAllowed() : unavailable();
}

export const DELETE = GET;
