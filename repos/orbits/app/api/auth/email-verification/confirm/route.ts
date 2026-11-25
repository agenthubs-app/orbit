import { NextResponse } from "next/server";

import { authRateLimitedResponse } from "../../../../../features/auth/auth-rate-limit";
import { configuredEmailVerification } from "../../../../../features/auth/email-verification";
import { withinPublicAuthLimit } from "../../../../../features/auth/public-rate";
import { recordSignupFunnel } from "../../../../../features/signup-funnel/record";
import { failure, success } from "../../../../../shared/api/envelope";
import type { EmailVerificationConfirmResult } from "../../../../../shared/contract/email-verification";
import { AppError } from "../../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

/** 公开：点邮件里的链接。不签发会话、不说出是哪个账号。 */
export async function POST(request: Request): Promise<Response> {
  if (!await withinPublicAuthLimit("verify-email", request.headers)) return authRateLimitedResponse(600);
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  try {
    const verification = configuredEmailVerification();
    if (!verification) throw new Error("unconfigured");
    const result = await verification.service.confirm(body?.token);
    if (result.outcome === "verified") recordSignupFunnel((store) => store.step({ userId: result.userId, name: "email_verified", client: null }));
    return NextResponse.json(success<EmailVerificationConfirmResult>({ outcome: result.outcome }), { headers, status: 200 });
  } catch {
    return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Email verification is unavailable.")), { headers, status: 503 });
  }
}
