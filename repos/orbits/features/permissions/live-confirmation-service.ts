import {
  CONFIRMATION_GUARD_ERROR_DEFINITIONS,
  type ConfirmationDecisionInput,
  type ConfirmationDecisionPayload,
  type ConfirmationDecisionResult,
  type ConfirmationDecisionScenario,
  type ConfirmationDecisionStatus,
  type ConfirmationEvidence,
  type ConfirmationGuardErrorCode,
  type ConfirmationGuardFailure,
  type ConfirmationGuardInput,
  type ConfirmationGuardProvenance,
  type ConfirmationGuardScenario,
  type ConfirmationRequirement,
  type ConfirmationRequirementPayload,
  type ConfirmationRequirementResult,
  type SensitiveActionConfirmationService,
} from "./confirmation-contract";
import {
  mockConfirmationGuardFixture,
  mockConfirmationGuardProvenance,
  mockConfirmationRequirements,
  mockEmptyConfirmationGuardFixture,
  mockPendingConfirmationGuardFixture,
} from "./mock-confirmation-service";

const LIVE_CONFIRMATION_GUARD_SOURCE =
  "live-policy:features/permissions/live-confirmation-service.ts";
const collectedAt = "2026-07-01T00:02:00.000Z";
const createdAt = "2026-07-01T00:03:00.000Z";
const decidedAt = "2026-07-01T00:04:00.000Z";
const liveRequirementIds = [
  "live-confirmation-send-message",
  "live-confirmation-add-contact",
  "live-confirmation-create-calendar-event",
  "live-confirmation-update-profile",
] as const;
const supportedGuardScenarios = new Set<ConfirmationGuardScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const supportedDecisionScenarios = new Set<ConfirmationDecisionScenario>([
  "success",
  "failure",
  "blocked",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function liveProvenance(input: {
  evidenceIds: readonly string[];
  sourceLabel: string;
}): ConfirmationGuardProvenance {
  return {
    ...mockConfirmationGuardProvenance,
    source: LIVE_CONFIRMATION_GUARD_SOURCE,
    sourceLabel: input.sourceLabel,
    evidenceIds: input.evidenceIds,
    collectedAt,
    privacy: "live-confirmation-guard-policy",
    generationMethod: "live-policy-confirmation-guard",
  };
}

function liveEvidence(evidence: ConfirmationEvidence): ConfirmationEvidence {
  return {
    ...clonePayload(evidence),
    collectedAt,
    sourceLabel: evidence.sourceLabel.replace(/^Mock /, "Live "),
  };
}

function liveRequirement(
  requirement: ConfirmationRequirement,
  index: number,
): ConfirmationRequirement {
  const evidence = requirement.evidence.map(liveEvidence);
  const evidenceIds = evidence.map((item) => item.evidenceId);

  return {
    ...clonePayload(requirement),
    createdAt,
    evidence,
    id: liveRequirementIds[index] ?? `live-confirmation-${index + 1}`,
    provenance: liveProvenance({
      evidenceIds,
      sourceLabel: "Live sensitive action confirmation policy",
    }),
  };
}

const liveRequirements = mockConfirmationRequirements.map(liveRequirement);

function livePayload(
  payload: ConfirmationRequirementPayload,
  sourceLabel: string,
): ConfirmationRequirementPayload {
  const cloned = clonePayload(payload);
  const requirements =
    cloned.state === "success"
      ? liveRequirements
      : cloned.state === "pending"
        ? [liveRequirements[0]].filter(
            (requirement): requirement is ConfirmationRequirement =>
              Boolean(requirement),
          )
        : [];
  const evidenceIds =
    requirements.length > 0
      ? requirements.flatMap((requirement) =>
          requirement.evidence.map((item) => item.evidenceId),
        )
      : cloned.provenance.evidenceIds;

  return {
    ...cloned,
    requirements,
    provenance: liveProvenance({
      evidenceIds,
      sourceLabel,
    }),
    summary: cloned.summary.replace(/^Four/, "Four live policy"),
  };
}

function failure(code: ConfirmationGuardErrorCode): ConfirmationGuardFailure {
  const definition = CONFIRMATION_GUARD_ERROR_DEFINITIONS[code];
  const provenance = liveProvenance({
    evidenceIds: ["evidence:confirmation-live-policy-failure"],
    sourceLabel: "Live sensitive action confirmation policy failure",
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

function normalizeGuardScenario(
  scenario?: ConfirmationGuardInput["scenario"],
): ConfirmationGuardScenario {
  if (
    scenario &&
    supportedGuardScenarios.has(scenario as ConfirmationGuardScenario)
  ) {
    return scenario as ConfirmationGuardScenario;
  }

  return "success";
}

function normalizeDecisionScenario(
  scenario?: ConfirmationDecisionInput["scenario"],
): ConfirmationDecisionScenario {
  if (
    scenario &&
    supportedDecisionScenarios.has(scenario as ConfirmationDecisionScenario)
  ) {
    return scenario as ConfirmationDecisionScenario;
  }

  return "success";
}

function findRequirement(id: string): ConfirmationRequirement | undefined {
  return liveRequirements.find((requirement) => requirement.id === id);
}

function actorLabel(input?: string | null): string {
  const normalized = input?.trim();

  return normalized || "Orbit operator";
}

function decisionPayload(
  status: ConfirmationDecisionStatus,
  requirement: ConfirmationRequirement,
  input: ConfirmationDecisionInput,
): ConfirmationDecisionPayload {
  const actionVerb = status === "approved" ? "approval" : "rejection";

  return {
    decision: {
      actorLabel: actorLabel(input.actorLabel),
      confirmationId: requirement.id,
      decidedAt,
      externalActionExecuted: false,
      id: `live-confirmation-decision:${requirement.id}:${status}`,
      outcomeSummary: `Live policy ${actionVerb} recorded. ${requirement.action.mockEffect}`,
      replacesOutboundAction: true,
      status,
    },
    nextAction:
      status === "approved"
        ? `Keep the approved action staged; ${requirement.action.mockEffect.toLowerCase()}`
        : "Keep the action in review and do not execute the external effect.",
    provenance: requirement.provenance,
    requirement: {
      ...requirement,
      status,
    },
    state: status,
  };
}

function resolveDecision(
  input: ConfirmationDecisionInput,
  status: ConfirmationDecisionStatus,
): ConfirmationDecisionResult {
  const scenario = normalizeDecisionScenario(input.scenario);

  if (scenario === "blocked") {
    return failure("CONFIRMATION_DECISION_NOT_ALLOWED");
  }

  if (scenario === "failure") {
    return failure("CONFIRMATION_GUARD_MOCK_FAILED");
  }

  const requirement = findRequirement(input.confirmationId);

  if (!requirement) {
    return failure("CONFIRMATION_REQUIREMENT_NOT_FOUND");
  }

  if (requirement.status !== "pending_confirmation") {
    return failure("CONFIRMATION_REQUIREMENT_ALREADY_RESOLVED");
  }

  return {
    success: true,
    data: decisionPayload(status, requirement, input),
  };
}

export function createLiveSensitiveActionConfirmationService(): SensitiveActionConfirmationService {
  return {
    approveConfirmation(input) {
      return resolveDecision(input, "approved");
    },
    listConfirmationRequirements(input = {}): ConfirmationRequirementResult {
      switch (normalizeGuardScenario(input.scenario)) {
        case "empty":
          return {
            success: true,
            data: livePayload(
              mockEmptyConfirmationGuardFixture,
              "Live empty sensitive action confirmation policy",
            ),
          };
        case "pending":
          return {
            success: true,
            data: livePayload(
              mockPendingConfirmationGuardFixture,
              "Live pending sensitive action confirmation policy",
            ),
          };
        case "failure":
          return failure("CONFIRMATION_GUARD_MOCK_FAILED");
        case "success":
        default:
          return {
            success: true,
            data: livePayload(
              mockConfirmationGuardFixture,
              "Live sensitive action confirmation policy",
            ),
          };
      }
    },
    rejectConfirmation(input) {
      return resolveDecision(input, "rejected");
    },
  };
}
