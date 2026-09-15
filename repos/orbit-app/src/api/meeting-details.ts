import { meetingDetailsMutationSchema, meetingDetailsSchema } from "./schema/appointment-details";
import type { MeetingDetailsContract, MeetingDetailsMutationContract } from "./contract/appointments";
import { appointmentDetailsPath, appointmentPath, scheduleMeetingDetailsPath } from "./endpoints";

export function normalizeMeetingDetails(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function meetingDetailsPath(id: string, edit = false, source: "appointment" | "schedule" = "appointment"): string {
  if (source === "schedule") return scheduleMeetingDetailsPath(id);
  return edit ? appointmentDetailsPath(id) : appointmentPath(id);
}

export function readMeetingDetails(data: unknown): MeetingDetailsContract | null {
  const result = meetingDetailsSchema.safeParse(data);
  return result.success ? result.data as MeetingDetailsContract : null;
}

export function meetingDetailsReceipt(
  data: unknown,
  appointmentId: string,
  submittedDetails: string,
  previousVersion: number,
): MeetingDetailsMutationContract | null {
  const result = meetingDetailsMutationSchema.safeParse(data);
  if (!result.success) return null;
  const receipt = result.data as MeetingDetailsMutationContract;
  if (
    receipt.appointmentId !== appointmentId
    || receipt.details !== normalizeMeetingDetails(submittedDetails)
    || receipt.detailsUpdatedBy !== "you"
    || receipt.version <= previousVersion
  ) return null;
  return receipt;
}
