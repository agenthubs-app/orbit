import {
  MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS,
  mockEmptyManualContactCreationFixture,
  mockManualContactConfirmedFixture,
  mockManualContactCreationFailureProvenance,
  mockManualContactCreationFixture,
  mockManualContactDraft,
  mockManualContactEvidence,
  mockPendingManualContactCreationFixture,
  type ManualContactConfirmationInput,
  type ManualContactConfirmationPayload,
  type ManualContactConfirmationResult,
  type ManualContactConfirmationScenario,
  type ManualContactConfirmationSuccess,
  type ManualContactCreationErrorCode,
  type ManualContactCreationFailure,
  type ManualContactCreationInput,
  type ManualContactCreationPayload,
  type ManualContactCreationResult,
  type ManualContactCreationScenario,
  type ManualContactCreationService,
  type ManualContactCreationSuccess,
  type ManualContactDraft,
  type ManualContactEvidence,
  type ManualContactSourceReference,
} from "./manual-contract";

const supportedCreationScenarios = new Set<ManualContactCreationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<ManualContactConfirmationScenario>([
    "success",
    "blocked",
    "failure",
  ]);

// ManualContactCreation mock service 模拟手动录入联系人。
// 它只生成/确认本地草稿，不执行真实联系人写入或重复联系人查询。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ManualContactCreationPayload,
): ManualContactCreationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: ManualContactConfirmationPayload,
): ManualContactConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ManualContactCreationErrorCode,
): ManualContactCreationFailure {
  // failure 带固定 mock provenance，API route 可以稳定构造错误响应。
  const definition = MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockManualContactCreationFailureProvenance,
      evidenceIds: mockManualContactCreationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeCreationScenario(
  scenario?: ManualContactCreationInput["scenario"],
): ManualContactCreationScenario {
  if (
    scenario &&
    supportedCreationScenarios.has(scenario as ManualContactCreationScenario)
  ) {
    return scenario as ManualContactCreationScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: ManualContactConfirmationInput["scenario"],
): ManualContactConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as ManualContactConfirmationScenario,
    )
  ) {
    return scenario as ManualContactConfirmationScenario;
  }

  return "success";
}

function normalizeTags(tags?: readonly string[] | null): readonly string[] {
  // 空 tags 回落到 fixture 默认标签；非空 tags 会 trim 并过滤空字符串。
  const normalizedTags =
    tags
      ?.map((tag) => tag.trim())
      .filter((tag) => tag.length > 0) ?? [];

  return normalizedTags.length > 0 ? normalizedTags : mockManualContactDraft.tags;
}

function resolveActorLabel(actorLabel?: string | null): string {
  const normalizedActor = actorLabel?.trim();

  return normalizedActor ? normalizedActor : "Demo operator";
}

function buildSourceReference(
  source?: Partial<ManualContactSourceReference> | null,
): ManualContactSourceReference {
  // 手动录入强制 source.type=manual，避免外部输入伪装成其它来源。
  return {
    ...mockManualContactDraft.source,
    ...source,
    type: "manual",
    label: source?.label?.trim() || mockManualContactDraft.source.label,
  };
}

function inputMatchesFixture(input: ManualContactCreationInput): boolean {
  return (
    input.note === undefined &&
    input.tags === undefined &&
    input.followUpHint === undefined &&
    input.source === undefined
  );
}

function shouldFlagPossibleDuplicate(
  note: string,
  tags: readonly string[],
): boolean {
  // duplicate check 是本地关键词模拟，只用于 UI 展示确认流程，不查真实联系人库。
  const normalizedNote = note.toLowerCase();
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  return (
    normalizedNote.includes("duplicate") ||
    normalizedTags.some((tag) => tag.includes("duplicate"))
  );
}

function buildRuleEvidence(
  source: ManualContactSourceReference,
  note: string,
): ManualContactEvidence {
  return {
    ...mockManualContactEvidence,
    evidenceId: "evidence:manual-note-rule-based",
    source,
    excerpt: note,
    sourceLabel: "Rule-based manual note intake",
  };
}

