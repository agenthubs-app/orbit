import { timingSafeEqual } from "node:crypto";
import { dispatchPasswordResetMail } from "../../../../../features/auth/password-reset-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 401 });
  try {
    const result = await dispatchPasswordResetMail();
    return Response.json(result, { status: result.configured ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ success: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
