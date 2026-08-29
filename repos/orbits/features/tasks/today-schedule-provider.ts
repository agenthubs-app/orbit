import { createConfiguredAppointmentService } from "../appointments/runtime";
import { listConfiguredOrbitScheduleItems } from "../events/orbit-schedule-reader";
import type { ScheduleItemDTO } from "./today-contract";

export interface TodayScheduleProvider {
  list: (input: { actorId: string }) => Promise<readonly ScheduleItemDTO[]>;
}

function appointmentLocation(
  medium: {
    kind: "in_person" | "video" | "phone";
    location?: string;
    provider?: string;
  },
): string | undefined {
  if (medium.kind === "in_person") return medium.location;
  if (medium.kind === "video") return medium.provider === "google_meet"
    ? "Google Meet"
    : "线上会面";
  return "电话";
}

export function createConfiguredTodayScheduleProvider(): TodayScheduleProvider {
  return {
    async list({ actorId }) {
      const [eventItems, appointmentItems] = await Promise.all([
        listConfiguredOrbitScheduleItems(actorId),
        createConfiguredAppointmentService()?.list({ actorId }) ?? [],
      ]);
      return [
        ...eventItems.map(
          (item): ScheduleItemDTO => ({
            id: item.id,
            kind: item.kind,
            category: item.category,
            state: "upcoming",
            title: item.title,
            startsAt: item.startsAt,
            ...(item.endsAt ? { endsAt: item.endsAt } : {}),
            ...(item.location ? { location: item.location } : {}),
            sourceId: item.sourceId,
          }),
        ),
        ...appointmentItems.flatMap((appointment): readonly ScheduleItemDTO[] => {
          if (!appointment.confirmed) return [];
          const startsAt = appointment.confirmed.startsAtUtc;
          const endsAt = new Date(
            Date.parse(startsAt) + appointment.confirmed.durationMinutes * 60_000,
          ).toISOString();
          return [
            {
              id: `schedule:${appointment.appointmentId}`,
              kind: "meeting",
              category: "meeting",
              state:
                appointment.status === "cancelled"
                  ? "cancelled"
                  : appointment.status === "completed"
                    ? "ended"
                    : "upcoming",
              title: "人脉会面",
              startsAt,
              endsAt,
              ...(appointmentLocation(appointment.confirmed.medium)
                ? {
                    location: appointmentLocation(
                      appointment.confirmed.medium,
                    ),
                  }
                : {}),
              sourceId: appointment.appointmentId,
            },
          ];
        }),
      ];
    },
  };
}
