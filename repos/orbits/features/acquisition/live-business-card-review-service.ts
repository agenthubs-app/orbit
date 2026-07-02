import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS,
  BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX,
  type BusinessCardReviewConfirmInput,
  type BusinessCardReviewConfirmationPayload,
  type BusinessCardReviewConfirmationResult,
  type BusinessCardReviewConfirmationScenario,
  type BusinessCardReviewConfirmationSuccess,
  type BusinessCardReviewDraft,
  type BusinessCardReviewErrorCode,
  type BusinessCardReviewEvidence,
  type BusinessCardReviewFailure,
  type BusinessCardReviewField,
  type BusinessCardReviewFieldMap,
  type BusinessCardReviewPayload,
  type BusinessCardReviewProvenance,
  type BusinessCardReviewResult,
  type BusinessCardReviewScenario,
  type BusinessCardReviewService,
  type BusinessCardReviewSourceReference,
  type BusinessCardReviewSuccess,
  type BusinessCardReviewUpdateInput,
  type BusinessCardReviewedFields,
} from "./business-card-review-contract";
import type {
  LiveBusinessCardReviewGraph,
  LiveBusinessCardReviewProvider,
} from "./storage/business-card-review-live-record-provider";

export interface LiveBusinessCardReviewServiceOptions {
  now?: () => string;
  provider?: LiveBusinessCardReviewProvider | null;
}

interface ReadBusinessCardGraphSuccess {
  graph: LiveBusinessCardReviewGraph;
  provider: LiveBusinessCardReviewProvider;
}

type ReadBusinessCardGraphResult =
  | BusinessCardReviewFailure
  | ReadBusinessCardGraphSuccess;

const supportedReviewScenarios = new Set<BusinessCardReviewScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<BusinessCardReviewConfirmationScenario>([
    "success",
    "pending",
    "blocked",
    "failure",
  ]);

const reviewFieldNames: readonly (keyof BusinessCardReviewedFields)[] = [
  "displayName",
  "role",
  "organization",
  "email",
  "phone",
];

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: BusinessCardReviewPayload): BusinessCardReviewSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: BusinessCardReviewConfirmationPayload,
): BusinessCardReviewConfirmationSuccess {
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

function normalizeReviewScenario(
  scenario?: BusinessCardReviewUpdateInput["scenario"],
): BusinessCardReviewScenario {
  if (
    scenario &&
    supportedReviewScenarios.has(scenario as BusinessCardReviewScenario)
  ) {
    return scenario as BusinessCardReviewScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: BusinessCardReviewConfirmInput["scenario"],
): BusinessCardReviewConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as BusinessCardReviewConfirmationScenario,
    )
  ) {
    return scenario as BusinessCardReviewConfirmationScenario;
  }

  return "success";
}

