import { handlePasswordResetRequest } from "../../../../../features/auth/password-reset-http";
import { after } from "next/server";
import { dispatchPasswordResetMail } from "../../../../../features/auth/password-reset-dispatch";

import { enqueuePasswordResetDelivery } from "../../../../../features/auth/password-reset-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const hosted = process.env.VERCEL === "1";
  const response = await handlePasswordResetRequest(request, "request", undefined, hosted ? enqueuePasswordResetDelivery : undefined);
  if (response.status === 202 && !hosted) after(async () => {
    try { await dispatchPasswordResetMail(); }
    catch { console.error("Password reset dispatch failed; durable queue retained"); }
  });
  return response;
}
