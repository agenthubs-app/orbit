/**
 * All actions（操作账本）route view-model。
 *
 * 与 Today 的区别：这里是全量视图，包含 deferred，并按状态提供筛选。
 * 计数始终基于全量账本，不随当前筛选变化。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  AGENT_LEDGER_ENTRY_STATUSES,
  agentLedgerFailureToAppError,
  type AgentLedgerEntry,
  type AgentLedgerEntryStatus,
} from "../../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../../features/agent/service-factory";
import type { AgentLedgerService } from "../../../../../../features/agent/ledger/service";

export type AppAllActionsSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AllActionsFilterKey = "all" | AgentLedgerEntryStatus;

export interface AllActionsFilterViewModel {
  key: AllActionsFilterKey;
  label: string;
  count: number;
  active: boolean;
}

export interface AppAllActionsRouteViewModel {
  state: "success" | "empty" | "failure";
  filters: readonly AllActionsFilterViewModel[];
  entries: readonly AgentLedgerEntry[];
  activeFilter: AllActionsFilterKey;
  selectedEntryId: string | null;
  evidenceIds: readonly string[];
  errorCode: string | null;
  failureMessage: string | null;
}

export interface AppAllActionsRouteDependencies {
  ledgerService?: AgentLedgerService | null;
}

const FILTER_LABELS: Record<AllActionsFilterKey, string> = {
  all: "全部",
  approved: "已确认",
  awaiting_confirmation: "等待确认",
  canceled: "已取消",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  rejected: "已忽略",
  undone: "已撤销",
};

function readParam(
  params: AppAllActionsSearchParams | undefined,
  key: string,
): string | null {
  const value = params?.[key];

  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;

  return null;
}

function resolveFilter(value: string | null): AllActionsFilterKey {
  return (AGENT_LEDGER_ENTRY_STATUSES as readonly string[]).includes(
    value ?? "",
  )
    ? (value as AgentLedgerEntryStatus)
    : "all";
}

export async function loadAppAllActionsRouteViewModel(
  searchParams?: AppAllActionsSearchParams,
  dependencies: AppAllActionsRouteDependencies = {},
): Promise<AppAllActionsRouteViewModel> {
  if (dependencies.ledgerService === null) {
    return {
      activeFilter: "all",
      entries: [],
      errorCode: "AGENT_LEDGER_ACTOR_REQUIRED",
      evidenceIds: [],
      failureMessage:
        AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_ACTOR_REQUIRED.message,
      filters: [],
      selectedEntryId: null,
      state: "failure",
    };
  }

  const service =
    dependencies.ledgerService ?? createAgentLedgerService();
  const result = await service.listEntries({
    scenario: readParam(searchParams, "scenario"),
  });

  if (result.success === false) {
    return {
      activeFilter: "all",
      entries: [],
      errorCode: result.error.code,
      evidenceIds: result.error.evidenceIds,
      failureMessage: agentLedgerFailureToAppError(result).message,
      filters: [],
      selectedEntryId: null,
      state: "failure",
    };
  }

  const allEntries = result.data.entries;
  const activeFilter = resolveFilter(readParam(searchParams, "status"));
  const entries =
    activeFilter === "all"
      ? allEntries
      : allEntries.filter((entry) => entry.status === activeFilter);

  const statusFilters = AGENT_LEDGER_ENTRY_STATUSES.map((status) => ({
    active: activeFilter === status,
    count: allEntries.filter((entry) => entry.status === status).length,
    key: status as AllActionsFilterKey,
    label: FILTER_LABELS[status],
  })).filter((filter) => filter.count > 0 || filter.active);

  return {
    activeFilter,
    entries,
    errorCode: null,
    evidenceIds: result.data.provenance.evidenceIds,
    failureMessage: null,
    filters: [
      {
        active: activeFilter === "all",
        count: allEntries.length,
        key: "all",
        label: FILTER_LABELS.all,
      },
      ...statusFilters,
    ],
    selectedEntryId: readParam(searchParams, "entry"),
    state: allEntries.length === 0 ? "empty" : "success",
  };
}
