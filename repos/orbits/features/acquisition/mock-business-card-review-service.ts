import {
  BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS,
  mockBusinessCardReviewDraft,
  mockBusinessCardReviewFailureProvenance,
  mockBusinessCardReviewFixture,
  mockBusinessCardReviewUpdatedFixture,
  mockBusinessCardReviewConfirmedFixture,
  mockEmptyBusinessCardReviewFixture,
  mockPendingBusinessCardReviewFixture,
  type BusinessCardReviewConfirmInput,
  type BusinessCardReviewConfirmationResult,
  type BusinessCardReviewConfirmationScenario,
  type BusinessCardReviewConfirmationSuccess,
  type BusinessCardReviewDraft,
  type BusinessCardReviewErrorCode,
  type BusinessCardReviewEvidence,
  type BusinessCardReviewFailure,
  type BusinessCardReviewFieldMap,
  type BusinessCardReviewPayload,
  type BusinessCardReviewResult,
  type BusinessCardReviewScenario,
  type BusinessCardReviewService,
  type BusinessCardReviewSuccess,
  type BusinessCardReviewUpdateInput,
  type BusinessCardReviewedFields,
} from "./business-card-review-contract";

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
  payload: typeof mockBusinessCardReviewConfirmedFixture,
): BusinessCardReviewConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: BusinessCardReviewErrorCode): BusinessCardReviewFailure {
  const definition = BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockBusinessCardReviewFailureProvenance,
      evidenceIds: mockBusinessCardReviewFailureProvenance.evidenceIds,
    },
  };
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

function resolveReviewerLabel(reviewerLabel?: string | null): string {
  const normalizedReviewer = reviewerLabel?.trim();

  return normalizedReviewer ? normalizedReviewer : "Demo reviewer";
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

function buildRuleBasedFields(
  reviewedFields: Partial<BusinessCardReviewedFields>,
): BusinessCardReviewFieldMap {
  const displayName = buildRuleBasedField("displayName", reviewedFields);
  const role = buildRuleBasedField("role", reviewedFields);
  const organization = buildRuleBasedField("organization", reviewedFields);
  const email = buildRuleBasedField("email", reviewedFields);
  const phone = buildRuleBasedField("phone", reviewedFields);

  return {
    displayName,
    role,
    organization,
    email,
    phone,
  };
}

function buildRuleBasedField(
  fieldName: keyof BusinessCardReviewedFields,
  reviewedFields: Partial<BusinessCardReviewedFields>,
) {
  const baseField = mockBusinessCardReviewDraft.extractedFields[fieldName];
  const reviewedValue = reviewedFields[fieldName]?.trim() || baseField.value;

  return {
    ...baseField,
    reviewedValue,
    reviewState: reviewedValue === baseField.value ? "accepted" : "edited",
  } as const;
}

function buildRuleBasedReviewEvidence(
  draftId: string,
  reviewerLabel?: string | null,
): BusinessCardReviewEvidence {
  return {
    evidenceId: `evidence:business-card-review-reviewed:${draftId}`,
    source: mockBusinessCardReviewDraft.source,
    sourceLabel: "Rule-based business card field review",
    excerpt: `${resolveReviewerLabel(
      reviewerLabel,
    )} reviewed extracted card fields for ${draftId}.`,
    capturedFields: ["reviewer", "reviewedFields", "evidenceIds"],
    createdAt: "2026-06-25T12:08:00.000Z",
    createdBy: "mock-business-card-review-service",
  };
}

function buildRuleBasedReviewPayload(
  input: BusinessCardReviewUpdateInput,
): BusinessCardReviewPayload {
  const reviewedFields = input.reviewedFields ?? {};
  const fieldMap = buildRuleBasedFields(reviewedFields);
  const reviewEvidence = buildRuleBasedReviewEvidence(
    input.draftId,
    input.reviewerLabel,
  );
  const evidence = [...mockBusinessCardReviewDraft.evidence, reviewEvidence];
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const draft: BusinessCardReviewDraft = {
    ...mockBusinessCardReviewDraft,
    status: "reviewed",
    extractedFields: fieldMap,
    displayName: fieldMap.displayName.reviewedValue,
    role: fieldMap.role.reviewedValue,
    organization: fieldMap.organization.reviewedValue,
    email: fieldMap.email.reviewedValue,
    phone: fieldMap.phone.reviewedValue,
    evidence,
    provenance: {
      ...mockBusinessCardReviewDraft.provenance,
      evidenceIds,
      sourceLabel: "Rule-based business card review",
      generationMethod: "rule-based-card-review",
    },
    reviewedAt: reviewEvidence.createdAt,
    reviewedBy: resolveReviewerLabel(input.reviewerLabel),
  };

  return {
    ...mockBusinessCardReviewUpdatedFixture,
    reviewDraft: draft,
    reviewEvidence,
    provenance: draft.provenance,
  };
}

export function createMockBusinessCardReviewService(): BusinessCardReviewService {
  return {
    getReviewDraft(input): BusinessCardReviewResult {
      switch (normalizeReviewScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyBusinessCardReviewFixture);
        case "pending":
          return success(mockPendingBusinessCardReviewFixture);
        case "failure":
          return failure("BUSINESS_CARD_REVIEW_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.draftId !== mockBusinessCardReviewDraft.id) {
        return failure("BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND");
      }

      return success(mockBusinessCardReviewFixture);
    },

    updateReviewDraft(input): BusinessCardReviewResult {
      switch (normalizeReviewScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyBusinessCardReviewFixture);
        case "pending":
          return success(mockPendingBusinessCardReviewFixture);
        case "failure":
          return failure("BUSINESS_CARD_REVIEW_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.draftId !== mockBusinessCardReviewDraft.id) {
        return failure("BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND");
      }

      if (input.reviewedFields && !hasAnyReviewedField(input.reviewedFields)) {
        return failure("BUSINESS_CARD_REVIEW_FIELDS_REQUIRED");
      }

      return success(
        input.reviewedFields
          ? buildRuleBasedReviewPayload(input)
          : mockBusinessCardReviewUpdatedFixture,
      );
    },

    confirmReviewedDraft(
      input: BusinessCardReviewConfirmInput,
    ): BusinessCardReviewConfirmationResult {
      switch (normalizeConfirmationScenario(input.scenario)) {
        case "pending":
          return failure("BUSINESS_CARD_REVIEW_PENDING");
        case "blocked":
          return failure("BUSINESS_CARD_REVIEW_CONFIRMATION_NOT_ALLOWED");
        case "failure":
          return failure("BUSINESS_CARD_REVIEW_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.draftId !== mockBusinessCardReviewDraft.id) {
        return failure("BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND");
      }

      return confirmationSuccess(mockBusinessCardReviewConfirmedFixture);
    },
  };
}

export type {
  BusinessCardReviewConfirmationResult,
  BusinessCardReviewResult,
};
