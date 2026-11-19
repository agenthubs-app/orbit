/**
 * The reminder sender on the product's own services (agent-design AG16): the owner's registered phones and browsers,
 * the two push channels (Expo for phones, Web Push for browsers), and the owner's notification settings — quiet hours,
 * the daily limit and the "updates" switch, the same ones every other automatic notification obeys (视觉稿 D16-4).
 */
import { deliveryPolicyId, createDeliveryPolicyRepository } from "../../notifications/delivery-policy-repository";
import { deliveryQuotaUsage, evaluateDeliveryPolicy, type DeliveryQuotaReservation } from "../../notifications/delivery-policy";
import { createConfiguredExpoPushAdapter, type OrbitPushAdapter } from "../../notifications/push-adapter";
import { createPushDeviceService } from "../../notifications/push-device-service";
import { createConfiguredWebPushAdapter } from "../../notifications/web-push-adapter";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import type { AutomationStorage } from "./due-index";
import type { RulePushChannel, RulePushDeps, RulePushDeviceAccess, RulePushPolicy } from "./push";

/** Whether these reminders obey the owner's quiet hours and daily limit (视觉稿 D16-4, option A). One place to change. */
export const RULE_PUSH_OBEYS_NOTIFICATION_SETTINGS = true;

/** Phones go through Expo, browsers through Web Push; a kind of device with no channel configured is not sent to. */
export function createRulePushChannel(adapters: { expo: OrbitPushAdapter | null; web: OrbitPushAdapter | null }): RulePushChannel | null {
  const { expo, web } = adapters;
  if (!expo && !web) return null;
  const of = (platform: string) => (platform === "web" ? web : expo);
  return {
    async getReceipt(receiptId, platform) {
      const adapter = of(platform);
      if (!adapter?.getReceipt) throw new Error("This push channel has no receipts.");
      return adapter.getReceipt(receiptId);
    },
    hasReceipts: (platform) => Boolean(of(platform)?.getReceipt),
    async send(message) {
      const adapter = of(message.platform);
      if (!adapter) throw new Error(`No push channel is configured for ${message.platform} devices.`);
      return adapter.send(message);
    },
    supports: (platform) => Boolean(of(platform)),
  };
}

export function configuredRulePushChannel(env: NodeJS.ProcessEnv = process.env): RulePushChannel | null {
  return createRulePushChannel({ expo: createConfiguredExpoPushAdapter(env), web: createConfiguredWebPushAdapter(env) });
}

const RESERVATIONS = "notificationDeliveryReservations";

/**
 * The owner's notification settings, read from the same records the inbox's own pushes obey. A reminder that goes out
 * is written to the same day-count those pushes use, so the daily limit is one limit.
 */
export function createRulePushPolicy(input: { client: TransactionalPostgresClient; workspaceId: string }): RulePushPolicy {
  return {
    async check(ownerId, { now }) {
      const repository = createDeliveryPolicyRepository({ ...input, now: () => now });
      const preferences = await repository.preferences(ownerId);
      const decision = evaluateDeliveryPolicy({ active: true, channel: "update", explicitNight: false, origin: "automation", read: false, scheduledFor: now }, preferences, now);
      if (decision.action === "suppress") return { reason: "notifications_off", send: false };
      if (decision.action === "defer" && decision.reason === "quiet_hours") return { reason: "quiet_hours", send: false };
      const rows = await input.client.query<{ payload: DeliveryQuotaReservation }>(
        "select payload from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=$3 and (payload->>'at')::timestamptz >= $4::timestamptz",
        [input.workspaceId, ownerId, RESERVATIONS, new Date(Date.parse(now) - 48 * 3_600_000).toISOString()],
      );
      const usage = deliveryQuotaUsage(rows.rows.map((row) => row.payload), now, preferences.timeZone);
      return usage.total >= (preferences.dailyCap ?? 3) ? { reason: "daily_cap", send: false } : { send: true };
    },
    async sent(ownerId, { eventKey, now }) {
      const repository = createDeliveryPolicyRepository({ ...input, now: () => now });
      const preferences = await repository.preferences(ownerId);
      await repository.tx(ownerId, (database) => repository.save(database, RESERVATIONS, deliveryPolicyId(ownerId, eventKey), ownerId, { at: now, eventKey, suggestion: false, timeZone: preferences.timeZone } satisfies DeliveryQuotaReservation));
    },
  };
}

let policyRuntime: { client: TransactionalPostgresClient; workspaceId: string } | null | undefined;

function configuredRulePushPolicy(): RulePushPolicy | null {
  if (!RULE_PUSH_OBEYS_NOTIFICATION_SETTINGS) return null;
  if (policyRuntime === undefined) policyRuntime = createConfiguredTransactionalPostgresRuntime({ max: 2 });
  return policyRuntime ? createRulePushPolicy(policyRuntime) : null;
}

/** An owner's registrations: phones and browsers that allow notifications now. Null when the device store cannot be opened. */
export function configuredRulePushDevices(ownerId: string): RulePushDeviceAccess | null {
  try {
    const service = createPushDeviceService({ actorId: ownerId });
    return {
      async listActive() {
        return (await service.listActive({ includeWeb: true })).map((device) => ({ deviceId: device.deviceId, platform: device.platform, token: device.token }));
      },
      revoke: (deviceId) => service.revoke(deviceId, "provider_rejected"),
    };
  } catch {
    // ORBIT_PUSH_TOKEN_KEY is not set: push is not set up in this deployment.
    return null;
  }
}

export function configuredRulePushDeps(storage: AutomationStorage, now: () => string): RulePushDeps {
  return { channel: configuredRulePushChannel(), devices: configuredRulePushDevices, now, policy: configuredRulePushPolicy(), storage };
}

export function resetRulePushConfigurationForTests(): void {
  policyRuntime = undefined;
}
