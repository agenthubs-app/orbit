/**
 * 联系人详情标签/状态编辑的 mock 服务。
 *
 * 这个服务模拟联系人详情页的读取和局部更新：标签、状态、备注、最近互动。
 * 更新结果只来自本地 fixture 和请求输入，不写真实联系人记录。
 */
import {
  CONTACT_DETAIL_STATUS_OPTIONS,
  CONTACT_DETAIL_TAG_OPTIONS,
  CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS,
  type ContactDetail,
  type ContactDetailLastInteractionChannel,
  type ContactDetailLastInteractionInput,
  type ContactDetailLastInteractionMetadata,
  type ContactDetailNote,
  type ContactDetailNoteInput,
  type ContactDetailStatusOption,
  type ContactDetailTagOption,
  type ContactDetailTagStatusErrorCode,
  type ContactDetailTagStatusFailure,
  type ContactDetailTagStatusFailureForCode,
  type ContactDetailTagStatusInvalidPatchBodyError,
  type ContactDetailTagStatusPayload,
  type ContactDetailTagStatusResult,
  type ContactDetailTagStatusScenario,
  type ContactDetailTagStatusService,
  type ContactDetailTagStatusUpdatePendingError,
  type ContactDetailUpdateInput,
} from "./detail-contract";
import {
  mockContactDetail,
  mockContactDetailFailureProvenance,
  mockContactDetailFixture,
  mockContactDetailSource,
  mockEmptyContactDetailFixture,
  mockPendingContactDetailFixture,
  mockUpdatedContactDetailLastInteraction,
  mockUpdatedContactDetailNote,
  mockUpdatedContactDetailProvenance,
} from "./detail-fixtures";

const supportedScenarios = new Set<ContactDetailTagStatusScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTags = new Set<ContactDetailTagOption>(
  CONTACT_DETAIL_TAG_OPTIONS,
);
const supportedStatuses = new Set<ContactDetailStatusOption>(
  CONTACT_DETAIL_STATUS_OPTIONS,
);
const supportedInteractionChannels = new Set<ContactDetailLastInteractionChannel>(
  ["event_note", "manual_note", "email_signal", "calendar_signal", "referral"],
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 联系人详情包含数组和嵌套对象，clone 可以避免 fixture 被调用方污染。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ContactDetailTagStatusPayload,
): ContactDetailTagStatusResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure<TCode extends ContactDetailTagStatusErrorCode>(
  code: TCode,
): ContactDetailTagStatusFailureForCode<TCode> {
  // 保留具体错误码类型，让 route 和测试能精确断言失败原因。
  const definition = CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockContactDetailFailureProvenance,
      evidenceIds: mockContactDetailFailureProvenance.evidenceIds,
    },
  } as ContactDetailTagStatusFailureForCode<TCode>;
}

