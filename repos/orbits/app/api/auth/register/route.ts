import { NextResponse, after } from "next/server";

import {
  authUserFailureContext,
  authUserFailureToAppError,
} from "../../../../features/auth/service";
import { authClientIp, authRateLimitedResponse, getAuthRateLimiter } from "../../../../features/auth/auth-rate-limit";
import { authUserFailure } from "../../../../features/auth/contract";
import { configuredEmailVerification } from "../../../../features/auth/email-verification";
import { SIGNUP_COOKIE, readSignupCookie, requestCookie, signupClient, signupSource, signupVisitorId } from "../../../../features/signup-funnel/context";
import { recordSignupFunnel } from "../../../../features/signup-funnel/record";
import { resolveAuthUserService } from "../../../../features/auth/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { isPublishedLegalConsent } from "../../../../shared/compute/legal-version";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import type { AccountRegisterEmailVerification } from "../../../../shared/contract/account-register";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { requestMailLanguage } from "../../account/email-verification/send/handler";

export const dynamic = "force-dynamic";

// /api/auth/register 创建邮箱密码账号。注册成功后由前端调 signIn("credentials")
// 建立会话;本 route 不签发任何 cookie。
export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: unknown;
    email?: unknown;
    password?: unknown;
    consent?: { accepted?: unknown; termsVersion?: unknown; privacyVersion?: unknown } | null;
    client?: unknown;
    language?: unknown;
    source?: unknown;
    visitorId?: unknown;
  };
  const gate = await (await getAuthRateLimiter()).checkRegister({
    email: typeof body.email === "string" ? body.email : "",
    ip: authClientIp(request.headers),
  });
  if (gate.allowed === false) return authRateLimitedResponse(gate.retryAfterSeconds);
  const authService = resolveAuthUserService(mode);
  const client = signupClient(body.client);
  const { accepted, termsVersion, privacyVersion } = body.consent ?? {};
  const agreed = accepted === true && typeof termsVersion === "string" && typeof privacyVersion === "string" && isPublishedLegalConsent(termsVersion, privacyVersion);

  const result = agreed === false ? authUserFailure("AUTH_CONSENT_REQUIRED") : await authService.registerUser({
    consent: { client, privacyVersion: privacyVersion as string, termsVersion: termsVersion as string },
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    displayName:
      typeof body.displayName === "string" ? body.displayName : undefined,
  });

  if (result.state !== "success") {
    const appError = authUserFailureToAppError(result);

    return NextResponse.json(
      failure(appError, authUserFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  const { user } = result.data;
  // 建号已经成功：发信与漏斗都在响应之后做，失败不影响注册。
  const verification = mode === "live" ? configuredEmailVerification() : null;
  const sending = verification?.deliverable === true;
  if (verification && sending) {
    const language = requestMailLanguage(request, body.language);
    after(async () => {
      try { await verification.service.send({ email: user.email, userId: user.id }, language); }
      catch { console.error(JSON.stringify({ event: "email_verification_first_send_failed" })); }
    });
  }
  const signup = client === "web" ? readSignupCookie(requestCookie(request, SIGNUP_COOKIE)) : null;
  const visitorId = signup?.visitorId ?? (client === "app" ? signupVisitorId(body.visitorId) : null);
  const source = signup?.source ?? signupSource(body.source);
  recordSignupFunnel((funnel) => funnel.accountCreated({ userId: user.id, visitorId, client, source }));

  const emailVerification: AccountRegisterEmailVerification = { email: user.email, sending };
  const response = NextResponse.json(success({ user, emailVerification }), {
    headers: runtimeBoundaryHeaders(mode),
    status: 201,
  });
  if (signup) response.cookies.delete(SIGNUP_COOKIE);
  return response;
}
