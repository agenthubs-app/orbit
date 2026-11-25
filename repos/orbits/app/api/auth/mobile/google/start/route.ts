import { NextResponse } from "next/server";

import { resolveMobileAuthService } from "../../../../../../features/auth/mobile-service-factory";
import { SIGNUP_COOKIE, SIGNUP_COOKIE_APP_MAX_AGE, newSignupVisitorId, signupCookieValue, signupSource, signupVisitorId } from "../../../../../../features/signup-funnel/context";
import { runtimeBoundaryHeaders } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { mobileAuthFailureResponse } from "../../http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = resolveFeatureMode();
  const service = resolveMobileAuthService(mode, { origin: url.origin });
  const result = await service.createBrokerRequest({
    codeChallenge: url.searchParams.get("code_challenge") ?? "",
    next: url.searchParams.get("next") ?? undefined,
    redirectUri: url.searchParams.get("redirect_uri") ?? "",
    state: url.searchParams.get("state") ?? "",
    purpose: url.searchParams.get("purpose") === "deletion-request" ? "deletion-request" : undefined,
  });

  if (result.success === false) {
    return mobileAuthFailureResponse(result, mode);
  }

  const brokerUrl = new URL("/app/account/mobile-google", request.url);
  brokerUrl.searchParams.set("request", result.data.request);

  const response = NextResponse.redirect(brokerUrl, {
    headers: runtimeBoundaryHeaders(mode),
    status: 302,
  });
  // 建号发生在随后的 Google 回调里：告诉它这是 App（同意记录与漏斗的「端」）。
  if (url.searchParams.get("purpose") !== "deletion-request") {
    response.cookies.set(SIGNUP_COOKIE, signupCookieValue({
      client: "app", source: signupSource(url.searchParams.get("signup_source")),
      visitorId: signupVisitorId(url.searchParams.get("signup_visitor")) ?? newSignupVisitorId(),
    }), { httpOnly: true, maxAge: SIGNUP_COOKIE_APP_MAX_AGE, path: "/", sameSite: "lax", secure: url.protocol === "https:" });
  }
  return response;
}
