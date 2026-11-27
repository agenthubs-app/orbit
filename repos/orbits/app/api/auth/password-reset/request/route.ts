import { authClientIp, authRateLimitedResponse, getAuthRateLimiter } from "../../../../../features/auth/auth-rate-limit";
import { handlePasswordResetRequest } from "../../../../../features/auth/password-reset-http";
import { after } from "next/server";
import { dispatchPasswordResetMail } from "../../../../../features/auth/password-reset-dispatch";

import { enqueuePasswordResetDelivery } from "../../../../../features/auth/password-reset-queue";
import { requestMailLanguage } from "../../../account/email-verification/send/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const gate = await (await getAuthRateLimiter()).checkResetRequest({ ip: authClientIp(request.headers) });
  if (gate.allowed === false) return authRateLimitedResponse(gate.retryAfterSeconds);
  const hosted = process.env.VERCEL === "1";
  // 重置邮件按申请页面的语言发（与注册验证邮件同一做法）。
  const response = await handlePasswordResetRequest(request, "request", undefined, hosted ? enqueuePasswordResetDelivery : undefined, requestMailLanguage(request, undefined));
  if (response.status === 202 && !hosted) after(async () => {
    try { await dispatchPasswordResetMail(); }
    catch { console.error("Password reset dispatch failed; durable queue retained"); }
  });
  return response;
}
