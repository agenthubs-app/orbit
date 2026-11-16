import { handleCallback } from "@vercel/queue";
import { isCardQueueWake } from "../../../../features/acquisition/business-card-queue-dispatch";
import { CardWorkPending, runConfiguredCardQueueTick } from "../../../../features/acquisition/business-card-queue-worker";

export const maxDuration = 300;

const consume = handleCallback(async (message: unknown) => {
  if (!isCardQueueWake(message)) return;
  try { await runConfiguredCardQueueTick(message.pipeline); } catch (error) {
    if (error instanceof CardWorkPending) throw error;
    throw new Error("Business-card background execution unavailable.");
  }
}, {
  visibilityTimeoutSeconds: 360,
  retry: (error) => ({ afterSeconds: error instanceof CardWorkPending ? error.afterSeconds : 60 }),
});

export async function POST(request: Request): Promise<Response> { return consume(request); }
