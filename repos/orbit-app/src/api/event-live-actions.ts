/**
 * Sprint 0107: the two live-page actions that are not event-operations commands,
 * with the same requests as the web live page (events-0918/event-note-modal.tsx and
 * event-schedule-modal.tsx):
 *   - note:        POST /api/encounters (idempotency-key, attaches to the owner's contact)
 *   - appointment: GET /api/appointments → POST /api/appointments (draft for the accepted
 *                  exchange) → POST /api/appointments/:id/commands { command: "propose" }
 * Every receipt is decoded; a failure never reports success.
 */
import { z } from "zod";
import type { OrbitApiClient } from "./client";
import type { ApiResult } from "./types";

export const ENCOUNTERS_PATH = "/api/encounters";
export const APPOINTMENTS_PATH = "/api/appointments";
export const appointmentCommandPath = (appointmentId: string) => `${APPOINTMENTS_PATH}/${encodeURIComponent(appointmentId)}/commands`;

export type LiveActionFailure = { ok: false; kind: "offline" | "conflict" | "failed"; message: string };

function failure(result: ApiResult<unknown>, fallback: string): LiveActionFailure {
  if (result.success) return { ok: false, kind: "failed", message: fallback };
  const offline = result.error.code === "ORBIT_APP_NETWORK_ERROR";
  const conflict = result.status === 409 || result.error.context?.featureCode === "APPOINTMENT_CONFLICT";
  return { ok: false, kind: offline ? "offline" : conflict ? "conflict" : "failed", message: result.error.message || fallback };
}
const succeeded = (result: ApiResult<unknown>) => result.success && result.status >= 200 && result.status < 300;

const encounterReceipt = z.object({ encounterId: z.string().min(1), contactId: z.string().min(1), eventId: z.string().nullable(), noteText: z.string() });

export interface EncounterInput { eventId: string; contactId: string; noteText: string; nextStep: string; tags: readonly string[]; observedAt: string; idempotencyKey: string }

export async function captureLiveEncounter(client: OrbitApiClient, input: EncounterInput): Promise<{ ok: true; encounterId: string } | LiveActionFailure> {
  const result = await client.post<unknown>(ENCOUNTERS_PATH, {
    headers: { "idempotency-key": input.idempotencyKey },
    body: { commitments: [], contactId: input.contactId, eventId: input.eventId, nextStep: input.nextStep.trim(), noteText: input.noteText, observedAt: input.observedAt, privacy: "private", talked: "yes", tags: [...input.tags] }
  });
  if (!succeeded(result)) return failure(result, "Save failed; nothing was recorded.");
  const receipt = encounterReceipt.safeParse(result.success ? result.data : null);
  if (!receipt.success || receipt.data.contactId !== input.contactId || receipt.data.eventId !== input.eventId) return { ok: false, kind: "failed", message: "The saved note could not be confirmed." };
  return { ok: true, encounterId: receipt.data.encounterId };
}

const appointmentSchema = z.object({
  appointmentId: z.string().min(1), authorityRequestId: z.string(), contactId: z.string().nullable(), eventId: z.string().nullable(),
  status: z.enum(["draft", "awaiting_response", "negotiating", "confirmed", "reschedule_pending", "cancelled", "completed"]),
  version: z.number().int().positive(),
  confirmed: z.object({ startsAtUtc: z.string() }).passthrough().nullable(),
  proposals: z.array(z.object({ candidateTimes: z.array(z.object({ startsAtUtc: z.string() }).passthrough()) }).passthrough())
}).passthrough();
export type LiveAppointment = z.infer<typeof appointmentSchema>;

/** The in-progress appointment for this exchange and event (cancelled / completed count as none). */
export async function findLiveAppointment(client: OrbitApiClient, requestId: string, eventId: string): Promise<{ ok: true; appointment: LiveAppointment | null } | LiveActionFailure> {
  const result = await client.get<unknown>(APPOINTMENTS_PATH);
  if (!succeeded(result)) return failure(result, "Could not check existing appointments.");
  const list = z.array(z.unknown()).safeParse(result.success ? result.data : null);
  if (!list.success) return { ok: false, kind: "failed", message: "Could not check existing appointments." };
  const appointments = list.data.flatMap(item => { const parsed = appointmentSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
  return { ok: true, appointment: appointments.find(a => a.authorityRequestId === requestId && a.eventId === eventId && a.status !== "cancelled" && a.status !== "completed") ?? null };
}

export interface AppointmentProposalInput {
  eventId: string; requestId: string; draft: { appointmentId: string; version: number } | null;
  candidateTimes: readonly { startsAtUtc: string }[]; durationMinutes: number; timezone: string;
  medium: { kind: "in_person"; location: string } | { kind: "video"; provider: "google_meet"; joinUrl: null };
  note: string; createKey: string; proposeKey: string;
}

export async function proposeLiveAppointment(client: OrbitApiClient, input: AppointmentProposalInput): Promise<{ ok: true; appointment: LiveAppointment } | LiveActionFailure> {
  let draft = input.draft;
  if (!draft) {
    const created = await client.post<unknown>(APPOINTMENTS_PATH, { headers: { "idempotency-key": input.createKey }, body: { eventContactRequestId: input.requestId, eventId: input.eventId } });
    if (!succeeded(created)) return failure(created, "Only an accepted business-card exchange can start an appointment.");
    const parsed = appointmentSchema.safeParse(created.success ? created.data : null);
    if (!parsed.success || parsed.data.authorityRequestId !== input.requestId || parsed.data.eventId !== input.eventId) return { ok: false, kind: "failed", message: "The appointment draft could not be confirmed." };
    draft = { appointmentId: parsed.data.appointmentId, version: parsed.data.version };
  }
  const proposal = { candidateTimes: [...input.candidateTimes], durationMinutes: input.durationMinutes, medium: input.medium, note: input.note.trim(), timezone: input.timezone };
  const result = await client.post<unknown>(appointmentCommandPath(draft.appointmentId), { headers: { "idempotency-key": input.proposeKey }, body: { command: "propose", expectedVersion: draft.version, proposal } });
  if (!succeeded(result)) return failure(result, "Review the candidate times and meeting details, then retry.");
  const parsed = appointmentSchema.safeParse(result.success ? result.data : null);
  if (!parsed.success || parsed.data.appointmentId !== draft.appointmentId || parsed.data.status === "draft" || parsed.data.version <= draft.version) return { ok: false, kind: "failed", message: "The invitation could not be confirmed." };
  return { ok: true, appointment: parsed.data };
}
