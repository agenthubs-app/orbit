import {
  POST_EVENT_REVIEW_ERROR_DEFINITIONS,
  mockEmptyPostEventReviewFixture,
  mockEmptyPostEventReviewProvenance,
  mockPendingPostEventReviewFixture,
  mockPendingPostEventReviewProvenance,
  mockPostEventReviewConfirmFixture,
  mockPostEventReviewFailureProvenance,
  mockPostEventReviewFixture,
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

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<PostEventReviewScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

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
