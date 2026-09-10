import { handleMaintenanceRequest } from "../../../../features/operations/maintenance/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron (production) and any external scheduler call this with
// `Authorization: Bearer $CRON_SECRET`. It runs one maintenance pass and
// starts or repairs the queue heartbeat that keeps passes running between calls.
export async function GET(request: Request): Promise<Response> {
  return handleMaintenanceRequest(request);
}
