import { timingSafeEqual } from "node:crypto";

import { runConfiguredAccountRightsMaintenancePass } from "../../../../features/account/data-rights/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 401, headers });
  if (new URL(request.url).searchParams.size) return new Response(null, { status: 400, headers });
  try {
    const result = await runConfiguredAccountRightsMaintenancePass();
    if (!result) return Response.json({ error: "unavailable" }, { status: 503, headers });
    return Response.json({ data: result }, { status: result.expiryFailed || result.delivery.uncertain ? 503 : 200, headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
