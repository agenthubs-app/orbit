import { send } from "@vercel/queue";

export async function enqueuePasswordResetDelivery(): Promise<void> {
  // Wakeup only: never persist an email, password, bearer token or mail content in the queue.
  await send("password-reset-delivery", { version: 1 }, { retentionSeconds: 35 * 60 });
}
