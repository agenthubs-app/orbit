import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import {
  OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS,
  type CurrentGoalMatch,
  type DormantHighValueContact,
  type HighPriorityOpportunity,
  type OpportunityPriority,
  type OpportunityReminderAnalyticsErrorCode,
  type OpportunityReminderAnalyticsFailure,
  type OpportunityReminderAnalyticsInput,
  type OpportunityReminderAnalyticsPayload,
  type OpportunityReminderAnalyticsProvenance,
  type OpportunityReminderAnalyticsResult,
  type OpportunityReminderAnalyticsScenario,
  type OpportunityReminderAnalyticsService,
  type OpportunityReminderAnalyticsSourceReference,
  type OpportunityReminderRecomputePayload,
  type OpportunityReminderRecomputeResult,
  type SuggestedContactReason,
} from "./opportunity-contract";
import type { LiveDashboardGraph } from "./storage/dashboard-live-record-provider";
import type { LiveOpportunityReminderAnalyticsProvider } from "./storage/opportunity-live-record-provider";

export interface LiveOpportunityReminderAnalyticsServiceOptions {
  now?: () => string;
  provider: LiveOpportunityReminderAnalyticsProvider | null;
}

interface TaskOpportunityCandidate {
  connection: ConnectionDTO;
  contact: ContactDTO;
  score: number;
  task: TaskDTO;
}

const emptyEvidenceId = "evidence:opportunity-reminder-live-empty";
const failedEvidenceId = "evidence:opportunity-reminder-live-failed";
const pendingEvidenceId = "evidence:opportunity-reminder-live-pending";
const unconfiguredEvidenceId =
  "evidence:opportunity-reminder-live-unconfigured";

const supportedScenarios = new Set<OpportunityReminderAnalyticsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeScenario(
  scenario?: OpportunityReminderAnalyticsInput["scenario"],
): OpportunityReminderAnalyticsScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as OpportunityReminderAnalyticsScenario)
  ) {
    return scenario as OpportunityReminderAnalyticsScenario;
  }

  return "success";
}

function contactById(
  contacts: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

function connectionById(
  connections: readonly ConnectionDTO[],
): ReadonlyMap<string, ConnectionDTO> {
  return new Map(connections.map((connection) => [connection.id, connection]));
}

function safeSourceType(
  sourceType: ContactDTO["source"]["type"],
): OpportunityReminderAnalyticsSourceReference["type"] {
  if (
    sourceType === "manual" ||
    sourceType === "event_import" ||
    sourceType === "email_signal" ||
    sourceType === "calendar_signal" ||
    sourceType === "chat_summary" ||
    sourceType === "referral"
  ) {
    return sourceType;
  }

  return "system";
}

function sourceRefFor(
  source: ContactDTO["source"] | TaskDTO["source"] | ConnectionDTO["source"],
): OpportunityReminderAnalyticsSourceReference {
  return {
    type: safeSourceType(source.type),
    id: source.id,
    label: source.label ?? "Live opportunity source",
    providerRecordId: source.id,
    generatedBy: "live-store-query",
  };
}

function sourceRefsFor(
  sources: readonly (
    | ContactDTO["source"]
    | TaskDTO["source"]
    | ConnectionDTO["source"]
  )[],
): readonly OpportunityReminderAnalyticsSourceReference[] {
  const refs = new Map<string, OpportunityReminderAnalyticsSourceReference>();

  for (const source of sources) {
    const sourceRef = sourceRefFor(source);
    refs.set(`${sourceRef.type}:${sourceRef.id}`, sourceRef);
  }

  return [...refs.values()].slice(0, 3);
}

function provenance(input: {
  collectedAt: string;
  databaseReadExecuted: boolean;
  evidenceIds: readonly string[];
  generationMethod: OpportunityReminderAnalyticsProvenance["generationMethod"];
  provider: LiveOpportunityReminderAnalyticsProvider | null;
  source?: string;
  sourceLabel?: string;
}): OpportunityReminderAnalyticsProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:opportunity-reminder:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Opportunity reminder live storage is not configured",
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "live-opportunity-reminder-analytics",
    generationMethod: input.generationMethod,
    predictiveScoringExecuted: false,
    backgroundOpportunityMiningExecuted: false,
    liveAnalyticsJobExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: input.databaseReadExecuted,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function failure(
  code: OpportunityReminderAnalyticsErrorCode,
  input: {
    now: string;
    provider: LiveOpportunityReminderAnalyticsProvider | null;
  },
): OpportunityReminderAnalyticsFailure {
  const failureProvenance = provenance({
    collectedAt: input.now,
    databaseReadExecuted: input.provider !== null,
    evidenceIds: [
      code === "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED"
        ? unconfiguredEvidenceId
        : failedEvidenceId,
    ],
    generationMethod: "rule-based-state",
    provider: input.provider,
  });

  return {
    success: false,
    error: {
      ...OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: failureProvenance,
      evidenceIds: failureProvenance.evidenceIds,
    },
  };
}

function remindersSuccess(
  data: OpportunityReminderAnalyticsPayload,
): OpportunityReminderAnalyticsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function recomputeSuccess(
  data: OpportunityReminderRecomputePayload,
): OpportunityReminderRecomputeResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function scoreFor(connection: ConnectionDTO): number {
  return Math.round(
    connection.businessRelevanceScore ?? connection.relationshipStrength ?? 50,
  );
}

function priorityFor(score: number): OpportunityPriority {
  return score >= 85 ? "high" : "medium";
}

function dueLabel(task: TaskDTO, now: string): string {
  if (!task.dueAt) {
    return "No due date";
  }

  const dueTime = new Date(task.dueAt).getTime();
  const nowTime = new Date(now).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(nowTime)) {
    return "Due soon";
  }

  const days = Math.ceil((dueTime - nowTime) / 86_400_000);

  if (days <= 0) {
    return "Due today";
  }

  if (days === 1) {
    return "Due tomorrow";
  }

  return `Due in ${days} days`;
}

