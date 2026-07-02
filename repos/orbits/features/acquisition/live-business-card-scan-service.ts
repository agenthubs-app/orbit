import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS,
  type BusinessCardCapture,
  type BusinessCardContactDraft,
  type BusinessCardDraftLookupInput,
  type BusinessCardDraftLookupResult,
  type BusinessCardDraftLookupSuccess,
  type BusinessCardEvidence,
  type BusinessCardOcrExtraction,
  type BusinessCardScanOcrErrorCode,
  type BusinessCardScanOcrFailure,
  type BusinessCardScanOcrInput,
  type BusinessCardScanOcrPayload,
  type BusinessCardScanOcrProvenance,
  type BusinessCardScanOcrResult,
  type BusinessCardScanOcrScenario,
  type BusinessCardScanOcrService,
  type BusinessCardScanOcrSuccess,
  type BusinessCardSourceReference,
} from "./business-card-contract";
import { BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX } from "./business-card-review-contract";
import type {
  LiveBusinessCardScanOcrGraph,
  LiveBusinessCardScanOcrProvider,
} from "./storage/business-card-scan-live-record-provider";

export interface LiveBusinessCardScanOcrServiceOptions {
  now?: () => string;
  provider?: LiveBusinessCardScanOcrProvider | null;
}

interface ReadBusinessCardScanGraphSuccess {
  graph: LiveBusinessCardScanOcrGraph;
  provider: LiveBusinessCardScanOcrProvider;
}

type ReadBusinessCardScanGraphResult =
  | BusinessCardScanOcrFailure
  | ReadBusinessCardScanGraphSuccess;

const supportedScanScenarios = new Set<BusinessCardScanOcrScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: BusinessCardScanOcrPayload,
): BusinessCardScanOcrSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function draftSuccess(
  draft: BusinessCardContactDraft,
): BusinessCardDraftLookupSuccess {
  return {
    success: true,
    data: clonePayload(draft),
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
  scenario?: BusinessCardScanOcrInput["scenario"],
): BusinessCardScanOcrScenario {
  if (
    scenario &&
    supportedScanScenarios.has(scenario as BusinessCardScanOcrScenario)
  ) {
    return scenario as BusinessCardScanOcrScenario;
  }

  return "success";
}

function compactDigest(value: string): string {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1000000;
  }

  return `sha256:live-card-${hash.toString().padStart(6, "0")}`;
}

function unconfiguredProvenance(now: string): BusinessCardScanOcrProvenance {
  return {
    source: "live-record-store:business-card-scan-ocr:unconfigured",
    sourceLabel: "Unconfigured business card scan OCR live store",
    evidenceIds: ["evidence:business-card-scan-ocr-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-business-card-scan-ocr",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    cameraRequested: false,
    uploadStorageRequested: false,
    storageWriteExecuted: false,
    externalNetworkRequested: false,
    ocrProviderRequested: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  provider: LiveBusinessCardScanOcrProvider;
  readExecuted?: boolean;
}): BusinessCardScanOcrProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:business-card-scan-ocr-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-business-card-scan-ocr",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: input.readExecuted ?? true,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    cameraRequested: false,
    uploadStorageRequested: false,
    storageWriteExecuted: false,
    externalNetworkRequested: false,
    ocrProviderRequested: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: BusinessCardScanOcrErrorCode,
  provenance: BusinessCardScanOcrProvenance,
): BusinessCardScanOcrFailure {
  const definition = BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS[code];

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
  result: ReadBusinessCardScanGraphResult,
): result is BusinessCardScanOcrFailure {
  return "success" in result && result.success === false;
}

function draftIdFor(contactId: string): string {
  return `${BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX}${contactId}`;
}

function contactIdFromDraftId(draftId: string): string {
  return draftId.startsWith(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX)
    ? draftId.slice(BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX.length)
    : draftId;
}

