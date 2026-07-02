import {
  MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS,
  MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS,
  type MessageDraft,
  type MessageDraftChannel,
  type MessageDraftGeneratorCreateInput,
  type MessageDraftGeneratorErrorCode,
  type MessageDraftGeneratorFailure,
  type MessageDraftGeneratorPayload,
  type MessageDraftGeneratorProvenance,
  type MessageDraftGeneratorResult,
  type MessageDraftGeneratorScenario,
  type MessageDraftGeneratorService,
  type MessageDraftGeneratorSourceReference,
  type MessageDraftGeneratorUpdateInput,
  type MessageDraftKind,
  type MessageDraftStatus,
} from "./message-draft-contract";

const LIVE_MESSAGE_DRAFT_COLLECTED_AT = "2026-07-01T00:00:00.000Z";

const supportedScenarios = new Set<MessageDraftGeneratorScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedChannels = new Set<MessageDraftChannel>([
  "calendar_note",
  "email",
  "internal_note",
  "linkedin",
]);

const supportedStatuses = new Set<MessageDraftStatus>([
  "draft",
  "held_for_review",
  "ready_for_confirmation",
  "revised",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeScenario(
  scenario?:
    | MessageDraftGeneratorCreateInput["scenario"]
    | MessageDraftGeneratorUpdateInput["scenario"],
): MessageDraftGeneratorScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as MessageDraftGeneratorScenario)
  ) {
    return scenario as MessageDraftGeneratorScenario;
  }

  return "success";
}

function isDraftKind(value: unknown): value is MessageDraftKind {
  return (
    typeof value === "string" &&
    MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS.includes(value as MessageDraftKind)
  );
}

function draftKindFor(value: unknown): MessageDraftKind {
  return isDraftKind(value) ? value : "follow_up";
}

function channelFor(
  value: unknown,
  draftKind: MessageDraftKind,
): MessageDraftChannel {
  if (typeof value === "string" && supportedChannels.has(value as MessageDraftChannel)) {
    return value as MessageDraftChannel;
  }

  if (draftKind === "appointment") {
    return "calendar_note";
  }

  if (draftKind === "invitation") {
    return "linkedin";
  }

  return "email";
}

function statusForInput(value: unknown): MessageDraftStatus {
  return typeof value === "string" &&
    supportedStatuses.has(value as MessageDraftStatus)
    ? (value as MessageDraftStatus)
    : "revised";
}

function stableToken(parts: readonly (string | null | undefined)[]): string {
  const text = parts.filter((part): part is string => Boolean(part)).join("|");
  let hash = 0;

  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36).padStart(6, "0");
}

function evidenceIdsFor(token: string): readonly string[] {
  return [`evidence:message-draft-live:${token}`];
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  sourceLabel: string;
}): MessageDraftGeneratorProvenance {
  return {
    source: "live-rule:features/followups/live-message-draft-service.ts",
    sourceLabel: input.sourceLabel,
    evidenceIds: input.evidenceIds,
    collectedAt: LIVE_MESSAGE_DRAFT_COLLECTED_AT,
    privacy: "live-message-draft-generator-preview",
    generationMethod: "live-rule-based-draft-generation",
    aiProviderRequested: false,
    externalSendRequested: false,
    externalNetworkRequested: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  };
}

