// NextAuth 的 catch-all(登录/回调/会话/CSRF 全在这里)。
// 配置在项目根 auth.ts;route 保持薄壳,与参考实现一致。
//
// 隧道适配:zrok 把 Host 改写成 localhost:3000 且只带 x-forwarded-proto,
// Next 由此固化出 https://localhost:3000 的 request.url,Auth.js 直接消费它,
// 导致 Google OAuth 的 redirect_uri 变成未注册的地址。中间件层改头无法影响
// 已固化的 request.url,所以在这里重建 Request:指纹(proto 含 https 且
// host 是 localhost)命中时,把 URL 的 origin 换成 ORBIT_PUBLIC_HOST。
// 本机直连没有 x-forwarded-proto,不受影响——两个入口同时可用。
import { NextRequest } from "next/server";

import { handlers } from "../../../../auth";

function withPublicOrigin(request: NextRequest): NextRequest {
  const publicHost = process.env.ORBIT_PUBLIC_HOST?.trim();

  if (!publicHost) {
    return request;
  }

  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "";

  if (
    !forwardedProto.includes("https") ||
    !/^localhost(:\d+)?$/i.test(url.host)
  ) {
    return request;
  }

  url.protocol = "https:";
  url.host = publicHost;
  url.port = "";

  return new NextRequest(url, request);
}

export const GET = (request: NextRequest): Promise<Response> =>
  handlers.GET(withPublicOrigin(request));

export const POST = (request: NextRequest): Promise<Response> =>
  handlers.POST(withPublicOrigin(request));
