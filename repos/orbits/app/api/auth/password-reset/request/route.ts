import { handlePasswordResetRequest } from "../../../../../features/auth/password-reset-http";
import { after } from "next/server";
import { dispatchPasswordResetMail } from "../../../../../features/auth/password-reset-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const response = await handlePasswordResetRequest(request, "request");
  if (response.status === 202) after(async () => {
    try { await dispatchPasswordResetMail(); }
    catch { console.error("Password reset dispatch failed; durable queue retained"); }
  });
  return response;
}
