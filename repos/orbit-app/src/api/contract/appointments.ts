export type MeetingDetailsActorRole = "you" | "other";

export type MeetingDetailsMedium =
  | { kind: "in_person"; location: string }
  | { kind: "video"; provider: "google_meet" | "other"; joinUrl: string | null }
  | { kind: "phone"; phoneHint: string | null };

export interface MeetingDetailsContract {
  appointmentId: string;
  confirmed: {
    durationMinutes: number;
    medium: MeetingDetailsMedium;
    startsAtUtc: string;
    timezone: string;
  } | null;
  contactId: string | null;
  details: string;
  detailsUpdatedAt: string | null;
  detailsUpdatedBy: MeetingDetailsActorRole | null;
  eventId: string | null;
  proposals: readonly {
    createdAt: string;
    durationMinutes: number;
    medium: MeetingDetailsMedium;
    note: string;
    proposedBy: MeetingDetailsActorRole;
    revision: number;
    timezone: string;
  }[];
  status: "draft" | "awaiting_response" | "negotiating" | "confirmed" | "reschedule_pending" | "cancelled" | "completed";
  title: string;
  updatedAt: string;
  version: number;
  visibility: "participants" | "private";
}

export interface MeetingDetailsMutationContract extends MeetingDetailsContract {
  replayed: boolean;
}
