import { NextResponse } from "next/server";

import { authRateLimitedResponse } from "../../../../features/auth/auth-rate-limit";
import { withinPublicAuthLimit } from "../../../../features/auth/public-rate";
import { SIGNUP_COOKIE, SIGNUP_COOKIE_MAX_AGE, newSignupVisitorId, readSignupCookie, requestCookie, signupClient, signupCookieValue, signupSource, signupVisitorId } from "../../../../features/signup-funnel/context";
import { recordSignupFunnel } from "../../../../features/signup-funnel/record";
import { failure } from "../../../../shared/api/envelope";
import { AppError } from "../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1024;

/** 匿名：只收「打开注册」，只记端和来源类别（shared/contract/signup-funnel.ts）。 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  try {
    body = text.length <= MAX_BYTES ? JSON.parse(text) as Record<string, unknown> : null;
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || body.name !== "register_opened" || (body.client !== "web" && body.client !== "app")) {
    return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "Unknown event.")), { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (!await withinPublicAuthLimit("funnel", request.headers)) return authRateLimitedResponse(600);
  const client = signupClient(body.client);
  const source = signupSource(body.source);
  const visitorId = client === "app" ? signupVisitorId(body.visitorId)
    : readSignupCookie(requestCookie(request, SIGNUP_COOKIE))?.visitorId ?? newSignupVisitorId();
  const response = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  if (!visitorId) return response;
  recordSignupFunnel((store) => store.opened({ visitorId, client, source }));
  if (client === "web") {
    response.cookies.set(SIGNUP_COOKIE, signupCookieValue({ visitorId, source, client }), {
      httpOnly: true, maxAge: SIGNUP_COOKIE_MAX_AGE, path: "/", sameSite: "lax", secure: new URL(request.url).protocol === "https:",
    });
  }
  return response;
}
