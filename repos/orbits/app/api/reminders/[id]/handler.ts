import { AppError } from "../../../../shared/errors/app-error";
import { exactKeys, reminderError, reminderJson, reminderRouteActor, reminderRouteService, reminderSuccess, stringField, type ReminderRouteDependencies } from "../route-support";

export function createReminderPatchHandler(dependencies?: ReminderRouteDependencies) {
  return async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const { id } = await context.params;
      const body = await reminderJson(request);
      const action = body.action;
      if (action === "cancel") {
        exactKeys(body, ["action", "idempotencyKey"]);
        return reminderSuccess({ reminder: await reminderRouteService(dependencies).cancel({ actorId: actor.id, idempotencyKey: stringField(body.idempotencyKey, "idempotencyKey"), reminderId: id }) });
      }
      if (action === "reschedule") {
        exactKeys(body, ["action", "expectedUpdatedAt", "fireAt", "idempotencyKey", "timeZone"]);
        return reminderSuccess({ reminder: await reminderRouteService(dependencies).reschedule({ actorId: actor.id, expectedUpdatedAt: stringField(body.expectedUpdatedAt, "expectedUpdatedAt"), fireAt: stringField(body.fireAt, "fireAt"), idempotencyKey: stringField(body.idempotencyKey, "idempotencyKey"), reminderId: id, timeZone: stringField(body.timeZone, "timeZone") }) });
      }
      throw new AppError("VALIDATION_ERROR", "action is invalid.");
    } catch (error) { return reminderError(error); }
  };
}
