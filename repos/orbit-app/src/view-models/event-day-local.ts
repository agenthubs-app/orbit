import { z } from "zod";

import type { SyncRecord } from "../api/contract/sync";
import { readAttendeeWorkspace, type AttendeeWorkspace } from "../api/event-attendee-operations";
import { publicEventDetailSchema, type PublicEventDetail } from "../api/event-detail-contract";

/**
 * Sprint 0115 (offline 1a): the device mirror rows of the three event sync
 * domains (event-registrations, registered-events, event-published-results)
 * turned into the shapes the event live page, the event detail and the
 * calendar already render. Every row is validated here; a row that does not
 * parse (or names an attendee outside its own directory) is not shown.
 * Check-in state and card exchanges are not on the device: the workspace
 * carries none, and the screens say that those need a connection.
 */
const id = z.string().min(1).max(512);
const iso = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const strings = z.array(z.string());

const registrationSchema = z.object({
  eventId: id,
  membershipStatus: z.enum(["rsvped", "cancelled"]).nullable(),
  admissionStatus: z.enum(["pending_review", "waitlisted", "admitted", "rejected", "withdrawn"]).nullable(),
});
export type LocalEventRegistration = z.infer<typeof registrationSchema>;

const registeredEventSchema = z.object({
  eventId: id, participantId: id.nullable(), title: z.string().min(1), description: z.string().nullable(), venue: z.string().nullable(),
  timeZone: z.string().nullable(), startsAt: iso, endsAt: iso, lifecycleState: z.string().nullable(),
  checkInOpensAt: iso.nullable(), eventStartsAt: iso.nullable(), eventEndsAt: iso.nullable(), profileEditDeadlineAt: iso.nullable(),
  resultsAvailableAt: iso.nullable(), roundOneStartsAt: iso.nullable(), roundTwoStartsAt: iso.nullable(),
}).refine((event) => Date.parse(event.startsAt) < Date.parse(event.endsAt));
export type LocalRegisteredEvent = z.infer<typeof registeredEventSchema>;

const person = z.object({ participantId: id, displayName: z.string(), company: z.string().nullable(), role: z.string().nullable(), industry: z.string().nullable(), topics: strings, experienceHighlight: z.string().nullable(), languages: strings, needs: strings, offers: strings });
const table = z.object({ tableNumber: z.number().int().positive(), theme: z.string(), rationale: z.string(), icebreakers: strings, memberPrompts: z.record(z.string(), strings), memberRationales: z.record(z.string(), z.string()), members: z.array(z.object({ participantId: id, seat: z.string() })) });
const publishedResultSchema = z.object({
  eventId: id, generationId: id, publishedAt: iso, resultsAvailableAt: iso,
  me: person, directory: z.array(person), directoryComplete: z.boolean().optional(),
  recommendations: z.object({ sourceParticipantId: id, noMatchReason: z.string().nullable(), recommendations: z.array(z.object({ targetParticipantId: id, score: z.number().finite(), reasons: strings, icebreakers: strings, memberHint: z.string() })) }).nullable(),
  roundOneTable: table.nullable(), roundTwoTable: table.nullable(),
}).refine((value) => value.directory.some((entry) => entry.participantId === value.me.participantId));
export type LocalPublishedResult = z.infer<typeof publishedResultSchema>;

function parsed<T>(schema: z.ZodType<T>, records: readonly SyncRecord[] | undefined, eventId?: string): T[] {
  const values: T[] = [];
  for (const record of records ?? []) {
    if (record.deletedAt !== null || record.payload === null) continue;
    const result = schema.safeParse(record.payload);
    if (!result.success) continue;
    const value = result.data as T & { eventId: string };
    // The row id is the event id; a payload for another event is not this row.
    if (value.eventId !== record.id || (eventId !== undefined && value.eventId !== eventId)) continue;
    values.push(result.data);
  }
  return values;
}

export interface LocalEventDayRecords {
  registrations: readonly SyncRecord[];
  events: readonly SyncRecord[];
  results: readonly SyncRecord[];
}

export interface LocalEventDay {
  eventId: string;
  registration: LocalEventRegistration | null;
  event: LocalRegisteredEvent | null;
  result: LocalPublishedResult | null;
}

export function localEventDay(records: LocalEventDayRecords, eventId: string): LocalEventDay {
  const event = parsed(registeredEventSchema, records.events, eventId)[0] ?? null;
  const result = parsed(publishedResultSchema, records.results, eventId)[0] ?? null;
  return {
    eventId,
    registration: parsed(registrationSchema, records.registrations, eventId)[0] ?? null,
    event,
    // Results only travel with their event (a cancelled registration removes both).
    result: event && result && (event.participantId === null || result.me.participantId === event.participantId) ? result : null,
  };
}

