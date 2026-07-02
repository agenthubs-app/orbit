import type {
  ContactDTO,
  ConversationDTO,
  MessageDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS,
  EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS,
  type EmailCalendarRelationshipSignal,
  type EmailCalendarSignalConfirmationPayload,
  type EmailCalendarSignalConfirmationResult,
  type EmailCalendarSignalConfirmationScenario,
  type EmailCalendarSignalConfirmationSuccess,
  type EmailCalendarSignalConfirmInput,
  type EmailCalendarSignalErrorCode,
  type EmailCalendarSignalEvidence,
  type EmailCalendarSignalFailure,
  type EmailCalendarSignalKind,
  type EmailCalendarSignalListInput,
  type EmailCalendarSignalPayload,
  type EmailCalendarSignalPermission,
  type EmailCalendarSignalProvenance,
  type EmailCalendarSignalResult,
  type EmailCalendarSignalScenario,
  type EmailCalendarSignalService,
  type EmailCalendarSignalSourceKind,
  type EmailCalendarSignalSourceReference,
  type EmailCalendarSignalSuccess,
} from "./email-calendar-contract";
import type {
  LiveEmailCalendarSignalGraph,
  LiveEmailCalendarSignalProvider,
} from "./storage/email-calendar-live-record-provider";

export interface LiveEmailCalendarSignalServiceOptions {
  now?: () => string;
  provider?: LiveEmailCalendarSignalProvider | null;
}

interface LiveEmailCalendarSignalRecord {
  signal: EmailCalendarRelationshipSignal;
}

interface ReadEmailCalendarGraphSuccess {
  graph: LiveEmailCalendarSignalGraph;
  provider: LiveEmailCalendarSignalProvider;
}

type ReadEmailCalendarGraphResult =
  | ReadEmailCalendarGraphSuccess
  | EmailCalendarSignalFailure;

const supportedScenarios = new Set<EmailCalendarSignalScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<EmailCalendarSignalConfirmationScenario>([
    "success",
    "pending",
    "blocked",
    "failure",
  ]);

const supportedSourceKinds = new Set<EmailCalendarSignalSourceKind>(
  EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: EmailCalendarSignalPayload): EmailCalendarSignalSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: EmailCalendarSignalConfirmationPayload,
): EmailCalendarSignalConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeScenario(
  scenario?: EmailCalendarSignalListInput["scenario"],
): EmailCalendarSignalScenario {
  if (scenario && supportedScenarios.has(scenario as EmailCalendarSignalScenario)) {
    return scenario as EmailCalendarSignalScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: EmailCalendarSignalConfirmInput["scenario"],
): EmailCalendarSignalConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as EmailCalendarSignalConfirmationScenario,
    )
  ) {
    return scenario as EmailCalendarSignalConfirmationScenario;
  }

  return "success";
}

function normalizeSourceKind(
  sourceKind?: EmailCalendarSignalListInput["sourceKind"],
): EmailCalendarSignalSourceKind | null {
  const normalized = sourceKind?.trim();

  if (!normalized) {
    return null;
  }

  return supportedSourceKinds.has(normalized as EmailCalendarSignalSourceKind)
    ? normalized as EmailCalendarSignalSourceKind
    : null;
}

function unconfiguredProvenance(now: string): EmailCalendarSignalProvenance {
  return {
    source: "live-record-store:email-calendar-signals:unconfigured",
    sourceLabel: "Unconfigured email calendar signal live store",
    evidenceIds: ["evidence:email-calendar-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-email-calendar-signals",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
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
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod?: EmailCalendarSignalProvenance["generationMethod"];
  provider: LiveEmailCalendarSignalProvider;
  readExecuted?: boolean;
}): EmailCalendarSignalProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:email-calendar-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-email-calendar-signals",
    generationMethod: input.generationMethod ?? "live-store-query",
    liveDatabaseReadExecuted: input.readExecuted ?? true,
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
}

