import {
  EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS,
  EVENT_SOURCE_CAPTURE_METHODS,
  EVENT_STATUS_VALUES,
  type EventCaptureMethod,
  type EventCrudImportErrorCode,
  type EventCrudImportFailure,
  type EventCrudImportInput,
  type EventCrudImportScenario,
  type EventDetailInput,
  type EventDetailResult,
  type EventDetailSuccess,
  type EventListPayload,
  type EventListResult,
  type EventListSuccess,
  type EventRecord,
  type EventStatus,
  type ImportedEventRecord,
  type ManualEventCreationInput,
  type ManualEventCreationPayload,
  type ManualEventCreationResult,
  type ManualEventCreationSuccess,
} from "./contract";
import {
  buildEventDetailPayload,
  buildEventListPayload,
  buildManualEventCreationPayload,
  mockEmptyEventListFixture,
  mockEventFailureProvenance,
  mockEventListFixture,
  mockEventRecords,
  mockImportedEventRecords,
  mockManualEventCreationFixture,
  mockPendingEventListFixture,
} from "./fixtures";
import type { EventCrudAndImportService } from "./service";

// Event CRUD/import mock service 模拟活动列表、详情和手动创建。
// 它验证 source note/title 这类最小来源要求，但不会写真实数据库或导入外部日历。
const supportedScenarios = new Set<EventCrudImportScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedStatuses = new Set<EventStatus>(EVENT_STATUS_VALUES);
const supportedCaptureMethods = new Set<EventCaptureMethod>(
  EVENT_SOURCE_CAPTURE_METHODS,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // events fixtures 同时被 list/detail/create 使用，返回 clone 保持 fixture 只读。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function listSuccess(payload: EventListPayload): EventListSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function createSuccess(
  payload: ManualEventCreationPayload,
): ManualEventCreationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function detailSuccess(payload: EventDetailSuccess["data"]): EventDetailSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: EventCrudImportErrorCode): EventCrudImportFailure {
  // mock failure 都带固定 provenance，API route 可以稳定映射到 AppError。
  const definition = EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventFailureProvenance,
      evidenceIds: mockEventFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventCrudImportInput["scenario"],
): EventCrudImportScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventCrudImportScenario)
  ) {
    return scenario as EventCrudImportScenario;
  }

  return "success";
}

function normalizeStatusFilter(
  statusFilter?: EventCrudImportInput["statusFilter"],
): EventStatus | null {
  // statusFilter 来自 query/body，必须收敛到 EVENT_STATUS_VALUES。
  if (statusFilter && supportedStatuses.has(statusFilter as EventStatus)) {
    return statusFilter as EventStatus;
  }

  return null;
}

