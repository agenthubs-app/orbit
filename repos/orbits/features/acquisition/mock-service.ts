import {
  CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS,
  type ContactAcquisitionDraft,
  type ContactAcquisitionDraftErrorCode,
  type ContactAcquisitionDraftFailure,
  type ContactAcquisitionDraftInput,
  type ContactAcquisitionDraftPayload,
  type ContactAcquisitionDraftResult,
  type ContactAcquisitionDraftScenario,
  type ContactAcquisitionDraftSuccess,
  type ContactDraftConfirmationInput,
  type ContactDraftConfirmationPayload,
  type ContactDraftConfirmationResult,
  type ContactDraftConfirmationScenario,
  type ContactDraftConfirmationSuccess,
} from "./contract";
import {
  mockContactAcquisitionDraftFailureProvenance,
  mockContactAcquisitionDraftFixture,
  mockContactAcquisitionDrafts,
  mockContactDraftConfirmedFixture,
  mockEmptyContactAcquisitionDraftFixture,
  mockPendingContactAcquisitionDraftFixture,
} from "./fixtures";
import type { ContactAcquisitionDraftService } from "./service";

export interface MockContactAcquisitionDraftService
  extends ContactAcquisitionDraftService {
  listContactDrafts: (
    input?: ContactAcquisitionDraftInput,
  ) => ContactAcquisitionDraftResult;
  confirmContactDraft: (
    input: ContactDraftConfirmationInput,
  ) => ContactDraftConfirmationResult;
}

// ContactAcquisitionDraft mock service 是统一的联系人草稿管线。
// 它汇总来自不同 intake 的候选联系人，并模拟“确认草稿”到 contact candidate 的过程，
// 但不会写入真实 contacts 表。
const supportedListScenarios = new Set<ContactAcquisitionDraftScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<ContactDraftConfirmationScenario>([
    "success",
    "failure",
    "blocked",
  ]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // draft payload 包含嵌套 evidence/provenance，返回 clone 避免 UI 直接改 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ContactAcquisitionDraftPayload,
): ContactAcquisitionDraftSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: ContactDraftConfirmationPayload,
): ContactDraftConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ContactAcquisitionDraftErrorCode,
): ContactAcquisitionDraftFailure {
  // 失败分支统一带 mock provenance，说明这是草稿管线本地边界里的受控失败。
  const definition = CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockContactAcquisitionDraftFailureProvenance,
      evidenceIds: mockContactAcquisitionDraftFailureProvenance.evidenceIds,
    },
  };
}

function normalizeListScenario(
  scenario?: ContactAcquisitionDraftInput["scenario"],
): ContactAcquisitionDraftScenario {
  if (
    scenario &&
    supportedListScenarios.has(scenario as ContactAcquisitionDraftScenario)
  ) {
    return scenario as ContactAcquisitionDraftScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: ContactDraftConfirmationInput["scenario"],
): ContactDraftConfirmationScenario {
  // confirmation 额外支持 blocked，用来测试“需要人工确认但不允许执行”的状态。
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as ContactDraftConfirmationScenario,
    )
  ) {
    return scenario as ContactDraftConfirmationScenario;
  }

  return "success";
}

function findDraft(id: string): ContactAcquisitionDraft | undefined {
  return mockContactAcquisitionDrafts.find((draft) => draft.id === id);
}

function resolveActorLabel(actorLabel?: string | null): string {
  // actorLabel 缺省时使用 Demo operator，保证 confirmation evidence 文案稳定。
  const normalizedActor = actorLabel?.trim();

  return normalizedActor ? normalizedActor : "Demo operator";
}

function buildConfirmationPayload(
  draft: ContactAcquisitionDraft,
  actorLabel?: string | null,
): ContactDraftConfirmationPayload {
  // 默认 fixture 命中时直接返回固定 payload；其它草稿走规则派生，保持测试可预测。
  if (
    draft.id === mockContactDraftConfirmedFixture.confirmedDraft.id &&
    resolveActorLabel(actorLabel) === "Demo operator"
  ) {
    return mockContactDraftConfirmedFixture;
  }

  const basePayload = mockContactDraftConfirmedFixture;
  const createdEvidence = {
    ...basePayload.createdEvidence,
    evidenceId: `evidence:contact-draft-confirmed:${draft.id}`,
    source: draft.source,
    excerpt: `${resolveActorLabel(actorLabel)} confirmed ${draft.displayName} after reviewing source evidence.`,
  };
  const confirmedDraft: ContactAcquisitionDraft = {
    ...draft,
    status: "confirmed",
    confirmation: {
      ...draft.confirmation,
      state: "confirmed",
      actorLabel: resolveActorLabel(actorLabel),
      confirmedAt: basePayload.confirmedAt,
    },
    evidence: [...draft.evidence, createdEvidence],
    provenance: {
      ...draft.provenance,
      evidenceIds: [
        ...draft.provenance.evidenceIds,
        createdEvidence.evidenceId,
      ],
      generationMethod: "rule-based-contact-draft",
    },
  };

  return {
    ...basePayload,
    confirmedDraft,
    contactCandidate: {
      candidateId: `contact-candidate:${draft.id}`,
      displayName: draft.displayName,
      role: draft.role,
      organization: draft.organization,
      relationshipContext: draft.relationshipContext,
      source: draft.source,
      evidenceIds: confirmedDraft.provenance.evidenceIds,
      readyForContactWrite: true,
      contactWriteExecuted: false,
    },
    createdEvidence,
    provenance: confirmedDraft.provenance,
  };
}

export function createMockContactAcquisitionDraftService(): MockContactAcquisitionDraftService {
  // listContactDrafts 展示候选草稿；confirmContactDraft 只生成 readyForContactWrite 候选结果。
  return {
    listContactDrafts(input = {}): ContactAcquisitionDraftResult {
      switch (normalizeListScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyContactAcquisitionDraftFixture);
        case "pending":
          return success(mockPendingContactAcquisitionDraftFixture);
        case "failure":
          return failure("CONTACT_DRAFT_PIPELINE_FAILED");
        case "success":
        default:
          return success(mockContactAcquisitionDraftFixture);
      }
    },

    confirmContactDraft(input): ContactDraftConfirmationResult {
      switch (normalizeConfirmationScenario(input.scenario)) {
        case "failure":
          return failure("CONTACT_DRAFT_PIPELINE_FAILED");
        case "blocked":
          return failure("CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED");
        case "success":
        default:
          break;
      }

      const draft = findDraft(input.draftId);

      if (!draft) {
        return failure("CONTACT_DRAFT_NOT_FOUND");
      }

      if (draft.status !== "pending_confirmation") {
        return failure("CONTACT_DRAFT_ALREADY_CONFIRMED");
      }

      return confirmationSuccess(
        buildConfirmationPayload(draft, input.actorLabel),
      );
    },
  };
}

export type {
  ContactAcquisitionDraftResult,
  ContactDraftConfirmationResult,
};