function failure(
  code: EmailCalendarSignalErrorCode,
  provenance: EmailCalendarSignalProvenance,
): EmailCalendarSignalFailure {
  const definition = EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function isFailureResult(
  result: ReadEmailCalendarGraphResult,
): result is EmailCalendarSignalFailure {
  return "success" in result && result.success === false;
}

function sourceKindFailure(
  sourceKind: EmailCalendarSignalListInput["sourceKind"],
  provenance: EmailCalendarSignalProvenance,
): EmailCalendarSignalFailure | null {
  const normalized = sourceKind?.trim();

  if (!normalized || supportedSourceKinds.has(normalized as EmailCalendarSignalSourceKind)) {
    return null;
  }

  return failure("EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED", provenance);
}

function sourceKindFor(
  conversation: ConversationDTO,
): EmailCalendarSignalSourceKind {
  switch (conversation.channel) {
    case "calendar":
      return "google_calendar";
    case "chat":
    case "note":
      return "microsoft_graph";
    case "email":
    default:
      return "gmail";
  }
}

function signalKindFor(
  sourceKind: EmailCalendarSignalSourceKind,
): EmailCalendarSignalKind {
  switch (sourceKind) {
    case "google_calendar":
      return "calendar_meeting";
    case "microsoft_graph":
      return "email_calendar_overlap";
    case "gmail":
    default:
      return "email_intro";
  }
}

function sourceFor(input: {
  message: MessageDTO;
  sourceKind: EmailCalendarSignalSourceKind;
}): EmailCalendarSignalSourceReference {
  const type =
    input.sourceKind === "google_calendar" ? "calendar_signal" : "email_signal";

  return {
    type,
    id: input.message.source.id,
    label: input.message.source.label ?? "Live email/calendar signal",
    sourceKind: input.sourceKind,
    providerRecordId: input.message.id,
  };
}

function evidenceForMessage(
  evidence: readonly RelationshipEvidenceDTO[],
  message: MessageDTO,
): RelationshipEvidenceDTO | null {
  const evidenceIdSet = new Set(message.evidenceIds);

  return (
    evidence.find((item) => evidenceIdSet.has(item.id)) ??
    evidence.find((item) => item.sourceId === message.source.id) ??
    null
  );
}

function contactForConversation(
  contacts: readonly ContactDTO[],
  conversation: ConversationDTO,
): ContactDTO | null {
  return (
    conversation.participantContactIds
      .map((contactId) => contacts.find((contact) => contact.id === contactId))
      .find((contact): contact is ContactDTO => contact !== undefined) ?? null
  );
}

function confidenceFor(evidence: RelationshipEvidenceDTO | null) {
  const confidence = evidence?.confidence ?? 0.72;

  if (confidence >= 0.85) {
    return "high";
  }

  if (confidence >= 0.65) {
    return "medium";
  }

  return "low";
}

function permissionFor(
  sourceKind: EmailCalendarSignalSourceKind,
): EmailCalendarSignalPermission {
  return {
    required: true,
    state: "live-granted" as const,
    provider: sourceKind,
    scopes:
      sourceKind === "google_calendar"
        ? ["calendar.metadata.readonly"]
        : sourceKind === "microsoft_graph"
          ? ["graph.relationship-signals.readonly"]
          : ["gmail.metadata.readonly"],
    permissionGrantId: `permission:email-calendar:live:${sourceKind}`,
    permissionFlowExecuted: false,
    mailboxSyncExecuted: false,
    deviceCalendarReadExecuted: false,
  };
}

function signalEvidence(input: {
  evidence: RelationshipEvidenceDTO | null;
  message: MessageDTO;
  source: EmailCalendarSignalSourceReference;
}): EmailCalendarSignalEvidence {
  return {
    evidenceId: input.evidence?.id ?? input.message.evidenceIds[0],
    source: input.source,
    sourceLabel: input.source.label,
    excerpt:
      input.evidence?.summary ??
      "Live email/calendar metadata indicates a relationship follow-up signal.",
    capturedFields: [
      "conversationId",
      "direction",
      "occurredAt",
      "source",
      "evidenceIds",
    ],
    createdAt: input.evidence?.occurredAt ?? input.message.occurredAt,
    createdBy: "live-email-calendar-signal-service",
    messageBodyIngested: false,
  };
}

function buildSignal(input: {
  contact: ContactDTO | null;
  conversation: ConversationDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  message: MessageDTO;
  provenance: EmailCalendarSignalProvenance;
}): EmailCalendarRelationshipSignal {
  const sourceKind = sourceKindFor(input.conversation);
  const source = sourceFor({
    message: input.message,
    sourceKind,
  });
  const evidence = evidenceForMessage(input.evidence, input.message);
  const signalEvidenceRecord = signalEvidence({
    evidence,
    message: input.message,
    source,
  });
  const contact = input.contact;
  const displayName = contact?.displayName ?? "Unknown live contact";
  const relationshipContext =
    evidence?.summary ??
    `Live ${input.conversation.channel} metadata indicates a relationship signal for ${displayName}.`;

  return {
    id: `email-calendar-signal:live:${input.message.id}`,
    source,
    sourceKind,
    signalKind: signalKindFor(sourceKind),
    displayName,
    role: contact?.role ?? "Relationship contact",
    organization: contact?.organization ?? "",
    relationshipContext,
    suggestedNextAction:
      "Review this live email/calendar signal before updating a relationship or follow-up.",
    occurredAt: input.message.occurredAt,
    confidence: confidenceFor(evidence),
    permission: permissionFor(sourceKind),
    confirmation: {
      required: true,
      state: "pending",
      question: `Confirm this ${sourceKind} relationship signal for ${displayName}?`,
    },
    evidenceIds: input.message.evidenceIds,
    evidence: [signalEvidenceRecord],
    provenance: input.provenance,
    readyForReview: true,
    relationshipWriteExecuted: false,
    gmailApiRequested: false,
    googleCalendarApiRequested: false,
    microsoftGraphApiRequested: false,
    backgroundSyncEnqueued: false,
    messageBodyIngested: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  };
}

function buildRecords(input: {
  graph: LiveEmailCalendarSignalGraph;
  provider: LiveEmailCalendarSignalProvider;
}): readonly LiveEmailCalendarSignalRecord[] {
  const conversationsById = new Map(
    input.graph.conversations.map((conversation) => [
      conversation.id,
      conversation,
    ]),
  );
  const signals = input.graph.messages
    .map((message) => {
      const conversation = conversationsById.get(message.conversationId);

      if (!conversation) {
        return null;
      }

      const evidence = evidenceForMessage(input.graph.evidence, message);
      const provenance = provenanceFor({
        evidenceIds: message.evidenceIds,
        generatedAt: input.graph.generatedAt,
        provider: input.provider,
      });

      return {
        signal: buildSignal({
          contact: contactForConversation(input.graph.contacts, conversation),
          conversation,
          evidence: evidence ? [evidence] : input.graph.evidence,
          message,
          provenance,
        }),
      };
    })
    .filter(
      (record): record is LiveEmailCalendarSignalRecord => record !== null,
    );

  return signals;
}

function filterRecords(
  records: readonly LiveEmailCalendarSignalRecord[],
  sourceKind: EmailCalendarSignalSourceKind | null,
): readonly LiveEmailCalendarSignalRecord[] {
  if (!sourceKind) {
    return records;
  }

  return records.filter((record) => record.signal.sourceKind === sourceKind);
}

async function readGraph(
  provider: LiveEmailCalendarSignalProvider | null | undefined,
  now: string,
): Promise<ReadEmailCalendarGraphResult> {
  if (!provider) {
    return failure(
      "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(now),
    );
  }

  try {
    return {
      graph: await provider.readEmailCalendarSignalGraph(),
      provider,
    };
  } catch {
    return failure(
      "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:email-calendar-live-store-failed"],
        generatedAt: now,
        provider,
        readExecuted: true,
      }),
    );
  }
}