function normalizeScenario(
  scenario?: ContactDetailUpdateInput["scenario"],
): ContactDetailTagStatusScenario {
  // scenario 只允许 contract 中定义的值，未知输入默认走 success 规则。
  if (
    scenario &&
    supportedScenarios.has(scenario as ContactDetailTagStatusScenario)
  ) {
    return scenario as ContactDetailTagStatusScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: ContactDetailTagStatusScenario,
): ContactDetailTagStatusResult | null {
  // get 路径中的 pending 表示页面状态 pending；不会被当作更新冲突。
  switch (scenario) {
    case "empty":
      return success(mockEmptyContactDetailFixture);
    case "pending":
      return success(mockPendingContactDetailFixture);
    case "failure":
      return failure("CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function updateScenarioResult(
  scenario: ContactDetailTagStatusScenario,
): ContactDetailTagStatusResult | null {
  // update 路径里的 pending 表示“更新暂不可执行”，因此返回错误而不是 pending payload。
  if (scenario === "pending") {
    return updatePendingFailure();
  }

  return scenarioResult(scenario);
}

function invalidPatchBodyFailure(): ContactDetailTagStatusInvalidPatchBodyError {
  return failure("CONTACT_DETAIL_INVALID_PATCH_BODY");
}

function updatePendingFailure(): ContactDetailTagStatusUpdatePendingError {
  return failure("CONTACT_DETAIL_UPDATE_PENDING");
}

function isDemoContact(contactId: string): boolean {
  // 当前 mock 只支持一个联系人详情，非 demo id 一律模拟 not found。
  return contactId.trim() === "demo-contact-1";
}

function normalizedValues(
  values?: readonly (string | null | undefined)[] | null,
): string[] {
  // 标签输入可能包含空值；先 trim 并去掉空字符串再做白名单判断。
  return (
    values
      ?.map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0) ?? []
  );
}

function unsupportedTagFailure(
  input: ContactDetailUpdateInput,
): ContactDetailTagStatusFailure | null {
  // tags/addTags/removeTags 三个入口都必须服从同一套可编辑标签白名单。
  const requestedTags = [
    ...normalizedValues(input.tags),
    ...normalizedValues(input.addTags),
    ...normalizedValues(input.removeTags),
  ];
  const hasUnsupportedTag = requestedTags.some(
    (tag) => !supportedTags.has(tag as ContactDetailTagOption),
  );

  return hasUnsupportedTag ? failure("CONTACT_DETAIL_TAG_NOT_SUPPORTED") : null;
}

function unsupportedStatusFailure(
  status?: ContactDetailUpdateInput["status"],
): ContactDetailTagStatusFailure | null {
  const normalizedStatus = status?.trim();

  if (
    normalizedStatus &&
    !supportedStatuses.has(normalizedStatus as ContactDetailStatusOption)
  ) {
    return failure("CONTACT_DETAIL_STATUS_NOT_SUPPORTED");
  }

  return null;
}

function uniqueTags(tags: readonly string[]): ContactDetailTagOption[] {
  return Array.from(new Set(tags)) as ContactDetailTagOption[];
}

function applyTagRules(
  input: ContactDetailUpdateInput,
): ContactDetailTagOption[] {
  // tags 表示整体替换；addTags/removeTags 表示在当前 fixture 标签上做增量修改。
  const replacementTags = normalizedValues(input.tags);

  if (input.tags) {
    return uniqueTags(replacementTags);
  }

  const removeTags = new Set(normalizedValues(input.removeTags));
  const retainedTags = mockContactDetail.tags.filter(
    (tag) => !removeTags.has(tag),
  );

  return uniqueTags([...retainedTags, ...normalizedValues(input.addTags)]);
}

function normalizeStatus(
  status?: ContactDetailUpdateInput["status"],
): ContactDetailStatusOption {
  return (status?.trim() as ContactDetailStatusOption) || mockContactDetail.status;
}

function normalizeNoteInput(
  note?: ContactDetailUpdateInput["note"],
): ContactDetailNoteInput | null {
  // note 既支持简写字符串，也支持带作者的对象；空白备注会被忽略。
  if (typeof note === "string") {
    const body = note.trim();

    return body ? { body } : null;
  }

  if (!note) {
    return null;
  }

  const body = note.body.trim();

  if (!body) {
    return null;
  }

  return {
    body,
    authorLabel: note.authorLabel?.trim() || "Orbit operator",
  };
}

function buildNote(note?: ContactDetailUpdateInput["note"]): ContactDetailNote | null {
  const noteInput = normalizeNoteInput(note);

  if (!noteInput) {
    return null;
  }

  return {
    ...mockUpdatedContactDetailNote,
    body: noteInput.body,
    authorLabel: noteInput.authorLabel || "Orbit operator",
  };
}

function normalizeInteractionChannel(
  channel?: string | null,
): ContactDetailLastInteractionChannel {
  if (
    channel &&
    supportedInteractionChannels.has(channel as ContactDetailLastInteractionChannel)
  ) {
    return channel as ContactDetailLastInteractionChannel;
  }

  return "manual_note";
}

function buildLastInteraction(
  input?: ContactDetailLastInteractionInput | null,
): ContactDetailLastInteractionMetadata {
  // 没传最近互动时，使用标准更新 fixture；传入后只覆盖安全字段。
  if (!input) {
    return clonePayload(mockUpdatedContactDetailLastInteraction);
  }

  return {
    ...mockUpdatedContactDetailLastInteraction,
    channel: normalizeInteractionChannel(input.channel),
    occurredAt:
      input.occurredAt?.trim() ||
      mockUpdatedContactDetailLastInteraction.occurredAt,
    summary:
      input.summary?.trim() || mockUpdatedContactDetailLastInteraction.summary,
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-tag-status-update"],
  };
}

function buildUpdatePayload(
  input: ContactDetailUpdateInput,
): ContactDetailTagStatusPayload {
  // 汇总所有可编辑字段，生成一个“可复核的更新结果”而不是写入真实联系人。
  const tags = applyTagRules(input);
  const status = normalizeStatus(input.status);
  const note = buildNote(input.note);
  const notes = note ? [...mockContactDetail.notes, note] : mockContactDetail.notes;
  const lastInteraction = buildLastInteraction(input.lastInteraction);
  const updatedContact: ContactDetail = {
    ...mockContactDetail,
    tags,
    status,
    notes,
    lastInteraction,
    updatedAt: lastInteraction.occurredAt,
  };

  return {
    state: "success",
    contact: updatedContact,
    editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
    editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
    summary:
      "Kenji Watanabe has a mock status and tag update ready for review.",
    provenance: clonePayload(mockUpdatedContactDetailProvenance),
    nextAction: "Use the updated tags and active status to plan the next follow-up.",
    updateSummary: `Mock update changed Kenji Watanabe to ${status} with ${tags.length} tags and ${notes.length} notes.`,
  };
}

export function createMockContactDetailTagStatusService(): ContactDetailTagStatusService {
  // get 和 update 共用 not found 校验；update 额外校验状态和标签白名单。
  return {
    getContactDetail(input): ContactDetailTagStatusResult {
      const resolvedScenario = scenarioResult(normalizeScenario(input.scenario));

      if (resolvedScenario) {
        return resolvedScenario;
      }

      if (!isDemoContact(input.contactId)) {
        return failure("CONTACT_DETAIL_NOT_FOUND");
      }

      return success(mockContactDetailFixture);
    },

    updateContactDetail(input): ContactDetailTagStatusResult {
      const resolvedScenario = updateScenarioResult(
        normalizeScenario(input.scenario),
      );

      if (resolvedScenario) {
        return resolvedScenario;
      }

      if (!isDemoContact(input.contactId)) {
        return failure("CONTACT_DETAIL_NOT_FOUND");
      }

      const unsupportedStatus = unsupportedStatusFailure(input.status);

      if (unsupportedStatus) {
        return unsupportedStatus;
      }

      const unsupportedTags = unsupportedTagFailure(input);

      if (unsupportedTags) {
        return unsupportedTags;
      }

      return success(buildUpdatePayload(input));
    },

    invalidPatchBody(): ContactDetailTagStatusInvalidPatchBodyError {
      return invalidPatchBodyFailure();
    },
  };
}

export type { ContactDetailTagStatusResult };
