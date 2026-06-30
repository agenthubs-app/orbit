import type {
  OpportunityReminderAnalyticsPayload,
  OpportunityReminderAnalyticsProvenance,
  OpportunityReminderAnalyticsSourceReference,
  OpportunityReminderRecomputePayload,
} from "./opportunity-contract";

export const OPPORTUNITY_REMINDER_ANALYTICS_FIXTURE_SOURCE =
  "fixture:features/dashboard/opportunity-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T23:58:00.000+09:00";
const recomputedAt = "2026-06-25T23:59:00.000+09:00";

function source(input: {
  type: OpportunityReminderAnalyticsSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): OpportunityReminderAnalyticsSourceReference {
  return {
    ...input,
    generatedBy: "mock-opportunity-reminder-analytics-rules",
  };
}

export const mockOpportunityReminderAnalyticsProvenance: OpportunityReminderAnalyticsProvenance =
  {
    source: OPPORTUNITY_REMINDER_ANALYTICS_FIXTURE_SOURCE,
    sourceLabel: "Mock opportunity reminder analytics fixture",
    evidenceIds: [
      "evidence:opportunity:maya:pilot-expansion",
      "evidence:opportunity:ren:bridge-round",
      "evidence:opportunity:diego:operations-pilot",
      "evidence:opportunity:dormant:amina",
      "evidence:opportunity:dormant:kenji",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-opportunity-reminder-analytics-only",
    generationMethod: "fixture",
    predictiveScoringExecuted: false,
    backgroundOpportunityMiningExecuted: false,
    liveAnalyticsJobExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };

export const mockOpportunityReminderAnalyticsFailureProvenance: OpportunityReminderAnalyticsProvenance =
  {
    ...mockOpportunityReminderAnalyticsProvenance,
    sourceLabel: "Mock opportunity reminder analytics controlled failure",
    evidenceIds: ["evidence:opportunity:controlled-failure"],
    generationMethod: "rule-based-state",
  };

const emptyStateProvenance: OpportunityReminderAnalyticsProvenance = {
  ...mockOpportunityReminderAnalyticsProvenance,
  sourceLabel: "Mock empty opportunity reminder analytics state",
  evidenceIds: ["evidence:opportunity:empty-state"],
  generationMethod: "rule-based-state",
};

const pendingStateProvenance: OpportunityReminderAnalyticsProvenance = {
  ...mockOpportunityReminderAnalyticsProvenance,
  sourceLabel: "Mock pending opportunity reminder analytics state",
  evidenceIds: ["evidence:opportunity:pending-state"],
  generationMethod: "rule-based-state",
};

const recomputeProvenance: OpportunityReminderAnalyticsProvenance = {
  ...mockOpportunityReminderAnalyticsProvenance,
  sourceLabel: "Mock opportunity reminder analytics recompute rule output",
  generationMethod: "rule-based-recompute",
};

const climateDinnerSource = source({
  type: "event_import",
  id: "source:opportunity:climate-dinner-roster",
  label: "Climate dinner attendee roster",
  providerRecordId: "event:climate-dinner:roster",
});

const mayaPilotThreadSource = source({
  type: "email_signal",
  id: "source:opportunity:maya-pilot-thread",
  label: "Maya pilot expansion thread",
  providerRecordId: "email-thread:maya:pilot-expansion",
});

const bridgeRoundSource = source({
  type: "referral",
  id: "source:opportunity:ren-bridge-round",
  label: "Ren bridge round intro note",
  providerRecordId: "referral:ren:bridge-round",
});

const operationsCalendarSource = source({
  type: "calendar_signal",
  id: "source:opportunity:diego-ops-review",
  label: "Operations review calendar note",
  providerRecordId: "calendar:event:operations-review",
});

const aminaSource = source({
  type: "manual",
  id: "source:opportunity:amina-product-council",
  label: "Amina product council note",
  providerRecordId: "manual-note:amina-product-council",
});

const kenjiSource = source({
  type: "chat_summary",
  id: "source:opportunity:kenji-channel-summary",
  label: "Kenji channel partner chat summary",
  providerRecordId: "chat-summary:kenji-channel-partners",
});

export const mockOpportunityReminderAnalyticsFixture: OpportunityReminderAnalyticsPayload =
  {
    state: "success",
    highPriorityOpportunities: [
      {
        opportunityId: "opportunity:maya:pilot-expansion",
        contactId: "contact:maya-chen",
        contactName: "Maya Chen",
        organization: "Kumo Grid",
        title: "Climate infrastructure pilot expansion",
        priority: "high",
        priorityScore: 94,
        currentGoalId: "goal:climate-pilots",
        reason:
          "Maya asked for a customer reliability memo after the climate dinner, matching the pilot expansion goal.",
        suggestedAction:
          "Send the reliability memo and ask whether Kumo Grid can review pilot scope this week.",
        dueLabel: "This week",
        sourceRefs: [climateDinnerSource, mayaPilotThreadSource],
        evidenceIds: ["evidence:opportunity:maya:pilot-expansion"],
      },
      {
        opportunityId: "opportunity:ren:bridge-round",
        contactId: "contact:ren-takahashi",
        contactName: "Ren Takahashi",
        organization: "Mori Ventures",
        title: "Bridge round sponsor path",
        priority: "high",
        priorityScore: 89,
        currentGoalId: "goal:bridge-round",
        reason:
          "Ren has recent bridge-round context and a warm referral path through Kenji.",
        suggestedAction:
          "Ask Ren for a 20-minute bridge round feedback call before sending the broader investor update.",
        dueLabel: "Next 3 days",
        sourceRefs: [bridgeRoundSource, kenjiSource],
        evidenceIds: ["evidence:opportunity:ren:bridge-round"],
      },
      {
        opportunityId: "opportunity:diego:operations-pilot",
        contactId: "contact:diego-rivera",
        contactName: "Diego Rivera",
        organization: "Northstar Fleet",
        title: "Operations buyer validation",
        priority: "medium",
        priorityScore: 76,
        currentGoalId: "goal:climate-pilots",
        reason:
          "The operations review note shows Diego can validate buyer objections for climate infrastructure pilots.",
        suggestedAction:
          "Share the two-question buyer validation note and ask for one concrete objection.",
        dueLabel: "Next week",
        sourceRefs: [operationsCalendarSource],
        evidenceIds: ["evidence:opportunity:diego:operations-pilot"],
      },
    ],
    dormantHighValueContacts: [
      {
        contactId: "contact:amina-okafor",
        contactName: "Amina Okafor",
        organization: "Harbor Labs",
        valueType: "strategic_fit",
        valueScore: 91,
        lastTouchpointDays: 84,
        lastTouchpointLabel: "84 days since product council follow-up",
        reason:
          "Amina is a high-value strategic fit but has no recent evidence-backed touchpoint.",
        suggestedAction:
          "Send a short product council update with one specific question about buyer reliability proof.",
        sourceRefs: [aminaSource],
        evidenceIds: ["evidence:opportunity:dormant:amina"],
      },
      {
        contactId: "contact:kenji-sato",
        contactName: "Kenji Sato",
        organization: "Cedar Robotics",
        valueType: "referral_path",
        valueScore: 88,
        lastTouchpointDays: 67,
        lastTouchpointLabel: "67 days since channel partner exchange",
        reason:
          "Kenji remains a strong referral path for channel partners and investor access.",
        suggestedAction:
          "Ask Kenji for one adjacent channel partner intro connected to the bridge round goal.",
        sourceRefs: [kenjiSource],
        evidenceIds: ["evidence:opportunity:dormant:kenji"],
      },
    ],
    currentGoalMatches: [
      {
        goalId: "goal:climate-pilots",
        label: "Close two climate infrastructure pilots",
        targetOutcome:
          "Convert warm climate infrastructure relationships into two scoped pilot conversations.",
        coverageScore: 72,
        matchedOpportunityIds: [
          "opportunity:maya:pilot-expansion",
          "opportunity:diego:operations-pilot",
        ],
        missingContext:
          "Needs one buyer objection note before the next event follow-up window closes.",
        evidenceIds: [
          "evidence:opportunity:maya:pilot-expansion",
          "evidence:opportunity:diego:operations-pilot",
        ],
      },
      {
        goalId: "goal:bridge-round",
        label: "Build investor access for the bridge round",
        targetOutcome:
          "Turn warm investor and referral paths into bridge round feedback calls.",
        coverageScore: 64,
        matchedOpportunityIds: ["opportunity:ren:bridge-round"],
        missingContext:
          "Needs one warm intro request before broad investor update outreach.",
        evidenceIds: ["evidence:opportunity:ren:bridge-round"],
      },
    ],
    suggestedContactReasons: [
      {
        reasonId: "reason:maya:goal-match",
        contactId: "contact:maya-chen",
        contactName: "Maya Chen",
        reasonType: "goal_match",
        reason:
          "Maya is tied to the active climate pilot goal and has a specific next artifact to review.",
        confidence: "high",
        sourceRefs: [climateDinnerSource, mayaPilotThreadSource],
        evidenceIds: ["evidence:opportunity:maya:pilot-expansion"],
      },
      {
        reasonId: "reason:amina:dormancy",
        contactId: "contact:amina-okafor",
        contactName: "Amina Okafor",
        reasonType: "dormancy",
        reason:
          "Amina is high value and dormant long enough that a lightweight context refresh is sensible.",
        confidence: "high",
        sourceRefs: [aminaSource],
        evidenceIds: ["evidence:opportunity:dormant:amina"],
      },
      {
        reasonId: "reason:diego:event-context",
        contactId: "contact:diego-rivera",
        contactName: "Diego Rivera",
        reasonType: "event_context",
        reason:
          "Diego's operations note came from a recent event-adjacent review and can sharpen pilot qualification.",
        confidence: "medium",
        sourceRefs: [operationsCalendarSource],
        evidenceIds: ["evidence:opportunity:diego:operations-pilot"],
      },
      {
        reasonId: "reason:kenji:referral-path",
        contactId: "contact:kenji-sato",
        contactName: "Kenji Sato",
        reasonType: "referral_path",
        reason:
          "Kenji can unlock adjacent channel and investor paths with one targeted ask.",
        confidence: "medium",
        sourceRefs: [kenjiSource],
        evidenceIds: ["evidence:opportunity:dormant:kenji"],
      },
    ],
    summary:
      "Mock opportunity reminder analytics uses deterministic goal, dormancy, event, and referral rules to surface the next sensible relationship actions.",
    provenance: mockOpportunityReminderAnalyticsProvenance,
    nextAction:
      "Review the top opportunity and send the evidence-backed follow-up before adding new broad outreach.",
  };

export const mockEmptyOpportunityReminderAnalyticsFixture: OpportunityReminderAnalyticsPayload =
  {
    state: "empty",
    highPriorityOpportunities: [],
    dormantHighValueContacts: [],
    currentGoalMatches: [],
    suggestedContactReasons: [],
    summary:
      "The local opportunity reminder analytics mock has no evidence-backed contacts or current goals to evaluate.",
    provenance: emptyStateProvenance,
    nextAction:
      "Add evidence-backed contacts and current goals before showing opportunity reminders.",
  };

export const mockPendingOpportunityReminderAnalyticsFixture: OpportunityReminderAnalyticsPayload =
  {
    state: "pending",
    highPriorityOpportunities: [],
    dormantHighValueContacts: [],
    currentGoalMatches: [],
    suggestedContactReasons: [],
    summary:
      "The opportunity reminder analytics mock is waiting for local fixture review.",
    provenance: pendingStateProvenance,
    nextAction:
      "Keep opportunity reminders pending until the mock fixture refresh is approved.",
  };

export const mockOpportunityReminderRecomputeFixture: OpportunityReminderRecomputePayload =
  {
    state: "success",
    recomputedAt,
    evaluatedContacts: 12,
    generatedOpportunityCount: 3,
    changedOpportunityIds: [
      "opportunity:maya:pilot-expansion",
      "opportunity:ren:bridge-round",
      "opportunity:diego:operations-pilot",
    ],
    summary:
      "Rule-based recompute evaluated local fixture contacts against current goals, dormancy windows, event context, and referral paths.",
    provenance: recomputeProvenance,
    nextAction:
      "Expose the changed opportunities to the dashboard reminder list without sending notifications.",
  };

export const mockEmptyOpportunityReminderRecomputeFixture: OpportunityReminderRecomputePayload =
  {
    state: "empty",
    recomputedAt,
    evaluatedContacts: 0,
    generatedOpportunityCount: 0,
    changedOpportunityIds: [],
    summary:
      "The local opportunity reminder recompute mock has no evidence-backed contacts or goals to evaluate.",
    provenance: emptyStateProvenance,
    nextAction:
      "Add evidence-backed contacts and current goals before running opportunity reminder recompute.",
  };

export const mockPendingOpportunityReminderRecomputeFixture: OpportunityReminderRecomputePayload =
  {
    state: "pending",
    recomputedAt,
    evaluatedContacts: 0,
    generatedOpportunityCount: 0,
    changedOpportunityIds: [],
    summary:
      "The opportunity reminder recompute mock is waiting for local fixture review.",
    provenance: pendingStateProvenance,
    nextAction:
      "Keep recompute pending until the mock fixture refresh is approved.",
  };