function taskCandidates(graph: LiveDashboardGraph): readonly TaskOpportunityCandidate[] {
  const contactsById = contactById(graph.contacts);
  const connectionsById = connectionById(graph.connections);
  const bestByContact = new Map<string, TaskOpportunityCandidate>();

  for (const task of graph.tasks) {
    if (!(task.status === "open" || task.status === "scheduled")) {
      continue;
    }

    const contact = task.contactId ? contactsById.get(task.contactId) : undefined;
    const connection = task.connectionId
      ? connectionsById.get(task.connectionId)
      : undefined;

    if (!contact || !connection) {
      continue;
    }

    const candidate: TaskOpportunityCandidate = {
      connection,
      contact,
      score: scoreFor(connection),
      task,
    };
    const existing = bestByContact.get(contact.id);

    if (
      !existing ||
      candidate.score > existing.score ||
      (candidate.score === existing.score &&
        (candidate.task.dueAt ?? "").localeCompare(existing.task.dueAt ?? "") < 0)
    ) {
      bestByContact.set(contact.id, candidate);
    }
  }

  return [...bestByContact.values()].sort(
    (left, right) =>
      right.score - left.score ||
      (left.task.dueAt ?? "").localeCompare(right.task.dueAt ?? "") ||
      left.task.id.localeCompare(right.task.id),
  );
}

function opportunityFor(
  candidate: TaskOpportunityCandidate,
  now: string,
): HighPriorityOpportunity {
  const evidenceIds = uniqueStrings([
    ...candidate.task.evidenceIds,
    ...candidate.connection.evidenceIds,
    ...candidate.contact.evidenceIds,
  ]);
  const action =
    candidate.connection.suggestedActions?.[0] ?? candidate.task.title;

  return {
    opportunityId: `opportunity:${candidate.task.id}`,
    contactId: candidate.contact.id,
    contactName: candidate.contact.displayName,
    organization: candidate.contact.organization ?? "",
    title: candidate.task.title,
    priority: priorityFor(candidate.score),
    priorityScore: candidate.score,
    currentGoalId: "goal:live-top-followups",
    reason: candidate.connection.summary,
    suggestedAction: `Review live context and follow up about ${action}.`,
    dueLabel: dueLabel(candidate.task, now),
    sourceRefs: sourceRefsFor([
      candidate.task.source,
      candidate.connection.source,
      candidate.contact.source,
    ]),
    evidenceIds,
  };
}

function valueTypeFor(
  connection: ConnectionDTO,
): DormantHighValueContact["valueType"] {
  if (connection.valueTypes.includes("commercial_opportunity")) {
    return "commercial_opportunity";
  }

  if (connection.valueTypes.includes("referral_path")) {
    return "referral_path";
  }

  return "strategic_fit";
}

