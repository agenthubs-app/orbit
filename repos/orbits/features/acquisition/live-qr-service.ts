import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  QR_SCAN_CONNECT_ERROR_DEFINITIONS,
  QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX,
  type QrConnectionCandidate,
  type QrConnectionConfirmationPayload,
  type QrConnectionConfirmationResult,
  type QrConnectionConfirmationSuccess,
  type QrConnectionDraft,
  type QrConnectionDraftConfirmInput,
  type QrConnectionEvidence,
  type QrContactCandidate,
  type QrMutualConnectionContext,
  type QrScanConnectErrorCode,
  type QrScanConnectFailure,
  type QrScanConnectInput,
  type QrScanConnectConfirmationScenario,
  type QrScanConnectPayload,
  type QrScanConnectProvenance,
  type QrScanConnectResult,
  type QrScanConnectScenario,
  type QrScanConnectService,
  type QrScanConnectSuccess,
  type QrScanResult,
  type QrScanSourceReference,
} from "./qr-contract";
import type {
  LiveQrScanConnectGraph,
  LiveQrScanConnectProvider,
} from "./storage/qr-live-record-provider";

export interface LiveQrScanConnectServiceOptions {
  now?: () => string;
  provider?: LiveQrScanConnectProvider | null;
}

interface ReadQrScanConnectGraphSuccess {
  graph: LiveQrScanConnectGraph;
  provider: LiveQrScanConnectProvider;
}

type ReadQrScanConnectGraphResult =
  | QrScanConnectFailure
  | ReadQrScanConnectGraphSuccess;

const supportedScanScenarios = new Set<QrScanConnectScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<QrScanConnectConfirmationScenario>([
    "success",
    "pending",
    "failure",
  ]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: QrScanConnectPayload): QrScanConnectSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: QrConnectionConfirmationPayload,
): QrConnectionConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function nonEmpty(value?: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeScanScenario(
  scenario?: QrScanConnectInput["scenario"],
): QrScanConnectScenario {
  if (
    scenario &&
    supportedScanScenarios.has(scenario as QrScanConnectScenario)
  ) {
    return scenario as QrScanConnectScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: QrConnectionDraftConfirmInput["scenario"],
): QrScanConnectConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as QrScanConnectConfirmationScenario,
    )
  ) {
    return scenario as QrScanConnectConfirmationScenario;
  }

  return "success";
}

function compactDigest(value: string): string {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 33 + character.charCodeAt(0)) % 1000000;
  }

  return `sha256:live-qr-${hash.toString().padStart(6, "0")}`;
}

function unconfiguredProvenance(now: string): QrScanConnectProvenance {
  return {
    source: "live-record-store:qr-scan-connect:unconfigured",
    sourceLabel: "Unconfigured QR scan connect live store",
    evidenceIds: ["evidence:qr-scan-connect-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-qr-scan-connect",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    connectionWriteExecuted: false,
    externalNetworkRequested: false,
    cameraRequested: false,
    qrDecoderProviderRequested: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod?: QrScanConnectProvenance["generationMethod"];
  provider: LiveQrScanConnectProvider;
  readExecuted?: boolean;
}): QrScanConnectProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:qr-scan-connect-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-qr-scan-connect",
    generationMethod: input.generationMethod ?? "live-store-query",
    liveDatabaseReadExecuted: input.readExecuted ?? true,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    connectionWriteExecuted: false,
    externalNetworkRequested: false,
    cameraRequested: false,
    qrDecoderProviderRequested: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: QrScanConnectErrorCode,
  provenance: QrScanConnectProvenance,
): QrScanConnectFailure {
  const definition = QR_SCAN_CONNECT_ERROR_DEFINITIONS[code];

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
  result: ReadQrScanConnectGraphResult,
): result is QrScanConnectFailure {
  return "success" in result && result.success === false;
}

function draftIdFor(contactId: string): string {
  return `${QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX}${contactId}`;
}

function contactIdFromDraftId(draftId: string): string {
  return draftId.startsWith(QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX)
    ? draftId.slice(QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX.length)
    : draftId;
}

