import type { AppointmentAggregate, AppointmentMedium } from "../../../../../features/appointments/contract";
import { createConfiguredAppointmentService } from "../../../../../features/appointments/runtime";
import { createContactsListSearchAndFilterService } from "../../../../../features/contacts/service-factory";
import {
  listConfiguredOrbitScheduleItems,
  type OrbitScheduleItem,
} from "../../../../../features/events/orbit-schedule-reader";
import type { ContactListItemContract } from "../../../../../shared/contract/contacts";
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../../orbit-schedule-route-view-model";
import { ORBIT_DISPLAY_TIME_ZONE } from "../../orbit-datetime";

function dateTimeParts(value: string): { date: string; time: string } | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: ORBIT_DISPLAY_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? null;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");

  return year && month && day && hour && minute
    ? { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
    : null;
}

function todayParts(now: Date): OrbitScheduleViewModel["today"] {
  const parts = dateTimeParts(now.toISOString());
  const [year, month, day] = (parts?.date ?? now.toISOString().slice(0, 10))
    .split("-")
    .map(Number);

  return { d: day, m: month - 1, y: year };
}

function durationLabel(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function mediumLabel(medium: AppointmentMedium): string {
  if (medium.kind === "in_person") return medium.location;
  if (medium.kind === "phone") return "电话";
  return "视频会议";
}

/**
 * Project only persisted appointments into Today's calendar.
 *
 * A follow-up task, reminder, or AI suggestion is not an appointment. Even a
 * persisted appointment is excluded until it has a confirmed time and an
 * actor-owned canonical contact that still exists in the contact store.
 */
export function appointmentScheduleFromRecords(input: {
  actorId: string;
  appointments: readonly AppointmentAggregate[];
  contacts: readonly ContactListItemContract[];
  now?: Date;
}): OrbitScheduleViewModel {
  const contactsById = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const connections = new Map<string, OrbitScheduleConnectionView>();
  const schedules: OrbitScheduleItemView[] = [];

  for (const appointment of input.appointments) {
    if (!appointment.confirmed || appointment.status === "cancelled") continue;

    const contactId = appointment.contactIdsByActor[input.actorId];
    const contact = contactId ? contactsById.get(contactId) : null;
    const timing = dateTimeParts(appointment.confirmed.startsAtUtc);
    if (!contactId || !contact || !timing) continue;

    if (!connections.has(contactId)) {
      connections.set(contactId, {
        company: contact.organization,
        displayName: contact.displayName,
        g: "g-violet",
        id: contactId,
        initial: contact.displayName.trim().slice(0, 1) || "约",
        title: contact.role,
      });
    }

    schedules.push({
      cid: contactId,
      contactId,
      date: timing.date,
      dur: durationLabel(appointment.confirmed.durationMinutes),
      id: appointment.appointmentId,
      place: mediumLabel(appointment.confirmed.medium),
      status: appointment.status === "reschedule_pending" ? "待确认" : "已确认",
      time: timing.time,
      topic: `与 ${contact.displayName} 的约谈`,
    });
  }

  return {
    connections: Array.from(connections.values()),
    schedules: schedules.sort((left, right) =>
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    ),
    today: todayParts(input.now ?? new Date()),
  };
}

/**
 * Project only event records that the actor explicitly approved for Orbit
 * Schedule. Event lifecycle status (for example an imported event being
 * "confirmed") is deliberately not enough: it says nothing about whether the
 * current user plans to attend.
 */
export function confirmedEventScheduleFromRecords(input: {
  items: readonly OrbitScheduleItem[];
  now?: Date;
}): OrbitScheduleViewModel {
  const connections = new Map<string, OrbitScheduleConnectionView>();
  const schedules: OrbitScheduleItemView[] = [];

  for (const item of input.items) {
    const timing = dateTimeParts(item.startsAt);
    if (!timing) continue;

    const connectionId = `event:${item.eventId}`;
    if (!connections.has(connectionId)) {
      connections.set(connectionId, {
        company: "Orbit Schedule",
        displayName: item.title,
        g: "g-amber",
        id: connectionId,
        initial: item.title.trim().slice(0, 1) || "活",
        title: "已确认活动",
      });
    }

    const startsAt = Date.parse(item.startsAt);
    const endsAt = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
    const durationMinutes =
      Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt > startsAt
        ? Math.round((endsAt - startsAt) / 60_000)
        : 60;

    schedules.push({
      cid: connectionId,
      contactId: null,
      date: timing.date,
      detailHref: `/app/events/${encodeURIComponent(item.eventId)}`,
      dur: durationLabel(durationMinutes),
      id: item.id,
      place: item.location ?? "地点待定",
      status: "已确认",
      time: timing.time,
      topic: item.title,
    });
  }

  return {
    connections: Array.from(connections.values()),
    schedules: schedules.sort((left, right) =>
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    ),
    today: todayParts(input.now ?? new Date()),
  };
}

function mergeConfirmedSchedules(
  appointments: OrbitScheduleViewModel,
  events: OrbitScheduleViewModel,
): OrbitScheduleViewModel {
  return {
    connections: [...appointments.connections, ...events.connections],
    schedules: [...appointments.schedules, ...events.schedules].sort(
      (left, right) =>
        `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    ),
    today: appointments.today,
  };
}

export async function loadConfiguredTodayAppointmentSchedule(
  actorId: string,
): Promise<OrbitScheduleViewModel> {
  const appointmentService = createConfiguredAppointmentService();
  if (!appointmentService) {
    throw new Error("Appointment storage is not configured.");
  }

  const contactsService = createContactsListSearchAndFilterService("live");
  const [appointments, contactsResult] = await Promise.all([
    appointmentService.list({ actorId }),
    contactsService.listContacts({ actorId }),
  ]);
  if (contactsResult.success === false) {
    throw new Error(contactsResult.error.message);
  }

  return appointmentScheduleFromRecords({
    actorId,
    appointments,
    contacts: contactsResult.data.contacts,
  });
}

/**
 * Today's calendar truth: actor-owned confirmed appointments plus event
 * schedule records created only after the actor approved add_to_orbit_schedule.
 * Raw contacts, follow-up suggestions, and imported event inventory never enter
 * this projection.
 */
export async function loadConfiguredTodaySchedule(
  actorId: string,
): Promise<OrbitScheduleViewModel> {
  const [appointments, eventItems] = await Promise.all([
    loadConfiguredTodayAppointmentSchedule(actorId),
    listConfiguredOrbitScheduleItems(actorId),
  ]);

  return mergeConfirmedSchedules(
    appointments,
    confirmedEventScheduleFromRecords({ items: eventItems }),
  );
}

export function emptyTodayAppointmentSchedule(now = new Date()): OrbitScheduleViewModel {
  return { connections: [], schedules: [], today: todayParts(now) };
}
