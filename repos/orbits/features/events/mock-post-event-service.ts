import {
  POST_EVENT_REVIEW_ERROR_DEFINITIONS,
  type ConfirmPostEventContactsInput,
  type PostEventContactReviewService,
  type PostEventReviewConfirmResult,
  type PostEventReviewConfirmSuccess,
  type PostEventReviewErrorCode,
  type PostEventReviewFailure,
  type PostEventReviewInput,
  type PostEventReviewPayload,
  type PostEventReviewProvenance,
  type PostEventReviewResult,
  type PostEventReviewScenario,
  type PostEventReviewSuccess,
} from "./post-event-contract";
import {
  mockEmptyPostEventReviewFixture,
  mockEmptyPostEventReviewProvenance,
  mockPendingPostEventReviewFixture,
  mockPendingPostEventReviewProvenance,
  mockPostEventReviewConfirmFixture,
  mockPostEventReviewFailureProvenance,
  mockPostEventReviewFixture,
} from "./post-event-fixtures";

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<PostEventReviewScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// post-event review mock 模拟活动结束后的联系人复核和确认流程。
// 它只返回 fixture 或受控失败，不会真正创建联系人。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function reviewSuccess(
  payload: PostEventReviewPayload,
): PostEventReviewSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmSuccess(): PostEventReviewConfirmSuccess {
  return {
    success: true,
    data: clonePayload(mockPostEventReviewConfirmFixture),
  };
}

function failure(
  code: PostEventReviewErrorCode,
  provenance: PostEventReviewProvenance = mockPostEventReviewFailureProvenance,
): PostEventReviewFailure {
  // empty/pending 这类受控失败会使用对应 provenance，方便 UI 解释为何不能确认。
  const definition = POST_EVENT_REVIEW_ERROR_DEFINITIONS[code];

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

function normalizeScenario(
  scenario?: PostEventReviewInput["scenario"],
): PostEventReviewScenario {
  if (scenario && supportedScenarios.has(scenario as PostEventReviewScenario)) {
    return scenario as PostEventReviewScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function eventFailure(
  input: PostEventReviewInput | ConfirmPostEventContactsInput,
): PostEventReviewFailure | null {
  // review 和 confirm 两条路径共享 demo event id 校验。
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("POST_EVENT_REVIEW_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("POST_EVENT_REVIEW_EVENT_NOT_FOUND");
  }

  return null;
}

function scenarioReviewResult(
  scenario: PostEventReviewScenario,
): PostEventReviewResult | null {
  switch (scenario) {
    case "empty":
      return reviewSuccess(mockEmptyPostEventReviewFixture);
    case "pending":
      return reviewSuccess(mockPendingPostEventReviewFixture);
    case "failure":
      return failure("POST_EVENT_REVIEW_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioConfirmResult(
  scenario: PostEventReviewScenario,
): PostEventReviewConfirmResult | null {
  switch (scenario) {
    case "empty":
      return failure("POST_EVENT_REVIEW_EMPTY", mockEmptyPostEventReviewProvenance);
    case "pending":
      return failure(
        "POST_EVENT_REVIEW_PENDING",
        mockPendingPostEventReviewProvenance,
      );
    case "failure":
      return failure("POST_EVENT_REVIEW_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

export function createMockPostEventContactReviewService(): PostEventContactReviewService {
  return {
    getPostEventReview(input = {}): PostEventReviewResult {
      // 读取 post-event review：scenario 短路后返回 demo review fixture。
      const scenarioResult = scenarioReviewResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return reviewSuccess(mockPostEventReviewFixture);
    },

    confirmPostEventContacts(input = {}): PostEventReviewConfirmResult {
      // 确认 post-event contacts：empty/pending 会返回明确失败，success 返回确认 fixture。
      const scenarioResult = scenarioConfirmResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return confirmSuccess();
    },
  };
}