export function localRegisteredEvents(records: readonly SyncRecord[] | undefined): LocalRegisteredEvent[] {
  return parsed(registeredEventSchema, records);
}

/**
 * The live page's workspace from the device copy. It needs the event's
 * configuration windows and the attendee's participant id; before any
 * publication the directory holds only the attendee.
 */
export function localAttendeeWorkspace(day: LocalEventDay, input: { now: number; displayName: string }): AttendeeWorkspace | null {
  const { event, result } = day;
  if (!event || !event.participantId) return null;
  const configuration = {
    eventId: event.eventId,
    checkInOpensAt: event.checkInOpensAt, eventStartsAt: event.eventStartsAt, eventEndsAt: event.eventEndsAt,
    profileEditDeadlineAt: event.profileEditDeadlineAt, resultsAvailableAt: event.resultsAvailableAt,
    roundOneStartsAt: event.roundOneStartsAt, roundTwoStartsAt: event.roundTwoStartsAt,
  };
  if (Object.values(configuration).some((value) => value === null)) return null;
  const windows = configuration as { [K in keyof typeof configuration]: string };
  const me = result?.me ?? { participantId: event.participantId, displayName: input.displayName, company: null, role: null, industry: null, topics: [], experienceHighlight: null, languages: [], needs: [], offers: [] };
  const workspace = {
    eventId: event.eventId,
    configuration: windows,
    me,
    directory: result ? result.directory : [me],
    checkIn: null,
    checkInAvailable: input.now >= Date.parse(windows.checkInOpensAt) && input.now <= Date.parse(windows.eventEndsAt),
    profileEditable: input.now < Date.parse(windows.profileEditDeadlineAt),
    resultsState: result ? "ready" as const : input.now < Date.parse(windows.resultsAvailableAt) ? "locked" as const : "not_generated" as const,
    recommendations: result?.recommendations ?? null,
    roundOneTable: result?.roundOneTable ?? null,
    roundTwoTable: result?.roundTwoTable ?? null,
    contactRequests: [],
  };
  try {
    return readAttendeeWorkspace(workspace, event.eventId);
  } catch {
    return null;
  }
}

/** The event detail screen's input from the device copy (the public fields only). */
export function localPublicEventDetail(event: LocalRegisteredEvent): PublicEventDetail | null {
  const value = {
    event: {
      id: event.eventId,
      title: event.title,
      startsAt: new Date(event.startsAt).toISOString(),
      endsAt: new Date(event.endsAt).toISOString(),
      status: event.lifecycleState === "cancelled" ? "cancelled" as const : "imported" as const,
      ...(event.venue ? { venue: event.venue, location: event.venue } : {}),
      ...(event.description ? { description: event.description } : {}),
      sourceMetadata: { label: "event-core-postgres" },
    },
  };
  const checked = publicEventDetailSchema.safeParse(value);
  return checked.success ? checked.data : null;
}

/** The calendar's event input: the events this account registered for, from the device copy. */
export function localScheduleEvents(records: readonly SyncRecord[] | undefined): { events: Record<string, unknown>[] } {
  return {
    events: localRegisteredEvents(records).map((event) => ({
      id: event.eventId,
      eventId: event.eventId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      ...(event.venue ? { venue: event.venue, location: event.venue } : {}),
      status: event.lifecycleState === "cancelled" ? "cancelled" : "published",
    })),
  };
}

export type LocalRegistrationStatusKey =
  | "events.localStatusRsvped" | "events.localStatusCancelled" | "events.localStatusPending"
  | "events.localStatusWaitlisted" | "events.localStatusRejected";

/** What the device copy says about the attendee's own registration (a membership decides over an application). */
export function localRegistrationStatusKey(registration: LocalEventRegistration | null): LocalRegistrationStatusKey | null {
  if (!registration) return null;
  if (registration.membershipStatus === "rsvped") return "events.localStatusRsvped";
  if (registration.admissionStatus === "rejected") return "events.localStatusRejected";
  if (registration.membershipStatus === "cancelled" || registration.admissionStatus === "withdrawn") return "events.localStatusCancelled";
  if (registration.admissionStatus === "pending_review") return "events.localStatusPending";
  if (registration.admissionStatus === "waitlisted") return "events.localStatusWaitlisted";
  return null;
}
