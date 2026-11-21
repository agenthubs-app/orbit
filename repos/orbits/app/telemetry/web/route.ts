/**
 * P0 browser timing beacon (shared/observability/web-metrics.ts). Outside `/api` on purpose: the proxy
 * (and its per-request session check against the database) does not run here, so a beacon costs no
 * database work. Validates, writes one log line, answers 204. Stops logging when the P0 week ends.
 */
import { p0MeasurementActive } from "../../../shared/observability/request-timing";
import { WEB_METRICS_MAX_BYTES, parseWebMetric } from "../../../shared/observability/web-metrics";

export const dynamic = "force-dynamic";

const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!p0MeasurementActive()) return noContent();
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > WEB_METRICS_MAX_BYTES) return noContent();
  let text = "";
  try {
    text = await request.text();
  } catch {
    return noContent();
  }
  if (text.length > WEB_METRICS_MAX_BYTES) return noContent();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return noContent();
  }
  const metric = parseWebMetric(parsed);
  if (metric) {
    console.info(JSON.stringify({ event: "web_timing", region: process.env.VERCEL_REGION ?? null, ...metric }));
  }
  return noContent();
}
