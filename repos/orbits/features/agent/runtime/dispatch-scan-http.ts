import { timingSafeEqual } from "node:crypto";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { redispatchPendingAgentActions, type AgentDispatchScanResult } from "./dispatch-scan";

async function runConfiguredScan(): Promise<AgentDispatchScanResult> {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) throw new Error("Agent dispatch configuration unavailable.");
  return redispatchPendingAgentActions({ client: configured.client, workspaceId: configured.workspaceId });
}

export async function handleAgentDispatchScanRequest(
  request: Request,
  run: () => Promise<AgentDispatchScanResult> = runConfiguredScan,
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
    console.info(JSON.stringify({ event: "agent_dispatch_scan", ...result }));
    return Response.json({ data: result }, { status: result.failed > 0 ? 503 : 200, headers });
  } catch {
    return Response.json({ error: { code: "AGENT_DISPATCH_SCAN_UNAVAILABLE" } }, { status: 503, headers });
  }
}
