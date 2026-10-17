import type { OrbitApiClient } from "../../api/client";
import type { MeetingDetailsContract } from "../../api/contract/appointments";
import { appointmentPath } from "../../api/endpoints";
import { meetingDetailsMutationSchema } from "../../api/schema/appointment-details";

export type CancelMeetingResult = { status: "cancelled"; meeting: MeetingDetailsContract } | { status: "invalid" | "conflict" | "failed" | "unconfirmed" };

export async function cancelConfirmedAppointment(
  client: Pick<OrbitApiClient, "post">,
  meeting: MeetingDetailsContract,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CancelMeetingResult> {
  if (meeting.visibility !== "participants" || meeting.status !== "confirmed" || !meeting.confirmed || !meeting.contactId || !idempotencyKey) return { status: "invalid" };
  const result = await client.post<unknown>(`${appointmentPath(meeting.appointmentId)}/commands`, {
    body: { command: "cancel", expectedVersion: meeting.version },
    headers: { "Idempotency-Key": idempotencyKey },
    ...(signal ? { signal } : {}),
  });
  if (!result.success) return { status: result.status === 409 ? "conflict" : "failed" };
  const parsed = meetingDetailsMutationSchema.safeParse(result.data);
  if (!parsed.success) return { status: "unconfirmed" };
  const receipt = parsed.data;
  if (receipt.appointmentId !== meeting.appointmentId || receipt.contactId !== meeting.contactId || receipt.status !== "cancelled" || receipt.version <= meeting.version) return { status: "unconfirmed" };
  return { status: "cancelled", meeting: receipt };
}
