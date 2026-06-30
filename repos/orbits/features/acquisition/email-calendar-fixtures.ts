import type {
  EmailCalendarRelationshipSignal,
  EmailCalendarSignalConfirmation,
  EmailCalendarSignalConfirmationPayload,
  EmailCalendarSignalEvidence,
  EmailCalendarSignalPayload,
  EmailCalendarSignalPermission,
  EmailCalendarSignalProvenance,
  EmailCalendarSignalSourceKind,
  EmailCalendarSignalSourceReference,
} from "./email-calendar-contract";

export const EMAIL_CALENDAR_SIGNAL_FIXTURE_SOURCE =
  "fixture:features/acquisition/email-calendar-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T17:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T17:06:00.000Z";
const fixtureConfirmedAt = "2026-06-25T17:12:00.000Z";

export const mockEmailCalendarSignalSources = {
  gmail: {
    type: "email_signal",
    id: "source:email-calendar:gmail",
    label: "Gmail fixture",
    sourceKind: "gmail",
    providerRecordId: "gmail-message:demo-intro-1",
  },
  googleCalendar: {
    type: "calendar_signal",
    id: "source:email-calendar:google-calendar",
    label: "Google Calendar fixture",
    sourceKind: "google_calendar",
    providerRecordId: "google-calendar-event:demo-calendar-1",
  },
  microsoftGraph: {
    type: "email_signal",
    id: "source:email-calendar:microsoft-graph",
    label: "Microsoft Graph fixture",
    sourceKind: "microsoft_graph",
    providerRecordId: "microsoft-graph-item:demo-overlap-1",
  },
} as const satisfies Record<string, EmailCalendarSignalSourceReference>;

function buildPermission(
  provider: EmailCalendarSignalSourceKind,
  scopes: readonly string[],
): EmailCalendarSignalPermission {
  return {
    required: true,
    state: "mock-granted",
    provider,
    scopes,
    permissionGrantId: `permission:email-calendar:${provider}`,
    permissionFlowExecuted: false,
    mailboxSyncExecuted: false,
    deviceCalendarReadExecuted: false,
  };
}

function buildConfirmation(
  displayName: string,
): EmailCalendarSignalConfirmation {
  return {
    required: true,
    state: "pending",
    question: `Confirm whether ${displayName} should become an Orbit relationship signal.`,
  };
}