function unconfiguredProvenance(now: string): BusinessCardReviewProvenance {
  return {
    source: "live-record-store:business-card-review:unconfigured",
    sourceLabel: "Unconfigured business card review live store",
    evidenceIds: ["evidence:business-card-review-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-business-card-review",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
    ocrProviderRequested: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod?: BusinessCardReviewProvenance["generationMethod"];
  provider: LiveBusinessCardReviewProvider;
  readExecuted?: boolean;
}): BusinessCardReviewProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:business-card-review-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-business-card-review",
    generationMethod: input.generationMethod ?? "live-store-query",
    liveDatabaseReadExecuted: input.readExecuted ?? true,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
    ocrProviderRequested: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: BusinessCardReviewErrorCode,
  provenance: BusinessCardReviewProvenance,
): BusinessCardReviewFailure {
  const definition = BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS[code];

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
  result: ReadBusinessCardGraphResult,
): result is BusinessCardReviewFailure {
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
  graph: LiveBusinessCardReviewGraph,
): readonly ContactDTO[] {
  return graph.contacts
    .filter((contact) => contact.source.type === "business_card_ocr")
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sourceFor(contact: ContactDTO): BusinessCardReviewSourceReference {
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
  graph: LiveBusinessCardReviewGraph,
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

function reviewEvidenceFromSource(input: {
  contact: ContactDTO;
  evidence: RelationshipEvidenceDTO;
}): BusinessCardReviewEvidence {
  return {
    evidenceId: input.evidence.id,
    source: sourceFor(input.contact),
    sourceLabel:
      input.contact.source.label ??
      `Business card evidence for ${input.contact.displayName}`,
    excerpt: input.evidence.summary,
    capturedFields: [
      "displayName",
      "role",
      "organization",
      "source",
      "evidenceIds",
    ],
    createdAt: input.evidence.occurredAt,
    createdBy: "live-business-card-review-service",
  };
}

function fallbackEvidence(contact: ContactDTO): BusinessCardReviewEvidence {
  return {
    evidenceId: `evidence:business-card-review-live:${contact.id}`,
    source: sourceFor(contact),
    sourceLabel: `Business card source for ${contact.displayName}`,
    excerpt: `${contact.displayName} was sourced from a live business-card OCR contact record.`,
    capturedFields: ["displayName", "role", "organization", "source"],
    createdAt: contact.createdAt,
    createdBy: "live-business-card-review-service",
  };
}

function sourceEvidence(input: {
  contact: ContactDTO;
  graph: LiveBusinessCardReviewGraph;
}): readonly BusinessCardReviewEvidence[] {
  const evidence = evidenceForContact(input.contact, input.graph).map((item) =>
    reviewEvidenceFromSource({
      contact: input.contact,
      evidence: item,
    }),
  );

  return evidence.length > 0 ? evidence : [fallbackEvidence(input.contact)];
}

function baseFieldValues(contact: ContactDTO): BusinessCardReviewedFields {
  return {
    displayName: contact.displayName,
    role: nonEmpty(contact.role) ?? "Relationship candidate",
    organization: nonEmpty(contact.organization) ?? "Unknown organization",
    email: nonEmpty(contact.primaryEmail) ?? "",
    phone: nonEmpty(contact.primaryPhone) ?? "",
  };
}

function labelFor(fieldName: keyof BusinessCardReviewedFields): string {
  switch (fieldName) {
    case "displayName":
      return "Name";
    case "organization":
      return "Organization";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "role":
    default:
      return "Role";
  }
}

function buildField(input: {
  evidenceId: string;
  fieldName: keyof BusinessCardReviewedFields;
  mode: "pending" | "reviewed";
  reviewedFields?: Partial<BusinessCardReviewedFields> | null;
  value: string;
}): BusinessCardReviewField {
  const reviewedValue =
    input.mode === "pending"
      ? ""
      : input.reviewedFields?.[input.fieldName]?.trim() || input.value;

  return {
    field: input.fieldName,
    label: labelFor(input.fieldName),
    value: input.value,
    reviewedValue,
    reviewState:
      input.mode === "pending"
        ? "needs_review"
        : reviewedValue === input.value
          ? "accepted"
          : "edited",
    confidence: input.value.length > 0 ? "high" : "low",
    evidenceId: input.evidenceId,
  };
}

function buildFields(input: {
  contact: ContactDTO;
  evidenceId: string;
  mode: "pending" | "reviewed";
  reviewedFields?: Partial<BusinessCardReviewedFields> | null;
}): BusinessCardReviewFieldMap {
  const values = baseFieldValues(input.contact);

  return {
    displayName: buildField({
      ...input,
      fieldName: "displayName",
      value: values.displayName,
    }),
    role: buildField({
      ...input,
      fieldName: "role",
      value: values.role,
    }),
    organization: buildField({
      ...input,
      fieldName: "organization",
      value: values.organization,
    }),
    email: buildField({
      ...input,
      fieldName: "email",
      value: values.email,
    }),
    phone: buildField({
      ...input,
      fieldName: "phone",
      value: values.phone,
    }),
  };
}

function reviewedValueFor(
  fields: BusinessCardReviewFieldMap,
  fieldName: keyof BusinessCardReviewedFields,
): string {
  return fields[fieldName].reviewedValue || fields[fieldName].value;
}

function hasAnyReviewedField(
  reviewedFields?: Partial<BusinessCardReviewedFields> | null,
): boolean {
  if (!reviewedFields) {
    return false;
  }

  return reviewFieldNames.some((fieldName) => {
    const fieldValue = reviewedFields[fieldName];

    return typeof fieldValue === "string" && fieldValue.trim().length > 0;
  });
}

function actorLabelFor(actorLabel?: string | null): string {
  return nonEmpty(actorLabel) ?? "Live reviewer";
}

function buildReviewEvidence(input: {
  contact: ContactDTO;
  now: string;
  reviewerLabel?: string | null;
}): BusinessCardReviewEvidence {
  return {
    evidenceId: `evidence:business-card-review-reviewed:${input.contact.id}`,
    source: sourceFor(input.contact),
    sourceLabel: "Live business card field review",
    excerpt: `${actorLabelFor(
      input.reviewerLabel,
    )} reviewed live business card fields for ${input.contact.displayName}.`,
    capturedFields: ["reviewer", "reviewedFields", "evidenceIds"],
    createdAt: input.now,
    createdBy: "live-business-card-review-service",
  };
}

function buildConfirmEvidence(input: {
  actorLabel?: string | null;
  contact: ContactDTO;
  now: string;
}): BusinessCardReviewEvidence {
  return {
    evidenceId: `evidence:business-card-review-confirmed:${input.contact.id}`,
    source: sourceFor(input.contact),
    sourceLabel: "Live business card review confirmation",
    excerpt: `${actorLabelFor(
      input.actorLabel,
    )} confirmed the reviewed business card candidate for ${input.contact.displayName}.`,
    capturedFields: ["confirmation", "source", "evidenceIds"],
    createdAt: input.now,
    createdBy: "live-business-card-review-service",
  };
}

function buildDraft(input: {
  contact: ContactDTO;
  generatedAt: string;
  graph: LiveBusinessCardReviewGraph;
  mode: "confirmed" | "pending" | "reviewed";
  now: string;
  provider: LiveBusinessCardReviewProvider;
  reviewedFields?: Partial<BusinessCardReviewedFields> | null;
  reviewerLabel?: string | null;
  actorLabel?: string | null;
}): {
  confirmEvidence: BusinessCardReviewEvidence | null;
  draft: BusinessCardReviewDraft;
  provenance: BusinessCardReviewProvenance;
  reviewEvidence: BusinessCardReviewEvidence | null;
} {
  const sourceEvidenceItems = sourceEvidence({
    contact: input.contact,
    graph: input.graph,
  });
  const reviewEvidence =
    input.mode === "reviewed" || input.mode === "confirmed"
      ? buildReviewEvidence({
          contact: input.contact,
          now: input.now,
          reviewerLabel: input.reviewerLabel,
        })
      : null;
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
    ...(reviewEvidence ? [reviewEvidence] : []),
    ...(confirmEvidence ? [confirmEvidence] : []),
  ];
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const fields = buildFields({
    contact: input.contact,
    evidenceId: sourceEvidenceItems[0]?.evidenceId ?? evidenceIds[0] ?? "",
    mode: input.mode === "pending" ? "pending" : "reviewed",
    reviewedFields: input.reviewedFields,
  });
  const provenance = provenanceFor({
    evidenceIds,
    generatedAt: input.generatedAt,
    generationMethod:
      input.mode === "confirmed"
        ? "live-store-confirmation"
        : input.mode === "reviewed"
          ? "live-store-review"
          : "live-store-query",
    provider: input.provider,
  });
  const draft: BusinessCardReviewDraft = {
    id: draftIdFor(input.contact.id),
    status:
      input.mode === "confirmed"
        ? "confirmed"
        : input.mode === "reviewed"
          ? "reviewed"
          : "pending_review",
    source: sourceFor(input.contact),
    extractedFields: fields,
    displayName: reviewedValueFor(fields, "displayName"),
    role: reviewedValueFor(fields, "role"),
    organization: reviewedValueFor(fields, "organization"),
    email: reviewedValueFor(fields, "email"),
    phone: reviewedValueFor(fields, "phone"),
    relationshipContext:
      input.contact.profileSnippet ??
      `${input.contact.displayName} was sourced from a live business-card OCR contact record.`,
    suggestedNextAction:
      "Review the source-backed business card fields before sending the candidate to contact write.",
    confirmation: {
      required: true,
      state: input.mode === "confirmed" ? "confirmed" : "pending",
      question: `Confirm adding ${input.contact.displayName} after reviewing the live business card fields?`,
      ...(input.mode === "confirmed"
        ? {
            actorLabel: actorLabelFor(input.actorLabel),
            confirmedAt: input.now,
          }
        : {}),
    },
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    aiProviderCalled: false,
    ocrProviderCalled: false,
    notificationDelivered: false,
    evidence,
    provenance,
    createdAt: input.contact.createdAt,
    ...(input.mode === "reviewed" || input.mode === "confirmed"
      ? {
          reviewedAt: input.now,
          reviewedBy: actorLabelFor(input.reviewerLabel),
        }
      : {}),
  };

  return {
    confirmEvidence,
    draft,
    provenance,
    reviewEvidence,
  };
}

function emptyPayload(input: {
  generatedAt: string;
  provider: LiveBusinessCardReviewProvider;
}): BusinessCardReviewPayload {
  return {
    state: "empty",
    reviewDraft: null,
    reviewEvidence: null,
    summary: "No live business-card OCR contacts are ready for review.",
    provenance: provenanceFor({
      evidenceIds: [],
      generatedAt: input.generatedAt,
      provider: input.provider,
    }),
    nextAction: "Wait for source-backed business card contacts before reviewing.",
    contactCandidateReady: false,
  };
}

async function readGraph(input: {
  now: string;
  provider?: LiveBusinessCardReviewProvider | null;
}): Promise<ReadBusinessCardGraphResult> {
  if (!input.provider) {
    return failure(
      "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  try {
    return {
      graph: await input.provider.readBusinessCardReviewGraph(),
      provider: input.provider,
    };
  } catch {
    return failure(
      "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:business-card-review-live-store-failed"],
        generatedAt: input.now,
        provider: input.provider,
        readExecuted: true,
      }),
    );
  }
}

