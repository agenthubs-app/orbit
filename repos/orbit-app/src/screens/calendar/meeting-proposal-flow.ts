import type { OrbitApiClient } from "../../api/client";
import type { MeetingDetailsContract, MeetingDetailsMedium, MeetingInitialProposalRequestContract, MeetingProposalDetailsContract } from "../../api/contract/appointments";
import { appointmentPath } from "../../api/endpoints";
import { readMeetingDetails } from "../../api/meeting-details";
import { meetingDetailsMutationSchema, meetingDetailsSchema } from "../../api/schema/appointment-details";
import { meetingInitialProposalAvailabilityQuerySchema, meetingInitialProposalAvailabilitySchema, meetingInitialProposalRequestSchema } from "../../api/schema/appointment-initial-proposal";
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

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const validId = (value: string) => Boolean(value && value.trim() === value && value !== "." && value !== ".." && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value));

function proposalInput(contactId: string, candidates: readonly MeetingCandidate[], medium: MeetingDetailsMedium, timeZone: string, idempotencyKey: string, now: number): MeetingInitialProposalRequestContract | null {
  const selection = validateMeetingCandidates(candidates, now);
  if (selection.error || !Number.isFinite(now) || !validTimeZone(timeZone) || !idempotencyKey || idempotencyKey.length > 96 || !/^[\x21-\x7e]+$/u.test(idempotencyKey)) return null;
  if (medium.kind === "video" && medium.joinUrl) {
    try { const url = new URL(medium.joinUrl); if (url.protocol !== "https:" || url.username || url.password) return null; } catch { return null; }
  }
  const parsed = meetingInitialProposalRequestSchema.safeParse({ contactId, proposal: {
    candidateTimes: [...selection.candidateTimes].sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc)),
    durationMinutes: selection.durationMinutes, medium, note: "", timezone: timeZone,
  } });
  return parsed.success ? parsed.data : null;
}

function matchesProposal(receipt: MeetingDetailsContract, input: MeetingInitialProposalRequestContract, revision: number) {
  const latest = receipt.proposals.at(-1), expected = input.proposal;
  return Boolean(latest && latest.revision === revision && receipt.pendingProposalRevision === revision && latest.proposedBy === "you"
    && latest.durationMinutes === expected.durationMinutes && same(latest.medium, expected.medium) && latest.note === expected.note && latest.timezone === expected.timezone
    && latest.candidateTimes && same(latest.candidateTimes.map(candidate => ({ startsAtUtc: new Date(candidate.startsAtUtc).toISOString() })), expected.candidateTimes));
}

function sameConfirmed(before: MeetingProposalDetailsContract["confirmed"], after: MeetingProposalDetailsContract["confirmed"]) {
  if (!before || !after) return false;
  const core = (value: NonNullable<MeetingProposalDetailsContract["confirmed"]>) => ({ startsAtUtc: value.startsAtUtc, durationMinutes: value.durationMinutes, medium: value.medium, timezone: value.timezone });
  return same(core(before), core(after)) && (before.candidateId === undefined || before.candidateId === after.candidateId)
    && (before.proposalRevision === undefined || before.proposalRevision === after.proposalRevision);
}

async function readback(client: Pick<OrbitApiClient, "get">, receipt: MeetingDetailsContract, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || !validId(receipt.appointmentId)) return false;
  // A signal also bypasses the API client's in-flight GET coalescing: this must
  // be a new read after the POST, not an earlier screen load's promise.
  const result = await client.get<unknown>(appointmentPath(receipt.appointmentId), { signal, headers: { "Cache-Control": "no-store" } });
  if (signal.aborted || !result.success) return false;
  const verified = meetingDetailsSchema.safeParse(result.data), expected = meetingDetailsSchema.safeParse(receipt);
  return verified.success && expected.success && same(verified.data, expected.data);
}