function scenarioResult(input: {
  now: string;
  provider: LiveEmailCalendarSignalProvider | null | undefined;
  scenario: EmailCalendarSignalScenario;
}): EmailCalendarSignalResult | null {
  if (input.scenario === "success") {
    return null;
  }

  const provenance = input.provider
    ? provenanceFor({
        evidenceIds: [`evidence:email-calendar-live-${input.scenario}`],
        generatedAt: input.now,
        provider: input.provider,
        readExecuted: false,
      })
    : unconfiguredProvenance(input.now);

  switch (input.scenario) {
    case "empty":
      return success({
        state: "empty",
        signals: [],
        summary: "No live email/calendar relationship signals matched the requested source.",
        provenance,
        nextAction: "Seed live conversations and messages before reviewing signals.",
      });
    case "pending":
      return success({
        state: "pending",
        signals: [],
        summary: "Live email/calendar signals are waiting for review.",
        provenance,
        nextAction: "Wait for live signal review to complete.",
      });
    case "failure":
      return failure("EMAIL_CALENDAR_SIGNAL_LIVE_STORE_FAILED", provenance);
    default:
      return null;
  }
}

function buildPayload(input: {
  graph: LiveEmailCalendarSignalGraph;
  provider: LiveEmailCalendarSignalProvider;
  sourceKind: EmailCalendarSignalSourceKind | null;
}): EmailCalendarSignalPayload {
  const records = buildRecords({
    graph: input.graph,
    provider: input.provider,
  });
  const filteredRecords = filterRecords(records, input.sourceKind);
  const evidenceIds = filteredRecords.flatMap(
    (record) => record.signal.evidenceIds,
  );
  const provenance = provenanceFor({
    evidenceIds,
    generatedAt: input.graph.generatedAt,
    provider: input.provider,
  });

  return {
    state: filteredRecords.length > 0 ? "success" : "empty",
    signals: filteredRecords.map((record) => ({
      ...record.signal,
      provenance,
    })),
    summary:
      filteredRecords.length > 0
        ? `Found ${filteredRecords.length} source-backed email/calendar relationship signals in live storage.`
        : "No source-backed email/calendar relationship signals matched the requested source.",
    provenance,
    nextAction:
      filteredRecords.length > 0
        ? "Review live relationship signals before confirming any relationship action."
        : "Adjust the source filter or seed live conversation records.",
  };
}

