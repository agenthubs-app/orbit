import {
  MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS,
  MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS,
  mockEmptyMessageDraftGeneratorFixture,
  mockMessageDraftGeneratorFailureProvenance,
  mockMessageDraftGeneratorFixture,
  mockMessageDraftGeneratorProvenance,
  mockMessageDrafts,
  mockPendingMessageDraftGeneratorFixture,
  type MessageDraft,
  type MessageDraftGeneratorCreateInput,
  type MessageDraftGeneratorErrorCode,
  type MessageDraftGeneratorFailure,
  type MessageDraftGeneratorPayload,
  type MessageDraftGeneratorProvenance,
  type MessageDraftGeneratorResult,
  type MessageDraftGeneratorScenario,
  type MessageDraftGeneratorService,
  type MessageDraftGeneratorUpdateInput,
  type MessageDraftKind,
  type MessageDraftStatus,
} from "./message-draft-contract";

const supportedScenarios = new Set<MessageDraftGeneratorScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedStatuses = new Set<MessageDraftStatus>([
  "draft",
  "held_for_review",
  "ready_for_confirmation",
  "revised",
]);

// MessageDraftGenerator mock service 用规则生成/更新跟进消息草稿。
// 它不发送消息、不持久保存草稿，也不调用 AI 写作 provider。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
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
  // 失败 provenance 固定在 message draft mock 边界，说明没有外部发送或 AI 调用。
  const definition = MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockMessageDraftGeneratorFailureProvenance,
      evidenceIds: mockMessageDraftGeneratorFailureProvenance.evidenceIds,
    },
  };
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

function scenarioResult(
  scenario: MessageDraftGeneratorScenario,
): MessageDraftGeneratorResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyMessageDraftGeneratorFixture);
    case "pending":
      return success(mockPendingMessageDraftGeneratorFixture);
    case "failure":
      return failure("MESSAGE_DRAFT_GENERATOR_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function isDraftKind(value: unknown): value is MessageDraftKind {
  return (
    typeof value === "string" &&
    MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS.includes(value as MessageDraftKind)
  );
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusForInput(value: unknown): MessageDraftStatus {
  // 更新草稿时未知 status 回落到 revised，保证编辑动作有稳定结果。
  return typeof value === "string" &&
    supportedStatuses.has(value as MessageDraftStatus)
    ? (value as MessageDraftStatus)
    : "revised";
}

function selectedDrafts(
  input: MessageDraftGeneratorCreateInput,
): readonly MessageDraft[] {
  // draftKind 是可选过滤；不传时返回全部本地草稿类型。
  if (isDraftKind(input.draftKind)) {
    return mockMessageDrafts.filter((draft) => draft.kind === input.draftKind);
  }

  return mockMessageDrafts;
}

function uniqueEvidenceIds(drafts: readonly MessageDraft[]): readonly string[] {
  if (drafts.length === 0) {
    return ["evidence:message-draft-empty"];
  }

  return [...new Set(drafts.flatMap((draft) => draft.evidenceIds))];
}

function provenanceForDrafts(input: {
  drafts: readonly MessageDraft[];
  sourceLabel: string;
  generationMethod: MessageDraftGeneratorProvenance["generationMethod"];
}): MessageDraftGeneratorProvenance {
  return {
    ...mockMessageDraftGeneratorProvenance,
    evidenceIds: uniqueEvidenceIds(input.drafts),
    generationMethod: input.generationMethod,
    sourceLabel: input.sourceLabel,
  };
}

function personalizeDraft(
  draft: MessageDraft,
  input: MessageDraftGeneratorCreateInput,
): MessageDraft {
  // 个性化只替换收件人、组织和上下文说明，不改变发送状态或 evidence。
  const recipientName = readText(input.recipientName);
  const organization = readText(input.organization);
  const contextNote = readText(input.contextNote);

  if (!recipientName && !organization && !contextNote) {
    return draft;
  }

  const personalizedBody = recipientName
    ? draft.body.replace(/^Hi [^,]+,/, `Hi ${recipientName},`)
    : draft.body;

  return {
    ...draft,
    recipientName: recipientName ?? draft.recipientName,
    organization: organization ?? draft.organization,
    relationshipContext: contextNote ?? draft.relationshipContext,
    body: contextNote
      ? `${personalizedBody}\n\nContext note: ${contextNote}`
      : personalizedBody,
  };
}

function buildCreatePayload(
  input: MessageDraftGeneratorCreateInput,
): MessageDraftGeneratorPayload {
  // create payload 按输入生成一组草稿，并同步 provenance evidenceIds。
  const drafts = selectedDrafts(input).map((draft) =>
    personalizeDraft(draft, input),
  );
  const hasDrafts = drafts.length > 0;

  if (!hasDrafts) {
    return mockEmptyMessageDraftGeneratorFixture;
  }

  return {
    ...mockMessageDraftGeneratorFixture,
    state: "success",
    drafts,
    summary:
      drafts.length === 1
        ? `Local rules prepared one ${drafts[0].kind.replaceAll("_", " ")} draft from source-backed relationship context.`
        : "Local rules prepared greeting, follow-up, appointment, introduction request, invitation, and thank-you drafts from source-backed relationship context.",
    provenance: provenanceForDrafts({
      drafts,
      generationMethod: "rule-based-draft-generation",
      sourceLabel: "Mock message draft generation rule",
    }),
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
  };
}

function findDraftById(draftId: string): MessageDraft | null {
  return mockMessageDrafts.find((draft) => draft.draftId === draftId) ?? null;
}

function buildUpdatedDraft(
  draft: MessageDraft,
  input: MessageDraftGeneratorUpdateInput,
): MessageDraft {
  // update 只是把 reviewer/user edits 追加到 body，模拟本地复核后的版本。
  const userEdits = readText(input.userEdits);
  const reviewerLabel = readText(input.reviewerLabel) ?? "Local reviewer";

  return {
    ...draft,
    status: statusForInput(input.status),
    body: userEdits
      ? `${draft.body}\n\n${reviewerLabel} edit: ${userEdits}`
      : draft.body,
  };
}

function buildUpdatePayload(
  draft: MessageDraft,
  input: MessageDraftGeneratorUpdateInput,
): MessageDraftGeneratorPayload {
  const updatedDraft = buildUpdatedDraft(draft, input);

  return {
    ...mockMessageDraftGeneratorFixture,
    state: "success",
    drafts: [updatedDraft],
    summary:
      "Local rules updated one message draft without sending, persisting, or invoking AI writing providers.",
    provenance: provenanceForDrafts({
      drafts: [updatedDraft],
      generationMethod: "rule-based-update",
      sourceLabel: "Mock message draft update rule",
    }),
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
  };
}

export function createMockMessageDraftGeneratorService(): MessageDraftGeneratorService {
  // createDraft 生成候选草稿；updateDraft 要求已有 draftId，避免凭空更新。
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

      const draft = findDraftById(draftId);

      if (!draft) {
        return failure("MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND");
      }

      return success(buildUpdatePayload(draft, input));
    },
  };
}

export type { MessageDraftGeneratorResult };
