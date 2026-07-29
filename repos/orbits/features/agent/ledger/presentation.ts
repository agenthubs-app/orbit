import type {
  AgentLedgerEntryStatus,
  AgentLedgerErrorCode,
  AgentLedgerTransition,
} from "./contract";

export type AgentLedgerReviewTransition = Extract<
  AgentLedgerTransition,
  "confirm" | "defer" | "reject"
>;

type AgentLedgerPresentationLanguage = "en" | "zh";

const REVIEW_TRANSITIONS_BY_STATUS: Partial<
  Record<AgentLedgerEntryStatus, readonly AgentLedgerReviewTransition[]>
> = {
  awaiting_confirmation: ["confirm", "defer", "reject"],
  deferred: ["confirm", "reject"],
};

const ZH_ERROR_MESSAGES: Partial<Record<AgentLedgerErrorCode, string>> = {
  AGENT_LEDGER_ACTOR_REQUIRED: "请先登录，再处理这项操作。",
  AGENT_LEDGER_DRAFT_NOT_EDITABLE: "当前状态不能再编辑这项内容，请刷新后重试。",
  AGENT_LEDGER_ENTRY_ID_REQUIRED: "尚未选中可处理的操作。",
  AGENT_LEDGER_ENTRY_NOT_FOUND: "找不到这项操作，它可能已经被移除。",
  AGENT_LEDGER_LIVE_STORE_UNCONFIGURED: "操作服务尚未配置，当前无法保存状态。",
  AGENT_LEDGER_MOCK_FAILED: "操作服务暂时不可用，请稍后重试。",
  AGENT_LEDGER_NO_OPERATIONS_SELECTED: "请至少选择一项要执行的操作。",
  AGENT_LEDGER_TRANSITION_INVALID: "操作状态已经变化，请刷新后再试。",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLedgerErrorCode(value: unknown): AgentLedgerErrorCode | null {
  if (
    !isRecord(value) ||
    !isRecord(value.error) ||
    !isRecord(value.error.context) ||
    typeof value.error.context.agentLedgerErrorCode !== "string"
  ) {
    return null;
  }

  const code = value.error.context.agentLedgerErrorCode;
  return code in ZH_ERROR_MESSAGES ? (code as AgentLedgerErrorCode) : null;
}

export function agentLedgerReviewTransitionsForStatus(
  status: string,
): readonly AgentLedgerReviewTransition[] {
  return (
    REVIEW_TRANSITIONS_BY_STATUS[status as AgentLedgerEntryStatus] ?? []
  );
}

export function agentLedgerErrorMessage(
  value: unknown,
  language: AgentLedgerPresentationLanguage,
): string {
  const errorCode = readLedgerErrorCode(value);

  if (language === "zh") {
    return (
      (errorCode ? ZH_ERROR_MESSAGES[errorCode] : null) ??
      "操作没有完成，请刷新状态后重试。"
    );
  }

  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === "string"
    ? value.error.message
    : "The action did not complete. Refresh its status and try again.";
}
