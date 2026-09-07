import { handleCallback } from "@vercel/queue";
import { PasswordResetDeliveryPending, processPasswordResetQueueWake } from "../../../../features/auth/password-reset-queue-worker";

export const maxDuration = 60;

// The queue/v2beta trigger makes this function private to Vercel's queue infrastructure.
const consume = handleCallback(async (message: { version?: unknown }) => {
  if (message?.version !== 1) return;
  await processPasswordResetQueueWake();
}, {
  visibilityTimeoutSeconds: 120,
  retry: (error) => ({ afterSeconds: error instanceof PasswordResetDeliveryPending ? error.afterSeconds : 60 }),
});

export async function POST(request: Request): Promise<Response> {
  return consume(request);
}
