import { createConfiguredPasswordResetRuntime } from "./password-reset-factory";
import { deliverPasswordResetMail } from "./password-reset-service";

type DeliveryRuntime = Pick<NonNullable<ReturnType<typeof createConfiguredPasswordResetRuntime>>, "store" | "secret" | "origin" | "mailer">;

export class PasswordResetDeliveryPending extends Error {
  constructor(readonly afterSeconds: number) {
    super("Password reset delivery remains pending.");
  }
}

export async function processPasswordResetQueueWake(
  runtime: DeliveryRuntime | null = createConfiguredPasswordResetRuntime(),
  now = () => new Date(),
): Promise<void> {
  if (!runtime) throw new Error("Password reset delivery configuration unavailable.");
  const result = await deliverPasswordResetMail({ ...runtime, now });
  // An idle claim can mean a future retry or a lease held by another invocation.
  // Acknowledge only when no unexpired delivery remains in the authoritative store.
  const pending = await runtime.store.hasPendingDelivery(now().toISOString());
  console.info(JSON.stringify({ event: "password_reset_delivery_tick", result, pending }));
  if (pending) {
    throw new PasswordResetDeliveryPending(result === "sent" ? 1 : 60);
  }
}
