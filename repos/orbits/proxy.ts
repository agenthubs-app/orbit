/**
 * `/app` 路由组的语言偏好 proxy。
 *
 * 用户通过 `?lang=zh|en|ja` 切换语言时，这里把语言写入请求头和 cookie。
 * 页面 layout 再从 `x-orbit-lang` 或 `orbit-lang` cookie 恢复语言上下文。
 */
import { NextResponse } from "next/server";

import { parseOrbitLanguage } from "./app/(app)/app/orbit-language-core";
import { auth } from "./auth";
import {
  isOrbitPrivateAppPath,
  normalizeOrbitAuthReturnPath,
} from "./features/auth/app-auth-routing";

function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === "/api/health" ||
    pathname === "/api/health/error" ||
    pathname.startsWith("/api/events/public") ||
    pathname.startsWith("/api/auth/") ||
    /^\/api\/integrations\/[^/]+\/callback$/u.test(pathname)
  );
}

export const proxy = auth((request) => {
  // Next proxy 不能直接改原 request，因此复制 headers 后交给 NextResponse.next。
  // 复用产品语言命名空间，但保留 null 语义，避免非法 query 污染 header/cookie。
  const language = parseOrbitLanguage(request.nextUrl.searchParams.get("lang"));
  const requestHeaders = new Headers(request.headers);

  // CORS preflight 按规范不携带业务会话，只声明随后请求的方法和 headers。
  // 这里仅确认 `/api` 的传输能力；真正的 GET/POST/PUT/PATCH/DELETE 仍继续
  // 经过下面的账号认证边界和各 route 自己的 actor 校验。
  if (
    request.method === "OPTIONS" &&
    request.nextUrl.pathname.startsWith("/api/")
  ) {
    return new NextResponse(null, {
      headers: {
        "cache-control": "no-store",
      },
      status: 204,
    });
  }

  if (language) {
    requestHeaders.set("x-orbit-lang", language);
  }

  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !isPublicApiPath(request.nextUrl.pathname) &&
    !request.auth?.user?.id
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required for this Orbit API.",
        },
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 401,
      },
    );
  }

  if (isOrbitPrivateAppPath(request.nextUrl.pathname) && !request.auth?.user?.id) {
    const loginUrl = new URL("/app/account/login", request.url);
    loginUrl.searchParams.set(
      "next",
      normalizeOrbitAuthReturnPath(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      ),
    );

    const redirectResponse = NextResponse.redirect(loginUrl);
    if (language) {
      redirectResponse.cookies.set("orbit-lang", language, {
        maxAge: 31536000,
        path: "/",
        sameSite: "lax",
      });
    }
    return redirectResponse;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (language) {
    // cookie 让后续没有 query 参数的 `/app` 页面继续使用用户选择的语言。
    response.cookies.set("orbit-lang", language, {
      maxAge: 31536000,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
});

export const config = {
  // 个人产品页面和 API 默认走统一会话边界；公开 API 由上面的窄白名单放行。
  matcher: ["/app/:path*", "/api/:path*"],
};
