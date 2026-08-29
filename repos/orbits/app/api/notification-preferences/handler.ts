import { AppError } from "../../../shared/errors/app-error";
import { booleanField, exactKeys, reminderError, reminderJson, reminderRouteActor, reminderRouteService, reminderSuccess, stringField, type ReminderRouteDependencies } from "../reminders/route-support";

export function createNotificationPreferencesGetHandler(dependencies?: ReminderRouteDependencies) {
  return async function GET(): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const preferences = await reminderRouteService(dependencies).getPreferences(actor.id);
      const availability = await reminderRouteService(dependencies).notificationAvailability(actor.id);
      return reminderSuccess({ availability, preferences });
    } catch (error) { return reminderError(error); }
  };
}

export function createNotificationPreferencesPatchHandler(dependencies?: ReminderRouteDependencies) {
  return async function PATCH(request: Request): Promise<Response> {
    try {
      const actor = await reminderRouteActor(dependencies)();
      const body = await reminderJson(request);
      exactKeys(body, ["inAppEnabled", "iosPushEnabled", "lockScreenContent", "quietHours"]);
      if (body.lockScreenContent !== "full" && body.lockScreenContent !== "private") throw new AppError("VALIDATION_ERROR", "lockScreenContent is invalid.");
      if (!body.quietHours || typeof body.quietHours !== "object" || Array.isArray(body.quietHours)) throw new AppError("VALIDATION_ERROR", "quietHours is invalid.");
      const quiet = body.quietHours as Record<string, unknown>;
      exactKeys(quiet, ["enabled", "end", "start", "timeZone"]);
      const preferences = await reminderRouteService(dependencies).updatePreferences({ actorId: actor.id, inAppEnabled: booleanField(body.inAppEnabled, "inAppEnabled"), iosPushEnabled: booleanField(body.iosPushEnabled, "iosPushEnabled"), lockScreenContent: body.lockScreenContent, quietHours: { enabled: booleanField(quiet.enabled, "quietHours.enabled"), end: stringField(quiet.end, "quietHours.end"), start: stringField(quiet.start, "quietHours.start"), timeZone: stringField(quiet.timeZone, "quietHours.timeZone") } });
      return reminderSuccess({ availability: await reminderRouteService(dependencies).notificationAvailability(actor.id), preferences });
    } catch (error) { return reminderError(error); }
  };
}
