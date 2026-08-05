import type {
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
} from "./contract";

/**
 * The HTTP allow-list is intentionally separate from the read model. It keeps
 * future read-model implementation details from being serialized by mistake.
 */
export function toEventAnalyticsOrganizerResponse(
  value: EventAnalyticsOrganizerAggregate,
): EventAnalyticsOrganizerAggregate {
  return {
    appointments: { ...value.appointments },
    checkIns: { ...value.checkIns },
    contactRequests: { ...value.contactRequests },
    encounters: { ...value.encounters },
    eventId: value.eventId,
    grouping: {
      published: value.grouping.published,
      roundOne: { ...value.grouping.roundOne },
      roundTwo: { ...value.grouping.roundTwo },
    },
    kind: "organizer_aggregate",
    registrations: { ...value.registrations },
  };
}

export function toEventAnalyticsAttendeeResponse(
  value: EventAnalyticsAttendeeReport,
): EventAnalyticsAttendeeReport {
  const artifact = value.aiArtifact.artifact;
  return {
    aiArtifact: {
      artifact: artifact
        ? {
            evidenceHash: artifact.evidenceHash,
            evidenceIds: [...artifact.evidenceIds],
            generatedAt: artifact.generatedAt,
            messageDraft: artifact.messageDraft,
            model: artifact.model,
            provider: artifact.provider,
            promptVersion: artifact.promptVersion,
            summary: artifact.summary,
            version: artifact.version,
          }
        : null,
      eventId: value.eventId,
      failureCode: value.aiArtifact.failureCode,
      status: value.aiArtifact.status,
      updatedAt: value.aiArtifact.updatedAt,
    },
    appointments: { ...value.appointments },
    checkIn: { ...value.checkIn },
    contactRequests: { ...value.contactRequests },
    encounters: { ...value.encounters },
    eventId: value.eventId,
    grouping: { ...value.grouping },
    kind: "attendee_report",
    registration: { status: "active" },
  };
}