function qrContacts(graph: LiveQrScanConnectGraph): readonly ContactDTO[] {
  return graph.contacts
    .filter((contact) => contact.source.type === "qr_scan")
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sourceFor(contact: ContactDTO): QrScanSourceReference {
  return {
    type: "qr_scan",
    id: contact.source.id,
    label: contact.source.label ?? `Live QR scan for ${contact.displayName}`,
  };
}

function evidenceForContact(
  contact: ContactDTO,
  graph: LiveQrScanConnectGraph,
): readonly RelationshipEvidenceDTO[] {
  const contactEvidenceIds = new Set(contact.evidenceIds);

  return graph.evidence.filter(
    (evidence) =>
      contactEvidenceIds.has(evidence.id) ||
      (evidence.sourceType === "qr_scan" &&
        (evidence.sourceId === contact.id ||
          evidence.sourceId === contact.source.id)),
  );
}

function connectionEvidenceFromSource(input: {
  contact: ContactDTO;
  evidence: RelationshipEvidenceDTO;
}): QrConnectionEvidence {
  return {
    evidenceId: input.evidence.id,
    source: sourceFor(input.contact),
    sourceLabel:
      input.contact.source.label ??
      `Live QR evidence for ${input.contact.displayName}`,
    excerpt: input.evidence.summary,
    capturedFields: [
      "displayName",
      "role",
      "organization",
      "source",
      "evidenceIds",
    ],
    createdAt: input.evidence.occurredAt,
    createdBy: "live-qr-scan-connect-service",
  };
}

function fallbackEvidence(contact: ContactDTO): QrConnectionEvidence {
  return {
    evidenceId: `evidence:qr-scan-connect-live:${contact.id}`,
    source: sourceFor(contact),
    sourceLabel: `Live QR source for ${contact.displayName}`,
    excerpt: `${contact.displayName} was sourced from a live QR scan contact record.`,
    capturedFields: ["displayName", "role", "organization", "source"],
    createdAt: contact.createdAt,
    createdBy: "live-qr-scan-connect-service",
  };
}

function sourceEvidence(input: {
  contact: ContactDTO;
  graph: LiveQrScanConnectGraph;
}): readonly QrConnectionEvidence[] {
  const evidence = evidenceForContact(input.contact, input.graph).map((item) =>
    connectionEvidenceFromSource({
      contact: input.contact,
      evidence: item,
    }),
  );

  return evidence.length > 0 ? evidence : [fallbackEvidence(input.contact)];
}

function sharedTopicsFor(contact: ContactDTO): readonly string[] {
  return unique([
    nonEmpty(contact.organization) ?? "",
    nonEmpty(contact.role) ?? "",
  ]);
}

function buildScan(contact: ContactDTO): QrScanResult {
  const source = sourceFor(contact);
  const scanLabel = source.label;
  const qrText = `orbit-live-qr:contactId=${contact.id};sourceId=${source.id}`;

  return {
    scanId: `qr-scan:live:${contact.id}`,
    scanMethod: "live-store-qr-record",
    scanLabel,
    payloadFormat: "orbit-demo-qr-v1",
    qrText,
    payloadDigest: compactDigest(`${scanLabel}:${qrText}`),
    deviceCameraAccessed: false,
    qrDecoderProviderCalled: false,
    cryptographicValidationExecuted: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  };
}

function buildMutualContext(input: {
  contact: ContactDTO;
  evidence: readonly QrConnectionEvidence[];
}): QrMutualConnectionContext {
  const source = sourceFor(input.contact);
  const firstEvidenceId =
    input.evidence[0]?.evidenceId ?? `evidence:qr-context:${input.contact.id}`;

  return {
    contextId: `qr-context:live:${input.contact.id}`,
    eventId: source.id,
    eventName: source.label,
    encounterReason:
      input.contact.profileSnippet ??
      `${input.contact.displayName} was discovered through a source-backed QR scan record.`,
    mutualConnections: [],
    sharedTopics: sharedTopicsFor(input.contact),
    introductionPath: `Live QR scan source for ${input.contact.displayName}`,
    confidence: "live-store",
    evidenceId: firstEvidenceId,
    externalGraphLookupExecuted: false,
  };
}

function actorLabelFor(actorLabel?: string | null): string {
  return nonEmpty(actorLabel) ?? "Live QR reviewer";
}

function buildConfirmEvidence(input: {
  actorLabel?: string | null;
  contact: ContactDTO;
  now: string;
}): QrConnectionEvidence {
  return {
    evidenceId: `evidence:qr-scan-connect-confirmed:${input.contact.id}`,
    source: sourceFor(input.contact),
    sourceLabel: "Live QR connection confirmation",
    excerpt: `${actorLabelFor(
      input.actorLabel,
    )} confirmed the QR-sourced connection candidate for ${input.contact.displayName}.`,
    capturedFields: ["confirmation", "source", "evidenceIds"],
    createdAt: input.now,
    createdBy: "live-qr-scan-connect-service",
  };
}

function buildDraft(input: {
  actorLabel?: string | null;
  contact: ContactDTO;
  graph: LiveQrScanConnectGraph;
  mode: "confirmed" | "pending";
  now: string;
  provider: LiveQrScanConnectProvider;
}): {
  confirmEvidence: QrConnectionEvidence | null;
  draft: QrConnectionDraft;
  provenance: QrScanConnectProvenance;
} {
  const sourceEvidenceItems = sourceEvidence({
    contact: input.contact,
    graph: input.graph,
  });
  const confirmEvidence =
    input.mode === "confirmed"
      ? buildConfirmEvidence({
          actorLabel: input.actorLabel,
          contact: input.contact,
          now: input.now,
        })
      : null;
  const evidence = [
    ...sourceEvidenceItems,
    ...(confirmEvidence ? [confirmEvidence] : []),
  ];
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const provenance = provenanceFor({
    evidenceIds,
    generatedAt: input.graph.generatedAt,
    generationMethod:
      input.mode === "confirmed"
        ? "live-store-confirmation"
        : "live-store-query",
    provider: input.provider,
  });
  const mutualContext = buildMutualContext({
    contact: input.contact,
    evidence: sourceEvidenceItems,
  });

  return {
    confirmEvidence,
    draft: {
      id: draftIdFor(input.contact.id),
      status: input.mode === "confirmed" ? "confirmed" : "pending_confirmation",
      source: sourceFor(input.contact),
      displayName: input.contact.displayName,
      role: nonEmpty(input.contact.role) ?? "Relationship candidate",
      organization:
        nonEmpty(input.contact.organization) ?? "Unknown organization",
      email: nonEmpty(input.contact.primaryEmail) ?? "",
      relationshipContext:
        input.contact.profileSnippet ??
        `${input.contact.displayName} was sourced from a live QR scan contact record.`,
      suggestedNextAction:
        "Review the source-backed QR relationship context before contact and connection write.",
      mutualContext,
      confirmation: {
        required: true,
        state: input.mode === "confirmed" ? "confirmed" : "pending",
        question: `Confirm adding ${input.contact.displayName} from the live QR scan record?`,
        ...(input.mode === "confirmed"
          ? {
              actorLabel: actorLabelFor(input.actorLabel),
              confirmedAt: input.now,
            }
          : {}),
      },
      contactWriteExecuted: false,
      connectionWriteExecuted: false,
      notificationDelivered: false,
      evidence,
      provenance,
      createdAt: input.contact.createdAt,
    },
    provenance,
  };
}

function emptyPayload(input: {
  generatedAt: string;
  provider: LiveQrScanConnectProvider;
}): QrScanConnectPayload {
  const provenance = provenanceFor({
    evidenceIds: [],
    generatedAt: input.generatedAt,
    provider: input.provider,
  });

  return {
    state: "empty",
    scan: {
      scanId: "qr-scan:live:empty",
      scanMethod: "live-store-qr-record",
      scanLabel: "No live QR scan contact records",
      payloadFormat: "orbit-demo-qr-v1",
      qrText: "",
      payloadDigest: "sha256:live-qr-empty",
      deviceCameraAccessed: false,
      qrDecoderProviderCalled: false,
      cryptographicValidationExecuted: false,
      externalLookupExecuted: false,
      databaseWriteExecuted: false,
    },
    mutualContext: null,
    draft: null,
    summary: "No live QR scan contacts are ready for connection review.",
    provenance,
    nextAction: "Wait for source-backed QR scan contacts before staging a draft.",
  };
}

async function readGraph(input: {
  now: string;
  provider?: LiveQrScanConnectProvider | null;
}): Promise<ReadQrScanConnectGraphResult> {
  if (!input.provider) {
    return failure(
      "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  try {
    return {
      graph: await input.provider.readQrScanConnectGraph(),
      provider: input.provider,
    };
  } catch {
    return failure(
      "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:qr-scan-connect-live-store-failed"],
        generatedAt: input.now,
        provider: input.provider,
        readExecuted: true,
      }),
    );
  }
}

