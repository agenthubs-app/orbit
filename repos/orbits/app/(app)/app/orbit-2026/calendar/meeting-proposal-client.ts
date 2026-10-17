import { z } from "zod";
import type { MeetingDetailsMedium } from "../../../../../shared/contract/appointments";
import { meetingDetailsSchema } from "../../../../../shared/api-schema/appointment-details";
import { meetingInitialProposalAvailabilitySchema } from "../../../../../shared/api-schema/appointment-initial-proposal";
import { createAppointmentActionIdempotencyRegistry } from "../../../../../features/appointments/client-idempotency";
import { calendarDate, validTimeZone } from "../../../../../features/tasks/local-date-time";

export interface MeetingCandidate { startsAt: string; endsAt: string }
export class MeetingProposalError extends Error {
  constructor(readonly code: "invalid" | "denied" | "conflict" | "failed" | "unconfirmed") { super(code); }
}
const instant = z.string().datetime({ offset: true }).refine(value => calendarDate(value.slice(0, 10)) !== null && Number.isFinite(Date.parse(value)));
const candidateSchema = z.object({ candidateId: z.string().min(1).max(128), startsAtUtc: instant });
const confirmedSchema = meetingDetailsSchema.shape.confirmed.unwrap().extend({ candidateId: z.string().min(1).max(128), proposalRevision: z.number().int().positive() });
const proposalSchema = meetingDetailsSchema.shape.proposals.element.extend({ candidateTimes: z.array(candidateSchema).min(3).max(5) });
const targetSchema = meetingDetailsSchema.extend({ confirmed: confirmedSchema.nullable(), proposals: z.array(proposalSchema).max(100), pendingProposalRevision: z.number().int().positive().nullable() });
export type MeetingProposalTarget = z.infer<typeof targetSchema>;
export interface MeetingProposalInput { candidateTimes: { startsAtUtc: string }[]; durationMinutes: number; medium: MeetingDetailsMedium; note: string; timezone: string }

export function prepareMeetingProposal(candidates: readonly MeetingCandidate[], medium: MeetingDetailsMedium, zone: string, now: number): MeetingProposalInput | null {
  if (!Number.isFinite(now) || !validTimeZone(zone) || candidates.length < 3 || candidates.length > 5) return null;
  const ranges = candidates.map(candidate => ({ start: Date.parse(candidate.startsAt), end: Date.parse(candidate.endsAt) }));
  if (candidates.some(candidate => !instant.safeParse(candidate.startsAt).success || !instant.safeParse(candidate.endsAt).success) || ranges.some(range => range.start <= now + 15 * 60_000 || range.end <= range.start)) return null;
  const durationMinutes = (ranges[0]!.end - ranges[0]!.start) / 60_000;
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || ranges.some(range => (range.end - range.start) / 60_000 !== durationMinutes)) return null;
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  if (ordered.some((range, index) => index > 0 && range.start < ordered[index - 1]!.end)) return null;
  const parsed = confirmedSchema.shape.medium.safeParse(medium);
  if (!parsed.success) return null;
  if (parsed.data.kind === "video" && parsed.data.joinUrl) { const url = new URL(parsed.data.joinUrl); if (url.username || url.password || url.protocol !== "https:") return null; }
  const normalizedMedium: MeetingDetailsMedium = parsed.data.kind === "in_person" ? { kind: "in_person", location: parsed.data.location }
    : parsed.data.kind === "video" ? { kind: "video", provider: parsed.data.provider, joinUrl: parsed.data.joinUrl ?? null }
    : { kind: "phone", phoneHint: parsed.data.phoneHint ?? null };
  return { candidateTimes: ordered.map(range => ({ startsAtUtc: new Date(range.start).toISOString() })), durationMinutes, medium: normalizedMedium, note: "", timezone: zone };
}

