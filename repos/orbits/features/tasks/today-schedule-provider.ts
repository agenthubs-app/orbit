import { createConfiguredPersonalScheduleService } from "../personal-schedule/service-factory";
import { personalScheduleAggregateRepresentation } from "../personal-schedule/representation";
import { createConfiguredAppointmentService } from "../appointments/runtime";
import { listConfiguredOrbitScheduleItems } from "../events/orbit-schedule-reader";
import type { ScheduleItemDTO } from "./today-contract";
import type { PersonalScheduleService } from "../personal-schedule/service";
import type { AppointmentAggregate } from "../appointments/contract";
import type { OrbitScheduleItem } from "../events/orbit-schedule-reader";
import type { OrbitLanguage } from "../../shared/contract/language";
import { calendarScheduleOverlaps, calendarScheduleQuery } from "./calendar-window";

export interface TodayScheduleProvider {
  list: (input: { actorId: string; from?: string; to?: string; language?: OrbitLanguage }) => Promise<readonly ScheduleItemDTO[]>;
}

function appointmentLocation(
  medium: {
    kind: "in_person" | "video" | "phone";
    location?: string;
    provider?: string;
  }, language: OrbitLanguage = "zh",
): string | undefined {
  if (medium.kind === "in_person") return medium.location;
  if (medium.kind === "video") return medium.provider === "google_meet"
    ? "Google Meet"
    : ({ ja: "オンライン", zh: "线上会面", en: "Online" })[language];
  return ({ ja: "電話", zh: "电话", en: "Phone" })[language];
}

export function createTodayScheduleProvider(input: {
  listEvents: (actorId: string) => Promise<readonly Pick<OrbitScheduleItem, "id" | "kind" | "category" | "title" | "startsAt" | "endsAt" | "location" | "sourceId">[]>;
  listAppointments: (actorId: string) => Promise<readonly Pick<AppointmentAggregate, "appointmentId" | "confirmed" | "status">[]>;
  personalList: PersonalScheduleService["list"];
}): TodayScheduleProvider {
  return {
    async list({ actorId, from, to, language }) {
      const calendar = from !== undefined || to !== undefined ? calendarScheduleQuery(new URLSearchParams({ scope: "calendar", from: from ?? "", to: to ?? "", language: language ?? "ja" })) : undefined;
      const locale = calendar?.language ?? "zh";
      const [eventItems, appointmentItems, personalItems] = await Promise.all([
        input.listEvents(actorId),
        input.listAppointments(actorId),
        input.personalList({ actorId, ...(calendar ? { from: calendar.from, to: calendar.to, overlap: true } : {}) }),
      ]);
      const items = [
        ...personalItems.map(personalScheduleAggregateRepresentation),
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
              title: ({ ja: "面談", zh: "人脉会面", en: "Meeting" })[locale],
              startsAt,
              endsAt,
              ...(appointmentLocation(appointment.confirmed.medium, locale)
                ? {
                    location: appointmentLocation(
                      appointment.confirmed.medium,
                      locale,
                    ),
                  }
                : {}),
              sourceId: appointment.appointmentId,
            },
          ];
        }),
      ];
      if (!calendar) return items;
      const selected = items.filter(item => calendarScheduleOverlaps(item, calendar));
      if (selected.length > 1000) throw Error("CALENDAR_ITEMS_READ_CAP");
      return selected;
    },
  };
}

export function createConfiguredTodayScheduleProvider(): TodayScheduleProvider {
  return createTodayScheduleProvider({
    listEvents: listConfiguredOrbitScheduleItems,
    listAppointments: actorId => createConfiguredAppointmentService()?.list({ actorId }) ?? Promise.resolve([]),
    personalList: query => createConfiguredPersonalScheduleService().list(query),
  });
}
