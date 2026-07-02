import {
  EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS,
  EVENT_ATTENDEE_TAG_CODES,
  type EventAttendeeRosterErrorCode,
  type EventAttendeeRosterFailure,
  type EventAttendeeRosterImportResult,
  type EventAttendeeRosterImportSuccess,
  type EventAttendeeRosterInput,
  type EventAttendeeRosterPayload,
  type EventAttendeeRosterRecord,
  type EventAttendeeRosterResult,
  type EventAttendeeRosterScenario,
  type EventAttendeeRosterService,
  type EventAttendeeRosterSuccess,
  type EventAttendeeTagCode,
} from "./contract";
import {
  buildEventAttendeeRosterImportPayload,
  buildEventAttendeeRosterPayload,
  mockEmptyEventAttendeeRosterFixture,
  mockEmptyEventAttendeeRosterImportFixture,
  mockEventAttendeeRosterFailureProvenance,
  mockEventAttendeeRosterFixture,
  mockEventAttendeeRosterImportFixture,
  mockEventAttendeeRosterRecords,
  mockPendingEventAttendeeRosterFixture,
  mockPendingEventAttendeeRosterImportFixture,
} from "./fixtures";

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<EventAttendeeRosterScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTagFilters = new Set<EventAttendeeTagCode>(
  EVENT_ATTENDEE_TAG_CODES,
);

// attendee roster mock 支持按 tag/known/eligible 做本地规则过滤。
// 它模拟活动参会者名册导入，不读取真实活动系统。
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
  payload: EventAttendeeRosterImportSuccess["data"],
): EventAttendeeRosterImportSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: EventAttendeeRosterErrorCode,
): EventAttendeeRosterFailure {
  const definition = EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventAttendeeRosterFailureProvenance,
      evidenceIds: mockEventAttendeeRosterFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventAttendeeRosterInput["scenario"],
): EventAttendeeRosterScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventAttendeeRosterScenario)
  ) {
    return scenario as EventAttendeeRosterScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  // eventId 未提供时使用 demo event；空字符串会触发 required failure。
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function normalizeTagFilter(
  tagFilter?: EventAttendeeRosterInput["tagFilter"],
): EventAttendeeTagCode | null {
  if (tagFilter && supportedTagFilters.has(tagFilter as EventAttendeeTagCode)) {
    return tagFilter as EventAttendeeTagCode;
  }

  return null;
}

function normalizeBooleanFilter(
  value?: boolean | string | null,
): boolean {
  // API route 可能传 boolean，也可能从 query/form 传 "true"。
  return value === true || value === "true";
}

function eventFailure(
  input: EventAttendeeRosterInput,
): EventAttendeeRosterFailure | null {
  // 所有 roster/import 方法共享 eventId 校验。
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("EVENT_ATTENDEE_ROSTER_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND");
  }

  return null;
}

function scenarioRosterResult(
  scenario: EventAttendeeRosterScenario,
): EventAttendeeRosterResult | null {
  switch (scenario) {
    case "empty":
      return rosterSuccess(mockEmptyEventAttendeeRosterFixture);
    case "pending":
      return rosterSuccess(mockPendingEventAttendeeRosterFixture);
    case "failure":
      return failure("EVENT_ATTENDEE_ROSTER_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioImportResult(
  scenario: EventAttendeeRosterScenario,
): EventAttendeeRosterImportResult | null {
  switch (scenario) {
    case "empty":
      return importSuccess(mockEmptyEventAttendeeRosterImportFixture);
    case "pending":
      return importSuccess(mockPendingEventAttendeeRosterImportFixture);
    case "failure":
      return failure("EVENT_ATTENDEE_ROSTER_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function filterAttendees(
  input: EventAttendeeRosterInput,
): readonly EventAttendeeRosterRecord[] {
  // 过滤完全基于本地 fixture 标签和资格字段，保证测试可复现。
  const tagFilter = normalizeTagFilter(input.tagFilter);
  const knownContactOnly = normalizeBooleanFilter(input.knownContactOnly);
  const eligibleOnly = normalizeBooleanFilter(input.eligibleOnly);

  return mockEventAttendeeRosterRecords.filter((attendee) => {
    const tagMatches = tagFilter
      ? attendee.attendeeTags.some((tag) => tag.code === tagFilter)
      : true;
    const knownMatches = knownContactOnly
      ? attendee.knownContactMarker.isKnownContact
      : true;
    const eligibleMatches = eligibleOnly
      ? attendee.eligibleRecommendation.isEligible
      : true;

    return tagMatches && knownMatches && eligibleMatches;
  });
}

function buildRuleBasedRosterPayload(
  input: EventAttendeeRosterInput,
): EventAttendeeRosterPayload {
  // 有过滤条件时动态生成 payload summary/provenance，保留筛选原因。
  const attendees = filterAttendees(input);
  const tagFilter = normalizeTagFilter(input.tagFilter);
  const filterLabels = [
    tagFilter ? `tag ${tagFilter}` : "",
    normalizeBooleanFilter(input.knownContactOnly) ? "known contacts" : "",
    normalizeBooleanFilter(input.eligibleOnly)
      ? "eligible recommendations"
      : "",
  ].filter(Boolean);
  const summary =
    attendees.length > 0
      ? `Local mock rules filtered attendees by ${filterLabels.join(" and ")}.`
      : `No local attendees matched ${filterLabels.join(" and ")}.`;

  return buildEventAttendeeRosterPayload({
    attendees,
    summary,
    evidenceIds:
      attendees.length > 0
        ? mockEventAttendeeRosterFixture.provenance.evidenceIds
        : ["evidence:event-roster-empty"],
    generationMethod: "rule-based-roster-filter",
    sourceLabel: "Rule-based attendee roster filter",
    nextAction:
      attendees.length > 0
        ? "Review the filtered attendee tags and recommendation eligibility."
        : "Clear the local roster filter before reviewing attendees.",
  });
}

function hasFilters(input: EventAttendeeRosterInput): boolean {
  // 无过滤条件时直接返回完整 fixture，避免不必要地重建 payload。
  return (
    normalizeTagFilter(input.tagFilter) !== null ||
    normalizeBooleanFilter(input.knownContactOnly) ||
    normalizeBooleanFilter(input.eligibleOnly)
  );
}

export function createMockEventAttendeeRosterService(): EventAttendeeRosterService {
  return {
    getAttendeeRoster(input = {}): EventAttendeeRosterResult {
      // 读取 roster：scenario 短路优先，然后校验 eventId，最后应用可选过滤。
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

      return rosterSuccess(
        hasFilters(input)
          ? buildRuleBasedRosterPayload(input)
          : mockEventAttendeeRosterFixture,
      );
    },

    importAttendeeRoster(input = {}): EventAttendeeRosterImportResult {
      // 导入 roster：同一套过滤规则，最后包装成 import payload。
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

      return importSuccess(
        hasFilters(input)
          ? buildEventAttendeeRosterImportPayload(
              buildRuleBasedRosterPayload(input),
            )
          : mockEventAttendeeRosterImportFixture,
      );
    },
  };
}

export type {
  EventAttendeeRosterImportResult,
  EventAttendeeRosterResult,
};
