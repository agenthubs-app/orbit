import { requireEventCapability } from "../event-access/guard";
import { createConfiguredEventAccessService } from "../event-access/runtime";
import { createConfiguredEventCoreService } from "../core/runtime";
import { eventRegistrationRuntimeService } from "../registration/runtime";
import { createConfiguredEventOperationsAiProvider } from "./ai-provider";
import { createEventOperationsEngine } from "./engine";
import { publishEventOperationsWake } from "./queue";
import { createConfiguredEventOperationsRepository } from "./repository";
import { createConfiguredEventOperationsPostgresRuntime } from "./storage/postgres-client";
import {
  createEventOperationsService,
  type EventOperationsService,
} from "./service";

export function createConfiguredEventOperationsService(): EventOperationsService | null {
  const repository = createConfiguredEventOperationsRepository();
  const eventAccess = createConfiguredEventAccessService();
  const eventCore = createConfiguredEventCoreService();
  if (!repository || !eventAccess || !eventCore) return null;

  const engine = createEventOperationsEngine({
    aiProvider: createConfiguredEventOperationsAiProvider(),
    repository,
  });

  return createEventOperationsService({
    access: {
      async requireCapability({ actorId, capability, eventId }) {
        await requireEventCapability({
          actorId,
          capability,
          eventId,
          service: eventAccess,
        });
      },
      async isOrganizer({ actorId, eventId }) {
        const event = await eventCore.getEvent(eventId);
        return event?.organizerActorId === actorId.trim();
      },
      async isRegistered({ actorId, eventId }) {
        const registration = await repository.getCanonicalRegistration(
          eventId,
          actorId,
        );
        return registration?.status === "rsvped";
      },
    },
    engine,
    eventSchedule: {
      async getCanonicalSchedule({ actorId, eventId }) {
        void actorId;
        const event = await eventCore.getPublishedEvent(eventId);
        return event
          ? { endsAt: event.endsAt, startsAt: event.startsAt }
          : null;
      },
    },
    notifyWorker: process.env.VERCEL === "1"
      ? async ({ reason }) => {
          const configuredRuntime = createConfiguredEventOperationsPostgresRuntime();
          if (!configuredRuntime) return;
          await publishEventOperationsWake({
            reason,
            workspaceId: configuredRuntime.workspaceId,
          });
        }
      : undefined,
    // R24 复核 M4：本人签到 = 参加了这场活动 → 计划（v1 已参加 / v2 イベント枠）。工作人员代签的 actor 归属交给 R26 / R27。
    async onSelfCheckedIn({ actorId, eventId }) {
      const { markPlanEventAttendedForActor } = await import("../../plans/event-attribution-runtime");
      await markPlanEventAttendedForActor({ actorId, eventId });
    },
    registrationService: eventRegistrationRuntimeService,
    repository,
  });
}
