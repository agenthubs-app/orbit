import {
  REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS,
  REFERRAL_SOURCE_KINDS,
  mockConfirmedRecommendedContactFixture,
  mockEmptyReferralRecommendationFixture,
  mockPendingReferralRecommendationFixture,
  mockRecommendedContacts,
  mockReferralContactDrafts,
  mockReferralRecommendationFailureProvenance,
  mockReferralRecommendationFixture,
  mockReferralSourceSummaries,
  type RecommendedContact,
  type RecommendedContactConfirmInput,
  type RecommendedContactConfirmationResult,
  type RecommendedContactConfirmationSuccess,
  type ReferralContactDraft,
  type ReferralRecommendationErrorCode,
  type ReferralRecommendationFailure,
  type ReferralRecommendationConfirmScenario,
  type ReferralRecommendationInput,
  type ReferralRecommendationPayload,
  type ReferralRecommendationResult,
  type ReferralRecommendationScenario,
  type ReferralRecommendationService,
  type ReferralRecommendationSuccess,
  type ReferralSourceKind,
  type ReferralSourceSummary,
} from "./referral-contract";

const supportedScenarios = new Set<ReferralRecommendationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<ReferralRecommendationConfirmScenario>([
    "success",
    "pending",
    "blocked",
    "failure",
  ]);

const supportedSourceKinds = new Set<ReferralSourceKind>(
  REFERRAL_SOURCE_KINDS,
);

// ReferralRecommendation mock service 模拟从推荐人/介绍来源生成联系人草稿。
// 它按 sourceKind 过滤本地 fixture，不联系推荐人、不创建真实联系人，也不发送介绍请求。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ReferralRecommendationPayload,
): ReferralRecommendationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(): RecommendedContactConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(mockConfirmedRecommendedContactFixture),
  };
}

function failure(
  code: ReferralRecommendationErrorCode,
): ReferralRecommendationFailure {
  // 推荐失败保留在 mock referral 边界内，避免误导为真实推荐系统失败。
  const definition = REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockReferralRecommendationFailureProvenance,
      evidenceIds: mockReferralRecommendationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ReferralRecommendationInput["scenario"],
): ReferralRecommendationScenario {
  if (scenario && supportedScenarios.has(scenario as ReferralRecommendationScenario)) {
    return scenario as ReferralRecommendationScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: RecommendedContactConfirmInput["scenario"],
): ReferralRecommendationConfirmScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as ReferralRecommendationConfirmScenario,
    )
  ) {
    return scenario as ReferralRecommendationConfirmScenario;
  }

  return "success";
}

function normalizeSourceKind(
  sourceKind?: ReferralRecommendationInput["sourceKind"],
): ReferralSourceKind | null {
  if (sourceKind === undefined || sourceKind === null) {
    return null;
  }

  const normalized = sourceKind.trim();

  if (!normalized) {
    return null;
  }

  if (supportedSourceKinds.has(normalized as ReferralSourceKind)) {
    return normalized as ReferralSourceKind;
  }

  return null;
}

function sourceKindFailure(
  sourceKind?: ReferralRecommendationInput["sourceKind"],
): ReferralRecommendationFailure | null {
  // sourceKind 显式传入但不在白名单时要失败；未传或空字符串表示不过滤。
  if (sourceKind === undefined || sourceKind === null || sourceKind.trim() === "") {
    return null;
  }

  if (!supportedSourceKinds.has(sourceKind as ReferralSourceKind)) {
    return failure("REFERRAL_SOURCE_NOT_SUPPORTED");
  }

  return null;
}

function filterSources(
  sourceKind: ReferralSourceKind | null,
): readonly ReferralSourceSummary[] {
  if (!sourceKind) {
    return mockReferralSourceSummaries;
  }

  return mockReferralSourceSummaries.filter(
    (source) => source.kind === sourceKind,
  );
}

function filterRecommendations(
  sourceKind: ReferralSourceKind | null,
): readonly RecommendedContact[] {
  if (!sourceKind) {
    return mockRecommendedContacts;
  }

  return mockRecommendedContacts.filter(
    (recommendation) => recommendation.sourceKind === sourceKind,
  );
}

function filterDrafts(
  sourceKind: ReferralSourceKind | null,
): readonly ReferralContactDraft[] {
  if (!sourceKind) {
    return mockReferralContactDrafts;
  }

  return mockReferralContactDrafts.filter(
    (draft) => draft.sourceKind === sourceKind,
  );
}

function buildRuleBasedPayload(
  sourceKind: ReferralSourceKind,
): ReferralRecommendationPayload {
  // 过滤后同步 recommendations、contactDrafts、referralSources 和 provenance evidenceIds。
  const recommendations = filterRecommendations(sourceKind);
  const contactDrafts = filterDrafts(sourceKind);
  const referralSources = filterSources(sourceKind);
  const state = recommendations.length > 0 ? "success" : "empty";
  const evidenceIds =
    recommendations.length > 0
      ? recommendations.flatMap((recommendation) => recommendation.evidenceIds)
      : ["evidence:referral:empty"];

  return {
    ...mockReferralRecommendationFixture,
    state,
    referralSources,
    recommendations,
    contactDrafts,
    summary:
      recommendations.length > 0
        ? `Local mock rules filtered referral recommendations by ${sourceKind}.`
        : `No local referral recommendations matched ${sourceKind}.`,
    provenance: {
      ...mockReferralRecommendationFixture.provenance,
      sourceLabel: "Rule-based referral recommendation source filter",
      evidenceIds,
      generationMethod: "rule-based-referral-recommendation",
    },
    nextAction:
      recommendations.length > 0
        ? "Review recommender context before confirming the filtered recommendation."
        : "Clear the local referral source filter before reviewing recommendations.",
  };
}

function scenarioResult(
  scenario: ReferralRecommendationScenario,
): ReferralRecommendationResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyReferralRecommendationFixture);
    case "pending":
      return success(mockPendingReferralRecommendationFixture);
    case "failure":
      return failure("REFERRAL_RECOMMENDATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function findRecommendation(
  recommendationId: string,
): RecommendedContact | null {
  return (
    mockRecommendedContacts.find(
      (recommendation) => recommendation.id === recommendationId,
    ) ?? null
  );
}

export function createMockReferralRecommendationService(): ReferralRecommendationService {
  // createReferralContactDrafts 只生成候选草稿；confirmRecommendedContact 只返回确认 payload。
  return {
    createReferralContactDrafts(input = {}): ReferralRecommendationResult {
      const resultForScenario = scenarioResult(
        normalizeScenario(input.scenario),
      );

      if (resultForScenario) {
        return resultForScenario;
      }

      const sourceFailure = sourceKindFailure(input.sourceKind);

      if (sourceFailure) {
        return sourceFailure;
      }

      const sourceKind = normalizeSourceKind(input.sourceKind);

      return success(
        sourceKind
          ? buildRuleBasedPayload(sourceKind)
          : mockReferralRecommendationFixture,
      );
    },

    confirmRecommendedContact(
      input: RecommendedContactConfirmInput,
    ): RecommendedContactConfirmationResult {
      switch (normalizeConfirmationScenario(input.scenario)) {
        case "pending":
          return failure("REFERRAL_RECOMMENDATION_PENDING");
        case "blocked":
          return failure("REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED");
        case "failure":
          return failure("REFERRAL_RECOMMENDATION_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (!findRecommendation(input.recommendationId)) {
        return failure("REFERRAL_RECOMMENDATION_NOT_FOUND");
      }

      return confirmationSuccess();
    },
  };
}

export type {
  RecommendedContactConfirmationResult,
  ReferralRecommendationResult,
};
