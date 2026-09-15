import type { DevicePushTokenDTO, NotificationPermission } from "./reminder-plan-contract";
import type { PushDeviceDescriptor, PushDeviceService } from "./push-device-service";

export interface ReminderPushDeviceGateway {
  listActive(actorId: string): Promise<readonly DevicePushTokenDTO[]>;
  register(input: {
    actorId: string;
    deviceId: string;
    platform: "ios";
    token: string;
    permission: NotificationPermission;
  }): Promise<DevicePushTokenDTO>;
  revoke(input: { actorId: string; deviceId: string }): Promise<DevicePushTokenDTO | null>;
  invalidate(input: { actorId: string; deviceId: string; reason: string }): Promise<DevicePushTokenDTO | null>;
}

function dto(input: {
  actorId: string;
  device: PushDeviceDescriptor;
  token: string;
  failureCode?: string;
}): DevicePushTokenDTO {
  return {
    accountId: input.actorId,
    createdAt: input.device.registeredAt,
    deviceId: input.device.deviceId,
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
    id: `push-device:${input.device.deviceId}`,
    ...(input.device.revokedAt ? { invalidatedAt: input.device.revokedAt } : {}),
    lastVerifiedAt: input.device.updatedAt,
    ownerUserId: input.actorId,
    permission: input.device.permission,
    platform: "ios",
    status: input.device.active ? "active" : input.failureCode ? "invalid" : "revoked",
    token: input.token,
    updatedAt: input.device.updatedAt,
  };
}

export function createReminderPushDeviceGateway(input: {
  serviceForActor: (actorId: string) => PushDeviceService;
}): ReminderPushDeviceGateway {
  return {
    async listActive(actorId) {
      return (await input.serviceForActor(actorId).listActive())
        .filter((device) => device.platform === "ios")
        .map((device) => dto({ actorId, device, token: device.token }));
    },
    async register(command) {
      const device = await input.serviceForActor(command.actorId).register({
        deviceId: command.deviceId,
        permission: command.permission,
        platform: command.platform,
        token: command.token,
      });
      return dto({ actorId: command.actorId, device, token: command.token });
    },
    async revoke(command) {
      const active = (await this.listActive(command.actorId)).find(
        (device) => device.deviceId === command.deviceId,
      );
      const device = await input.serviceForActor(command.actorId).revoke(command.deviceId);
      return device ? dto({ actorId: command.actorId, device, token: active?.token ?? "revoked" }) : null;
    },
    async invalidate(command) {
      const active = (await this.listActive(command.actorId)).find(
        (device) => device.deviceId === command.deviceId,
      );
      const device = await input.serviceForActor(command.actorId).revoke(command.deviceId);
      return device
        ? dto({ actorId: command.actorId, device, failureCode: command.reason, token: active?.token ?? "revoked" })
        : null;
    },
  };
}
