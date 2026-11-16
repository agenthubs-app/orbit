import { handleMaintenanceRequest } from "../../../../features/operations/maintenance/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron (production, hourly) and any external scheduler call this with
// `Authorization: Bearer $CRON_SECRET`. It runs one maintenance pass, which also
// queues delayed wakes for reminders due before the next pass.
export async function GET(request: Request): Promise<Response> {
  return handleMaintenanceRequest(request);
}
