import type { ReminderChannel, ReminderTargetType } from "../../../features/notifications/reminder-plan-contract";
import { AppError } from "../../../shared/errors/app-error";
import { exactKeys, reminderError, reminderJson, reminderRouteActor, reminderRouteService, reminderSuccess, stringField, type ReminderRouteDependencies } from "./route-support";

export function createRemindersGetHandler(dependencies?: ReminderRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const url = new URL(request.url);
      const targetType = url.searchParams.get("targetType");
      if (targetType && targetType !== "task" && targetType !== "schedule_item") throw new AppError("VALIDATION_ERROR", "targetType is invalid.");
      const reminders = await reminderRouteService(dependencies).list({ actorId: actor.id, ...(url.searchParams.get("targetId") ? { targetId: url.searchParams.get("targetId")! } : {}), ...(targetType ? { targetType: targetType as ReminderTargetType } : {}) });
      return reminderSuccess({ reminders });
    } catch (error) { return reminderError(error); }
  };
}

export function createRemindersPostHandler(dependencies?: ReminderRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const body = await reminderJson(request);
      exactKeys(body, ["body", "channels", "createdBy", "deepLink", "fireAt", "idempotencyKey", "targetId", "targetType", "timeZone", "title"]);
      if (body.targetType !== "task" && body.targetType !== "schedule_item") throw new AppError("VALIDATION_ERROR", "targetType is invalid.");
      if (body.createdBy !== "user" && body.createdBy !== "agent_confirmed") throw new AppError("VALIDATION_ERROR", "createdBy is invalid.");
      if (!Array.isArray(body.channels) || body.channels.some((item) => item !== "in_app" && item !== "ios_push")) throw new AppError("VALIDATION_ERROR", "channels are invalid.");
      const reminder = await reminderRouteService(dependencies).create({
        actorId: actor.id,
        body: stringField(body.body, "body"),
        channels: body.channels as ReminderChannel[],
        createdBy: body.createdBy,
        deepLink: stringField(body.deepLink, "deepLink"),
        fireAt: stringField(body.fireAt, "fireAt"),
        idempotencyKey: stringField(body.idempotencyKey, "idempotencyKey"),
        targetId: stringField(body.targetId, "targetId"),
        targetType: body.targetType,
        timeZone: stringField(body.timeZone, "timeZone"),
        title: stringField(body.title, "title"),
      });
      return reminderSuccess({ reminder }, 201);
    } catch (error) { return reminderError(error); }
  };
}