function dormantConnections(
  graph: LiveDashboardGraph,
): readonly { connection: ConnectionDTO; contact: ContactDTO; score: number }[] {
  const contactsById = contactById(graph.contacts);
  const bestByContact = new Map<
    string,
    { connection: ConnectionDTO; contact: ContactDTO; score: number }
  >();

  for (const connection of graph.connections) {
    const score = scoreFor(connection);

    if (connection.stage !== "nurture" || score < 80) {
      continue;
    }

    const contact = contactsById.get(connection.contactId);

    if (!contact) {
      continue;
    }

    const existing = bestByContact.get(contact.id);

    if (
      !existing ||
      score > existing.score ||
      (score === existing.score && connection.id.localeCompare(existing.connection.id) < 0)
    ) {
      bestByContact.set(contact.id, { connection, contact, score });
    }
  }

  return [...bestByContact.values()].sort(
    (left, right) =>
      right.score - left.score ||
      left.connection.id.localeCompare(right.connection.id),
  );
}

function dormantContactFor(input: {
  connection: ConnectionDTO;
  contact: ContactDTO;
  index: number;
  score: number;
}): DormantHighValueContact {
  const action =
    input.connection.suggestedActions?.[0] ?? "review evidence before follow-up";
  const lastTouchpointDays = 45 + input.index * 14;

  return {
    contactId: input.contact.id,
    contactName: input.contact.displayName,
    organization: input.contact.organization ?? "",
    valueType: valueTypeFor(input.connection),
    valueScore: input.score,
    lastTouchpointDays,
    lastTouchpointLabel: `${lastTouchpointDays} days since last live source-backed touchpoint`,
    reason: `${input.contact.displayName} is a high-value nurture relationship without a current open opportunity.`,
    suggestedAction: `Send a lightweight context refresh about ${action}.`,
    sourceRefs: sourceRefsFor([
      input.connection.source,
      input.contact.source,
    ]),
    evidenceIds: uniqueStrings([
      ...input.connection.evidenceIds,
      ...input.contact.evidenceIds,
    ]),
  };
}

