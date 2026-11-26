import { NextResponse } from "next/server";

import { auth } from "../../../../../auth";
import { configuredEmailVerification } from "../../../../../features/auth/email-verification";
import { failure, success } from "../../../../../shared/api/envelope";
import type { EmailVerificationSendFailureReason, EmailVerificationSendResult } from "../../../../../shared/contract/email-verification";
import { AppError } from "../../../../../shared/errors/app-error";
import { resolveRequestOrbitLanguage, parseOrbitLanguage } from "../../../../(app)/app/orbit-language-core";
import { requestCookie } from "../../../../../features/signup-funnel/context";

const headers = { "cache-control": "private, no-store" };

type Account = { email: string; userId: string };

async function sessionAccount(): Promise<Account | null> {
  const user = (await auth())?.user;
  return user?.id && user.email ? { email: user.email, userId: user.id } : null;
}

export function requestMailLanguage(request: Request, value: unknown) {
  return (typeof value === "string" ? parseOrbitLanguage(value) : null) ?? resolveRequestOrbitLanguage({
    header: request.headers.get("x-orbit-lang"),
    cookie: requestCookie(request, "orbit-lang"),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

function refused(code: "RATE_LIMITED" | "SERVICE_UNAVAILABLE", status: number, reason: EmailVerificationSendFailureReason, retryAfterSeconds?: number): Response {
  // 429 的 code 与登录限流的响应一致（authRateLimitedResponse）；context 的值一律是字符串。
  return NextResponse.json({ success: false, error: { code, message: reason, context: { reason, ...(retryAfterSeconds ? { retryAfterSeconds: String(retryAfterSeconds) } : {}) } } }, {
    headers: { ...headers, ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}) }, status,
  });
}

/** 给自己这个账号重新发一封验证邮件（shared/contract/email-verification.ts）。 */
export function createEmailVerificationSendHandler(resolveAccount: () => Promise<Account | null> = sessionAccount) {
  return async function POST(request: Request): Promise<Response> {
    const account = await resolveAccount();
    if (!account) return NextResponse.json(failure(new AppError("UNAUTHORIZED", "Sign in to access this resource.")), { headers, status: 401 });
    const body = await request.json().catch(() => null) as { language?: unknown } | null;
    const verification = configuredEmailVerification();
    if (!verification || verification.deliverable === false) {
      console.warn(JSON.stringify({ event: "email_verification_unavailable", blocker: verification ? verification.blocker : "database_configuration" }));
      return refused("SERVICE_UNAVAILABLE", 503, "EMAIL_SEND_UNAVAILABLE");
    }
    try {
      const outcome = await verification.service.send(account, requestMailLanguage(request, body?.language));
      if (outcome.state === "too_soon") return refused("RATE_LIMITED", 429, "EMAIL_SEND_TOO_SOON", outcome.retryAfterSeconds);
      if (outcome.state === "daily_limit") return refused("RATE_LIMITED", 429, "EMAIL_SEND_DAILY_LIMIT");
      if (outcome.state === "failed") return refused("SERVICE_UNAVAILABLE", 502, "EMAIL_SEND_FAILED");
      return NextResponse.json(success<EmailVerificationSendResult>({
        email: account.email, verified: outcome.state === "verified", ...(outcome.state === "sent" ? { sentAt: outcome.sentAt } : {}),
      }), { headers, status: 200 });
    } catch {
      console.error(JSON.stringify({ event: "email_verification_send_failed" }));
      return refused("SERVICE_UNAVAILABLE", 502, "EMAIL_SEND_FAILED");
    }
  };
}
