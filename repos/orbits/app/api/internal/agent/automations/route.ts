import { handleAutomationDispatchRequest } from "../../../../../features/agent/automations/dispatch-configured";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * agent-design AG15: the cross-account dispatch of scheduled rules, pending inbox deliveries and one-off timers.
 * It replaces the per-account worker entry that stood here (one process per account, the account in a request header):
 * what is due is claimed from the due index for every account at once, so no account is named in the request. The
 * maintenance pass runs the same dispatch about every 10 minutes; this route lets a scheduler call it on its own.
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAutomationDispatchRequest(request);
}