function id(value: string) { if (!value || value.trim() !== value || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new MeetingProposalError("invalid"); try { return encodeURIComponent(value); } catch { throw new MeetingProposalError("invalid"); } }
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
export function createMeetingProposalClient(options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const fetcher = options.fetch ?? globalThis.fetch, clock = options.now ?? Date.now;
  const keys = createAppointmentActionIdempotencyRegistry();
  async function request(path: string, signal?: AbortSignal, body?: object) {
    signal?.throwIfAborted();
    let response: Response;
    try { response = await fetcher(path, { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal, headers: { accept: "application/json", ...(body ? { "content-type": "application/json", "idempotency-key": keys.keyFor(JSON.stringify([path, body])) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { signal?.throwIfAborted(); throw new MeetingProposalError("failed"); }
    signal?.throwIfAborted();
    if (response.status === 401 || response.status === 403) throw new MeetingProposalError("denied");
    if (response.status === 409) throw new MeetingProposalError("conflict");
    const text = await response.text(); signal?.throwIfAborted();
    if (!response.ok || text.length > 1_048_576) throw new MeetingProposalError("failed");
    let envelope: any;
    try { envelope = JSON.parse(text); } catch { throw new MeetingProposalError("unconfirmed"); }
    if (envelope?.success !== true) throw new MeetingProposalError("failed");
    return envelope.data;
  }
  function decode(raw: unknown, appointmentId: string, contactId?: string) {
    const parsed = targetSchema.safeParse(raw);
    if (!parsed.success || parsed.data.appointmentId !== appointmentId || contactId !== undefined && parsed.data.contactId !== contactId) throw new MeetingProposalError("unconfirmed");
    return parsed.data;
  }
  const get = async (appointmentId: string, contactId?: string, signal?: AbortSignal) => {
    if (contactId !== undefined) id(contactId);
    return decode(await request(`/api/appointments/${id(appointmentId)}`, signal), appointmentId, contactId);
  };
  return {
    get,
    async available(contactId: string, signal?: AbortSignal): Promise<boolean> {
      id(contactId);
      const parsed = meetingInitialProposalAvailabilitySchema.safeParse(await request(`/api/appointments/initial-proposal?${new URLSearchParams({ contactId })}`, signal));
      if (!parsed.success || parsed.data.contactId !== contactId) throw new MeetingProposalError("unconfirmed");
      return parsed.data.available;
    },
    async create(contactId: string, candidates: readonly MeetingCandidate[], medium: MeetingDetailsMedium, zone: string, signal?: AbortSignal): Promise<MeetingProposalTarget> {
      id(contactId);
      const proposal = prepareMeetingProposal(candidates, medium, zone, clock());
      if (!proposal) throw new MeetingProposalError("invalid");
      const raw = await request("/api/appointments/initial-proposal", signal, { contactId, proposal });
      if (typeof raw?.appointmentId !== "string") throw new MeetingProposalError("unconfirmed");
      const receipt = decode(raw, raw.appointmentId, contactId), latest = receipt.proposals[0];
      if (typeof raw?.replayed !== "boolean" || receipt.visibility !== "participants" || receipt.status !== "awaiting_response" || receipt.version !== 2 || receipt.confirmed !== null || receipt.pendingProposalRevision !== 1 || receipt.proposals.length !== 1 || !latest || latest.revision !== 1 || latest.proposedBy !== "you" || latest.durationMinutes !== proposal.durationMinutes || latest.timezone !== proposal.timezone || latest.note !== proposal.note || !same(latest.medium, proposal.medium) || !same(latest.candidateTimes.map(candidate => ({ startsAtUtc: new Date(candidate.startsAtUtc).toISOString() })), proposal.candidateTimes)) throw new MeetingProposalError("unconfirmed");
      const verified = await get(receipt.appointmentId, contactId, signal);
      if (!same(verified, receipt)) throw new MeetingProposalError("unconfirmed");
      return verified;
    },
    async cancel(meeting: MeetingProposalTarget, signal?: AbortSignal): Promise<MeetingProposalTarget> {
      if (!targetSchema.safeParse(meeting).success || meeting.visibility !== "participants" || !["confirmed", "reschedule_pending"].includes(meeting.status) || !meeting.confirmed || !meeting.contactId) throw new MeetingProposalError("invalid");
      const raw = await request(`/api/appointments/${id(meeting.appointmentId)}/commands`, signal, { command: "cancel", expectedVersion: meeting.version });
      const receipt = decode(raw, meeting.appointmentId, meeting.contactId);
      if (typeof raw?.replayed !== "boolean" || receipt.status !== "cancelled" || receipt.version <= meeting.version || receipt.pendingProposalRevision !== null || !same(receipt.confirmed, meeting.confirmed) || !same(receipt.proposals, meeting.proposals)) throw new MeetingProposalError("unconfirmed");
      const verified = await get(meeting.appointmentId, meeting.contactId, signal);
      if (!same(verified, receipt)) throw new MeetingProposalError("unconfirmed");
      return verified;
    },
    async propose(meeting: MeetingProposalTarget, candidates: readonly MeetingCandidate[], medium: MeetingDetailsMedium, zone: string, signal?: AbortSignal): Promise<MeetingProposalTarget> {
      const baseline = targetSchema.safeParse(meeting), proposal = prepareMeetingProposal(candidates, medium, zone, clock());
      if (!baseline.success || !proposal || meeting.visibility !== "participants" || meeting.status !== "confirmed" || !meeting.confirmed || !meeting.contactId) throw new MeetingProposalError("invalid");
      const raw = await request(`/api/appointments/${id(meeting.appointmentId)}/commands`, signal, { command: "propose", expectedVersion: meeting.version, proposal });
      const receipt = decode(raw, meeting.appointmentId, meeting.contactId), latest = receipt.proposals.at(-1);
      if (typeof raw?.replayed !== "boolean" || receipt.status !== "reschedule_pending" || receipt.version <= meeting.version || !same(receipt.confirmed, meeting.confirmed) || !latest || latest.revision <= (meeting.proposals.at(-1)?.revision ?? 0) || receipt.pendingProposalRevision !== latest.revision || latest.proposedBy !== "you" || latest.durationMinutes !== proposal.durationMinutes || latest.timezone !== proposal.timezone || latest.note !== proposal.note || !same(latest.medium, proposal.medium) || !same(latest.candidateTimes.map(candidate => ({ startsAtUtc: new Date(candidate.startsAtUtc).toISOString() })), proposal.candidateTimes)) throw new MeetingProposalError("unconfirmed");
      const verified = await get(meeting.appointmentId, meeting.contactId, signal);
      if (!same(verified, receipt)) throw new MeetingProposalError("unconfirmed");
      return verified;
    },
  };
}
