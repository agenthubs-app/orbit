import { AppError } from "../../../../shared/errors/app-error";
import { exactKeys, reminderError, reminderJson, reminderRouteActor, reminderRouteService, reminderSuccess, stringField, type ReminderRouteDependencies } from "../../reminders/route-support";

function publicDevice(value: { deviceId: string; permission: string; platform: string; status: string; lastVerifiedAt: string }) {
  return { deviceId: value.deviceId, lastVerifiedAt: value.lastVerifiedAt, permission: value.permission, platform: value.platform, status: value.status };
}

export function createPushTokenPostHandler(dependencies?: ReminderRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const body = await reminderJson(request);
      exactKeys(body, ["deviceId", "permission", "platform", "token"]);
      if (body.platform !== "ios") throw new AppError("VALIDATION_ERROR", "platform is invalid.");
      if (!["granted", "denied", "provisional", "undetermined"].includes(String(body.permission))) throw new AppError("VALIDATION_ERROR", "permission is invalid.");
      const device = await reminderRouteService(dependencies).registerDevice({ actorId: actor.id, deviceId: stringField(body.deviceId, "deviceId"), permission: body.permission as "granted" | "denied" | "provisional" | "undetermined", platform: "ios", token: stringField(body.token, "token") });
      return reminderSuccess({ device: publicDevice(device) });
    } catch (error) { return reminderError(error); }
  };
}

export function createPushTokenDeleteHandler(dependencies?: ReminderRouteDependencies) {
  return async function DELETE(request: Request): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const body = await reminderJson(request);
      exactKeys(body, ["deviceId"]);
      const device = await reminderRouteService(dependencies).revokeDevice({ actorId: actor.id, deviceId: stringField(body.deviceId, "deviceId") });
      return reminderSuccess({ device: device ? publicDevice(device) : null });
    } catch (error) { return reminderError(error); }
  };
}
