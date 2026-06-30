import {
  EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS,
  EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS,
  type EmailCalendarRelationshipSignal,
  type EmailCalendarSignalConfirmationResult,
  type EmailCalendarSignalConfirmationScenario,
  type EmailCalendarSignalConfirmationSuccess,
  type EmailCalendarSignalConfirmInput,
  type EmailCalendarSignalErrorCode,
  type EmailCalendarSignalFailure,
  type EmailCalendarSignalListInput,
  type EmailCalendarSignalPayload,
  type EmailCalendarSignalResult,
  type EmailCalendarSignalScenario,
  type EmailCalendarSignalService,
  type EmailCalendarSignalSourceKind,
  type EmailCalendarSignalSuccess,
} from "./email-calendar-contract";
import {
  mockEmailCalendarSignalConfirmedFixture,
  mockEmailCalendarSignalFailureProvenance,
  mockEmailCalendarSignalFixture,
  mockEmailCalendarSignals,
  mockEmptyEmailCalendarSignalFixture,
  mockPendingEmailCalendarSignalFixture,
} from "./email-calendar-fixtures";

const supportedScenarios = new Set<EmailCalendarSignalScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<EmailCalendarSignalConfirmationScenario>([
    "success",
    "pending",
    "blocked",
    "failure",
  ]);

const supportedSourceKinds = new Set<EmailCalendarSignalSourceKind>(
  EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS,
);

// EmailCalendarSignal mock service 模拟从邮件/日历材料识别关系信号。
// 它只读本地 fixture，不请求邮箱、日历、账号授权 token 或后台分析任务。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: EmailCalendarSignalPayload,
): EmailCalendarSignalSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: typeof mockEmailCalendarSignalConfirmedFixture,
): EmailCalendarSignalConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: EmailCalendarSignalErrorCode,
): EmailCalendarSignalFailure {
  // sourceKind 不支持时用 permission-required 类错误，提醒真实接入前必须先授权。
  const definition = EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEmailCalendarSignalFailureProvenance,
      evidenceIds: mockEmailCalendarSignalFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EmailCalendarSignalListInput["scenario"],
): EmailCalendarSignalScenario {
  if (scenario && supportedScenarios.has(scenario as EmailCalendarSignalScenario)) {
    return scenario as EmailCalendarSignalScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: EmailCalendarSignalConfirmInput["scenario"],
): EmailCalendarSignalConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as EmailCalendarSignalConfirmationScenario,
    )
  ) {
    return scenario as EmailCalendarSignalConfirmationScenario;
  }

  return "success";
}

function normalizeSourceKind(
  sourceKind?: EmailCalendarSignalListInput["sourceKind"],
): EmailCalendarSignalSourceKind | null {
  if (sourceKind === undefined || sourceKind === null) {
    return null;
  }

  const normalized = sourceKind.trim();

  if (!normalized) {
    return null;
  }

  if (supportedSourceKinds.has(normalized as EmailCalendarSignalSourceKind)) {
    return normalized as EmailCalendarSignalSourceKind;
  }

  return null;
}

function sourceKindFailure(
  sourceKind?: EmailCalendarSignalListInput["sourceKind"],
): EmailCalendarSignalFailure | null {
  // 显式传入未知 sourceKind 不能静默忽略，否则 UI 会误以为真的查询了外部来源。
  if (sourceKind === undefined || sourceKind === null || sourceKind.trim() === "") {
    return null;
  }

  if (!supportedSourceKinds.has(sourceKind as EmailCalendarSignalSourceKind)) {
    return failure("EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED");
  }

  return null;
}

function filterSignals(
  sourceKind: EmailCalendarSignalSourceKind | null,
): readonly EmailCalendarRelationshipSignal[] {
  if (!sourceKind) {
    return mockEmailCalendarSignals;
  }

  return mockEmailCalendarSignals.filter(
    (signal) => signal.sourceKind === sourceKind,
  );
}

function buildRuleBasedPayload(
  sourceKind: EmailCalendarSignalSourceKind,
): EmailCalendarSignalPayload {
  // 过滤后的 signals 会同步 provenance evidenceIds，确保每个信号都能回溯来源。
  const signals = filterSignals(sourceKind);
  const state = signals.length > 0 ? "success" : "empty";
  const evidenceIds =
    signals.length > 0
      ? signals.flatMap((signal) => signal.evidenceIds)
      : ["evidence:email-calendar:empty"];

  return {
    ...mockEmailCalendarSignalFixture,
    state,
    signals,
    summary:
      signals.length > 0
        ? `Local mock rules filtered email and calendar relationship signals by ${sourceKind}.`
        : `No local email or calendar relationship signals matched ${sourceKind}.`,
    provenance: {
      ...mockEmailCalendarSignalFixture.provenance,
      sourceLabel: "Rule-based email and calendar signal source filter",
      evidenceIds,
      generationMethod: "rule-based-email-calendar-signal",
    },
    nextAction:
      signals.length > 0
        ? "Review the filtered relationship signals before confirming one."
        : "Clear the local source filter before reviewing relationship signals.",
  };
}

function scenarioResult(
  scenario: EmailCalendarSignalScenario,
): EmailCalendarSignalResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyEmailCalendarSignalFixture);
    case "pending":
      return success(mockPendingEmailCalendarSignalFixture);
    case "failure":
      return failure("EMAIL_CALENDAR_SIGNAL_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function findSignal(signalId: string): EmailCalendarRelationshipSignal | null {
  return (
    mockEmailCalendarSignals.find((signal) => signal.id === signalId) ?? null
  );
}

export function createMockEmailCalendarSignalService(): EmailCalendarSignalService {
  // confirmEmailCalendarSignal 只确认本地信号，不写入真实联系人或跟进记录。
  return {
    listEmailCalendarSignals(input = {}): EmailCalendarSignalResult {
      const resultForScenario = scenarioResult(
        normalizeScenario(input.scenario),
      );

      if (resultForScenario) {
        return resultForScenario;
      }

      const sourceFailure = sourceKindFailure(input.sourceKind);

      if (sourceFailure) {
        return sourceFailure;
      }

      const sourceKind = normalizeSourceKind(input.sourceKind);

      return success(
        sourceKind
          ? buildRuleBasedPayload(sourceKind)
          : mockEmailCalendarSignalFixture,
      );
    },

    confirmEmailCalendarSignal(
      input: EmailCalendarSignalConfirmInput,
    ): EmailCalendarSignalConfirmationResult {
      switch (normalizeConfirmationScenario(input.scenario)) {
        case "pending":
          return failure("EMAIL_CALENDAR_SIGNAL_PENDING");
        case "blocked":
          return failure("EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED");
        case "failure":
          return failure("EMAIL_CALENDAR_SIGNAL_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (!findSignal(input.signalId)) {
        return failure("EMAIL_CALENDAR_SIGNAL_NOT_FOUND");
      }

      return confirmationSuccess(mockEmailCalendarSignalConfirmedFixture);
    },
  };
}

export type {
  EmailCalendarSignalConfirmationResult,
  EmailCalendarSignalResult,
};