function success(
  data: MessageDraftGeneratorPayload,
): MessageDraftGeneratorResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: MessageDraftGeneratorErrorCode,
): MessageDraftGeneratorFailure {
  const definition = MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor({
    evidenceIds: ["evidence:message-draft-live-failure"],
    sourceLabel: "Live message draft generator failure",
  });

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

function emptyPayload(state: "empty" | "pending"): MessageDraftGeneratorPayload {
  const evidenceIds =
    state === "empty"
      ? ["evidence:message-draft-live-empty"]
      : ["evidence:message-draft-live-pending"];

  return {
    state,
    drafts: [],
    summary:
      state === "empty"
        ? "No source-backed relationship context is available for live message drafting."
        : "Live message draft generation is waiting for source context review.",
    provenance: provenanceFor({
      evidenceIds,
      sourceLabel:
        state === "empty"
          ? "Live empty message draft rule"
          : "Live pending message draft rule",
    }),
    nextAction:
      state === "empty"
        ? "Add relationship context, contact evidence, or a source note before generating a message draft."
        : "Resolve the source context review before exposing generated message drafts.",
  };
}

function scenarioResult(
  scenario: MessageDraftGeneratorScenario,
): MessageDraftGeneratorResult | null {
  switch (scenario) {
    case "empty":
      return success(emptyPayload("empty"));
    case "pending":
      return success(emptyPayload("pending"));
    case "failure":
      return failure("MESSAGE_DRAFT_GENERATOR_LIVE_RULE_FAILED");
    case "success":
    default:
      return null;
  }
}

function sourceFor(input: {
  label: string;
  token: string;
}): MessageDraftGeneratorSourceReference {
  return {
    id: `source:message-draft-live:${input.token}`,
    type: "manual",
    label: input.label,
    providerRecordId: `live-message-draft:${input.token}`,
    generatedBy: "live-rule-based-draft-generation",
  };
}

function titleCaseKind(kind: MessageDraftKind): string {
  return kind
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function subjectFor(input: {
  draftKind: MessageDraftKind;
  organization: string;
}): string {
  const organization = input.organization || "our conversation";

  switch (input.draftKind) {
    case "greeting":
      return `Good meeting you through ${organization}`;
    case "appointment":
      return `Finding time to review ${organization}`;
    case "introduction_request":
      return `Introduction request related to ${organization}`;
    case "invitation":
      return `Invitation for ${organization}`;
    case "thank_you":
      return `Thank you for the ${organization} context`;
    case "follow_up":
    default:
      return `Following up on ${organization}`;
  }
}

function bodyFor(input: {
  contextNote: string;
  draftKind: MessageDraftKind;
  organization: string;
  recipientName: string;
}): string {
  const greeting = input.recipientName
    ? `Hi ${input.recipientName},`
    : "Hi,";
  const organizationClause = input.organization
    ? ` for ${input.organization}`
    : "";

  return [
    greeting,
    `I am following up${organizationClause} based on the sourced relationship context now available in Orbit.`,
    input.contextNote,
    "Before anything is sent, please review the source evidence and confirmation requirements.",
  ].join("\n\n");
}

function hasSourceContext(input: MessageDraftGeneratorCreateInput): boolean {
  return Boolean(
    readText(input.recipientName) ||
      readText(input.organization) ||
      readText(input.contextNote),
  );
}

function buildDraft(input: MessageDraftGeneratorCreateInput): MessageDraft {
  const recipientName = readText(input.recipientName) ?? "Selected relationship";
  const organization = readText(input.organization) ?? "Source-backed context";
  const contextNote =
    readText(input.contextNote) ??
    "A sourced relationship context is available for review.";
  const draftKind = draftKindFor(input.draftKind);
  const channel = channelFor(input.channel, draftKind);
  const token = stableToken([
    draftKind,
    channel,
    recipientName,
    organization,
    contextNote,
  ]);
  const evidenceIds = evidenceIdsFor(token);
  const source = sourceFor({
    label: "Live relationship context supplied to message draft rule",
    token,
  });

  return {
    draftId: `live-draft-${draftKind}-${token}`,
    kind: draftKind,
    channel,
    status: "draft",
    recipientName,
    organization,
    subject: subjectFor({ draftKind, organization }),
    body: bodyFor({ contextNote, draftKind, organization, recipientName }),
    relationshipContext: contextNote,
    recommendedSendWindow: "after source review",
    rationale: `${titleCaseKind(draftKind)} draft prepared from source-backed relationship context.`,
    source,
    evidenceIds,
    generatedBy: "live-rule-based-draft-generation",
    audit: {
      sourceLabel: source.label,
      providerBoundary: "AI false, external send false, persistence false",
      verificationAction: "Review source evidence",
    },
    sendActionRequiresConfirmation: true,
    aiProviderRequested: false,
    externalSendRequested: false,
    externalNetworkRequested: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  };
}

function buildCreatePayload(
  input: MessageDraftGeneratorCreateInput,
): MessageDraftGeneratorPayload {
  if (!hasSourceContext(input)) {
    return emptyPayload("empty");
  }

  const draft = buildDraft(input);

  return {
    state: "success",
    drafts: [draft],
    summary:
      "Live rules prepared one review-only message draft from source-backed relationship context.",
    provenance: provenanceFor({
      evidenceIds: draft.evidenceIds,
      sourceLabel: "Live message draft generation rule",
    }),
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
  };
}

function kindFromLiveDraftId(draftId: string): MessageDraftKind | null {
  return (
    MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS.find((kind) =>
      draftId.startsWith(`live-draft-${kind}-`),
    ) ?? null
  );
}

function buildUpdatePayload(
  draftId: string,
  input: MessageDraftGeneratorUpdateInput,
): MessageDraftGeneratorPayload {
  const draftKind = kindFromLiveDraftId(draftId);

  if (!draftKind) {
    throw new Error("Unsupported live draft id");
  }

  const reviewerLabel = readText(input.reviewerLabel) ?? "Reviewer";
  const userEdits = readText(input.userEdits);
  const draft = {
    ...buildDraft({
      contextNote:
        "A previously generated live draft is being reviewed without external send or persistence.",
      draftKind,
      organization: "Source-backed context",
      recipientName: "Selected relationship",
    }),
    draftId,
    status: statusForInput(input.status),
  };
  const updatedDraft = {
    ...draft,
    body: userEdits
      ? `${draft.body}\n\n${reviewerLabel} edit: ${userEdits}`
      : draft.body,
  };

  return {
    state: "success",
    drafts: [updatedDraft],
    summary:
      "Live rules updated one review-only message draft without sending, persisting, or invoking AI providers.",
    provenance: provenanceFor({
      evidenceIds: updatedDraft.evidenceIds,
      sourceLabel: "Live message draft update rule",
    }),
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
  };
}

export function createLiveMessageDraftGeneratorService(): MessageDraftGeneratorService {
  return {
    createDraft(input = {}): MessageDraftGeneratorResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(buildCreatePayload(input));
    },

    updateDraft(input): MessageDraftGeneratorResult {
      const draftId = readText(input.draftId);

      if (!draftId) {
        return failure("MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED");
      }

      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      if (!kindFromLiveDraftId(draftId)) {
        return failure("MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND");
      }

      try {
        return success(buildUpdatePayload(draftId, input));
      } catch {
        return failure("MESSAGE_DRAFT_GENERATOR_LIVE_RULE_FAILED");
      }
    },
  };
}
