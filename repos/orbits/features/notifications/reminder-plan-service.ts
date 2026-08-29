import { createHash } from "node:crypto";

import type {
  DevicePushTokenDTO,
  NotificationAvailabilityDTO,
  NotificationDeliveryDTO,
  NotificationPermission,
  NotificationPreferencesDTO,
  QuietHours,
  ReminderChannel,
  ReminderPlanDTO,
  ReminderTargetType,
} from "./reminder-plan-contract";
import type { ReminderPlanRepository } from "./reminder-plan-repository";
import type { PushProvider } from "./push-provider";

export class ReminderPlanServiceError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "TARGET_NOT_OWNED",
    message: string,
  ) {
    super(message);
    this.name = "ReminderPlanServiceError";
  }
}

export interface ReminderTargetAuthorizer {
  assertOwned(input: { actorId: string; targetId: string; targetType: ReminderTargetType }): Promise<void>;
}

export interface ReminderPlanService {
  list(input: { actorId: string; includeCancelled?: boolean; targetId?: string; targetType?: ReminderTargetType }): Promise<readonly ReminderPlanDTO[]>;
  create(input: { actorId: string; targetType: ReminderTargetType; targetId: string; fireAt: string; timeZone: string; channels: readonly ReminderChannel[]; title: string; body: string; deepLink: string; createdBy: "user" | "agent_confirmed"; idempotencyKey: string }): Promise<ReminderPlanDTO>;
  reschedule(input: { actorId: string; reminderId: string; fireAt: string; timeZone: string; expectedUpdatedAt: string; idempotencyKey: string }): Promise<ReminderPlanDTO>;
  cancel(input: { actorId: string; reminderId: string; idempotencyKey: string }): Promise<ReminderPlanDTO>;
  cancelFutureForTarget(input: { actorId: string; targetType: ReminderTargetType; targetId: string; idempotencyKey: string }): Promise<number>;
  getPreferences(actorId: string): Promise<NotificationPreferencesDTO>;
  updatePreferences(input: { actorId: string; inAppEnabled: boolean; iosPushEnabled: boolean; lockScreenContent: "full" | "private"; quietHours: QuietHours }): Promise<NotificationPreferencesDTO>;
  registerDevice(input: { actorId: string; deviceId: string; platform: "ios"; token: string; permission: NotificationPermission }): Promise<DevicePushTokenDTO>;
  revokeDevice(input: { actorId: string; deviceId: string }): Promise<DevicePushTokenDTO | null>;
  invalidateDevice(input: { actorId: string; deviceId: string; reason: string }): Promise<DevicePushTokenDTO | null>;
  notificationAvailability(actorId: string): Promise<NotificationAvailabilityDTO>;
  dispatchDue(input: { now: string; provider: PushProvider }): Promise<{ claimed: number; inAppDelivered: number; pushDelivered: number; pushFailed: number; quietHoursSuppressed: number }>;
  listDeliveries(input: { actorId: string }): Promise<readonly NotificationDeliveryDTO[]>;
}

