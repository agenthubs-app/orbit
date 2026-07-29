import { createHash } from "node:crypto";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import type { RelationshipRecordWriteProvider } from "../contacts/contact-write-contract";
import type {
  ContactAcquisitionDraft,
  ContactDraftEvidence,
} from "./contract";
import {
  QR_SCAN_CONNECT_ERROR_DEFINITIONS,
  QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX,
  type QrConnectionCandidate,
  type QrConnectionConfirmationPayload,
  type QrConnectionConfirmationResult,
  type QrConnectionDraft,
  type QrConnectionDraftConfirmInput,
  type QrConnectionEvidence,
  type QrContactCandidate,
  type QrMutualConnectionContext,
  type QrScanConnectConfirmationScenario,
  type QrScanConnectErrorCode,
  type QrScanConnectFailure,
  type QrScanConnectInput,
  type QrScanConnectPayload,
  type QrScanConnectProvenance,
  type QrScanConnectResult,
  type QrScanConnectScenario,
  type QrScanConnectService,
  type QrScanResult,
  type QrScanSourceReference,
} from "./qr-contract";
import type { LiveContactAcquisitionDraftProvider } from "./storage/contact-draft-live-record-provider";

export interface LiveQrScanConnectServiceOptions {
  actorId?: string;
  draftProvider?: LiveContactAcquisitionDraftProvider | null;
  now?: () => string;
  recordProvider?: RelationshipRecordWriteProvider | null;
}

interface ParsedQrPayload {
  displayName: string;
  email: string;
  eventName: string;
  mutualConnections: readonly string[];
  organization: string;
  role: string;
  sharedTopics: readonly string[];
}

type StoredQrConnectionDraft = ContactAcquisitionDraft & {
  contactId?: string;
  connectionId?: string;
  contactWriteExecuted?: boolean;
  connectionWriteExecuted?: boolean;
  email?: string;
  mutualContext?: QrMutualConnectionContext;
  qrText?: string;
  scanLabel?: string;
};

interface QrWriteOutcome {
  contactId: string;
  connectionId: string;
  contactWriteExecuted: boolean;
  connectionWriteExecuted: boolean;
}

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

