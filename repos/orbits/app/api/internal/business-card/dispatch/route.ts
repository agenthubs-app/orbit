import { handleCardDispatchScanRequest } from "../../../../../features/acquisition/business-card-dispatch-scan-http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  return handleCardDispatchScanRequest(request);
}
