// contact-reach R42 ⑥ (mirrors Web R41 appointment-card-client): the meeting a message carries (R39 `appointmentId`),
// read with GET /api/appointments/{id} and answered with the existing commands (accept { candidateId } / counter
// { proposal }), each with one idempotency key per (meeting, version, command, payload) so a retry never doubles it.
import { randomUUID } from "expo-crypto";

import type { OrbitApiClient } from "../../api/client";
import type { MeetingDetailsContract } from "../../api/contract/appointments";
import { appointmentPath } from "../../api/endpoints";
import { readMeetingDetails } from "../../api/meeting-details";

export type AppointmentCardView = MeetingDetailsContract;
export type AppointmentCommandFailure = "conflict" | "denied" | "invalid" | "failed";

const keys = new Map<string, string>();
function keyFor(fingerprint: string): string {
  let key = keys.get(fingerprint);
  if (!key) { key = `app:appointment-card:${randomUUID()}`; keys.set(fingerprint, key); }
  return key;
}

/** null = could not be read. */
export async function readAppointment(client: Pick<OrbitApiClient, "get">, appointmentId: string, signal?: AbortSignal): Promise<AppointmentCardView | null> {
  try {
    const result = await client.get<unknown>(appointmentPath(appointmentId), { ...(signal ? { signal } : {}), headers: { "Cache-Control": "no-store" } });
    const meeting = result.success ? readMeetingDetails(result.data) : null;
    return meeting?.appointmentId === appointmentId ? meeting : null;
  } catch { return null; }
}

export async function appointmentCommand(client: Pick<OrbitApiClient, "post">, meeting: AppointmentCardView, command: "accept" | "counter", payload: Record<string, unknown>): Promise<{ ok: true; data: AppointmentCardView } | { ok: false; reason: AppointmentCommandFailure }> {
  const key = keyFor(JSON.stringify([meeting.appointmentId, meeting.version, command, payload]));
  try {
    const result = await client.post<unknown>(`${appointmentPath(meeting.appointmentId)}/commands`, {
      body: { ...payload, command, expectedVersion: meeting.version }, headers: { "Idempotency-Key": key },
    });
    if (!result.success) {
      if (result.status === 409) return { ok: false, reason: "conflict" };
      if (result.status === 401 || result.status === 403) return { ok: false, reason: "denied" };
      if (result.status === 400) return { ok: false, reason: "invalid" };
      return { ok: false, reason: "failed" };
    }
    const data = readMeetingDetails(result.data);
    return data?.appointmentId === meeting.appointmentId ? { ok: true, data } : { ok: false, reason: "failed" };
  } catch { return { ok: false, reason: "failed" }; }
}

/** The proposal the meeting is waiting on (null when nothing is pending). */
export function pendingProposal(meeting: AppointmentCardView) {
  if (meeting.pendingProposalRevision == null) return null;
  return meeting.proposals.find((proposal) => proposal.revision === meeting.pendingProposalRevision) ?? null;
}