export async function loadInitialProposalAvailability(client: Pick<OrbitApiClient, "get">, contactId: string, signal?: AbortSignal): Promise<boolean | null> {
  if (signal?.aborted || !meetingInitialProposalAvailabilityQuerySchema.safeParse({ contactId }).success) return null;
  try {
    const result = await client.get<unknown>(`/api/appointments/initial-proposal?${new URLSearchParams({ contactId })}`, { signal: signal ?? new AbortController().signal, headers: { "Cache-Control": "no-store" } });
    if (signal?.aborted || !result.success) return null;
    const parsed = meetingInitialProposalAvailabilitySchema.safeParse(result.data);
    return parsed.success && parsed.data.contactId === contactId ? parsed.data.available : null;
  } catch { return null; }
}

export async function postInitialProposal(
  client: Pick<OrbitApiClient, "get" | "post">,
  contactId: string,
  candidates: readonly MeetingCandidate[],
  medium: MeetingDetailsMedium,
  timeZone: string,
  idempotencyKey: string,
  now = Date.now(),
  signal: AbortSignal = new AbortController().signal,
): Promise<ProposalSendResult> {
  if (signal.aborted) return { status: "failed" };
  const input = proposalInput(contactId, candidates, medium, timeZone, idempotencyKey, now);
  if (!input) return { status: "invalid" };
  try {
    const result = await client.post<unknown>("/api/appointments/initial-proposal", { body: input, signal, headers: { "Idempotency-Key": idempotencyKey } });
    if (signal.aborted) return { status: "failed" };
    if (!result.success) return { status: result.status === 409 ? "conflict" : "failed" };
    const parsed = meetingDetailsMutationSchema.safeParse(result.data);
    if (!parsed.success) return { status: "unconfirmed" };
    const receipt = parsed.data;
    if (!validId(receipt.appointmentId) || receipt.contactId !== contactId || receipt.visibility !== "participants" || receipt.status !== "awaiting_response" || receipt.version !== 2 || receipt.confirmed !== null || receipt.proposals.length !== 1 || !matchesProposal(receipt, input, 1)) return { status: "unconfirmed" };
    const verified = await readback(client, receipt, signal);
    return signal.aborted ? { status: "failed" } : verified ? { status: "sent", appointmentId: receipt.appointmentId } : { status: "unconfirmed" };
  } catch { return { status: "failed" }; }
}

export async function postRescheduleProposal(
  client: Pick<OrbitApiClient, "get" | "post">,
  meeting: MeetingDetailsContract,
  candidates: readonly MeetingCandidate[],
  medium: MeetingDetailsMedium,
  timeZone: string,
  idempotencyKey: string,
  now = Date.now(),
  signal: AbortSignal = new AbortController().signal,
): Promise<ProposalSendResult> {
  if (signal.aborted) return { status: "failed" };
  const baseline = meetingDetailsSchema.safeParse(meeting);
  const input = proposalInput(meeting.contactId ?? "", candidates, medium, timeZone, idempotencyKey, now);
  if (!input || !baseline.success || !validId(meeting.appointmentId) || meeting.visibility !== "participants" || meeting.status !== "confirmed" || !meeting.confirmed) return { status: "invalid" };
  try {
    const result = await client.post<unknown>(`${appointmentPath(meeting.appointmentId)}/commands`, {
      body: { command: "propose", expectedVersion: meeting.version, proposal: input.proposal }, signal,
      headers: { "Idempotency-Key": idempotencyKey },
    });
    if (signal.aborted) return { status: "failed" };
    if (!result.success) return { status: result.status === 409 ? "conflict" : "failed" };
    const parsed = meetingDetailsMutationSchema.safeParse(result.data);
    if (!parsed.success) return { status: "unconfirmed" };
    const receipt = parsed.data, revision = (meeting.proposals.at(-1)?.revision ?? 0) + 1;
    if (receipt.appointmentId !== meeting.appointmentId || receipt.contactId !== meeting.contactId || receipt.visibility !== "participants"
      || receipt.status !== "reschedule_pending" || receipt.version !== meeting.version + 1 || receipt.proposals.length !== meeting.proposals.length + 1
      || !sameConfirmed(baseline.data.confirmed, receipt.confirmed) || !matchesProposal(receipt, input, revision)) return { status: "unconfirmed" };
    const verified = await readback(client, receipt, signal);
    return signal.aborted ? { status: "failed" } : verified ? { status: "sent", appointmentId: receipt.appointmentId } : { status: "unconfirmed" };
  } catch { return { status: "failed" }; }
}
