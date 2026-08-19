import type {
  AttendeePostEventAiArtifactView,
} from "../post-event-artifact/contract";

export interface EventAnalyticsRegistrationCounts {
  active: number;
  cancelled: number;
}

export interface EventAnalyticsCheckInAggregate {
  checkedIn: number;
}

export interface EventAnalyticsContactRequestCounts {
  accepted: number;
  awaitingTargetConsent: number;
  declined: number;
  withdrawn: number;
}

export interface EventAnalyticsPublishedGroupingAggregate {
  published: boolean;
  roundOne: {
    assignedParticipants: number;
    tables: number;
  };
  roundTwo: {
    assignedParticipants: number;
    tables: number;
  };
}

export interface EventAnalyticsEncounterAggregate {
  captured: number;
  projected: number;
}

export interface EventAnalyticsAppointmentCounts {
  awaitingResponse: number;
  cancelled: number;
  completed: number;
  confirmed: number;
  draft: number;
  negotiating: number;
  reschedulePending: number;
}

export interface EventAnalyticsRate {
  denominator: number;
  numerator: number;
  /** A 0..1 ratio. Zero denominators are represented by null, never zero. */
  value: number | null;
}

export interface EventAnalyticsMutualConnectionMetrics {
  acceptedRelationshipPairs: number;
  mutuallyCheckedInPairs: number;
  distinctConnectedCheckIns: number;
  participationRate: EventAnalyticsRate;
}

export interface EventAnalyticsAttributionCoverage {
  declaredCompletedOperations: number;
  stronglyAttributedCompletedOperations: number;
  rate: EventAnalyticsRate;
}

export interface EventAnalyticsRoiMetrics {
  attributionCoverage: EventAnalyticsAttributionCoverage;
  checkedInParticipants: number;
  completedAttributedAgentOperations: number;
  effectiveConnectionPairs: number;
  effectiveConnectionParticipants: number;
  effectiveConnectionRate: EventAnalyticsRate;
  mutualConnections: EventAnalyticsMutualConnectionMetrics;
  strongActions: {
    appointments: number;
    followupReminders: number;
    humanEncounterNotes: number;
    messageDrafts: number;
  };
}

export interface EventAnalyticsRoiSourceWatermark {
  appointmentCount: number;
  appointmentUpdatedAt: string | null;
  checkInCount: number;
  checkInRevision: number;
  completedAgentReceiptCount: number;
  completedAgentReceiptUpdatedAt: string | null;
  configurationVersion: number;
  membershipCount: number;
  membershipRevision: number;
  relationshipPairCount: number;
  relationshipAcceptedAt: string | null;
}

export interface EventAnalyticsRoiSnapshotState {
  finalizedAt: string | null;
  formulaHash: string;
  metricVersion: string;
  revision: number | null;
  sourceWatermark: EventAnalyticsRoiSourceWatermark;
  status: "live" | "finalized";
  windowEndsAt: string;
}

export interface EventAnalyticsRoiAggregate {
  metrics: EventAnalyticsRoiMetrics;
  snapshot: EventAnalyticsRoiSnapshotState;
}

/**
 * Organizer-facing data contains aggregate counts only. It intentionally has
 * no participant, actor, profile, contact, encounter, or appointment fields.
 */
export interface EventAnalyticsOrganizerAggregate {
  appointments: EventAnalyticsAppointmentCounts;
  checkIns: EventAnalyticsCheckInAggregate;
  contactRequests: EventAnalyticsContactRequestCounts;
  encounters: EventAnalyticsEncounterAggregate;
  eventId: string;
  grouping: EventAnalyticsPublishedGroupingAggregate;
  kind: "organizer_aggregate";
  registrations: EventAnalyticsRegistrationCounts;
  roi: EventAnalyticsRoiAggregate;
}

export interface EventAnalyticsAttendeeCheckIn {
  checkedInAt: string | null;
  status: "checked_in" | "not_checked_in";
}

export interface EventAnalyticsAttendeeGrouping {
  roundOneTableNumber: number | null;
  roundTwoTableNumber: number | null;
  status: "available" | "locked" | "not_published";
}

/**
 * An attendee report is deliberately self-scoped. Its only potentially rich
 * field is the existing artifact reader's already-validated ready artifact.
 */
export interface EventAnalyticsAttendeeReport {
  aiArtifact: AttendeePostEventAiArtifactView;
  appointments: EventAnalyticsAppointmentCounts;
  checkIn: EventAnalyticsAttendeeCheckIn;
  contactRequests: EventAnalyticsContactRequestCounts;
  encounters: EventAnalyticsEncounterAggregate;
  eventId: string;
  grouping: EventAnalyticsAttendeeGrouping;
  kind: "attendee_report";
  registration: {
    status: "active";
  };
}

export interface EventAnalyticsReadModel {
  readAttendeeReport(input: {
    actorId: string;
    eventId: string;
  }): Promise<EventAnalyticsAttendeeReport>;
  readOrganizerAggregate(input: {
    eventId: string;
  }): Promise<EventAnalyticsOrganizerAggregate>;
}