function businessCardContacts(
  graph: LiveBusinessCardScanOcrGraph,
): readonly ContactDTO[] {
  return graph.contacts
    .filter((contact) => contact.source.type === "business_card_ocr")
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sourceFor(contact: ContactDTO): BusinessCardSourceReference {
  return {
    type: "business_card_ocr",
    id: contact.source.id,
    label:
      contact.source.label ??
      `Business card exchange for ${contact.displayName}`,
  };
}

function evidenceForContact(
  contact: ContactDTO,
  graph: LiveBusinessCardScanOcrGraph,
): readonly RelationshipEvidenceDTO[] {
  const contactEvidenceIds = new Set(contact.evidenceIds);

  return graph.evidence.filter(
    (evidence) =>
      contactEvidenceIds.has(evidence.id) ||
      (evidence.sourceType === "business_card_ocr" &&
        (evidence.sourceId === contact.id ||
          evidence.sourceId === contact.source.id)),
  );
}

function evidenceFromSource(input: {
  contact: ContactDTO;
  evidence: RelationshipEvidenceDTO;
}): BusinessCardEvidence {
  return {
    evidenceId: input.evidence.id,
    source: sourceFor(input.contact),
    sourceLabel:
      input.contact.source.label ??
      `Business card evidence for ${input.contact.displayName}`,
    excerpt: input.evidence.summary,
    capturedFields: [
      "rawText",
      "displayName",
      "role",
      "organization",
      "email",
      "phone",
    ],
    createdAt: input.evidence.occurredAt,
    createdBy: "live-business-card-scan-service",
  };
}

function fallbackEvidence(contact: ContactDTO): BusinessCardEvidence {
  return {
    evidenceId: `evidence:business-card-scan-ocr-live:${contact.id}`,
    source: sourceFor(contact),
    sourceLabel: `Business card source for ${contact.displayName}`,
    excerpt: `${contact.displayName} was sourced from a live business-card OCR contact record.`,
    capturedFields: ["displayName", "role", "organization", "source"],
    createdAt: contact.createdAt,
    createdBy: "live-business-card-scan-service",
  };
}

function sourceEvidence(input: {
  contact: ContactDTO;
  graph: LiveBusinessCardScanOcrGraph;
}): readonly BusinessCardEvidence[] {
  const evidence = evidenceForContact(input.contact, input.graph).map((item) =>
    evidenceFromSource({
      contact: input.contact,
      evidence: item,
    }),
  );

  return evidence.length > 0 ? evidence : [fallbackEvidence(input.contact)];
}

function rawTextLinesFor(contact: ContactDTO): readonly string[] {
  return [
    contact.displayName,
    nonEmpty(contact.role) ?? "",
    nonEmpty(contact.organization) ?? "",
    nonEmpty(contact.primaryEmail) ?? "",
    nonEmpty(contact.primaryPhone) ?? "",
  ].filter((line) => line.length > 0);
}

function extractedFieldsFor(contact: ContactDTO): readonly string[] {
  return [
    "name",
    nonEmpty(contact.role) ? "role" : "",
    nonEmpty(contact.organization) ? "organization" : "",
    nonEmpty(contact.primaryEmail) ? "email" : "",
    nonEmpty(contact.primaryPhone) ? "phone" : "",
  ].filter((field) => field.length > 0);
}

function captureFor(contact: ContactDTO): BusinessCardCapture {
  const source = sourceFor(contact);
  const imageName = `${contact.id}-business-card-live-record.txt`;

  return {
    captureId: `capture:business-card-live:${contact.id}`,
    captureMethod: "live-store-business-card-record",
    imageName,
    imageMimeType: "text/plain",
    imageDigest: compactDigest(`${source.id}:${imageName}`),
    deviceCameraAccessed: false,
    uploadStorageExecuted: false,
    storageWriteExecuted: false,
  };
}

function ocrExtractionFor(contact: ContactDTO): BusinessCardOcrExtraction {
  const rawTextLines = rawTextLinesFor(contact);

  return {
    status: "complete",
    rawText: rawTextLines.join("\n"),
    rawTextLines,
    extractedFields: extractedFieldsFor(contact),
    ocrProviderCalled: false,
    aiExtractionExecuted: false,
  };
}

function draftFor(input: {
  contact: ContactDTO;
  evidence: readonly BusinessCardEvidence[];
  graph: LiveBusinessCardScanOcrGraph;
  provider: LiveBusinessCardScanOcrProvider;
}): BusinessCardContactDraft {
  const evidenceIds = input.evidence.map((item) => item.evidenceId);

  return {
    id: draftIdFor(input.contact.id),
    status: "pending_confirmation",
    source: sourceFor(input.contact),
    displayName: input.contact.displayName,
    role: nonEmpty(input.contact.role) ?? "Relationship candidate",
    organization: nonEmpty(input.contact.organization) ?? "Unknown organization",
    email: nonEmpty(input.contact.primaryEmail) ?? "",
    phone: nonEmpty(input.contact.primaryPhone) ?? "",
    relationshipContext:
      input.contact.profileSnippet ??
      `${input.contact.displayName} was sourced from a live business-card OCR contact record.`,
    suggestedNextAction:
      "Review the source-backed business card fields before confirming the contact candidate.",
    confirmation: {
      required: true,
      state: "pending",
      question: `Confirm adding ${input.contact.displayName} from the live business card OCR draft?`,
    },
    contactWriteExecuted: false,
    evidence: input.evidence,
    provenance: provenanceFor({
      evidenceIds,
      generatedAt: input.graph.generatedAt,
      provider: input.provider,
    }),
    createdAt: input.contact.createdAt,
  };
}

function payloadFor(input: {
  contact: ContactDTO;
  graph: LiveBusinessCardScanOcrGraph;
  provider: LiveBusinessCardScanOcrProvider;
}): BusinessCardScanOcrPayload {
  const evidence = sourceEvidence({
    contact: input.contact,
    graph: input.graph,
  });
  const draft = draftFor({
    contact: input.contact,
    evidence,
    graph: input.graph,
    provider: input.provider,
  });

  return {
    state: "success",
    capture: captureFor(input.contact),
    ocr: ocrExtractionFor(input.contact),
    draft,
    summary:
      "A live business-card OCR contact record was staged as an extracted contact draft without camera, upload storage, OCR provider, AI, database write, or notification calls.",
    provenance: draft.provenance,
    nextAction:
      "Review the live business-card fields before passing the draft to the review boundary.",
  };
}

function emptyPayload(input: {
  generatedAt: string;
  provider: LiveBusinessCardScanOcrProvider;
}): BusinessCardScanOcrPayload {
  const provenance = provenanceFor({
    evidenceIds: [],
    generatedAt: input.generatedAt,
    provider: input.provider,
  });

  return {
    state: "empty",
    capture: {
      captureId: "capture:business-card-live-empty",
      captureMethod: "live-store-business-card-record",
      imageName: "no-live-business-card-record.txt",
      imageMimeType: "text/plain",
      imageDigest: "sha256:live-card-empty",
      deviceCameraAccessed: false,
      uploadStorageExecuted: false,
      storageWriteExecuted: false,
    },
    ocr: {
      status: "empty",
      rawText: "",
      rawTextLines: [],
      extractedFields: [],
      ocrProviderCalled: false,
      aiExtractionExecuted: false,
    },
    draft: null,
    summary: "No live business-card OCR contacts are ready for scan preview.",
    provenance,
    nextAction:
      "Wait for source-backed business card OCR contacts before staging a draft.",
  };
}

function pendingPayload(input: {
  contact: ContactDTO;
  graph: LiveBusinessCardScanOcrGraph;
  provider: LiveBusinessCardScanOcrProvider;
}): BusinessCardScanOcrPayload {
  const evidence = sourceEvidence({
    contact: input.contact,
    graph: input.graph,
  });

  return {
    state: "pending",
    capture: captureFor(input.contact),
    ocr: {
      status: "pending",
      rawText:
        "Live business-card OCR source is waiting for source review before draft staging.",
      rawTextLines: [
        "Live business-card OCR source is waiting for source review before draft staging.",
      ],
      extractedFields: [],
      ocrProviderCalled: false,
      aiExtractionExecuted: false,
    },
    draft: null,
    summary:
      "A live business-card OCR contact record is waiting for review before draft staging.",
    provenance: provenanceFor({
      evidenceIds: evidence.map((item) => item.evidenceId),
      generatedAt: input.graph.generatedAt,
      provider: input.provider,
    }),
    nextAction:
      "Wait for source-backed business card review before confirming the draft.",
  };
}

async function readGraph(input: {
  now: string;
  provider?: LiveBusinessCardScanOcrProvider | null;
}): Promise<ReadBusinessCardScanGraphResult> {
  if (!input.provider) {
    return failure(
      "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  try {
    return {
      graph: await input.provider.readBusinessCardScanOcrGraph(),
      provider: input.provider,
    };
  } catch {
    return failure(
      "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:business-card-scan-ocr-live-store-failed"],
        generatedAt: input.now,
        provider: input.provider,
        readExecuted: true,
      }),
    );
  }
}

