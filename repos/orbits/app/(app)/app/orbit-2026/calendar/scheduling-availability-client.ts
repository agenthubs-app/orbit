"use client";

// contact-reach R41 (DESIGN D4): the signed-in person's 可约时间 (GET/PUT /api/scheduling/availability, R40).
// A failed read never blocks picking times: callers fall back to DEFAULT_SCHEDULING_AVAILABILITY.
import { schedulingAvailabilitySchema } from "../../../../../shared/api-schema/scheduling-availability";
import { DEFAULT_SCHEDULING_AVAILABILITY } from "../../../../../shared/compute/meeting-slots";
import type { SchedulingAvailabilityContract, SchedulingAvailabilitySettings } from "../../../../../shared/contract/scheduling-availability";
import { lastAnswer, rememberAnswer } from "../../orbit-last-answer";

/** orbit-last-answer key shared by the picker and 設定 › 日程. */
export const SCHEDULING_AVAILABILITY_ANSWER_KEY = "settings:schedule";
export const SCHEDULING_SETTINGS_HREF = "/app/settings/schedule";

export type SchedulingWriteFailure = "invalid" | "unavailable" | "network";

export function settingsOf(contract: SchedulingAvailabilitySettings): SchedulingAvailabilitySettings {
  const { weekdays, start, end, lunch, durationMinutes, minimumNotice, bufferMinutes, timeZoneMode, timeZone } = contract;
  return { weekdays: [...weekdays], start, end, lunch: lunch ? { ...lunch } : null, durationMinutes, minimumNotice, bufferMinutes, timeZoneMode, timeZone };
}

/** The zone the rules are read in: the stored one in fixed mode, else this device's (R40 交接). */
export function effectiveTimeZone(settings: Pick<SchedulingAvailabilitySettings, "timeZoneMode" | "timeZone">): string | null {
  if (settings.timeZoneMode === "fixed" && settings.timeZone) return settings.timeZone;
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

/** The stored settings, or null when they could not be read (the caller decides on the default). */
export async function readSchedulingAvailability(signal?: AbortSignal, fetcher: typeof fetch = globalThis.fetch): Promise<SchedulingAvailabilityContract | null> {
  try {
    const response = await fetcher("/api/scheduling/availability", { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const envelope = await response.json() as { success?: unknown; data?: unknown };
    const parsed = envelope?.success === true ? schedulingAvailabilitySchema.safeParse(envelope.data) : null;
    if (!parsed?.success) return null;
    rememberAnswer(SCHEDULING_AVAILABILITY_ANSWER_KEY, parsed.data);
    return parsed.data;
  } catch { return null; }
}

/** The picker's rules: the stored settings when they can be read, the defaults (= the old fixed rules) otherwise. */
export async function schedulingRulesFor(signal?: AbortSignal, fetcher?: typeof fetch): Promise<SchedulingAvailabilitySettings> {
  const remembered = lastAnswer<SchedulingAvailabilityContract>(SCHEDULING_AVAILABILITY_ANSWER_KEY);
  const read = await readSchedulingAvailability(signal, fetcher);
  return settingsOf(read ?? remembered ?? DEFAULT_SCHEDULING_AVAILABILITY);
}

export async function writeSchedulingAvailability(settings: SchedulingAvailabilitySettings, signal?: AbortSignal, fetcher: typeof fetch = globalThis.fetch): Promise<{ ok: true; data: SchedulingAvailabilityContract } | { ok: false; reason: SchedulingWriteFailure }> {
  let response: Response;
  try {
    response = await fetcher("/api/scheduling/availability", { method: "PUT", cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(settingsOf(settings)) });
  } catch { return { ok: false, reason: "network" }; }
  if (response.status === 400) return { ok: false, reason: "invalid" };
  if (!response.ok) return { ok: false, reason: "unavailable" };
  try {
    const envelope = await response.json() as { success?: unknown; data?: unknown };
    const parsed = envelope?.success === true ? schedulingAvailabilitySchema.safeParse(envelope.data) : null;
    if (!parsed?.success) return { ok: false, reason: "unavailable" };
    rememberAnswer(SCHEDULING_AVAILABILITY_ANSWER_KEY, parsed.data);
    return { ok: true, data: parsed.data };
  } catch { return { ok: false, reason: "unavailable" }; }
}
