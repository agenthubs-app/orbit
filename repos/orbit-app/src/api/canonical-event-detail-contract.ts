import { z } from "zod";
import { EVENT_REGISTRATION_ACTION_VIEWS, EVENT_REGISTRATION_ELIGIBILITY_STATE_VIEWS } from "../view-models/event-registration";
import { EVENT_REGISTRATION_BLOCKING_REASONS } from "../view-models/event-registration-status";

// Consumer contracts: copy only fields used by this screen, never serialize the internal aggregate.
const id = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const answers = z.object({
  positioning: z.string().optional(), industry: z.string().optional(),
  targetAttendees: z.string().optional(), valueOffered: z.string().optional(),
  desiredOutcome: z.string().optional(), energyStyle: z.string().optional(),
  experienceHighlight: z.string().optional(), followUpPreference: z.string().optional()
});
const registrationPayload = z.object({
  eligibility: z.object({
    blockingReason: z.enum(EVENT_REGISTRATION_BLOCKING_REASONS).optional().catch(undefined),
    allowedActions: z.array(z.enum(EVENT_REGISTRATION_ACTION_VIEWS)),
    applicationVersion: z.number().int().positive().nullable(),
    evaluatedAt: timestamp,
    policyVersion: z.number().int().positive().nullable(),
    reason: z.enum(EVENT_REGISTRATION_ELIGIBILITY_STATE_VIEWS),
    registrationVersion: timestamp.nullable(),
    state: z.enum(EVENT_REGISTRATION_ELIGIBILITY_STATE_VIEWS)
  }),
  questionSet: z.object({
    provenance: z.object({
      aiProviderRequested: z.literal(false), externalNetworkRequested: z.literal(false),
      fallbackReason: z.literal("QUESTIONS_NOT_REQUESTED"),
      generationMethod: z.literal("deterministic-not-requested"),
      model: z.null(), provider: z.null()
    }),
    questions: z.array(z.unknown()).length(0)
  }),
  registration: z.object({
    id, eventId: id, userId: id, status: z.enum(["rsvped", "cancelled"]),
    participantProfileId: id,
    participantProfile: z.object({ id, eventId: id, userId: id, answers }),
    updatedAt: timestamp
  }).nullable()
});

export function createCanonicalRegistrationSchema(eventId: string, actorId: string) {
  return registrationPayload.refine(data => {
    const { registration: record, eligibility } = data;
    if (eligibility.reason !== eligibility.state) return false;
    if (eligibility.state === "unavailable" && eligibility.allowedActions.length !== 0) return false;
    if (eligibility.state === "registered" && record?.status !== "rsvped") return false;
    if (eligibility.state === "registration_cancelled" && record?.status !== "cancelled") return false;
    return !record || Boolean(
      record.eventId === eventId && record.userId === actorId &&
      record.participantProfileId === record.participantProfile.id &&
      record.participantProfile.eventId === eventId && record.participantProfile.userId === actorId
    );
  }, "Registration authority does not match the current actor and event.");
}
export type CanonicalRegistration = z.infer<typeof registrationPayload>;

const participant = z.object({
  participantId: id, displayName: id, company: z.string().optional(), role: z.string().optional()
});
const operationsPayload = z.object({
  eventId: id, me: participant, directory: z.array(participant),
  resultsState: z.enum(["locked", "not_generated", "processing", "failed", "ready"]),
  recommendations: z.object({
    sourceParticipantId: id, noMatchReason: z.string().nullable(),
    recommendations: z.array(z.object({
      targetParticipantId: id, score: z.number().min(0).max(100),
      reasons: z.array(id).min(1), memberHint: z.string(), icebreakers: z.tuple([id, id])
    }))
  }).nullable()
});
export function createCanonicalOperationsSchema(eventId: string, participantProfileId: string) {
  return operationsPayload.refine(data => {
    if (data.eventId !== eventId || data.me.participantId !== participantProfileId) return false;
    const participantIds = data.directory.map(value => value.participantId);
    if (new Set(participantIds).size !== participantIds.length) return false;
    if (data.resultsState !== "ready") return data.recommendations === null;
    if (!data.recommendations) return true;
    const targets = data.recommendations.recommendations.map(value => value.targetParticipantId);
    return data.recommendations.sourceParticipantId === data.me.participantId &&
      new Set(targets).size === targets.length &&
      targets.every(target => target !== data.me.participantId && participantIds.includes(target));
  }, "Published recommendations do not match the current attendee or event.");
}
export type CanonicalOperations = z.infer<typeof operationsPayload>;

const artifactPayload = z.object({
  eventId: id, status: z.enum(["queued", "running", "ready", "failed", "unconfigured"]),
  failureCode: id.nullable(), updatedAt: timestamp.nullable(),
  artifact: z.object({
    summary: id, evidenceHash: id, evidenceIds: z.array(id),
    generatedAt: timestamp, messageDraft: z.string().nullable(),
    model: id, provider: id, promptVersion: z.number().int().positive(), version: z.number().int().positive()
  }).nullable()
});
export function createCanonicalArtifactSchema(eventId: string) {
  return artifactPayload.refine(data => data.eventId === eventId &&
    (data.status === "ready" ? data.artifact !== null && data.failureCode === null && data.updatedAt !== null : data.artifact === null),
  "Stored artifact state or event identity is inconsistent.");
}
export type CanonicalArtifact = z.infer<typeof artifactPayload>;
