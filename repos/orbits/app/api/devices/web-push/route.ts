import { NextResponse } from "next/server";

import { webPushPublicKey } from "../../../../features/notifications/web-push-adapter";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

export const dynamic = "force-dynamic";

/**
 * agent-design AG16: what a browser needs to subscribe to reminders — this deployment's public VAPID key. `null` means
 * browser reminders are not set up here (the page then says so and asks the browser for nothing). The private half
 * never leaves the server.
 */
export async function GET(): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return authenticatedApiActorRequiredResponse("live");
  return NextResponse.json({ data: { publicKey: webPushPublicKey() } }, { headers: { "cache-control": "no-store" } });
}
