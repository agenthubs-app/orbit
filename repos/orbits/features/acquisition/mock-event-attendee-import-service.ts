import {
  EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS,
  EVENT_ATTENDEE_RELATIONSHIP_STATUS_CODES,
  mockEmptyEventAttendeeImportFixture,
  mockEmptyEventAttendeeRosterFixture,
  mockEventAttendeeImportFailureProvenance,
  mockEventAttendeeImportFixture,
  mockEventAttendeeRosterFixture,
  mockPendingEventAttendeeImportFixture,
  mockPendingEventAttendeeRosterFixture,
  type EventAttendeeContactDraft,
  type EventAttendeeImportErrorCode,
  type EventAttendeeImportFailure,
  type EventAttendeeImportInput,
  type EventAttendeeImportPayload,
  type EventAttendeeImportResult,
  type EventAttendeeImportScenario,
  type EventAttendeeImportService,
  type EventAttendeeImportSuccess,
  type EventAttendeeRecord,
  type EventAttendeeRelationshipStatusCode,
  type EventAttendeeRosterPayload,
  type EventAttendeeRosterResult,
  type EventAttendeeRosterSuccess,
} from "./event-attendee-contract";

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<EventAttendeeImportScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedRelationshipStatusFilters =
  new Set<EventAttendeeRelationshipStatusCode>(
    EVENT_ATTENDEE_RELATIONSHIP_STATUS_CODES,
  );

