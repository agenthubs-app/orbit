import type { OrbitApiClient } from "../../api/client";
import type { MeetingDetailsContract, MeetingDetailsMedium } from "../../api/contract/appointments";
import { appointmentPath } from "../../api/endpoints";
import { readMeetingDetails } from "../../api/meeting-details";
import { meetingDetailsMutationSchema } from "../../api/schema/appointment-details";
import { localParts, resolveLocalDateTime, shiftCalendarDate, validTimeZone } from "../../time/date-time";

export interface MeetingCandidate {
  startsAt: string;
  endsAt: string;
}

export type CandidateError = "count" | "invalid" | "past" | "duration" | "overlap";

export function seedMeetingCandidates(initial: readonly MeetingCandidate[] | undefined, now: number, timeZone: string): MeetingCandidate[] {
  if (initial?.length) return initial.map(candidate => ({ ...candidate }));
  const zone = validTimeZone(timeZone) ? timeZone : "UTC";
  let day = localParts(now, zone).date;
  const result: MeetingCandidate[] = [];
  for (let i = 0; i < 14 && result.length < 3; i++) {
    day = shiftCalendarDate(day, 1);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const start = resolveLocalDateTime(day, "10:00", zone);
    if (!start) continue;
    result.push({ startsAt: start, endsAt: new Date(Date.parse(start) + 30 * 60_000).toISOString() });
  }
  return result;
}

export function validateMeetingCandidates(candidates: readonly MeetingCandidate[], now: number): {
  candidateTimes: { startsAtUtc: string }[];
  durationMinutes: number;
  error: CandidateError | null;
} {
  const failed = (error: CandidateError) => ({ candidateTimes: [], durationMinutes: 0, error });
  if (candidates.length < 3 || candidates.length > 5) return failed("count");
  const ranges = candidates.map(candidate => ({ start: Date.parse(candidate.startsAt), end: Date.parse(candidate.endsAt) }));
  if (ranges.some(range => !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start)) return failed("invalid");
  if (ranges.some(range => range.start <= now)) return failed("past");
  const durationMinutes = (ranges[0]!.end - ranges[0]!.start) / 60_000;
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || ranges.some(range => (range.end - range.start) / 60_000 !== durationMinutes)) return failed("duration");
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  if (sorted.some((range, index) => index > 0 && range.start < sorted[index - 1]!.end)) return failed("overlap");
  return { candidateTimes: ranges.map(range => ({ startsAtUtc: new Date(range.start).toISOString() })), durationMinutes, error: null };
}

export async function loadRescheduleTarget(client: Pick<OrbitApiClient, "get">, appointmentId: string, contactId: string, signal?: AbortSignal): Promise<MeetingDetailsContract | null> {
  const result = await client.get<unknown>(appointmentPath(appointmentId), signal ? { signal } : {});
  if (!result.success) return null;
  const meeting = readMeetingDetails(result.data);
  return meeting?.appointmentId === appointmentId && meeting.contactId === contactId && meeting.status === "confirmed" && meeting.confirmed ? meeting : null;
}

export type ProposalSendResult = { status: "sent"; appointmentId: string } | { status: "invalid" | "conflict" | "failed" | "unconfirmed" };

export async function postRescheduleProposal(
  client: Pick<OrbitApiClient, "post">,
  meeting: MeetingDetailsContract,
  candidates: readonly MeetingCandidate[],
  medium: MeetingDetailsMedium,
  timeZone: string,
  idempotencyKey: string,
  now = Date.now(),
): Promise<ProposalSendResult> {
  const selection = validateMeetingCandidates(candidates, now);
  if (selection.error || !validTimeZone(timeZone) || !idempotencyKey || meeting.status !== "confirmed" || !meeting.confirmed) return { status: "invalid" };
  if (medium.kind === "in_person" && (!medium.location.trim() || medium.location.length > 500)) return { status: "invalid" };
  if (medium.kind === "video" && medium.joinUrl && !/^https:\/\//u.test(medium.joinUrl)) return { status: "invalid" };
  const result = await client.post<unknown>(`${appointmentPath(meeting.appointmentId)}/commands`, {
    body: { command: "propose", expectedVersion: meeting.version, proposal: {
      candidateTimes: selection.candidateTimes, durationMinutes: selection.durationMinutes, medium, note: "", timezone: timeZone,
    } },
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (!result.success) return { status: result.status === 409 ? "conflict" : "failed" };
  const parsed = meetingDetailsMutationSchema.safeParse(result.data);
  if (!parsed.success) return { status: "unconfirmed" };
  const receipt = parsed.data;
  const previousRevision = meeting.proposals.at(-1)?.revision ?? 0;
  const currentRevision = receipt.proposals.at(-1)?.revision ?? 0;
  if (
    receipt.appointmentId !== meeting.appointmentId || receipt.contactId !== meeting.contactId
    || receipt.status !== "reschedule_pending" || receipt.version <= meeting.version
    || currentRevision <= previousRevision || receipt.confirmed?.startsAtUtc !== meeting.confirmed.startsAtUtc
  ) return { status: "unconfirmed" };
  return { status: "sent", appointmentId: receipt.appointmentId };
}