function findContact(input: {
  draftId: string;
  graph: LiveBusinessCardScanOcrGraph;
}): ContactDTO | null {
  const contactId = contactIdFromDraftId(input.draftId);

  return (
    businessCardContacts(input.graph).find(
      (contact) => contact.id === contactId,
    ) ?? null
  );
}

export function createLiveBusinessCardScanOcrService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveBusinessCardScanOcrServiceOptions = {}): BusinessCardScanOcrService {
  return {
    async scanBusinessCard(input = {}): Promise<BusinessCardScanOcrResult> {
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
          "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: [
              "evidence:business-card-scan-ocr-live-scenario-failed",
            ],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      const contacts = businessCardContacts(readResult.graph);

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
          pendingPayload({
            contact,
            graph: readResult.graph,
            provider: readResult.provider,
          }),
        );
      }

      return success(
        payloadFor({
          contact,
          graph: readResult.graph,
          provider: readResult.provider,
        }),
      );
    },

    async getBusinessCardDraft(
      input: BusinessCardDraftLookupInput,
    ): Promise<BusinessCardDraftLookupResult> {
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isFailureResult(readResult)) {
        return readResult;
      }

      if (input.scenario === "pending") {
        return failure(
          "BUSINESS_CARD_SCAN_NOT_READY",
          provenanceFor({
            evidenceIds: ["evidence:business-card-scan-ocr-live-pending"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      if (input.scenario === "failure") {
        return failure(
          "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: [
              "evidence:business-card-scan-ocr-live-scenario-failed",
            ],
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
          "BUSINESS_CARD_DRAFT_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:business-card-scan-ocr-live-draft-missing"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      return draftSuccess(
        draftFor({
          contact,
          evidence: sourceEvidence({
            contact,
            graph: readResult.graph,
          }),
          graph: readResult.graph,
          provider: readResult.provider,
        }),
      );
    },
  };
}
