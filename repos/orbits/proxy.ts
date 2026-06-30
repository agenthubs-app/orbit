/**
 * `/app` 路由组的语言偏好 proxy。
 *
 * 用户通过 `?lang=zh|en` 切换语言时，这里把语言写入请求头和 cookie。
 * 页面 layout 再从 `x-orbit-lang` 或 `orbit-lang` cookie 恢复语言上下文。
 */
import { NextResponse, type NextRequest } from "next/server";

function normalizeOrbitLanguage(value: string | null) {
  // 只允许产品声明过的语言值进入 header/cookie，避免任意 query 污染请求上下文。
  return value === "en" ? "en" : value === "zh" ? "zh" : null;
}

export function proxy(request: NextRequest) {
  // Next proxy 不能直接改原 request，因此复制 headers 后交给 NextResponse.next。
  const language = normalizeOrbitLanguage(request.nextUrl.searchParams.get("lang"));
  const requestHeaders = new Headers(request.headers);

  if (language) {
    requestHeaders.set("x-orbit-lang", language);
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
}

export const config = {
  // 只作用于产品 app 路由；公开落地页和 API 不通过这个语言 proxy。
  matcher: "/app/:path*",
};
