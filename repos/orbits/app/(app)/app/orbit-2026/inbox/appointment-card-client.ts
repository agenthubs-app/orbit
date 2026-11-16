"use client";

// contact-reach R41 ⑥: the meeting a message carries (R39 `appointmentId`), read with GET /api/appointments/{id}
// and answered with the existing commands (accept { candidateId } / counter { proposal }) — the same command
// calls the old event-contact negotiation makes, each with an idempotency key per (meeting, version, command).
import type { z } from "zod";

import { meetingDetailsSchema } from "../../../../../shared/api-schema/appointment-details";
import { createAppointmentActionIdempotencyRegistry } from "../../../../../features/appointments/client-idempotency";

export type AppointmentCardView = z.infer<typeof meetingDetailsSchema>;
export type AppointmentCommandFailure = "conflict" | "denied" | "invalid" | "failed";

const keys = createAppointmentActionIdempotencyRegistry();

export async function readAppointment(appointmentId: string, signal?: AbortSignal, fetcher: typeof fetch = globalThis.fetch): Promise<AppointmentCardView | null> {
  try {
    const response = await fetcher(`/api/appointments/${encodeURIComponent(appointmentId)}`, { cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const envelope = await response.json() as { success?: unknown; data?: unknown };
    const parsed = envelope?.success === true ? meetingDetailsSchema.safeParse(envelope.data) : null;
    return parsed?.success && parsed.data.appointmentId === appointmentId ? parsed.data : null;
  } catch { return null; }
}

export async function appointmentCommand(meeting: AppointmentCardView, command: "accept" | "counter", payload: Record<string, unknown>, fetcher: typeof fetch = globalThis.fetch): Promise<{ ok: true; data: AppointmentCardView } | { ok: false; reason: AppointmentCommandFailure }> {
  const key = keys.keyFor(JSON.stringify([meeting.appointmentId, meeting.version, command, payload]));
  let response: Response;
  try {
    response = await fetcher(`/api/appointments/${encodeURIComponent(meeting.appointmentId)}/commands`, {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ ...payload, command, expectedVersion: meeting.version }),
    });
  } catch { return { ok: false, reason: "failed" }; }
  if (response.status === 409) return { ok: false, reason: "conflict" };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "denied" };
  if (response.status === 400) return { ok: false, reason: "invalid" };
  if (!response.ok) return { ok: false, reason: "failed" };
  const envelope = await response.json().catch(() => null) as { success?: unknown; data?: unknown } | null;
  const parsed = envelope?.success === true ? meetingDetailsSchema.passthrough().safeParse(envelope.data) : null;
  return parsed?.success && parsed.data.appointmentId === meeting.appointmentId ? { ok: true, data: parsed.data } : { ok: false, reason: "failed" };
}

/** The proposal the meeting is waiting on (null when nothing is pending). */
export function pendingProposal(meeting: AppointmentCardView) {
  if (meeting.pendingProposalRevision == null) return null;
  return meeting.proposals.find((proposal) => proposal.revision === meeting.pendingProposalRevision) ?? null;
}
