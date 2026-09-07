import { timingSafeEqual } from "node:crypto";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { getConfiguredIngestV2 } from "./business-card-ingest-v2/configured";
import { redispatchPendingCardWork, type CardDispatchScanResult } from "./business-card-dispatch-scan";

async function runConfiguredCardScan(): Promise<CardDispatchScanResult> {
  const configured = createConfiguredPostgresLiveRecordStore();
  const ingest = getConfiguredIngestV2();
  if (!configured || !ingest) throw new Error("Business-card scan configuration unavailable.");
  await ingest.ready;
  return redispatchPendingCardWork({ client: configured.client, workspaceId: configured.workspaceId });
}

export async function handleCardDispatchScanRequest(
  request: Request,
  run: () => Promise<CardDispatchScanResult> = runConfiguredCardScan,
  secret = process.env.CRON_SECRET?.trim(),
): Promise<Response> {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 401, headers });
  if (new URL(request.url).searchParams.size > 0) {
    return Response.json({ error: { code: "SCAN_PARAMETERS_FORBIDDEN" } }, { status: 400, headers });
  }
  try {
    const result = await run();
    console.info(JSON.stringify({ event: "business_card_dispatch_scan", ...result }));
    return Response.json({ data: result }, { status: result.failed > 0 ? 503 : 200, headers });
  } catch {
    return Response.json({ error: { code: "BUSINESS_CARD_DISPATCH_SCAN_UNAVAILABLE" } }, { status: 503, headers });
  }
}