function findContact(input: {
  draftId: string;
  graph: LiveQrScanConnectGraph;
}): ContactDTO | null {
  const contactId = contactIdFromDraftId(input.draftId);

  return (
    qrContacts(input.graph).find((contact) => contact.id === contactId) ?? null
  );
}

function buildScanPayload(input: {
  contact: ContactDTO;
  graph: LiveQrScanConnectGraph;
  now: string;
  provider: LiveQrScanConnectProvider;
}): QrScanConnectPayload {
  const { draft, provenance } = buildDraft({
    contact: input.contact,
    graph: input.graph,
    mode: "pending",
    now: input.now,
    provider: input.provider,
  });

  return {
    state: "success",
    scan: buildScan(input.contact),
    mutualContext: draft.mutualContext,
    draft,
    summary:
      "A live QR scan contact record was staged as a connection draft without camera, decoder, graph lookup, database write, AI, or notification calls.",
    provenance,
    nextAction: "Review the QR-sourced relationship context before confirming.",
  };
}

function buildPendingPayload(input: {
  contact: ContactDTO;
  graph: LiveQrScanConnectGraph;
  now: string;
  provider: LiveQrScanConnectProvider;
}): QrScanConnectPayload {
  const sourceEvidenceItems = sourceEvidence({
    contact: input.contact,
    graph: input.graph,
  });

  return {
    state: "pending",
    scan: buildScan(input.contact),
    mutualContext: null,
    draft: null,
    summary:
      "The live QR scan contact record is waiting for source review before a connection draft is staged.",
    provenance: provenanceFor({
      evidenceIds: sourceEvidenceItems.map((item) => item.evidenceId),
      generatedAt: input.graph.generatedAt,
      provider: input.provider,
    }),
    nextAction: "Wait for source-backed QR review before confirming the draft.",
  };
}