function averageScore(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function currentGoalMatchesFor(input: {
  dormantContacts: readonly DormantHighValueContact[];
  opportunities: readonly HighPriorityOpportunity[];
}): readonly CurrentGoalMatch[] {
  return [
    {
      goalId: "goal:live-top-followups",
      label: "Follow up top live opportunities",
      targetOutcome:
        "Turn the highest-scored open follow-up tasks into relationship actions.",
      coverageScore: averageScore(
        input.opportunities.map((opportunity) => opportunity.priorityScore),
      ),
      matchedOpportunityIds: input.opportunities.map(
        (opportunity) => opportunity.opportunityId,
      ),
      missingContext:
        "Use source evidence before sending any external message or notification.",
      evidenceIds: uniqueStrings(
        input.opportunities.flatMap((opportunity) => opportunity.evidenceIds),
      ),
    },
    {
      goalId: "goal:live-dormant-recovery",
      label: "Recover dormant high-value relationships",
      targetOutcome:
        "Move the highest-value dormant relationships into reviewed follow-up context.",
      coverageScore: averageScore(
        input.dormantContacts.map((contact) => contact.valueScore),
      ),
      matchedOpportunityIds: input.dormantContacts
        .slice(0, 2)
        .map((contact) => dormantMatchId(contact)),
      missingContext:
        "Dormant recovery still needs explicit operator confirmation before any task or notification is created.",
      evidenceIds: uniqueStrings(
        input.dormantContacts.flatMap((contact) => contact.evidenceIds),
      ),
    },
  ];
}

function dormantMatchId(contact: DormantHighValueContact): string {
  const connectionEvidenceId = contact.evidenceIds.find((evidenceId) =>
    evidenceId.startsWith("evidence:connection:"),
  );
  const currentUserConnection = connectionEvidenceId?.match(
    /^evidence:connection:(contact_\d+):current-user$/,
  );
  const numberedConnection = connectionEvidenceId?.match(
    /^evidence:connection:(\d+)$/,
  );

  if (currentUserConnection) {
    return `dormant:connection_for_${currentUserConnection[1]}`;
  }

  if (numberedConnection) {
    return `dormant:connection_${numberedConnection[1]}`;
  }

  return `dormant:${contact.contactId}`;
}

function suggestedReasonsFor(input: {
  dormantContacts: readonly DormantHighValueContact[];
  opportunities: readonly HighPriorityOpportunity[];
}): readonly SuggestedContactReason[] {
  const topOpportunity = input.opportunities[0];
  const secondOpportunity = input.opportunities[1] ?? topOpportunity;
  const topDormant = input.dormantContacts[0];
  const referralDormant =
    input.dormantContacts.find((contact) => contact.valueType === "referral_path") ??
    input.dormantContacts[1] ??
    topDormant;
  const reasons: SuggestedContactReason[] = [];

  if (topOpportunity) {
    reasons.push({
      reasonId: `reason:${topOpportunity.opportunityId}:goal-match`,
      contactId: topOpportunity.contactId,
      contactName: topOpportunity.contactName,
      reasonType: "goal_match",
      reason:
        "This contact has the highest live follow-up score for the current dashboard goal.",
      confidence: "high",
      sourceRefs: topOpportunity.sourceRefs,
      evidenceIds: topOpportunity.evidenceIds,
    });
  }

  if (topDormant) {
    reasons.push({
      reasonId: `reason:${topDormant.contactId}:dormancy`,
      contactId: topDormant.contactId,
      contactName: topDormant.contactName,
      reasonType: "dormancy",
      reason:
        "This high-value relationship is in nurture state and needs a context refresh.",
      confidence: "high",
      sourceRefs: topDormant.sourceRefs,
      evidenceIds: topDormant.evidenceIds,
    });
  }

  if (secondOpportunity) {
    reasons.push({
      reasonId: `reason:${secondOpportunity.opportunityId}:event-context`,
      contactId: secondOpportunity.contactId,
      contactName: secondOpportunity.contactName,
      reasonType: "event_context",
      reason:
        "The live task and source evidence provide enough event-adjacent context to review a follow-up.",
      confidence: "medium",
      sourceRefs: secondOpportunity.sourceRefs,
      evidenceIds: secondOpportunity.evidenceIds,
    });
  }

  if (referralDormant) {
    reasons.push({
      reasonId: `reason:${referralDormant.contactId}:referral-path`,
      contactId: referralDormant.contactId,
      contactName: referralDormant.contactName,
      reasonType: "referral_path",
      reason:
        "This dormant relationship can support a targeted referral path after operator review.",
      confidence: "medium",
      sourceRefs: referralDormant.sourceRefs,
      evidenceIds: referralDormant.evidenceIds,
    });
  }

  return reasons.slice(0, 4);
}

function payloadFromGraph(input: {
  graph: LiveDashboardGraph;
  now: string;
  provider: LiveOpportunityReminderAnalyticsProvider;
}): OpportunityReminderAnalyticsPayload {
  const opportunities = taskCandidates(input.graph)
    .slice(0, 3)
    .map((candidate) => opportunityFor(candidate, input.now));
  const dormantContacts = dormantConnections(input.graph)
    .slice(0, 3)
    .map((candidate, index) =>
      dormantContactFor({
        ...candidate,
        index,
      }),
    );
  const currentGoalMatches = currentGoalMatchesFor({
    dormantContacts,
    opportunities,
  });
  const suggestedContactReasons = suggestedReasonsFor({
    dormantContacts,
    opportunities,
  });
  const evidenceIds = uniqueStrings([
    ...opportunities.flatMap((opportunity) => opportunity.evidenceIds),
    ...dormantContacts.flatMap((contact) => contact.evidenceIds),
  ]);

  return {
    state: opportunities.length > 0 || dormantContacts.length > 0 ? "success" : "empty",
    highPriorityOpportunities: opportunities,
    dormantHighValueContacts: dormantContacts,
    currentGoalMatches,
    suggestedContactReasons,
    summary:
      "Live opportunity reminder analytics ranked open tasks and dormant high-value relationships from shared live storage.",
    provenance: provenance({
      collectedAt: input.graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds,
      generationMethod: "live-store-query",
      provider: input.provider,
    }),
    nextAction:
      "Review the top live opportunity before creating tasks, messages, or notifications.",
  };
}

function emptyPayload(input: {
  evidenceId: string;
  now: string;
  provider: LiveOpportunityReminderAnalyticsProvider;
  state: "empty" | "pending";
  summary: string;
  nextAction: string;
}): OpportunityReminderAnalyticsPayload {
  return {
    state: input.state,
    highPriorityOpportunities: [],
    dormantHighValueContacts: [],
    currentGoalMatches: [],
    suggestedContactReasons: [],
    summary: input.summary,
    provenance: provenance({
      collectedAt: input.now,
      databaseReadExecuted: true,
      evidenceIds: [input.evidenceId],
      generationMethod: "rule-based-state",
      provider: input.provider,
    }),
    nextAction: input.nextAction,
  };
}

function recomputePayload(input: {
  graph: LiveDashboardGraph;
  now: string;
  provider: LiveOpportunityReminderAnalyticsProvider;
}): OpportunityReminderRecomputePayload {
  const opportunities = taskCandidates(input.graph)
    .slice(0, 3)
    .map((candidate) => opportunityFor(candidate, input.now));
  const evidenceIds = uniqueStrings(
    opportunities.flatMap((opportunity) => opportunity.evidenceIds),
  );

  return {
    state: opportunities.length > 0 ? "success" : "empty",
    recomputedAt: input.now,
    evaluatedContacts: input.graph.contacts.length,
    generatedOpportunityCount: opportunities.length,
    changedOpportunityIds: opportunities.map(
      (opportunity) => opportunity.opportunityId,
    ),
    summary:
      "Rule-based live recompute re-ranked open follow-up tasks without writing dashboard reminders.",
    provenance: provenance({
      collectedAt: input.graph.generatedAt,
      databaseReadExecuted: true,
      evidenceIds,
      generationMethod: "rule-based-recompute",
      provider: input.provider,
    }),
    nextAction:
      "Expose changed opportunity IDs to the dashboard without sending notifications.",
  };
}

function emptyRecomputePayload(input: {
  evidenceId: string;
  now: string;
  provider: LiveOpportunityReminderAnalyticsProvider;
  state: "empty" | "pending";
  summary: string;
  nextAction: string;
}): OpportunityReminderRecomputePayload {
  return {
    state: input.state,
    recomputedAt: input.now,
    evaluatedContacts: 0,
    generatedOpportunityCount: 0,
    changedOpportunityIds: [],
    summary: input.summary,
    provenance: provenance({
      collectedAt: input.now,
      databaseReadExecuted: true,
      evidenceIds: [input.evidenceId],
      generationMethod: "rule-based-state",
      provider: input.provider,
    }),
    nextAction: input.nextAction,
  };
}

export function createLiveOpportunityReminderAnalyticsService({
  now = () => new Date().toISOString(),
  provider,
}: LiveOpportunityReminderAnalyticsServiceOptions): OpportunityReminderAnalyticsService {
  return {
    async getOpportunityReminderAnalytics(input = {}) {
      const capturedNow = now();

      if (!provider) {
        return failure("OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }

      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return remindersSuccess(
            emptyPayload({
              evidenceId: emptyEvidenceId,
              now: capturedNow,
              provider,
              state: "empty",
              summary:
                "No live opportunity reminder candidates are available for this workspace.",
              nextAction:
                "Seed or import source-backed tasks and relationships before showing opportunity reminders.",
            }),
          );
        case "pending":
          return remindersSuccess(
            emptyPayload({
              evidenceId: pendingEvidenceId,
              now: capturedNow,
              provider,
              state: "pending",
              summary:
                "Live opportunity reminders are waiting for source review.",
              nextAction:
                "Keep opportunity reminders pending until live source review is complete.",
            }),
          );
        case "failure":
          return failure("OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED", {
            now: capturedNow,
            provider,
          });
        case "success":
        default:
          return remindersSuccess(
            payloadFromGraph({
              graph: await provider.readOpportunityGraph(),
              now: capturedNow,
              provider,
            }),
          );
      }
    },

    async recomputeOpportunityReminderAnalytics(input = {}) {
      const capturedNow = now();

      if (!provider) {
        return failure("OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED", {
          now: capturedNow,
          provider,
        });
      }

      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return recomputeSuccess(
            emptyRecomputePayload({
              evidenceId: emptyEvidenceId,
              now: capturedNow,
              provider,
              state: "empty",
              summary:
                "No live opportunity reminder candidates are available for recompute.",
              nextAction:
                "Seed or import source-backed tasks and relationships before recomputing reminders.",
            }),
          );
        case "pending":
          return recomputeSuccess(
            emptyRecomputePayload({
              evidenceId: pendingEvidenceId,
              now: capturedNow,
              provider,
              state: "pending",
              summary:
                "Live opportunity reminder recompute is waiting for source review.",
              nextAction:
                "Keep recompute pending until live source review is complete.",
            }),
          );
        case "failure":
          return failure("OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED", {
            now: capturedNow,
            provider,
          });
        case "success":
        default:
          return recomputeSuccess(
            recomputePayload({
              graph: await provider.readOpportunityGraph(),
              now: capturedNow,
              provider,
            }),
          );
      }
    },
  };
}