function buildRuleBasedDraft(
  input: ManualContactCreationInput,
): ManualContactDraft {
  // 非默认输入会通过本地规则派生 draft/evidence/provenance。
  const source = buildSourceReference(input.source);
  const note = input.note?.trim() || mockManualContactDraft.note;
  const tags = normalizeTags(input.tags);
  const followUpHint =
    input.followUpHint?.trim() || mockManualContactDraft.followUpHint;
  const possibleDuplicate = shouldFlagPossibleDuplicate(note, tags);
  const evidence = buildRuleEvidence(source, note);

  return {
    ...mockManualContactDraft,
    source,
    note,
    tags,
    followUpHint,
    evidence: [evidence],
    duplicateCheck: {
      ...mockManualContactDraft.duplicateCheck,
      result: possibleDuplicate ? "possible_match" : "clear",
      possibleMatchIds: possibleDuplicate ? ["contact:demo-kenji-existing"] : [],
    },
    provenance: {
      ...mockManualContactDraft.provenance,
      evidenceIds: [evidence.evidenceId],
      generationMethod: "rule-based-manual-contact",
      sourceLabel: "Rule-based manual contact draft",
    },
  };
}

function buildRuleBasedPayload(
  input: ManualContactCreationInput,
): ManualContactCreationPayload {
  const draft = buildRuleBasedDraft(input);

  return {
    ...mockManualContactCreationFixture,
    draft,
    provenance: draft.provenance,
    summary:
      "A manual contact draft was staged from rule-based local input without persistence or live duplicate lookup.",
  };
}

function buildConfirmationPayload(
  draft: ManualContactDraft,
  actorLabel?: string | null,
): ManualContactConfirmationPayload {
  // confirmation payload 表示“准备好写入联系人”，但 contactWriteExecuted 仍为 false。
  if (
    draft.id === mockManualContactConfirmedFixture.confirmedDraft.id &&
    resolveActorLabel(actorLabel) === "Demo operator"
  ) {
    return mockManualContactConfirmedFixture;
  }

  const basePayload = mockManualContactConfirmedFixture;
  const createdEvidence: ManualContactEvidence = {
    ...basePayload.createdEvidence,
    evidenceId: `evidence:manual-contact-confirmed:${draft.id}`,
    source: draft.source,
    excerpt: `${resolveActorLabel(actorLabel)} confirmed ${
      draft.displayName
    } from manual source evidence.`,
  };
  const confirmedDraft: ManualContactDraft = {
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
      generationMethod: "rule-based-manual-contact",
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
      note: draft.note,
      tags: draft.tags,
      followUpHint: draft.followUpHint,
      evidenceIds: confirmedDraft.provenance.evidenceIds,
      readyForContactWrite: true,
      contactWriteExecuted: false,
      duplicateLookupExecuted: false,
    },
    createdEvidence,
    provenance: confirmedDraft.provenance,
  };
}

export function createMockManualContactCreationService(): ManualContactCreationService {
  // create 阶段生成草稿；confirm 阶段生成候选 contact 和 confirmation evidence。
  return {
    createManualContactDraft(input = {}): ManualContactCreationResult {
      switch (normalizeCreationScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyManualContactCreationFixture);
        case "pending":
          return success(mockPendingManualContactCreationFixture);
        case "failure":
          return failure("MANUAL_CONTACT_CREATION_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.note !== undefined && !input.note?.trim()) {
        return failure("MANUAL_CONTACT_NOTE_REQUIRED");
      }

      return success(
        inputMatchesFixture(input)
          ? mockManualContactCreationFixture
          : buildRuleBasedPayload(input),
      );
    },

    confirmManualContactDraft(input): ManualContactConfirmationResult {
      switch (normalizeConfirmationScenario(input.scenario)) {
        case "failure":
          return failure("MANUAL_CONTACT_CREATION_MOCK_FAILED");
        case "blocked":
          return failure("MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED");
        case "success":
        default:
          break;
      }

      if (input.draftId !== mockManualContactDraft.id) {
        return failure("MANUAL_CONTACT_DRAFT_NOT_FOUND");
      }

      return confirmationSuccess(
        buildConfirmationPayload(mockManualContactDraft, input.actorLabel),
      );
    },
  };
}

export type {
  ManualContactConfirmationResult,
  ManualContactCreationResult,
};