function contactCandidateFromDraft(
  draft: QrConnectionDraft,
): QrContactCandidate {
  return {
    candidateId: `contact-candidate:qr-live:${draft.id}`,
    displayName: draft.displayName,
    role: draft.role,
    organization: draft.organization,
    email: draft.email,
    relationshipContext: draft.relationshipContext,
    source: draft.source,
    evidenceIds: draft.provenance.evidenceIds,
    readyForContactWrite: true,
    contactWriteExecuted: false,
  };
}

function connectionCandidateFromDraft(
  draft: QrConnectionDraft,
): QrConnectionCandidate {
  return {
    candidateId: `connection-candidate:qr-live:${draft.id}`,
    displayName: draft.displayName,
    organization: draft.organization,
    mutualContext: draft.mutualContext,
    valueHypothesis: `${draft.displayName} is a source-backed QR relationship candidate from ${draft.organization}.`,
    source: draft.source,
    evidenceIds: draft.provenance.evidenceIds,
    readyForConnectionWrite: true,
    connectionWriteExecuted: false,
  };
}

function buildConfirmationPayload(input: {
  actorLabel?: string | null;
  contact: ContactDTO;
  graph: LiveQrScanConnectGraph;
  now: string;
  provider: LiveQrScanConnectProvider;
}): QrConnectionConfirmationPayload {
  const { confirmEvidence, draft, provenance } = buildDraft({
    actorLabel: input.actorLabel,
    contact: input.contact,
    graph: input.graph,
    mode: "confirmed",
    now: input.now,
    provider: input.provider,
  });

  return {
    state: "confirmed",
    confirmedDraft: draft,
    contactCandidate: contactCandidateFromDraft(draft),
    connectionCandidate: connectionCandidateFromDraft(draft),
    createdEvidence: confirmEvidence ?? fallbackEvidence(input.contact),
    confirmedAt: input.now,
    provenance,
    nextAction:
      "Hand the QR-sourced contact and connection candidates to live persistence only after an explicit write boundary is implemented.",
  };
}

export function createLiveQrScanConnectService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveQrScanConnectServiceOptions = {}): QrScanConnectService {
  return {
    async scanQrCode(input = {}): Promise<QrScanConnectResult> {
      const scenario = normalizeScanScenario(input.scenario);
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isFailureResult(readResult)) {
        return readResult;
      }

      if (scenario === "failure") {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: ["evidence:qr-scan-connect-live-scenario-failed"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      const contacts = qrContacts(readResult.graph);

      if (scenario === "empty" || contacts.length === 0) {
        return success(
          emptyPayload({
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      const contact = contacts[0];

      if (scenario === "pending") {
        return success(
          buildPendingPayload({
            contact,
            graph: readResult.graph,
            now: now(),
            provider: readResult.provider,
          }),
        );
      }

      return success(
        buildScanPayload({
          contact,
          graph: readResult.graph,
          now: now(),
          provider: readResult.provider,
        }),
      );
    },

    async confirmQrConnectionDraft(
      input: QrConnectionDraftConfirmInput,
    ): Promise<QrConnectionConfirmationResult> {
      const scenario = normalizeConfirmationScenario(input.scenario);
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isFailureResult(readResult)) {
        return readResult;
      }

      if (scenario === "pending") {
        return failure(
          "QR_SCAN_CONNECT_PENDING",
          provenanceFor({
            evidenceIds: ["evidence:qr-scan-connect-live-pending"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      if (scenario === "failure") {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: ["evidence:qr-scan-connect-live-scenario-failed"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      const contact = findContact({
        draftId: input.draftId,
        graph: readResult.graph,
      });

      if (!contact) {
        return failure(
          "QR_SCAN_DRAFT_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:qr-scan-connect-live-draft-missing"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      return confirmationSuccess(
        buildConfirmationPayload({
          actorLabel: input.actorLabel,
          contact,
          graph: readResult.graph,
          now: now(),
          provider: readResult.provider,
        }),
      );
    },
  };
}
