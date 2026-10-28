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
import {
  profileOnboardingRedirectPath,
  shouldGateProfileOnboardingRequest,
} from "./app/(app)/app/profile/profile-onboarding-route-policy";

function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === "/api/health" ||
    pathname === "/api/health/error" ||
    pathname.startsWith("/api/events/public") ||
    // 注册前聚类预览只返回阈值保护后的聚合桶（无任何个人数据），供匿名
    // 详情页展示"谁会来"，因此放行；正则精确到该单一路径。
    /^\/api\/events\/[^/]+\/registration\/preview$/u.test(pathname) ||
    // R27（R26-08）：未登录可看活动列表（探す「すべて」，只公开目录、无分数）与详情（只公开资料的参加者）。
    pathname === "/api/events/discover" ||
    /^\/api\/events\/[^/]+\/overview$/u.test(pathname) ||
    // R08: an invite preview (only the fields the inviter chose to share) is read
    // before sign-in, and the App asks for the minimum version at start-up.
    /^\/api\/invite-codes\/[^/]+\/preview$/u.test(pathname) ||
    pathname === "/api/app/version" ||
    // R17（host/DESIGN.md §2.8、§2.11）：公开主办方页的资料读取，与共同运营邀请的落地预览（无效码一律同一回答、有限流）。
    /^\/api\/organizers\/by-slug\/[^/]+$/u.test(pathname) ||
    /^\/api\/host\/cohost-invites\/[^/]+$/u.test(pathname) ||
    // R17-16：申込页短链 slug → 活动 id（只认已公开活动；与网页 `/e/<slug>` 的跳转同等公开）。
    /^\/api\/events\/by-slug\/[^/]+$/u.test(pathname) ||
    pathname.startsWith("/api/auth/") ||
    /^\/api\/integrations\/[^/]+\/callback$/u.test(pathname)
  );
}

export const proxy = auth(async (request) => {
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
    // Cron is a service identity, not an Auth.js user. Only this exact GET
    // delegates authentication to handleMaintenanceRequest's constant-time
    // CRON_SECRET guard. Queue consumers remain private Vercel triggers and
    // are not made public here; other internal APIs still require a session.
    !(request.method === "GET" && request.nextUrl.pathname === "/api/internal/maintenance") &&
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

  if (request.auth?.user?.id &&
      (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname.startsWith("/app/")) &&
      !request.nextUrl.pathname.startsWith("/api/auth/")) {
    const { accountRightsAccessDecision, readAccountRightsGateState } = await import("./features/account/data-rights/access-policy");
    // LF4: cached per instance for a few seconds; an unreadable store lets the request through (see the gate's comment).
    const state = await readAccountRightsGateState(request.auth.user.id);
    const decision = accountRightsAccessDecision(state, request.method, request.nextUrl.pathname);
    if (decision === "reject-api") {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Account deletion is in progress.",
        context: { reason: state === "unavailable" ? "ACCOUNT_STATUS_UNAVAILABLE" : "ACCOUNT_DELETION_PENDING" } } },
      { status: state === "unavailable" ? 503 : 423, headers: { "cache-control": "private, no-store" } });
    }
    if (decision === "redirect-pending") {
      return NextResponse.redirect(new URL("/app/account/pending", request.url), { headers: { "cache-control": "private, no-store" } });
    }
  }

  if (
    shouldGateProfileOnboardingRequest({
      authenticated: Boolean(request.auth?.user?.id),
      method: request.method,
      pathname: request.nextUrl.pathname,
    })
  ) {
    let access: { status: "complete" | "incomplete" | "unavailable" } = {
      status: "unavailable",
    };
    try {
      const onboardingAccess = await import(
        "./app/(app)/app/profile/profile-onboarding-access.server"
      );
      access = await onboardingAccess.readProfileOnboardingAccess({
        email: request.auth?.user?.email,
        name: request.auth?.user?.name,
        userId: request.auth!.user!.id,
      });
    } catch {
      // A gate dependency failure must not turn into an accidental pass.
    }

    if (access.status !== "complete") {
      const redirectResponse = NextResponse.redirect(
        new URL(
          profileOnboardingRedirectPath({
            pathname: request.nextUrl.pathname,
            search: request.nextUrl.search,
          }),
          request.url,
        ),
      );
      redirectResponse.headers.set("cache-control", "no-store");
      if (language) {
        redirectResponse.cookies.set("orbit-lang", language, {
          maxAge: 31536000,
          path: "/",
          sameSite: "lax",
        });
      }
      return redirectResponse;
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // A signed-in /app page carries this person's data: no browser or shared cache keeps it, so after signing
  // out the Back button cannot show the previous person's page from the back/forward cache (web.dev sign-out
  // best practices). The app's own in-memory caches (router cache, orbit-last-answer) are unaffected.
  if (request.nextUrl.pathname.startsWith("/app") && request.auth?.user?.id) {
    response.headers.set("cache-control", "private, no-store");
  }

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
