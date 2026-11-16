// contact-reach R42 (DESIGN D4): the signed-in person's 可約時間 (GET/PUT /api/scheduling/availability, R40), and
// the busy times the slot picker avoids (Orbit's own schedule + the connected Google Calendar, same reads as Web R41).
// A failed availability read never blocks a proposal: the defaults (= the old fixed rules) are used instead.
import type { OrbitApiClient } from "../../api/client";
import type { SchedulingAvailabilityContract, SchedulingAvailabilitySettings } from "../../api/contract/scheduling-availability";
import { DEFAULT_SCHEDULING_AVAILABILITY, type MeetingBusyAvailability } from "../../api/compute/meeting-slots";
import { schedulingAvailabilityPath } from "../../api/endpoints";
import { calendarExternalEventsResponseSchema } from "../../api/schema/calendar-external-events";
import { schedulingAvailabilitySchema, schedulingAvailabilityUpdateInputSchema } from "../../api/schema/scheduling-availability";
import { localParts, resolveLocalDateTime, shiftCalendarDate, validTimeZone } from "../../time/date-time";

export const SCHEDULING_SETTINGS_HREF = "/settings/schedule";

export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimeZone(zone) ? zone : "UTC";
  } catch { return "UTC"; }
}

/** The zone slots are computed in: the fixed zone when one is set, otherwise this device's. */
export function effectiveTimeZone(settings: Pick<SchedulingAvailabilitySettings, "timeZoneMode" | "timeZone">, device = deviceTimeZone()): string {
  return settings.timeZoneMode === "fixed" && settings.timeZone && validTimeZone(settings.timeZone) ? settings.timeZone : device;
}

export const settingsOf = (value: SchedulingAvailabilitySettings): SchedulingAvailabilitySettings => ({
  weekdays: [...value.weekdays], start: value.start, end: value.end, lunch: value.lunch ? { ...value.lunch } : null,
  durationMinutes: value.durationMinutes, minimumNotice: value.minimumNotice, bufferMinutes: value.bufferMinutes,
  timeZoneMode: value.timeZoneMode, timeZone: value.timeZone,
});

type Client = Pick<OrbitApiClient, "get" | "put">;

/** null = could not be read. */
export async function readSchedulingAvailability(client: Pick<OrbitApiClient, "get">, signal?: AbortSignal): Promise<SchedulingAvailabilityContract | null> {
  try {
    const result = await client.get<unknown>(schedulingAvailabilityPath(), { ...(signal ? { signal } : {}), headers: { "Cache-Control": "no-store" } });
    if (!result.success) return null;
    const parsed = schedulingAvailabilitySchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** The rules the picker uses: what was saved, or the defaults when the read fails. */
export async function schedulingRulesFor(client: Pick<OrbitApiClient, "get">, signal?: AbortSignal): Promise<SchedulingAvailabilitySettings> {
  const read = await readSchedulingAvailability(client, signal);
  return read ? settingsOf(read) : settingsOf(DEFAULT_SCHEDULING_AVAILABILITY);
}

export type SchedulingWriteFailure = "invalid" | "failed";
export async function writeSchedulingAvailability(client: Client, settings: SchedulingAvailabilitySettings, signal?: AbortSignal): Promise<{ ok: true; data: SchedulingAvailabilityContract } | { ok: false; reason: SchedulingWriteFailure }> {
  const body = schedulingAvailabilityUpdateInputSchema.safeParse(settingsOf(settings));
  if (!body.success) return { ok: false, reason: "invalid" };
  try {
    const result = await client.put<unknown>(schedulingAvailabilityPath(), { body: settingsOf(settings), ...(signal ? { signal } : {}) });
    if (!result.success) return { ok: false, reason: result.status === 400 ? "invalid" : "failed" };
    const parsed = schedulingAvailabilitySchema.safeParse(result.data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "failed" };
  } catch { return { ok: false, reason: "failed" }; }
}

export interface MeetingBusyRead extends MeetingBusyAvailability {
  /** Orbit's schedule was read completely and no Google Calendar is connected or offered: that is the whole picture. */
  orbitOnly: boolean;
}

interface ScheduleItemRow { startsAt?: unknown; endsAt?: unknown; allDay?: unknown; timeZone?: unknown }
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

/**
 * Busy times from today to 14 days later (in `zone`). `complete` only when both reads came back whole and the
 * Google Calendar answer is "connected" or "not_connected"/"off" — otherwise free cells stay "unknown" and nothing
 * is pre-picked (R40 A3/A4). null when the window itself cannot be computed.
 */
export async function loadMeetingBusy(client: Pick<OrbitApiClient, "get">, zone: string, now: number, language: string, signal?: AbortSignal): Promise<MeetingBusyRead | null> {
  if (!validTimeZone(zone) || !Number.isFinite(now)) return null;
  const today = localParts(now, zone).date;
  const from = resolveLocalDateTime(today, "00:00", zone), to = resolveLocalDateTime(shiftCalendarDate(today, 14), "00:00", zone);
  if (!from || !to) return null;
  const query = new URLSearchParams({ scope: "calendar", from, to, language });
  const options = { ...(signal ? { signal } : {}), headers: { "Cache-Control": "no-store" } };
  const [native, external] = await Promise.all([
    client.get<{ scheduleItems?: unknown }>(`/api/schedule-items?${query}`, options).catch(() => null),
    client.get<unknown>(`/api/calendar/external-events?${new URLSearchParams({ from, to })}`, options).catch(() => null),
  ]);
  const items: MeetingBusyAvailability["items"][number][] = [];
  let nativeWhole = false;
  if (native?.success && Array.isArray(native.data?.scheduleItems)) {
    nativeWhole = true;
    for (const row of native.data.scheduleItems as ScheduleItemRow[]) {
      if (!row || !instant(row.startsAt) || (row.endsAt !== undefined && !instant(row.endsAt))) { nativeWhole = false; continue; }
      items.push({ startsAt: row.startsAt, ...(instant(row.endsAt) ? { endsAt: row.endsAt } : {}), ...(row.allDay === true ? { allDay: true } : {}), ...(typeof row.timeZone === "string" ? { timeZone: row.timeZone } : {}) });
    }
  }
  const parsed = external?.success ? calendarExternalEventsResponseSchema.safeParse(external.data) : null;
  const connection = parsed?.success ? parsed.data.connection : null;
  if (parsed?.success && connection === "connected") {
    for (const event of parsed.data.events) items.push({ startsAt: event.startsAt, ...(event.endsAt ? { endsAt: event.endsAt } : {}), ...(event.allDay ? { allDay: true } : {}) });
  }
  const orbitOnly = nativeWhole && (connection === "not_connected" || connection === "off");
  return { from, to, items, complete: nativeWhole && (connection === "connected" || orbitOnly), orbitOnly };
}
