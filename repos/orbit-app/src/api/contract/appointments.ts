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
  pendingProposalRevision?: number | null | undefined;
  proposals: readonly {
    candidateTimes?: readonly { candidateId: string; startsAtUtc: string }[] | undefined;
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

/** Wide proposal read, preserving the frozen nullable confirmed shape for old detail consumers. */
export interface MeetingProposalDetailsContract extends MeetingDetailsContract {
  confirmed: (NonNullable<MeetingDetailsContract["confirmed"]> & {
    candidateId?: string | undefined;
    proposalRevision?: number | undefined;
  }) | null;
}

/** No caller-supplied actor, event authority or counterparty identity. */
export interface MeetingInitialProposalRequestContract {
  contactId: string;
  proposal: {
    candidateTimes: readonly { startsAtUtc: string }[];
    durationMinutes: number;
    medium: MeetingDetailsMedium;
    note: string;
    timezone: string;
  };
}

export interface MeetingInitialProposalAvailabilityContract {
  contactId: string;
  available: boolean;
}
