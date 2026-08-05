export interface OrbitPartyPersonView {
  company: string;
  contactId: string | null;
  contactRequestId: string | null;
  contactRequestRevision: number | null;
  contactRequestDirection: "incoming" | "outgoing" | null;
  contactRequestStatus:
    | "none"
    | "awaiting_target_consent"
    | "incoming"
    | "accepted"
    | "declined"
    | "withdrawn";
  g: string;
  groupNumber: number | null;
  icebreakers: string[];
  id: string;
  industry: string;
  initial: string;
  isRecommended: boolean;
  memberHint: string | null;
  name: string;
  noMatchReason: string | null;
  offering: string;
  reason: string;
  score: number;
  seat: string | null;
  seeking: string;
  summary: string;
  title: string;
  topics: string[];
}

export interface OrbitPartyAgendaItemView {
  description: string;
  label: string;
  time: string;
}

export interface OrbitPartyMeView {
  groupNumber: number | null;
  initial: string;
  name: string;
  participantId: string;
  offering: string[];
  prompts: string[];
  role: string;
  seat: string | null;
  seeking: string[];
  topics: string[];
}

export interface OrbitPartyTableMemberView extends OrbitPartyPersonView {
  groupingRationale: string;
}

export interface OrbitPartyTableView {
  icebreakers: string[];
  memberPrompts: string[];
  members: OrbitPartyTableMemberView[];
  myRationale: string;
  rationale: string;
  seat: string;
  tableNumber: number;
  theme: string;
}

export interface OrbitPartyGraphView {
  edges: readonly {
    fromParticipantId: string;
    id: string;
    kind: "recommendation" | "round_one_table" | "round_two_topic";
    label: string;
    toParticipantId: string;
  }[];
  nodes: readonly {
    company: string | null;
    displayName: string;
    participantId: string;
  }[];
}

export interface OrbitPartyContactRequestView {
  direction: "incoming" | "outgoing";
  otherParticipantId: string;
  requestId: string;
  revision: number;
  status:
    | "awaiting_target_consent"
    | "accepted"
    | "declined"
    | "withdrawn";
}

export interface OrbitPartyViewModel {
  accessCode: string | null;
  agenda: OrbitPartyAgendaItemView[];
  attendees: OrbitPartyPersonView[];
  checkedInAt: string | null;
  checkInAvailable: boolean;
  contactRequests: OrbitPartyContactRequestView[];
  eventId: string;
  eventName: string;
  /**
   * UI-audit fix C10. The party screen hardcoded BOTH an "已结束" pill in its
   * chrome and a "进行中" badge (plus a "TONIGHT" eyebrow and an enabled 签到
   * button) in its hero card, unconditionally — so it always claimed the event
   * was over and live at the same time. Neither read any event state, because
   * there was none on this view model to read. Derived from the same
   * eventStatusFor() the landing and admin surfaces already use, so all three
   * agree about a given event.
   */
  eventPhase: "active" | "upcoming" | "ended";
  eventVenue: string;
  generationNotice: {
    errorCode: string | null;
    errorMessage: string | null;
    status:
      | "queued"
      | "running"
      | "failed"
      | "completed"
      | "published"
      | "superseded";
  } | null;
  graph: OrbitPartyGraphView | null;
  icebreakers: string[];
  me: OrbitPartyMeView;
  profileEditDeadlineAt: string;
  profileEditable: boolean;
  recommendations: OrbitPartyPersonView[];
  recommendationNoMatchReason: string | null;
  resultsAvailableAt: string;
  resultsState: "locked" | "not_generated" | "processing" | "failed" | "ready";
  roundOne: OrbitPartyTableView | null;
  roundTwo: OrbitPartyTableView | null;
  tableMates: OrbitPartyPersonView[];
}