function findContact(input: {
  draftId: string;
  graph: LiveBusinessCardReviewGraph;
}): ContactDTO | null {
  const contactId = contactIdFromDraftId(input.draftId);

  return (
    businessCardContacts(input.graph).find(
      (contact) => contact.id === contactId,
    ) ?? null
  );
}

function buildReviewPayload(input: {
  contact: ContactDTO;
  graph: LiveBusinessCardReviewGraph;
  mode: "pending" | "reviewed";
  now: string;
  provider: LiveBusinessCardReviewProvider;
  reviewedFields?: Partial<BusinessCardReviewedFields> | null;
  reviewerLabel?: string | null;
}): BusinessCardReviewPayload {
  const { draft, provenance, reviewEvidence } = buildDraft({
    contact: input.contact,
    generatedAt: input.graph.generatedAt,
    graph: input.graph,
    mode: input.mode,
    now: input.now,
    provider: input.provider,
    reviewedFields: input.reviewedFields,
    reviewerLabel: input.reviewerLabel,
  });

  return {
    state: input.mode === "pending" ? "success" : "success",
    reviewDraft: draft,
    reviewEvidence,
    summary:
      input.mode === "reviewed"
        ? "Live business card fields were reviewed without writing contacts."
        : "Live business-card OCR contact fields are ready for human review.",
    provenance,
    nextAction:
      input.mode === "reviewed"
        ? "Confirm the reviewed business card candidate before contact write."
        : "Review the source-backed fields before confirming the candidate.",
    contactCandidateReady: input.mode === "reviewed",
  };
}

