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
