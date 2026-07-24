import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";

import { auth } from "../../../../../../auth";
import { resolveMobileAuthService } from "../../../../../../features/auth/mobile-service-factory";
import { runtimeBoundaryHeaders } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  mobileAuthFailureResponse,
  mobileAuthUnauthorizedResponse,
} from "../../http";

export const dynamic = "force-dynamic";

function sessionCookie(request: NextAuthRequest): string | null {
  for (const cookieName of [
    "__Secure-authjs.session-token",
    "authjs.session-token",
  ]) {
    const value = request.cookies.get(cookieName)?.value;

    if (value) {
      return `${cookieName}=${value}`;
    }
  }

  return null;
}

export const GET = auth(async function mobileGoogleComplete(
  request: NextAuthRequest,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const cookieHeader = sessionCookie(request);
  const sessionUser = request.auth?.user;

  if (
    !cookieHeader ||
    !sessionUser?.id ||
    !sessionUser.email ||
    !sessionUser.name
  ) {
    return mobileAuthUnauthorizedResponse(mode);
  }

  const result = await resolveMobileAuthService(mode, {
    origin: request.nextUrl.origin,
  }).completeGoogleSession({
    brokerRequest: request.nextUrl.searchParams.get("request") ?? "",
    cookieHeader,
    user: {
      email: sessionUser.email,
      id: sessionUser.id,
      name: sessionUser.name,
    },
  });

  if (result.success === false) {
    return mobileAuthFailureResponse(result, mode);
  }

  const callback = new URL(result.data.redirectUri);
  callback.searchParams.set("code", result.data.code);
  callback.searchParams.set("state", result.data.state);

  return NextResponse.redirect(callback, {
    headers: runtimeBoundaryHeaders(mode),
    status: 302,
  });
});