export function createLiveBusinessCardReviewService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveBusinessCardReviewServiceOptions = {}): BusinessCardReviewService {
  return {
    async getReviewDraft(input): Promise<BusinessCardReviewResult> {
      const scenario = normalizeReviewScenario(input.scenario);
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isFailureResult(readResult)) {
        return readResult;
      }

      if (scenario === "failure") {
        return failure(
          "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-scenario-failed"],
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

      const contact = findContact({
        draftId: input.draftId,
        graph: readResult.graph,
      });

      if (!contact) {
        return failure(
          "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-draft-missing"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      return success(
        buildReviewPayload({
          contact,
          graph: readResult.graph,
          mode: "pending",
          now: now(),
          provider: readResult.provider,
        }),
      );
    },

    async updateReviewDraft(input): Promise<BusinessCardReviewResult> {
      const scenario = normalizeReviewScenario(input.scenario);
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isFailureResult(readResult)) {
        return readResult;
      }

      if (scenario === "failure") {
        return failure(
          "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-scenario-failed"],
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

      if (scenario === "pending") {
        const contact = findContact({
          draftId: input.draftId,
          graph: readResult.graph,
        });

        if (!contact) {
          return failure(
            "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
            provenanceFor({
              evidenceIds: ["evidence:business-card-review-live-draft-missing"],
              generatedAt: readResult.graph.generatedAt,
              provider: readResult.provider,
            }),
          );
        }

        return success(
          buildReviewPayload({
            contact,
            graph: readResult.graph,
            mode: "pending",
            now: now(),
            provider: readResult.provider,
          }),
        );
      }

      if (input.reviewedFields && !hasAnyReviewedField(input.reviewedFields)) {
        return failure(
          "BUSINESS_CARD_REVIEW_FIELDS_REQUIRED",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-fields-required"],
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
          "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-draft-missing"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      return success(
        buildReviewPayload({
          contact,
          graph: readResult.graph,
          mode: "reviewed",
          now: now(),
          provider: readResult.provider,
          reviewedFields: input.reviewedFields,
          reviewerLabel: input.reviewerLabel,
        }),
      );
    },

    async confirmReviewedDraft(
      input: BusinessCardReviewConfirmInput,
    ): Promise<BusinessCardReviewConfirmationResult> {
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
          "BUSINESS_CARD_REVIEW_PENDING",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-pending"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      if (scenario === "blocked") {
        return failure(
          "BUSINESS_CARD_REVIEW_CONFIRMATION_NOT_ALLOWED",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-blocked"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      if (scenario === "failure") {
        return failure(
          "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-scenario-failed"],
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
          "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:business-card-review-live-draft-missing"],
            generatedAt: readResult.graph.generatedAt,
            provider: readResult.provider,
          }),
        );
      }

      const { confirmEvidence, draft, provenance } = buildDraft({
        actorLabel: input.actorLabel,
        contact,
        generatedAt: readResult.graph.generatedAt,
        graph: readResult.graph,
        mode: "confirmed",
        now: now(),
        provider: readResult.provider,
        reviewerLabel: input.actorLabel,
      });
      const createdEvidence = confirmEvidence ?? buildConfirmEvidence({
        actorLabel: input.actorLabel,
        contact,
        now: now(),
      });

      return confirmationSuccess({
        state: "confirmed",
        confirmedDraft: draft,
        contactCandidate: {
          candidateId: `contact-candidate:business-card-review:live:${contact.id}`,
          displayName: draft.displayName,
          role: draft.role,
          organization: draft.organization,
          email: draft.email,
          phone: draft.phone,
          relationshipContext: draft.relationshipContext,
          source: draft.source,
          evidenceIds: provenance.evidenceIds,
          readyForContactWrite: true,
          contactWriteExecuted: false,
        },
        createdEvidence,
        confirmedAt: now(),
        provenance,
        nextAction:
          "Send the reviewed live business card candidate to the contact service with source and evidence ids intact.",
      });
    },
  };
}