function stableId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`;
}

function text(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ReminderPlanServiceError("VALIDATION_ERROR", `${field} is required`);
  return normalized;
}

function iso(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new ReminderPlanServiceError("VALIDATION_ERROR", `${field} must be an ISO date-time`);
  return value;
}

function timezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new ReminderPlanServiceError("VALIDATION_ERROR", "timeZone must be a valid IANA time zone");
  }
}

function channels(values: readonly ReminderChannel[]): readonly ReminderChannel[] {
  const unique = [...new Set(values)];
  if (unique.length === 0 || unique.some((value) => value !== "in_app" && value !== "ios_push")) {
    throw new ReminderPlanServiceError("VALIDATION_ERROR", "at least one supported channel is required");
  }
  return unique;
}

function defaultPreferences(actorId: string, now: string): NotificationPreferencesDTO {
  return {
    accountId: actorId,
    inAppEnabled: true,
    iosPushEnabled: true,
    lockScreenContent: "private",
    ownerUserId: actorId,
    quietHours: { enabled: false, end: "08:00", start: "22:00", timeZone: "Asia/Tokyo" },
    updatedAt: now,
  };
}

function minutesAt(value: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }).formatToParts(new Date(value));
  const number = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return number("hour") * 60 + number("minute");
}

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) throw new ReminderPlanServiceError("VALIDATION_ERROR", "quiet hour values must use HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new ReminderPlanServiceError("VALIDATION_ERROR", "quiet hour values must use HH:mm");
  return hour * 60 + minute;
}

function quietAt(value: string, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const current = minutesAt(value, quiet.timeZone);
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function delivery(input: { plan: ReminderPlanDTO; channel: ReminderChannel; deviceId?: string; now: string; status: NotificationDeliveryDTO["status"]; failureCode?: string }): NotificationDeliveryDTO {
  const id = stableId("notification-delivery", input.plan.ownerUserId, input.plan.id, input.channel, input.deviceId ?? "app", input.plan.fireAt);
  return {
    accountId: input.plan.accountId,
    channel: input.channel,
    createdAt: input.now,
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
    fireAt: input.plan.fireAt,
    id,
    ownerUserId: input.plan.ownerUserId,
    reminderPlanId: input.plan.id,
    status: input.status,
    updatedAt: input.now,
  };
}

export function createReminderPlanService({
  now,
  repository,
  targetAuthorizer,
}: {
  now: () => string;
  repository: ReminderPlanRepository;
  targetAuthorizer?: ReminderTargetAuthorizer;
}): ReminderPlanService {
  const activeClaims = new Set<string>();

  async function ownedPlan(actorId: string, reminderId: string) {
    const plan = await repository.getPlan(actorId, reminderId);
    if (!plan) throw new ReminderPlanServiceError("NOT_FOUND", "Reminder plan not found");
    return plan;
  }

  async function setDeviceStatus(actorId: string, deviceId: string, status: "invalid" | "revoked", reason?: string) {
    const device = (await repository.listDevices(actorId)).find((item) => item.deviceId === deviceId);
    if (!device) return null;
    const changedAt = now();
    return repository.saveDevice({ ...device, ...(reason ? { failureCode: reason } : {}), invalidatedAt: changedAt, status, updatedAt: changedAt });
  }

  return {
    list: (input) => repository.listPlans(input),
    async create(input) {
      const id = stableId("reminder", input.actorId, text(input.idempotencyKey, "idempotencyKey"));
      const replay = await repository.getPlan(input.actorId, id);
      if (replay) return replay;
      try {
        await targetAuthorizer?.assertOwned({ actorId: input.actorId, targetId: input.targetId, targetType: input.targetType });
      } catch {
        throw new ReminderPlanServiceError("TARGET_NOT_OWNED", "Reminder target is not owned by this actor");
      }
      const createdAt = now();
      const plan: ReminderPlanDTO = {
        accountId: input.actorId,
        body: text(input.body, "body"),
        channels: channels(input.channels),
        createdAt,
        createdBy: input.createdBy,
        deepLink: text(input.deepLink, "deepLink"),
        fireAt: iso(input.fireAt, "fireAt"),
        id,
        ownerUserId: input.actorId,
        status: "scheduled",
        targetId: text(input.targetId, "targetId"),
        targetType: input.targetType,
        timeZone: timezone(input.timeZone),
        title: text(input.title, "title"),
        updatedAt: createdAt,
      };
      return repository.savePlan(plan);
    },
    async reschedule(input) {
      const plan = await ownedPlan(input.actorId, input.reminderId);
      if (plan.updatedAt !== input.expectedUpdatedAt) throw new ReminderPlanServiceError("CONFLICT", "Reminder plan changed; refresh and retry");
      if (plan.status === "cancelled") throw new ReminderPlanServiceError("CONFLICT", "Cancelled reminders cannot be rescheduled");
      return repository.savePlan({ ...plan, cancelledAt: undefined, deliveredAt: undefined, failureCode: undefined, fireAt: iso(input.fireAt, "fireAt"), status: "scheduled", timeZone: timezone(input.timeZone), updatedAt: now() });
    },
    async cancel(input) {
      const plan = await ownedPlan(input.actorId, input.reminderId);
      if (plan.status === "cancelled") return plan;
      const cancelledAt = now();
      return repository.savePlan({ ...plan, cancelledAt, status: "cancelled", updatedAt: cancelledAt });
    },
    async cancelFutureForTarget(input) {
      const current = now();
      const plans = await repository.listPlans({ actorId: input.actorId, includeCancelled: true, targetId: input.targetId, targetType: input.targetType });
      const cancellable = plans.filter((plan) => plan.status === "scheduled" && plan.fireAt > current);
      for (const plan of cancellable) {
        await repository.savePlan({ ...plan, cancelledAt: current, status: "cancelled", updatedAt: current });
      }
      return cancellable.length;
    },
    async getPreferences(actorId) {
      return (await repository.getPreferences(actorId)) ?? defaultPreferences(actorId, now());
    },
    async updatePreferences(input) {
      parseClock(input.quietHours.start);
      parseClock(input.quietHours.end);
      timezone(input.quietHours.timeZone);
      const value: NotificationPreferencesDTO = { accountId: input.actorId, inAppEnabled: input.inAppEnabled, iosPushEnabled: input.iosPushEnabled, lockScreenContent: input.lockScreenContent, ownerUserId: input.actorId, quietHours: input.quietHours, updatedAt: now() };
      return repository.savePreferences(value);
    },
    async registerDevice(input) {
      const existing = (await repository.listDevices(input.actorId)).find((item) => item.deviceId === input.deviceId);
      const timestamp = now();
      const device: DevicePushTokenDTO = {
        accountId: input.actorId,
        createdAt: existing?.createdAt ?? timestamp,
        deviceId: text(input.deviceId, "deviceId"),
        id: existing?.id ?? stableId("push-device", input.actorId, input.deviceId),
        lastVerifiedAt: timestamp,
        ownerUserId: input.actorId,
        permission: input.permission,
        platform: input.platform,
        status: input.permission === "granted" || input.permission === "provisional" ? "active" : "revoked",
        token: text(input.token, "token"),
        updatedAt: timestamp,
      };
      return repository.saveDevice(device);
    },
    revokeDevice: ({ actorId, deviceId }) => setDeviceStatus(actorId, deviceId, "revoked"),
    invalidateDevice: ({ actorId, deviceId, reason }) => setDeviceStatus(actorId, deviceId, "invalid", reason),
    async notificationAvailability(actorId) {
      const devices = await repository.listDevices(actorId);
      const active = devices.filter((item) => item.status === "active" && (item.permission === "granted" || item.permission === "provisional"));
      const permission = active[0]?.permission ?? devices.at(-1)?.permission ?? "undetermined";
      return { inAppAvailable: (await this.getPreferences(actorId)).inAppEnabled, iosPushAvailable: active.length > 0, permission };
    },
    async dispatchDue(input) {
      const plans = await repository.listDuePlans(input.now);
      const result = { claimed: 0, inAppDelivered: 0, pushDelivered: 0, pushFailed: 0, quietHoursSuppressed: 0 };
      for (const plan of plans) {
        if (activeClaims.has(plan.id)) continue;
        activeClaims.add(plan.id);
        try {
          const existing = (await repository.listDeliveries(plan.ownerUserId)).filter((item) => item.reminderPlanId === plan.id && item.fireAt === plan.fireAt);
          if (existing.length > 0) continue;
          result.claimed += 1;
          const preferences = (await repository.getPreferences(plan.ownerUserId)) ?? defaultPreferences(plan.ownerUserId, input.now);
          let delivered = false;
          if (plan.channels.includes("in_app") && preferences.inAppEnabled) {
            const value = delivery({ channel: "in_app", now: input.now, plan, status: "delivered" });
            await repository.saveDelivery({ ...value, deliveredAt: input.now });
            result.inAppDelivered += 1;
            delivered = true;
          }
          if (plan.channels.includes("ios_push") && preferences.iosPushEnabled) {
            const devices = (await repository.listDevices(plan.ownerUserId)).filter((item) => item.status === "active" && (item.permission === "granted" || item.permission === "provisional"));
            for (const device of devices) {
              const value = delivery({ channel: "ios_push", deviceId: device.deviceId, now: input.now, plan, status: "claimed" });
              if (quietAt(input.now, preferences.quietHours)) {
                await repository.saveDelivery({ ...value, failureCode: "QUIET_HOURS", status: "suppressed" });
                result.quietHoursSuppressed += 1;
                continue;
              }
              await repository.saveDelivery(value);
              const providerResult = await input.provider.send({ body: preferences.lockScreenContent === "full" ? plan.body : "Orbit 有一条提醒", data: { deepLink: plan.deepLink, notificationId: plan.id }, deliveryId: value.id, title: preferences.lockScreenContent === "full" ? plan.title : "Orbit", token: device.token });
              if (providerResult.ok) {
                await repository.saveDelivery({ ...value, deliveredAt: input.now, providerMessageId: providerResult.providerMessageId, status: "delivered", updatedAt: input.now });
                result.pushDelivered += 1;
                delivered = true;
              } else if (providerResult.ok === false) {
                await repository.saveDelivery({ ...value, failureCode: providerResult.code, status: "failed", updatedAt: input.now });
                result.pushFailed += 1;
                if (providerResult.tokenInvalid) await setDeviceStatus(plan.ownerUserId, device.deviceId, "invalid", providerResult.code);
              }
            }
          }
          await repository.savePlan({ ...plan, ...(delivered ? { deliveredAt: input.now } : { failureCode: "NO_DELIVERY_CHANNEL_AVAILABLE" }), status: delivered ? "delivered" : "failed", updatedAt: input.now });
        } finally {
          activeClaims.delete(plan.id);
        }
      }
      return result;
    },
    listDeliveries: ({ actorId }) => repository.listDeliveries(actorId),
  };
}
