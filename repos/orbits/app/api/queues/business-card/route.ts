import { handleCallback } from "@vercel/queue";
import { isCardQueueWake } from "../../../../features/acquisition/business-card-queue-dispatch";
import { CardWorkPending, runConfiguredCardQueueTick } from "../../../../features/acquisition/business-card-queue-worker";
import { bootstrapMaintenanceHeartbeat } from "../../../../features/operations/maintenance/configured";

export const maxDuration = 300;

const consume = handleCallback(async (message: unknown) => {
  if (!isCardQueueWake(message)) return;
  try { await runConfiguredCardQueueTick(message.pipeline); } catch (error) {
    if (error instanceof CardWorkPending) throw error;
    throw new Error("Business-card background execution unavailable.");
  }
  // Hosts without cron (Preview) start the maintenance heartbeat from the
  // first background wake; a live chain makes this a single locked SELECT.
  await bootstrapMaintenanceHeartbeat();
}, {
  visibilityTimeoutSeconds: 360,
  retry: (error) => ({ afterSeconds: error instanceof CardWorkPending ? error.afterSeconds : 60 }),
});

export async function POST(request: Request): Promise<Response> { return consume(request); }