// EventAttendeeImport mock service 模拟活动参会者名单读取和联系人草稿 staging。
// 它只支持 demo-event-1，不导入真实活动系统，也不写联系人库。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function rosterSuccess(
  payload: EventAttendeeRosterPayload,
): EventAttendeeRosterSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function importSuccess(
  payload: EventAttendeeImportPayload,
): EventAttendeeImportSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: EventAttendeeImportErrorCode,
): EventAttendeeImportFailure {
  // 参会者导入失败使用固定 provenance，便于 UI 区分本地 mock 错误和 live provider 错误。
  const definition = EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventAttendeeImportFailureProvenance,
      evidenceIds: mockEventAttendeeImportFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventAttendeeImportInput["scenario"],
): EventAttendeeImportScenario {
  if (scenario && supportedScenarios.has(scenario as EventAttendeeImportScenario)) {
    return scenario as EventAttendeeImportScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  // 未传 eventId 时使用 demo event；显式空字符串才算缺少 event id。
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function normalizeRelationshipStatusFilter(
  value?: EventAttendeeImportInput["relationshipStatusFilter"],
): EventAttendeeRelationshipStatusCode | null {
  if (
    value &&
    supportedRelationshipStatusFilters.has(
      value as EventAttendeeRelationshipStatusCode,
    )
  ) {
    return value as EventAttendeeRelationshipStatusCode;
  }

  return null;
}

function eventFailure(input: EventAttendeeImportInput): EventAttendeeImportFailure | null {
  // 当前 fixture 只有 demo-event-1，非 demo id 返回 not found，避免假装远程查询。
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("EVENT_ATTENDEE_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("EVENT_ATTENDEE_EVENT_NOT_FOUND");
  }

  return null;
}

function filterAttendees(
  relationshipStatusFilter: EventAttendeeRelationshipStatusCode | null,
): readonly EventAttendeeRecord[] {
  if (!relationshipStatusFilter) {
    return mockEventAttendeeRosterFixture.attendees;
  }

  return mockEventAttendeeRosterFixture.attendees.filter(
    (attendee) => attendee.relationshipStatus.code === relationshipStatusFilter,
  );
}

function filterDrafts(
  relationshipStatusFilter: EventAttendeeRelationshipStatusCode | null,
): readonly EventAttendeeContactDraft[] {
  if (!relationshipStatusFilter) {
    return mockEventAttendeeImportFixture.contactDrafts;
  }

  return mockEventAttendeeImportFixture.contactDrafts.filter(
    (draft) => draft.relationshipStatus.code === relationshipStatusFilter,
  );
}

function buildRuleBasedRosterPayload(
  relationshipStatusFilter: EventAttendeeRelationshipStatusCode,
): EventAttendeeRosterPayload {
  // roster payload 只按 relationshipStatusFilter 派生 attendee 列表。
  const attendees = filterAttendees(relationshipStatusFilter);
  const state = attendees.length > 0 ? "success" : "empty";

  return {
    ...mockEventAttendeeRosterFixture,
    state,
    attendees,
    summary:
      attendees.length > 0
        ? `Local mock rules filtered attendees by ${relationshipStatusFilter}.`
        : `No local attendees matched ${relationshipStatusFilter}.`,
    provenance: {
      ...mockEventAttendeeRosterFixture.provenance,
      generationMethod: "rule-based-event-attendee-import",
      sourceLabel: "Rule-based event attendee roster filter",
      evidenceIds:
        attendees.length > 0
          ? mockEventAttendeeRosterFixture.provenance.evidenceIds
          : ["evidence:event-import-empty-roster"],
    },
    nextAction:
      attendees.length > 0
        ? "Review the filtered attendee relationship labels."
        : "Clear the local status filter before staging contact drafts.",
  };
}

function buildRuleBasedImportPayload(
  relationshipStatusFilter: EventAttendeeRelationshipStatusCode,
): EventAttendeeImportPayload {
  // import payload 在 roster 基础上追加 contactDrafts，但仍然不执行 contact write。
  const roster = buildRuleBasedRosterPayload(relationshipStatusFilter);
  const contactDrafts = filterDrafts(relationshipStatusFilter);

  return {
    ...roster,
    contactDrafts,
    summary:
      contactDrafts.length > 0
        ? `Local mock rules staged attendee drafts filtered by ${relationshipStatusFilter}.`
        : `No local attendee drafts matched ${relationshipStatusFilter}.`,
  };
}

function scenarioRosterResult(
  scenario: EventAttendeeImportScenario,
): EventAttendeeRosterResult | null {
  switch (scenario) {
    case "empty":
      return rosterSuccess(mockEmptyEventAttendeeRosterFixture);
    case "pending":
      return rosterSuccess(mockPendingEventAttendeeRosterFixture);
    case "failure":
      return failure("EVENT_ATTENDEE_IMPORT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioImportResult(
  scenario: EventAttendeeImportScenario,
): EventAttendeeImportResult | null {
  switch (scenario) {
    case "empty":
      return importSuccess(mockEmptyEventAttendeeImportFixture);
    case "pending":
      return importSuccess(mockPendingEventAttendeeImportFixture);
    case "failure":
      return failure("EVENT_ATTENDEE_IMPORT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

export function createMockEventAttendeeImportService(): EventAttendeeImportService {
  // listEventAttendees 展示名单；importEventAttendees 生成待确认联系人草稿。
  return {
    listEventAttendees(input = {}): EventAttendeeRosterResult {
      const scenarioResult = scenarioRosterResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      const relationshipStatusFilter = normalizeRelationshipStatusFilter(
        input.relationshipStatusFilter,
      );

      return rosterSuccess(
        relationshipStatusFilter
          ? buildRuleBasedRosterPayload(relationshipStatusFilter)
          : mockEventAttendeeRosterFixture,
      );
    },

    importEventAttendees(input = {}): EventAttendeeImportResult {
      const scenarioResult = scenarioImportResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      const relationshipStatusFilter = normalizeRelationshipStatusFilter(
        input.relationshipStatusFilter,
      );

      return importSuccess(
        relationshipStatusFilter
          ? buildRuleBasedImportPayload(relationshipStatusFilter)
          : mockEventAttendeeImportFixture,
      );
    },
  };
}

export type {
  EventAttendeeImportResult,
  EventAttendeeRosterResult,
};