export function createLiveEmailCalendarSignalService({
  now = () => new Date().toISOString(),
  provider,
}: LiveEmailCalendarSignalServiceOptions): EmailCalendarSignalService {
  return {
    async listEmailCalendarSignals(input = {}): Promise<EmailCalendarSignalResult> {
      const generatedAt = now();
      const sourceKind = normalizeSourceKind(input.sourceKind);
      const preliminaryProvenance = provider
        ? provenanceFor({
            evidenceIds: ["evidence:email-calendar-live-validation"],
            generatedAt,
            provider,
            readExecuted: false,
          })
        : unconfiguredProvenance(generatedAt);
      const unsupportedSourceFailure = sourceKindFailure(
        input.sourceKind,
        preliminaryProvenance,
      );

      if (unsupportedSourceFailure) {
        return unsupportedSourceFailure;
      }

      const scenario = scenarioResult({
        now: generatedAt,
        provider,
        scenario: normalizeScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      const graphResult = await readGraph(provider, generatedAt);

      if (isFailureResult(graphResult)) {
        return graphResult;
      }

      return success(
        buildPayload({
          graph: graphResult.graph,
          provider: graphResult.provider,
          sourceKind,
        }),
      );
    },

    async confirmEmailCalendarSignal(
      input: EmailCalendarSignalConfirmInput,
    ): Promise<EmailCalendarSignalConfirmationResult> {
      const generatedAt = now();

      switch (normalizeConfirmationScenario(input.scenario)) {
        case "pending":
          return failure(
            "EMAIL_CALENDAR_SIGNAL_PENDING",
            provider
              ? provenanceFor({
                  evidenceIds: ["evidence:email-calendar-live-pending"],
                  generatedAt,
                  provider,
                  readExecuted: false,
                })
              : unconfiguredProvenance(generatedAt),
          );
        case "blocked":
          return failure(
            "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED",
            provider
              ? provenanceFor({
                  evidenceIds: ["evidence:email-calendar-live-blocked"],
                  generatedAt,
                  provider,
                  readExecuted: false,
                })
              : unconfiguredProvenance(generatedAt),
          );
        case "failure":
          return failure(
            "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_FAILED",
            provider
              ? provenanceFor({
                  evidenceIds: ["evidence:email-calendar-live-failure"],
                  generatedAt,
                  provider,
                  readExecuted: false,
                })
              : unconfiguredProvenance(generatedAt),
          );
        case "success":
        default:
          break;
      }

      const graphResult = await readGraph(provider, generatedAt);

      if (isFailureResult(graphResult)) {
        return graphResult;
      }

      const payload = buildPayload({
        graph: graphResult.graph,
        provider: graphResult.provider,
        sourceKind: null,
      });
      const signal = payload.signals.find(
        (item) => item.id === input.signalId,
      );

      if (!signal) {
        return failure(
          "EMAIL_CALENDAR_SIGNAL_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:email-calendar-live-not-found"],
            generatedAt: graphResult.graph.generatedAt,
            provider: graphResult.provider,
          }),
        );
      }

      const confirmedAt = generatedAt;
      const actorLabel = input.actorLabel?.trim() || "Live reviewer";
      const createdEvidence: EmailCalendarSignalEvidence = {
        evidenceId: `evidence:email-calendar:confirmation:${signal.id}`,
        source: signal.source,
        sourceLabel: signal.source.label,
        excerpt: `Confirmed live email/calendar signal ${signal.id}.`,
        capturedFields: ["signalId", "actorLabel", "confirmedAt"],
        createdAt: confirmedAt,
        createdBy: "live-email-calendar-signal-service",
        messageBodyIngested: false,
      };
      const provenance = provenanceFor({
        evidenceIds: [...signal.evidenceIds, createdEvidence.evidenceId],
        generatedAt: confirmedAt,
        generationMethod: "live-store-confirmation",
        provider: graphResult.provider,
      });
      const confirmedSignal: EmailCalendarRelationshipSignal = {
        ...signal,
        confirmation: {
          ...signal.confirmation,
          actorLabel,
          confirmedAt,
          state: "confirmed",
        },
        evidence: [...signal.evidence, createdEvidence],
        evidenceIds: [...signal.evidenceIds, createdEvidence.evidenceId],
        provenance,
      };

      return confirmationSuccess({
        state: "confirmed",
        confirmedSignal,
        createdEvidence,
        confirmedAt,
        confirmedBy: actorLabel,
        provenance,
        nextAction:
          "Review the confirmed signal before any relationship write or notification.",
        relationshipWriteExecuted: false,
        externalActionExecuted: false,
        databaseWriteExecuted: false,
        notificationDelivered: false,
      });
    },
  };
}
