import { handleAgentDispatchScanRequest } from "../../../../../features/agent/runtime/dispatch-scan-http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  return handleAgentDispatchScanRequest(request);
}
