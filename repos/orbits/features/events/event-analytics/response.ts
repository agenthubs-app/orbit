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
    roi: {
      metrics: {
        attributionCoverage: {
          declaredCompletedOperations:
            value.roi.metrics.attributionCoverage.declaredCompletedOperations,
          stronglyAttributedCompletedOperations:
            value.roi.metrics.attributionCoverage
              .stronglyAttributedCompletedOperations,
          rate: { ...value.roi.metrics.attributionCoverage.rate },
        },
        checkedInParticipants: value.roi.metrics.checkedInParticipants,
        completedAttributedAgentOperations:
          value.roi.metrics.completedAttributedAgentOperations,
        effectiveConnectionPairs: value.roi.metrics.effectiveConnectionPairs,
        effectiveConnectionParticipants:
          value.roi.metrics.effectiveConnectionParticipants,
        effectiveConnectionRate: {
          ...value.roi.metrics.effectiveConnectionRate,
        },
        mutualConnections: {
          acceptedRelationshipPairs:
            value.roi.metrics.mutualConnections.acceptedRelationshipPairs,
          distinctConnectedCheckIns:
            value.roi.metrics.mutualConnections.distinctConnectedCheckIns,
          mutuallyCheckedInPairs:
            value.roi.metrics.mutualConnections.mutuallyCheckedInPairs,
          participationRate: {
            ...value.roi.metrics.mutualConnections.participationRate,
          },
        },
        strongActions: {
          appointments: value.roi.metrics.strongActions.appointments,
          followupReminders:
            value.roi.metrics.strongActions.followupReminders,
          humanEncounterNotes:
            value.roi.metrics.strongActions.humanEncounterNotes,
          messageDrafts: value.roi.metrics.strongActions.messageDrafts,
        },
      },
      snapshot: {
        finalizedAt: value.roi.snapshot.finalizedAt,
        formulaHash: value.roi.snapshot.formulaHash,
        metricVersion: value.roi.snapshot.metricVersion,
        revision: value.roi.snapshot.revision,
        sourceWatermark: {
          appointmentCount:
            value.roi.snapshot.sourceWatermark.appointmentCount,
          appointmentUpdatedAt:
            value.roi.snapshot.sourceWatermark.appointmentUpdatedAt,
          checkInCount: value.roi.snapshot.sourceWatermark.checkInCount,
          checkInRevision: value.roi.snapshot.sourceWatermark.checkInRevision,
          completedAgentReceiptCount:
            value.roi.snapshot.sourceWatermark.completedAgentReceiptCount,
          completedAgentReceiptUpdatedAt:
            value.roi.snapshot.sourceWatermark.completedAgentReceiptUpdatedAt,
          configurationVersion:
            value.roi.snapshot.sourceWatermark.configurationVersion,
          membershipCount:
            value.roi.snapshot.sourceWatermark.membershipCount,
          membershipRevision:
            value.roi.snapshot.sourceWatermark.membershipRevision,
          relationshipAcceptedAt:
            value.roi.snapshot.sourceWatermark.relationshipAcceptedAt,
          relationshipPairCount:
            value.roi.snapshot.sourceWatermark.relationshipPairCount,
        },
        status: value.roi.snapshot.status,
        windowEndsAt: value.roi.snapshot.windowEndsAt,
      },
    },
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
