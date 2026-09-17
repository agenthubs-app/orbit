import { z } from "zod";

// Consumer-local decoding of the public operations HTTP DTO. These endpoints
// aren't in shared/api-schema; no Web implementation or private profile import.
const id = z.string().min(1).max(512);
const strings = z.array(z.string());
const date = z.string().refine(value => Number.isFinite(Date.parse(value)));
const person = z.object({ participantId: id, displayName: z.string(), company: z.string().nullable(), role: z.string().nullable(), industry: z.string().nullable(), topics: strings, experienceHighlight: z.string().nullable(), languages: strings, needs: strings, offers: strings });
const request = z.object({ contactId: id.nullable(), requestId: id, revision: z.number().int().positive(), requesterParticipantId: id, targetParticipantId: id, status: z.enum(["awaiting_target_consent", "accepted", "declined", "withdrawn"]), withdrawnAt: date.nullable() });
const recommendation = z.object({ targetParticipantId: id, score: z.number().finite(), reasons: strings, icebreakers: strings, memberHint: z.string() });
const table = z.object({ tableNumber: z.number().int().positive(), theme: z.string(), rationale: z.string(), icebreakers: strings, memberPrompts: z.record(z.string(), strings), memberRationales: z.record(z.string(), z.string()), members: z.array(z.object({ participantId: id, seat: z.string() })) });
const workspaceSchema = z.object({
  eventId: id, configuration: z.object({ eventId: id, checkInOpensAt: date, eventStartsAt: date, eventEndsAt: date, profileEditDeadlineAt: date, resultsAvailableAt: date, roundOneStartsAt: date, roundTwoStartsAt: date }),
  me: person, directory: z.array(person), checkIn: z.object({ checkedInAt: date, participantId: id }).nullable(), checkInAvailable: z.boolean(), profileEditable: z.boolean(),
  resultsState: z.enum(["locked", "not_generated", "processing", "failed", "ready"]), recommendations: z.object({ sourceParticipantId: id, noMatchReason: z.string().nullable(), recommendations: z.array(recommendation) }).nullable(),
  roundOneTable: table.nullable(), roundTwoTable: table.nullable(), contactRequests: z.array(request),
});
const detailSchema = z.object({
  company: z.string().nullable(), displayName: z.string(), industry: z.string().nullable(), participantId: id, role: z.string().nullable(), topics: strings,
  profileCompleteness: z.enum(["complete", "partial", "minimal"]), profileVersion: z.number().int().nonnegative().nullable(), sourceContext: z.enum(["current_profile", "published_generation"]),
  responses: z.array(z.object({ answer: z.string(), answeredAt: date.nullable(), fieldKey: z.string(), label: z.object({ en: z.string(), zh: z.string() }), prompt: z.string().nullable(), questionSource: z.enum(["ai_adaptive", "legacy_unknown"]) })),
  recommendation: recommendation.omit({ targetParticipantId: true }).nullable(), placements: z.array(z.object({ groupingRationale: z.string().nullable(), icebreakers: strings, roundNumber: z.union([z.literal(1), z.literal(2)]), seat: z.string(), tableNumber: z.number().int().positive(), theme: z.string() })),
  contactRequest: z.object({ contactId: id.nullable(), direction: z.enum(["incoming", "outgoing"]).nullable(), requestId: id.nullable(), revision: z.number().int().positive().nullable(), status: z.enum(["none", "awaiting_target_consent", "accepted", "declined", "withdrawn"]) }),
});
export type AttendeeWorkspace = z.infer<typeof workspaceSchema>;
export type ParticipantDetail = z.infer<typeof detailSchema>;
export type ExchangeIntent = { requesterParticipantId: string; targetParticipantId: string } & (
  | { kind: "create"; expectedRevision: number | null; requestId?: string }
  | { kind: "respond"; expectedRevision: number; requestId: string; accept: boolean }
  | { kind: "withdraw"; expectedRevision: number; requestId: string }
);
export const attendeeOperationsPath = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/operations`;
export function readAttendeeWorkspace(value: unknown, eventId: string): AttendeeWorkspace {
  const data = workspaceSchema.parse(value);
  const ids = new Set(data.directory.map(p => p.participantId));
  const me = data.me.participantId;
  if (data.eventId !== eventId || data.configuration.eventId !== eventId || !ids.has(me) || ids.size !== data.directory.length
    || (data.checkIn && data.checkIn.participantId !== me)
    || (data.recommendations && (data.recommendations.sourceParticipantId !== me || data.recommendations.recommendations.some(r => r.targetParticipantId === me || !ids.has(r.targetParticipantId))))
    || data.contactRequests.some(r => (r.requesterParticipantId !== me && r.targetParticipantId !== me) || r.requesterParticipantId === r.targetParticipantId || !ids.has(r.requesterParticipantId) || !ids.has(r.targetParticipantId))
    || [data.roundOneTable, data.roundTwoTable].some(t => t && (!t.members.some(m => m.participantId === me) || t.members.some(m => !ids.has(m.participantId))))
  ) throw new Error("Invalid attendee scope");
  if (data.resultsState !== "ready" && (data.recommendations || data.roundOneTable || data.roundTwoTable)) throw new Error("Results are not available");
  return data;
}
export function readParticipantDetail(value: unknown, workspace: AttendeeWorkspace, participantId: string): ParticipantDetail {
  const data = detailSchema.parse(value);
  if (data.participantId !== participantId || !workspace.directory.some(p => p.participantId === participantId)) throw new Error("Invalid participant scope");
  const r = data.contactRequest;
  const known = workspace.contactRequests.find(item => item.requestId === r.requestId);
  if (r.status === "none") {
    const pairExists = workspace.contactRequests.some(item =>
      (item.requesterParticipantId === workspace.me.participantId && item.targetParticipantId === participantId)
      || (item.targetParticipantId === workspace.me.participantId && item.requesterParticipantId === participantId));
    if (pairExists || r.requestId !== null || r.revision !== null || r.direction !== null || r.contactId !== null) throw new Error("Exchange changed; refresh workspace");
  } else if (!known || known.status !== r.status || known.revision !== r.revision || known.contactId !== r.contactId
    || (known.requesterParticipantId === workspace.me.participantId ? "outgoing" : "incoming") !== r.direction
    || ![known.targetParticipantId, known.requesterParticipantId].includes(participantId)) throw new Error("Exchange changed; refresh workspace");
  return data;
}
export function exchangeCommand(eventId: string, intent: ExchangeIntent) {
  const root = `${attendeeOperationsPath(eventId)}/contact-requests`;
  return intent.kind === "create"
    ? { path: root, body: { targetParticipantId: intent.targetParticipantId, expectedRevision: intent.expectedRevision } }
    : { path: `${root}/${encodeURIComponent(intent.requestId)}/${intent.kind}`, body: intent.kind === "respond" ? { accept: intent.accept, expectedRevision: intent.expectedRevision } : { expectedRevision: intent.expectedRevision } };
}
export function validateExchangeReceipt(value: unknown, eventId: string, intent: ExchangeIntent) {
  const data = request.extend({ eventId: id }).parse(value);
  const status = intent.kind === "create" ? "awaiting_target_consent" : intent.kind === "withdraw" ? "withdrawn" : intent.accept ? "accepted" : "declined";
  if (data.eventId !== eventId || data.requesterParticipantId !== intent.requesterParticipantId || data.targetParticipantId !== intent.targetParticipantId
    || (intent.requestId !== undefined && data.requestId !== intent.requestId) || data.status !== status || data.revision <= (intent.expectedRevision ?? 0)) throw new Error("Invalid exchange receipt");
  return data;
}
export function validateCheckInReceipt(value: unknown, eventId: string, participantId: string, operationsActorId: string) {
  const data = z.object({ eventId: id, participantId: id, actorId: id, checkedInAt: date, evidenceId: id }).parse(value);
  if (data.eventId !== eventId || data.participantId !== participantId || data.actorId !== operationsActorId) throw new Error("Invalid check-in receipt");
  return data;
}