function success(payload: QrScanConnectPayload): {
  success: true;
  data: QrScanConnectPayload;
} {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: QrConnectionConfirmationPayload,
): { success: true; data: QrConnectionConfirmationPayload } {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function nonEmpty(value?: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
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

function stringList(value: string | undefined): readonly string[] {
  return value
    ? unique(value.split(",").map((item) => item.trim())).slice(0, 20)
    : [];
}

function parseOrbitQrText(qrText: string): ParsedQrPayload | null {
  const normalizedText = qrText.trim();

  if (
    normalizedText.length === 0 ||
    normalizedText.length > 4096 ||
    !normalizedText.startsWith("orbit-qr:")
  ) {
    return null;
  }

  const fields = new Map<string, string>();

  for (const pair of normalizedText.slice("orbit-qr:".length).split(";")) {
    const [rawKey, ...rawValue] = pair.split("=");
    const key = rawKey?.trim().toLocaleLowerCase();
    const value = rawValue.join("=").trim();

    if (key && value && value.length <= 512) {
      fields.set(key, value);
    }
  }

  const displayName = nonEmpty(fields.get("name"));

  if (!displayName) {
    return null;
  }

  return {
    displayName,
    email: nonEmpty(fields.get("email")) ?? "",
    eventName: nonEmpty(fields.get("event")) ?? "Scanned Orbit QR",
    mutualConnections: stringList(fields.get("mutual")),
    organization:
      nonEmpty(fields.get("organization")) ?? "Unknown organization",
    role: nonEmpty(fields.get("role")) ?? "Relationship candidate",
    sharedTopics: stringList(fields.get("topic")),
  };
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function stableDigest(input: {
  actorId: string;
  parsed: ParsedQrPayload;
}): string {
  const canonical = [
    input.actorId,
    input.parsed.displayName,
    input.parsed.organization,
    input.parsed.role,
    input.parsed.email,
    input.parsed.eventName,
    ...[...input.parsed.mutualConnections].sort(),
    ...[...input.parsed.sharedTopics].sort(),
  ]
    .map(normalized)
    .join("\u0000");

  return createHash("sha256").update(canonical).digest("hex");
}

function actorLabelFor(actorLabel?: string | null): string {
  return nonEmpty(actorLabel) ?? "Live QR reviewer";
}

function sourceFor(input: {
  digest: string;
  displayName: string;
  scanLabel?: string | null;
}): QrScanSourceReference {
  return {
    id: `source:qr-scan:${input.digest.slice(0, 24)}`,
    label:
      nonEmpty(input.scanLabel) ??
      `Orbit relationship QR for ${input.displayName}`,
    type: "qr_scan",
  };
}

function baseProvenance(input: {
  collectedAt: string;
  draftProvider?: LiveContactAcquisitionDraftProvider | null;
  evidenceIds: readonly string[];
  generationMethod?: QrScanConnectProvenance["generationMethod"];
  readExecuted?: boolean;
  databaseWriteExecuted?: boolean;
  contactWriteExecuted?: boolean;
  connectionWriteExecuted?: boolean;
}): QrScanConnectProvenance {
  return {
    source:
      input.draftProvider?.source ??
      "live-record-store:qr-scan-connect:unconfigured",
    sourceLabel:
      input.draftProvider?.sourceLabel ??
      "Unconfigured QR scan connect live store",
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:qr-scan-connect-live-empty"],
    collectedAt: input.collectedAt,
    privacy: "live-qr-scan-connect",
    generationMethod: input.generationMethod ?? "live-store-query",
    liveDatabaseReadExecuted: input.readExecuted ?? false,
    databaseWriteExecuted: input.databaseWriteExecuted ?? false,
    contactWriteExecuted: input.contactWriteExecuted ?? false,
    connectionWriteExecuted: input.connectionWriteExecuted ?? false,
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
  return {
    success: false,
    error: {
      ...QR_SCAN_CONNECT_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function mutualContextFor(input: {
  digest: string;
  parsed: ParsedQrPayload;
  source: QrScanSourceReference;
}): QrMutualConnectionContext {
  return {
    contextId: `qr-context:live:${input.digest.slice(0, 24)}`,
    eventId: `event:qr-source:${input.digest.slice(0, 24)}`,
    eventName: input.parsed.eventName,
    encounterReason: `${input.parsed.displayName} was supplied by an operator-reviewed Orbit relationship QR.`,
    mutualConnections: input.parsed.mutualConnections,
    sharedTopics: input.parsed.sharedTopics,
    introductionPath:
      input.parsed.mutualConnections.length > 0
        ? `${input.parsed.mutualConnections[0]} was named in the scanned QR context.`
        : "No introducer was encoded in the scanned QR context.",
    confidence: "live-store",
    evidenceId: `evidence:qr-scan:${input.digest.slice(0, 24)}`,
    externalGraphLookupExecuted: false,
  };
}

function draftEvidenceFor(input: {
  createdAt: string;
  digest: string;
  parsed: ParsedQrPayload;
  source: QrScanSourceReference;
}): readonly ContactDraftEvidence[] {
  return [
    {
      evidenceId: `evidence:qr-scan:${input.digest.slice(0, 24)}`,
      source: input.source,
      sourceLabel: input.source.label,
      excerpt: `${input.parsed.displayName}, ${input.parsed.role} at ${input.parsed.organization}, was parsed from an operator-supplied Orbit QR payload.`,
      capturedFields: [
        "displayName",
        "role",
        "organization",
        "email",
        "eventName",
        "mutualConnections",
        "sharedTopics",
      ],
      createdAt: input.createdAt,
      createdBy: "live-contact-acquisition-draft-service",
    },
  ];
}

function storedDraftFromInput(input: {
  actorId: string;
  createdAt: string;
  draftProvider: LiveContactAcquisitionDraftProvider;
  parsed: ParsedQrPayload;
  qrText: string;
  scanLabel?: string | null;
}): StoredQrConnectionDraft {
  const digest = stableDigest({
    actorId: input.actorId,
    parsed: input.parsed,
  });
  const source = sourceFor({
    digest,
    displayName: input.parsed.displayName,
    scanLabel: input.scanLabel,
  });
  const evidence = draftEvidenceFor({
    createdAt: input.createdAt,
    digest,
    parsed: input.parsed,
    source,
  });
  const mutualContext = mutualContextFor({
    digest,
    parsed: input.parsed,
    source,
  });

  return {
    id: `${QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX}${digest.slice(0, 24)}`,
    status: "pending_confirmation",
    source,
    displayName: input.parsed.displayName,
    role: input.parsed.role,
    organization: input.parsed.organization,
    relationshipContext: `${input.parsed.displayName} was scanned from ${input.parsed.eventName}; the QR named ${input.parsed.mutualConnections.length} mutual connection(s) and ${input.parsed.sharedTopics.length} shared topic(s).`,
    suggestedNextAction:
      "Review the unsigned QR fields, then confirm the actor-owned contact and connection write.",
    confidence: "medium",
    createdAt: input.createdAt,
    confirmation: {
      required: true,
      state: "pending",
      question: `Confirm adding ${input.parsed.displayName} from this unsigned Orbit QR?`,
      writeTargets: ["contact", "connection"],
    },
    evidence,
    provenance: {
      source: input.draftProvider.source,
      sourceLabel: input.draftProvider.sourceLabel,
      evidenceIds: evidence.map((item) => item.evidenceId),
      collectedAt: input.createdAt,
      privacy: "live-contact-acquisition-drafts",
      generationMethod: "live-store-query",
      liveDatabaseReadExecuted: true,
      contactDraftWriteExecuted: true,
      contactWriteExecuted: false,
      externalNetworkRequested: false,
    },
    email: input.parsed.email,
    mutualContext,
    qrText: input.qrText,
    scanLabel: source.label,
    contactWriteExecuted: false,
    connectionWriteExecuted: false,
  };
}

function qrEvidenceFromDraft(
  evidence: ContactDraftEvidence,
): QrConnectionEvidence {
  return {
    evidenceId: evidence.evidenceId,
    source: {
      id: evidence.source.id,
      label: evidence.source.label,
      type: "qr_scan",
    },
    sourceLabel: evidence.sourceLabel,
    excerpt: evidence.excerpt,
    capturedFields: evidence.capturedFields,
    createdAt: evidence.createdAt,
    createdBy: "live-qr-scan-connect-service",
  };
}

function qrDraftFromStored(
  draft: ContactAcquisitionDraft,
  draftProvider: LiveContactAcquisitionDraftProvider,
): QrConnectionDraft {
  const stored = draft as StoredQrConnectionDraft;
  const fallbackContext: QrMutualConnectionContext = {
    contextId: `qr-context:live:${draft.id}`,
    eventId: draft.source.id,
    eventName: draft.source.label,
    encounterReason: draft.relationshipContext,
    mutualConnections: [],
    sharedTopics: [],
    introductionPath: "No introducer was encoded in the stored QR draft.",
    confidence: "live-store",
    evidenceId:
      draft.provenance.evidenceIds[0] ??
      `evidence:qr-scan-connect-live:${draft.id}`,
    externalGraphLookupExecuted: false,
  };

  return {
    id: draft.id,
    status: draft.status,
    source: {
      id: draft.source.id,
      label: draft.source.label,
      type: "qr_scan",
    },
    displayName: draft.displayName,
    role: draft.role,
    organization: draft.organization,
    email: nonEmpty(stored.email) ?? "",
    relationshipContext: draft.relationshipContext,
    suggestedNextAction: draft.suggestedNextAction,
    mutualContext: stored.mutualContext ?? fallbackContext,
    confirmation: {
      required: true,
      state: draft.confirmation.state,
      question: draft.confirmation.question,
      ...(draft.confirmation.actorLabel
        ? { actorLabel: draft.confirmation.actorLabel }
        : {}),
      ...(draft.confirmation.confirmedAt
        ? { confirmedAt: draft.confirmation.confirmedAt }
        : {}),
      writeTargets: ["contact", "connection"],
    },
    ...(nonEmpty(stored.contactId) ? { contactId: stored.contactId } : {}),
    ...(nonEmpty(stored.connectionId)
      ? { connectionId: stored.connectionId }
      : {}),
    contactWriteExecuted: stored.contactWriteExecuted === true,
    connectionWriteExecuted: stored.connectionWriteExecuted === true,
    notificationDelivered: false,
    evidence: draft.evidence.map(qrEvidenceFromDraft),
    provenance: baseProvenance({
      collectedAt: draft.provenance.collectedAt,
      draftProvider,
      evidenceIds: draft.provenance.evidenceIds,
      generationMethod:
        draft.provenance.generationMethod === "live-store-confirmation"
          ? "live-store-confirmation"
          : "live-store-query",
      readExecuted: draft.provenance.liveDatabaseReadExecuted ?? true,
      databaseWriteExecuted:
        draft.provenance.contactDraftWriteExecuted ?? false,
      contactWriteExecuted: stored.contactWriteExecuted === true,
      connectionWriteExecuted: stored.connectionWriteExecuted === true,
    }),
    createdAt: draft.createdAt,
  };
}

function scanResultFor(input: {
  databaseWriteExecuted: boolean;
  draft: StoredQrConnectionDraft;
}): QrScanResult {
  const qrText = nonEmpty(input.draft.qrText) ?? "";
  const scanLabel = nonEmpty(input.draft.scanLabel) ?? input.draft.source.label;

  return {
    scanId: `qr-scan:live:${input.draft.id}`,
    scanMethod: "rule-based-qr-text",
    scanLabel,
    payloadFormat: "orbit-demo-qr-v1",
    qrText,
    payloadDigest: `sha256:${createHash("sha256")
      .update(`${scanLabel}\u0000${qrText}`)
      .digest("hex")}`,
    deviceCameraAccessed: false,
    qrDecoderProviderCalled: false,
    cryptographicValidationExecuted: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: input.databaseWriteExecuted,
  };
}

function scanPayload(input: {
  databaseWriteExecuted: boolean;
  draft: StoredQrConnectionDraft;
  draftProvider: LiveContactAcquisitionDraftProvider;
}): QrScanConnectPayload {
  const qrDraft = qrDraftFromStored(input.draft, input.draftProvider);
  const alreadyWritten =
    qrDraft.contactWriteExecuted &&
    qrDraft.connectionWriteExecuted &&
    qrDraft.contactId &&
    qrDraft.connectionId;
  const provenance = baseProvenance({
    collectedAt: qrDraft.createdAt,
    draftProvider: input.draftProvider,
    evidenceIds: qrDraft.provenance.evidenceIds,
    generationMethod:
      qrDraft.status === "confirmed"
        ? "live-store-confirmation"
        : "live-store-query",
    readExecuted: true,
    databaseWriteExecuted: input.databaseWriteExecuted,
    contactWriteExecuted: qrDraft.contactWriteExecuted,
    connectionWriteExecuted: qrDraft.connectionWriteExecuted,
  });

  return {
    state: "success",
    scan: scanResultFor({
      databaseWriteExecuted: input.databaseWriteExecuted,
      draft: input.draft,
    }),
    mutualContext: qrDraft.mutualContext,
    draft: {
      ...qrDraft,
      provenance,
    },
    summary: alreadyWritten
      ? "This QR source is already confirmed into one actor-owned contact and connection."
      : "The submitted Orbit QR was parsed and persisted as one actor-owned draft without creating a contact or connection.",
    provenance,
    nextAction: alreadyWritten
      ? "Open the saved contact to continue the relationship workflow."
      : "Review the unsigned QR fields before confirming the contact and connection write.",
  };
}

function emptyPayload(input: {
  at: string;
  draftProvider: LiveContactAcquisitionDraftProvider;
}): QrScanConnectPayload {
  const provenance = baseProvenance({
    collectedAt: input.at,
    draftProvider: input.draftProvider,
    evidenceIds: ["evidence:qr-scan-connect-live-empty"],
    readExecuted: false,
  });

  return {
    state: "empty",
    scan: {
      scanId: "qr-scan:live:empty",
      scanMethod: "rule-based-qr-text",
      scanLabel: "No Orbit QR payload",
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
    summary: "No readable Orbit relationship QR payload was supplied.",
    provenance,
    nextAction: "Scan or paste a valid orbit-qr payload before continuing.",
  };
}

function relationshipEvidenceFromDraft(input: {
  actorId: string;
  draft: QrConnectionDraft;
  evidence: QrConnectionEvidence;
}): RelationshipEvidenceDTO {
  return {
    id: input.evidence.evidenceId,
    sourceType: "qr_scan",
    sourceId: input.draft.source.id,
    summary: input.evidence.excerpt,
    occurredAt: input.evidence.createdAt,
    confidence: 0.75,
    createdBy: input.actorId,
  };
}

function confirmationEvidence(input: {
  actorId: string;
  actorLabel: string;
  at: string;
  draft: QrConnectionDraft;
}): QrConnectionEvidence {
  return {
    evidenceId: `evidence:qr-scan-connect-confirmed:${input.draft.id}`,
    source: input.draft.source,
    sourceLabel: "Operator QR relationship confirmation",
    excerpt: `${input.actorLabel} confirmed ${input.draft.displayName} from the reviewed QR source fields.`,
    capturedFields: [
      "confirmation",
      "contact",
      "connection",
      "source",
      "evidenceIds",
    ],
    createdAt: input.at,
    createdBy: "live-qr-scan-connect-service",
  };
}

function contactIdFor(actorId: string, draftId: string): string {
  return `contact:qr:${createHash("sha256")
    .update(actorId)
    .update("\u0000")
    .update(draftId)
    .digest("hex")
    .slice(0, 24)}`;
}

function connectionIdFor(actorId: string, draftId: string): string {
  return `connection:qr:${createHash("sha256")
    .update(actorId)
    .update("\u0000")
    .update(draftId)
    .digest("hex")
    .slice(0, 24)}`;
}

function contactForDraft(input: {
  at: string;
  contactId: string;
  draft: QrConnectionDraft;
  evidenceIds: readonly [string, ...string[]];
}): ContactDTO {
  return {
    id: input.contactId,
    displayName: input.draft.displayName.trim(),
    organization: input.draft.organization.trim(),
    role: input.draft.role.trim(),
    ...(nonEmpty(input.draft.email)
      ? { primaryEmail: input.draft.email.trim() }
      : {}),
    profileSnippet: input.draft.relationshipContext,
    stage: "captured",
    source: input.draft.source,
    evidenceIds: input.evidenceIds,
    createdAt: input.draft.createdAt,
    updatedAt: input.at,
  };
}

function connectionForDraft(input: {
  actorId: string;
  at: string;
  connectionId: string;
  contactId: string;
  draft: QrConnectionDraft;
  evidenceIds: readonly [string, ...string[]];
}): ConnectionDTO {
  return {
    id: input.connectionId,
    accountId: input.actorId,
    contactId: input.contactId,
    stage: "captured",
    valueTypes: ["community_context"],
    summary: input.draft.relationshipContext,
    sharedTopics: input.draft.mutualContext.sharedTopics,
    suggestedActions: [
      "Review the QR source evidence before the first follow-up.",
    ],
    source: input.draft.source,
    evidenceIds: input.evidenceIds,
    createdAt: input.draft.createdAt,
    updatedAt: input.at,
  };
}

function isDuplicateContact(
  contact: ContactDTO,
  draft: QrConnectionDraft,
): boolean {
  const email = normalized(draft.email);
  const sameEmail =
    email.length > 0 && normalized(contact.primaryEmail ?? "") === email;
  const sameIdentity =
    normalized(contact.displayName) === normalized(draft.displayName) &&
    normalized(contact.organization ?? "") ===
      normalized(draft.organization);

  return sameEmail || sameIdentity;
}

async function writeQrRecords(input: {
  actorId: string;
  actorLabel: string;
  at: string;
  draft: QrConnectionDraft;
  recordProvider: RelationshipRecordWriteProvider;
}): Promise<
  | { success: true; outcome: QrWriteOutcome; confirmation: QrConnectionEvidence }
  | {
      success: false;
      code:
        | "QR_SCAN_CONTACT_DUPLICATE_REVIEW_REQUIRED"
        | "QR_SCAN_CONTACT_WRITE_FAILED"
        | "QR_SCAN_CONNECTION_WRITE_FAILED";
    }
> {
  const contactId = contactIdFor(input.actorId, input.draft.id);
  const connectionId = connectionIdFor(input.actorId, input.draft.id);
  const confirmation = confirmationEvidence({
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    at: input.at,
    draft: input.draft,
  });
  const allEvidence = [...input.draft.evidence, confirmation];
  const evidenceIds = unique(
    allEvidence.map((item) => item.evidenceId),
  ) as [string, ...string[]];

  try {
    const existingContact = await input.recordProvider.getContact(
      contactId,
      input.actorId,
    );

    if (!existingContact) {
      const duplicate = (
        await input.recordProvider.listContacts(input.actorId)
      ).find((contact) => isDuplicateContact(contact, input.draft));

      if (duplicate) {
        return {
          success: false,
          code: "QR_SCAN_CONTACT_DUPLICATE_REVIEW_REQUIRED",
        };
      }
    }

    for (const evidence of allEvidence) {
      await input.recordProvider.saveEvidence(
        relationshipEvidenceFromDraft({
          actorId: input.actorId,
          draft: input.draft,
          evidence,
        }),
        input.actorId,
      );
    }

    const contact =
      existingContact ??
      (await input.recordProvider.saveContact(
        contactForDraft({
          at: input.at,
          contactId,
          draft: input.draft,
          evidenceIds,
        }),
        input.actorId,
      ));
    const existingConnection = await input.recordProvider.getConnection(
      connectionId,
      input.actorId,
    );

    try {
      if (!existingConnection) {
        await input.recordProvider.saveConnection(
          connectionForDraft({
            actorId: input.actorId,
            at: input.at,
            connectionId,
            contactId: contact.id,
            draft: input.draft,
            evidenceIds,
          }),
          input.actorId,
        );
      }
    } catch {
      return { success: false, code: "QR_SCAN_CONNECTION_WRITE_FAILED" };
    }

    return {
      success: true,
      outcome: {
        contactId: contact.id,
        connectionId,
        contactWriteExecuted: !existingContact,
        connectionWriteExecuted: !existingConnection,
      },
      confirmation,
    };
  } catch {
    return { success: false, code: "QR_SCAN_CONTACT_WRITE_FAILED" };
  }
}

function confirmedStoredDraft(input: {
  actorLabel: string;
  at: string;
  draft: StoredQrConnectionDraft;
  outcome: QrWriteOutcome;
  confirmation: QrConnectionEvidence;
}): StoredQrConnectionDraft {
  const confirmationEvidenceAsDraft: ContactDraftEvidence = {
    evidenceId: input.confirmation.evidenceId,
    source: input.confirmation.source,
    sourceLabel: input.confirmation.sourceLabel,
    excerpt: input.confirmation.excerpt,
    capturedFields: input.confirmation.capturedFields,
    createdAt: input.confirmation.createdAt,
    createdBy: "live-contact-acquisition-draft-service",
  };
  const evidence = [
    ...input.draft.evidence.filter(
      (item) => item.evidenceId !== input.confirmation.evidenceId,
    ),
    confirmationEvidenceAsDraft,
  ];

  return {
    ...input.draft,
    status: "confirmed",
    confirmation: {
      ...input.draft.confirmation,
      state: "confirmed",
      actorLabel: input.actorLabel,
      confirmedAt: input.at,
      writeTargets: ["contact", "connection"],
    },
    evidence,
    contactId: input.outcome.contactId,
    connectionId: input.outcome.connectionId,
    contactWriteExecuted: true,
    connectionWriteExecuted: true,
    provenance: {
      ...input.draft.provenance,
      evidenceIds: evidence.map((item) => item.evidenceId),
      collectedAt: input.at,
      generationMethod: "live-store-confirmation",
      liveDatabaseReadExecuted: true,
      contactDraftWriteExecuted: true,
      contactWriteExecuted: true,
    },
  };
}

function contactCandidateFromDraft(
  draft: QrConnectionDraft,
  outcome: QrWriteOutcome,
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
    readyForContactWrite: false,
    contactId: outcome.contactId,
    contactWriteExecuted: outcome.contactWriteExecuted,
  };
}

function connectionCandidateFromDraft(
  draft: QrConnectionDraft,
  outcome: QrWriteOutcome,
): QrConnectionCandidate {
  return {
    candidateId: `connection-candidate:qr-live:${draft.id}`,
    displayName: draft.displayName,
    organization: draft.organization,
    mutualContext: draft.mutualContext,
    valueHypothesis: `${draft.displayName} was confirmed from ${draft.mutualContext.eventName} with operator-reviewed QR context.`,
    source: draft.source,
    evidenceIds: draft.provenance.evidenceIds,
    readyForConnectionWrite: false,
    connectionId: outcome.connectionId,
    connectionWriteExecuted: outcome.connectionWriteExecuted,
  };
}

export function createLiveQrScanConnectService({
  actorId,
  draftProvider,
  now = () => new Date().toISOString(),
  recordProvider,
}: LiveQrScanConnectServiceOptions = {}): QrScanConnectService {
  const normalizedActorId = actorId?.trim() ?? "";

  return {
    async scanQrCode(input = {}): Promise<QrScanConnectResult> {
      const at = now();

      if (!normalizedActorId) {
        return failure(
          "QR_SCAN_ACTOR_REQUIRED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-actor-required"],
          }),
        );
      }

      if (!draftProvider) {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
          baseProvenance({
            collectedAt: at,
            evidenceIds: ["evidence:qr-scan-connect-live-store-unconfigured"],
          }),
        );
      }

      const scenario = normalizeScanScenario(input.scenario);

      if (scenario === "empty") {
        return success(emptyPayload({ at, draftProvider }));
      }

      if (scenario === "pending") {
        const payload = emptyPayload({ at, draftProvider });

        return success({
          ...payload,
          state: "pending",
          summary: "The supplied QR is still pending operator review.",
          nextAction: "Wait for QR review before staging a draft.",
        });
      }

      if (scenario === "failure") {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-connect-live-scenario-failed"],
          }),
        );
      }

      const qrText = nonEmpty(input.qrText);
      const parsed = qrText ? parseOrbitQrText(qrText) : null;

      if (!qrText || !parsed) {
        return failure(
          "QR_SCAN_PAYLOAD_REQUIRED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-payload-required"],
          }),
        );
      }

      const candidate = storedDraftFromInput({
        actorId: normalizedActorId,
        createdAt: at,
        draftProvider,
        parsed,
        qrText,
        scanLabel: input.scanLabel,
      });

      try {
        const graph = await draftProvider.readDraftGraph();
        const existing = graph.contactDrafts.find(
          (draft) =>
            draft.id === candidate.id && draft.source.type === "qr_scan",
        ) as StoredQrConnectionDraft | undefined;

        if (existing) {
          return success(
            scanPayload({
              databaseWriteExecuted: false,
              draft: existing,
              draftProvider,
            }),
          );
        }

        const saved = (await draftProvider.upsertContactDraft(
          candidate,
          at,
        )) as StoredQrConnectionDraft;

        return success(
          scanPayload({
            databaseWriteExecuted: true,
            draft: saved,
            draftProvider,
          }),
        );
      } catch {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: candidate.provenance.evidenceIds,
            readExecuted: true,
          }),
        );
      }
    },

    async confirmQrConnectionDraft(
      input: QrConnectionDraftConfirmInput,
    ): Promise<QrConnectionConfirmationResult> {
      const at = now();

      if (!normalizedActorId) {
        return failure(
          "QR_SCAN_ACTOR_REQUIRED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-actor-required"],
          }),
        );
      }

      if (!draftProvider) {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
          baseProvenance({
            collectedAt: at,
            evidenceIds: ["evidence:qr-scan-connect-live-store-unconfigured"],
          }),
        );
      }

      if (!recordProvider) {
        return failure(
          "QR_SCAN_CONNECT_WRITE_UNCONFIGURED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-connect-write-unconfigured"],
          }),
        );
      }

      const scenario = normalizeConfirmationScenario(input.scenario);

      if (scenario === "pending") {
        return failure(
          "QR_SCAN_CONNECT_PENDING",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-connect-live-pending"],
            readExecuted: true,
          }),
        );
      }

      if (scenario === "failure") {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-connect-live-scenario-failed"],
            readExecuted: true,
          }),
        );
      }

      let stored: StoredQrConnectionDraft | null = null;

      try {
        const graph = await draftProvider.readDraftGraph();
        stored =
          (graph.contactDrafts.find(
            (draft) =>
              draft.id === input.draftId && draft.source.type === "qr_scan",
          ) as StoredQrConnectionDraft | undefined) ?? null;
      } catch {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-connect-live-store-failed"],
            readExecuted: true,
          }),
        );
      }

      if (!stored) {
        return failure(
          "QR_SCAN_DRAFT_NOT_FOUND",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: ["evidence:qr-scan-connect-live-draft-missing"],
            readExecuted: true,
          }),
        );
      }

      const qrDraft = qrDraftFromStored(stored, draftProvider);
      const actorLabel = actorLabelFor(input.actorLabel);
      const write = await writeQrRecords({
        actorId: normalizedActorId,
        actorLabel,
        at,
        draft: qrDraft,
        recordProvider,
      });

      if (write.success === false) {
        return failure(
          write.code,
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: qrDraft.provenance.evidenceIds,
            readExecuted: true,
          }),
        );
      }

      const updated = confirmedStoredDraft({
        actorLabel,
        at,
        draft: stored,
        outcome: write.outcome,
        confirmation: write.confirmation,
      });
      let saved: StoredQrConnectionDraft;

      try {
        saved = (await draftProvider.upsertContactDraft(
          updated,
          at,
        )) as StoredQrConnectionDraft;
      } catch {
        return failure(
          "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
          baseProvenance({
            collectedAt: at,
            draftProvider,
            evidenceIds: updated.provenance.evidenceIds,
            readExecuted: true,
            databaseWriteExecuted: true,
            contactWriteExecuted: true,
            connectionWriteExecuted: true,
          }),
        );
      }

      const confirmedDraft = qrDraftFromStored(saved, draftProvider);
      const provenance = baseProvenance({
        collectedAt: at,
        draftProvider,
        evidenceIds: confirmedDraft.evidence.map((item) => item.evidenceId),
        generationMethod: "live-store-confirmation",
        readExecuted: true,
        databaseWriteExecuted: true,
        contactWriteExecuted: write.outcome.contactWriteExecuted,
        connectionWriteExecuted: write.outcome.connectionWriteExecuted,
      });

      return confirmationSuccess({
        state: "confirmed",
        confirmedDraft: {
          ...confirmedDraft,
          provenance,
        },
        contactCandidate: contactCandidateFromDraft(
          confirmedDraft,
          write.outcome,
        ),
        connectionCandidate: connectionCandidateFromDraft(
          confirmedDraft,
          write.outcome,
        ),
        createdEvidence: write.confirmation,
        confirmedAt: at,
        provenance,
        nextAction:
          "Open the saved actor-owned contact to continue the QR relationship workflow.",
      });
    },
  };
}