function normalizeCaptureMethod(
  sourceCaptureMethod?: EventCrudImportInput["sourceCaptureMethod"],
): EventCaptureMethod | null {
  // source capture method 决定活动来源类型；不支持的值直接忽略为无过滤。
  if (
    sourceCaptureMethod &&
    supportedCaptureMethods.has(sourceCaptureMethod as EventCaptureMethod)
  ) {
    return sourceCaptureMethod as EventCaptureMethod;
  }

  return null;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function scenarioListResult(
  scenario: EventCrudImportScenario,
): EventListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess(mockEmptyEventListFixture);
    case "pending":
      return listSuccess(mockPendingEventListFixture);
    case "failure":
      return failure("EVENTS_IMPORT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioCreateResult(
  scenario: EventCrudImportScenario,
): ManualEventCreationResult | null {
  switch (scenario) {
    case "failure":
      return failure("EVENTS_IMPORT_MOCK_FAILED");
    case "pending":
      return failure("EVENTS_IMPORT_PENDING");
    case "empty":
    case "success":
    default:
      return null;
  }
}

function filterImportedRecords(
  events: readonly EventRecord[],
): readonly ImportedEventRecord[] {
  // importedRecords 是 event 的附属来源记录；列表过滤后只保留匹配 event 的导入来源。
  const eventIds = new Set(events.map((event) => event.id));

  return mockImportedEventRecords.filter((record) =>
    eventIds.has(record.eventId),
  );
}

function filteredEventList(input: EventCrudImportInput): EventListPayload {
  // 过滤逻辑集中在这里，确保 status/source 两个 filter 与 provenance summary 同步。
  const statusFilter = normalizeStatusFilter(input.statusFilter);
  const captureMethod = normalizeCaptureMethod(input.sourceCaptureMethod);
  const events = mockEventRecords.filter((event) => {
    const statusMatches = statusFilter ? event.status === statusFilter : true;
    const sourceMatches = captureMethod
      ? event.sourceMetadata.captureMethod === captureMethod
      : true;

    return statusMatches && sourceMatches;
  });
  const importedRecords = filterImportedRecords(events);
  const filters = [
    statusFilter ? `status ${statusFilter}` : "",
    captureMethod ? `source ${captureMethod}` : "",
  ].filter(Boolean);

  if (filters.length === 0) {
    return mockEventListFixture;
  }

  return buildEventListPayload({
    events,
    importedRecords,
    summary:
      events.length > 0
        ? `Local mock rules filtered events by ${filters.join(" and ")}.`
        : `No local events matched ${filters.join(" and ")}.`,
    evidenceIds:
      events.length > 0
        ? events.flatMap((event) =>
            event.evidence.map((evidence) => evidence.evidenceId),
          )
        : ["evidence:events-empty-list"],
  });
}

function manualInputOrDefault(
  input: ManualEventCreationInput,
): ManualEventCreationInput | "default" | EventCrudImportFailure {
  // 没传 title 时返回默认创建 fixture；显式传了空 title/sourceNote 才算校验失败。
  if (input.title === undefined || input.title === null) {
    return "default";
  }

  const title = input.title.trim();

  if (!title) {
    return failure("EVENTS_TITLE_REQUIRED");
  }

  const sourceNote = input.sourceNote?.trim() ?? "";

  if (!sourceNote) {
    return failure("EVENTS_SOURCE_NOTE_REQUIRED");
  }

  return {
    ...input,
    sourceNote,
    title,
  };
}

function isEventCrudImportFailure(
  value: ManualEventCreationInput | "default" | EventCrudImportFailure,
): value is EventCrudImportFailure {
  return typeof value === "object" && value !== null && "success" in value;
}

function buildManualPayload(
  input: ManualEventCreationInput,
): ManualEventCreationPayload {
  // 有效输入会覆盖默认创建 fixture 的展示字段，缺省字段仍回落到 fixture。
  const normalized = manualInputOrDefault(input);

  if (normalized === "default" || isEventCrudImportFailure(normalized)) {
    return mockManualEventCreationFixture;
  }

  return buildManualEventCreationPayload({
    title: normalized.title ?? mockManualEventCreationFixture.event.title,
    description: normalized.description,
    sourceNote: normalized.sourceNote,
    venue:
      normalized.venue?.trim() ||
      mockManualEventCreationFixture.event.venue,
    startsAt:
      normalized.startsAt?.trim() ||
      mockManualEventCreationFixture.event.startsAt,
    endsAt:
      normalized.endsAt?.trim() ||
      mockManualEventCreationFixture.event.endsAt,
  });
}

function getManualValidationFailure(
  input: ManualEventCreationInput,
): EventCrudImportFailure | null {
  const normalized = manualInputOrDefault(input);

  return isEventCrudImportFailure(normalized) ? normalized : null;
}

export function createMockEventCrudAndImportService(): EventCrudAndImportService {
  // service 方法对应 route 的三个主要用例：列表、手动创建和详情读取。
  return {
    listEvents(input = {}): EventListResult {
      const scenarioResult = scenarioListResult(normalizeScenario(input.scenario));

      if (scenarioResult) {
        return scenarioResult;
      }

      return listSuccess(filteredEventList(input));
    },

    createEvent(input = {}): ManualEventCreationResult {
      const scenarioResult = scenarioCreateResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const validationFailure = getManualValidationFailure(input);

      if (validationFailure) {
        return validationFailure;
      }

      return createSuccess(buildManualPayload(input));
    },

    getEvent(input: EventDetailInput): EventDetailResult {
      if (normalizeScenario(input.scenario) === "failure") {
        return failure("EVENTS_IMPORT_MOCK_FAILED");
      }

      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("EVENTS_EVENT_ID_REQUIRED");
      }

      const event = mockEventRecords.find((record) => record.id === eventId);

      if (!event) {
        return failure("EVENTS_EVENT_NOT_FOUND");
      }

      return detailSuccess(buildEventDetailPayload(event));
    },
  };
}

export type {
  EventDetailResult,
  EventListResult,
  ManualEventCreationResult,
};