export const mockEmailCalendarSignalProvenance: EmailCalendarSignalProvenance =
  {
    source: EMAIL_CALENDAR_SIGNAL_FIXTURE_SOURCE,
    sourceLabel: "Mock email and calendar relationship signal fixture",
    evidenceIds: [
      "evidence:email-calendar:gmail-intro",
      "evidence:email-calendar:calendar-meeting",
      "evidence:email-calendar:graph-overlap",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-email-calendar-signals-only",
    generationMethod: "fixture",
    permissionRequired: true,
    userConfirmationRequired: true,
    gmailApiRequested: false,
    googleCalendarApiRequested: false,
    microsoftGraphApiRequested: false,
    backgroundSyncEnqueued: false,
    messageBodyIngested: false,
    externalNetworkRequested: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };

export const mockEmptyEmailCalendarSignalProvenance: EmailCalendarSignalProvenance =
  {
    ...mockEmailCalendarSignalProvenance,
    sourceLabel: "Mock empty email and calendar relationship signal rule",
    evidenceIds: ["evidence:email-calendar:empty"],
    generationMethod: "rule-based-email-calendar-signal",
  };

export const mockPendingEmailCalendarSignalProvenance: EmailCalendarSignalProvenance =
  {
    ...mockEmailCalendarSignalProvenance,
    sourceLabel: "Mock pending email and calendar relationship signal rule",
    evidenceIds: ["evidence:email-calendar:pending"],
    generationMethod: "rule-based-email-calendar-signal",
  };

export const mockEmailCalendarSignalFailureProvenance: EmailCalendarSignalProvenance =
  {
    ...mockEmailCalendarSignalProvenance,
    sourceLabel:
      "Mock email and calendar relationship signal controlled failure rule",
    evidenceIds: ["evidence:email-calendar:controlled-failure"],
    generationMethod: "rule-based-email-calendar-signal",
  };

export const mockEmailCalendarSignalEvidence: readonly EmailCalendarSignalEvidence[] =
  [
    {
      evidenceId: "evidence:email-calendar:gmail-intro",
      source: mockEmailCalendarSignalSources.gmail,
      sourceLabel: "Gmail fixture",
      excerpt:
        "Header and subject fixture: Intro for Aiko Watanabe after the climate operator dinner.",
      capturedFields: ["from", "to", "subject", "sentAt"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-email-calendar-signal-service",
      messageBodyIngested: false,
    },
    {
      evidenceId: "evidence:email-calendar:calendar-meeting",
      source: mockEmailCalendarSignalSources.googleCalendar,
      sourceLabel: "Google Calendar fixture",
      excerpt:
        "Calendar title fixture: Noah Silva attended the Climate LP breakfast with the founder.",
      capturedFields: ["eventTitle", "attendeeName", "startsAt"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-email-calendar-signal-service",
      messageBodyIngested: false,
    },
    {
      evidenceId: "evidence:email-calendar:graph-overlap",
      source: mockEmailCalendarSignalSources.microsoftGraph,
      sourceLabel: "Microsoft Graph fixture",
      excerpt:
        "Subject and calendar overlap fixture: Leah Novak appears in partner follow-up metadata.",
      capturedFields: ["subject", "attendeeName", "lastInteractionAt"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-email-calendar-signal-service",
      messageBodyIngested: false,
    },
  ];

export const mockEmailCalendarSignals: readonly EmailCalendarRelationshipSignal[] =
  [
    {
      id: "demo-email-signal-1",
      source: mockEmailCalendarSignalSources.gmail,
      sourceKind: "gmail",
      signalKind: "email_intro",
      displayName: "Aiko Watanabe",
      role: "Founder",
      organization: "Kumo Grid",
      relationshipContext:
        "Intro email metadata suggests Aiko is a warm climate-infrastructure founder connection.",
      suggestedNextAction:
        "Ask for context from the introducer before creating a relationship follow-up.",
      occurredAt: "2026-06-24T09:30:00.000Z",
      confidence: "high",
      permission: buildPermission("gmail", ["metadata.readonly"]),
      confirmation: buildConfirmation("Aiko Watanabe"),
      evidenceIds: ["evidence:email-calendar:gmail-intro"],
      evidence: mockEmailCalendarSignalEvidence.filter(
        (evidence) => evidence.evidenceId === "evidence:email-calendar:gmail-intro",
      ),
      provenance: mockEmailCalendarSignalProvenance,
      readyForReview: true,
      relationshipWriteExecuted: false,
      gmailApiRequested: false,
      googleCalendarApiRequested: false,
      microsoftGraphApiRequested: false,
      backgroundSyncEnqueued: false,
      messageBodyIngested: false,
      databaseWriteExecuted: false,
      notificationDelivered: false,
    },
    {
      id: "demo-calendar-signal-1",
      source: mockEmailCalendarSignalSources.googleCalendar,
      sourceKind: "google_calendar",
      signalKind: "calendar_meeting",
      displayName: "Noah Silva",
      role: "Limited Partner",
      organization: "Southbank Climate Fund",
      relationshipContext:
        "Calendar fixture shows a shared LP breakfast, making Noah a relationship worth reviewing before follow-up.",
      suggestedNextAction:
        "Confirm the calendar signal, then draft a brief post-breakfast note.",
      occurredAt: "2026-06-23T22:00:00.000Z",
      confidence: "medium",
      permission: buildPermission("google_calendar", [
        "calendar.events.metadata.readonly",
      ]),
      confirmation: buildConfirmation("Noah Silva"),
      evidenceIds: ["evidence:email-calendar:calendar-meeting"],
      evidence: mockEmailCalendarSignalEvidence.filter(
        (evidence) =>
          evidence.evidenceId === "evidence:email-calendar:calendar-meeting",
      ),
      provenance: mockEmailCalendarSignalProvenance,
      readyForReview: true,
      relationshipWriteExecuted: false,
      gmailApiRequested: false,
      googleCalendarApiRequested: false,
      microsoftGraphApiRequested: false,
      backgroundSyncEnqueued: false,
      messageBodyIngested: false,
      databaseWriteExecuted: false,
      notificationDelivered: false,
    },
    {
      id: "demo-graph-signal-1",
      source: mockEmailCalendarSignalSources.microsoftGraph,
      sourceKind: "microsoft_graph",
      signalKind: "email_calendar_overlap",
      displayName: "Leah Novak",
      role: "Partner Manager",
      organization: "HarborGrid",
      relationshipContext:
        "Microsoft Graph metadata fixture links Leah to a partner follow-up thread and recurring calendar overlap.",
      suggestedNextAction:
        "Review the metadata-only signal before adding Leah to partnership follow-ups.",
      occurredAt: "2026-06-22T15:45:00.000Z",
      confidence: "medium",
      permission: buildPermission("microsoft_graph", [
        "mail.metadata.readonly",
        "calendar.metadata.readonly",
      ]),
      confirmation: buildConfirmation("Leah Novak"),
      evidenceIds: ["evidence:email-calendar:graph-overlap"],
      evidence: mockEmailCalendarSignalEvidence.filter(
        (evidence) => evidence.evidenceId === "evidence:email-calendar:graph-overlap",
      ),
      provenance: mockEmailCalendarSignalProvenance,
      readyForReview: true,
      relationshipWriteExecuted: false,
      gmailApiRequested: false,
      googleCalendarApiRequested: false,
      microsoftGraphApiRequested: false,
      backgroundSyncEnqueued: false,
      messageBodyIngested: false,
      databaseWriteExecuted: false,
      notificationDelivered: false,
    },
  ];

export const mockEmailCalendarSignalFixture: EmailCalendarSignalPayload = {
  state: "success",
  signals: mockEmailCalendarSignals,
  summary:
    "Three metadata-only email and calendar relationship signals are ready for permission-gated review.",
  provenance: mockEmailCalendarSignalProvenance,
  nextAction:
    "Review each signal and explicitly confirm before converting it into a relationship action.",
};

export const mockEmptyEmailCalendarSignalFixture: EmailCalendarSignalPayload = {
  state: "empty",
  signals: [],
  summary:
    "No email or calendar relationship signals are available in the local fixture.",
  provenance: mockEmptyEmailCalendarSignalProvenance,
  nextAction:
    "Grant mock email and calendar permission before reviewing relationship signals.",
};

export const mockPendingEmailCalendarSignalFixture: EmailCalendarSignalPayload =
  {
    state: "pending",
    signals: [],
    summary:
      "Email and calendar relationship signals are pending local fixture permission review.",
    provenance: mockPendingEmailCalendarSignalProvenance,
    nextAction:
      "Wait for mock permission review before confirming relationship signals.",
  };

export const mockEmailCalendarSignalConfirmationEvidence: EmailCalendarSignalEvidence =
  {
    evidenceId: "evidence:email-calendar:confirmation:demo-calendar-signal-1",
    source: mockEmailCalendarSignalSources.googleCalendar,
    sourceLabel: "Rule-based email and calendar signal confirmation",
    excerpt:
      "Demo operator confirmed the calendar relationship signal for Noah Silva.",
    capturedFields: ["signalId", "actorLabel", "confirmedAt"],
    createdAt: fixtureConfirmedAt,
    createdBy: "mock-email-calendar-signal-service",
    messageBodyIngested: false,
  };

const confirmedCalendarSignal: EmailCalendarRelationshipSignal = {
  ...mockEmailCalendarSignals[1],
  confirmation: {
    ...mockEmailCalendarSignals[1].confirmation,
    state: "confirmed",
    confirmedAt: fixtureConfirmedAt,
    actorLabel: "Demo operator",
  },
  evidenceIds: [
    ...mockEmailCalendarSignals[1].evidenceIds,
    mockEmailCalendarSignalConfirmationEvidence.evidenceId,
  ],
  evidence: [
    ...mockEmailCalendarSignals[1].evidence,
    mockEmailCalendarSignalConfirmationEvidence,
  ],
  provenance: {
    ...mockEmailCalendarSignalProvenance,
    sourceLabel: "Rule-based email and calendar signal confirmation",
    evidenceIds: [
      ...mockEmailCalendarSignals[1].evidenceIds,
      mockEmailCalendarSignalConfirmationEvidence.evidenceId,
    ],
    generationMethod: "rule-based-email-calendar-signal",
  },
};

export const mockEmailCalendarSignalConfirmedFixture: EmailCalendarSignalConfirmationPayload =
  {
    state: "confirmed",
    confirmedSignal: confirmedCalendarSignal,
    createdEvidence: mockEmailCalendarSignalConfirmationEvidence,
    confirmedAt: fixtureConfirmedAt,
    confirmedBy: "Demo operator",
    provenance: confirmedCalendarSignal.provenance,
    nextAction:
      "Use the confirmed signal as evidence for a future relationship follow-up, without sending messages or writing contacts in this mock.",
    relationshipWriteExecuted: false,
    externalActionExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  };
