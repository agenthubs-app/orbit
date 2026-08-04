import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import type { ReminderScheduleNotificationListInput } from "../../../features/notifications/contract";
import { createReminderScheduleNotificationService } from "../../../features/notifications/service-factory";
import { createConfiguredNotificationInteractionService, type NotificationInteractionService } from "../../../features/notifications/interaction-service";
import {
  reminderScheduleNotificationFailureContext,
  reminderScheduleNotificationFailureToAppError,
} from "../../../features/notifications/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

function readInput(request: Request): ReminderScheduleNotificationListInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    frequency: searchParams.get("frequency"),
    limit: readLimit(searchParams),
    priority: searchParams.get("priority"),
    scenario: searchParams.get("scenario"),
  };
}

export function createNotificationsGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  interactions?: NotificationInteractionService | null,
) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const notificationService = createReminderScheduleNotificationService();
    const result = await notificationService.listNotifications({
      ...readInput(request),
      actorId: actor.id,
    });

    if (result.success === false) {
      const appError = reminderScheduleNotificationFailureToAppError(result);

      return NextResponse.json(
        failure(appError, reminderScheduleNotificationFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    const interactionService = interactions === undefined
      ? mode === "live" ? createConfiguredNotificationInteractionService() : null
      : interactions;
    const states = interactionService
      ? await interactionService.list(actor.id, result.data.reminders.map((reminder) => reminder.reminderId))
      : {};
    const ignored = new Set(Object.entries(states).filter(([, state]) => state === "ignored").map(([id]) => id));
    const reminders = result.data.reminders.filter((reminder) => !ignored.has(reminder.reminderId));
    const visibleIds = new Set(reminders.map((reminder) => reminder.reminderId));
    const data = {
      ...result.data,
      groupedLowPriorityReminders: result.data.groupedLowPriorityReminders.flatMap((group) => {
        const reminderIds = group.reminderIds.filter((id) => visibleIds.has(id));
        return reminderIds.length ? [{ ...group, reminderIds }] : [];
      }),
      ...(interactionService ? { notificationInteractions: states } : {}),
      notificationQueue: result.data.notificationQueue.filter((entry) => entry.reminderIds.some((id) => visibleIds.has(id))),
      reminders,
    };

    return NextResponse.json(success(data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
