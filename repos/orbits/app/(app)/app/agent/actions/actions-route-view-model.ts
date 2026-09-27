/**
 * 建议与行动（Orbit_0918 iOrbit actions 屏）route view-model。
 *
 * 数据源 = 操作账本（与 Today / All actions 同一权威来源，不另造数据）。
 * 三档分档规则沿用账本既有语义（用户 2026-09-19 拍板：规则「做了」，即复用
 * 现有账本状态归属，不发明新规则）：
 *   awaiting_confirmation → 需要你决定（decide）
 *   approved / executing  → 建议今天做（today）
 *   deferred              → 可稍后（later）
 * 终态条目（completed/failed/canceled/rejected/undone/partially_failed）不进
 * 三档；其中 completedAt 落在本地今天的计入「今日进度」分子，分母为三档合计
 * +今日已完成，全是账本真实计数，没有设计稿 mock 数字。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  agentLedgerFailureToAppError,
  type AgentLedgerEntry,
} from "../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../features/agent/service-factory";
import type { AgentLedgerService } from "../../../../../features/agent/ledger/service";
import { groupAgentActionEntries } from "./action-tiers";

export { groupAgentActionEntries } from "./action-tiers";

export type AgentActionsTierKey = "decide" | "today" | "later";

export interface AgentActionsTierViewModel {
  key: AgentActionsTierKey;
  entries: readonly AgentLedgerEntry[];
}

export interface AgentActionsRouteViewModel {
  state: "success" | "empty" | "failure";
  tiers: readonly AgentActionsTierViewModel[];
  /** 今日进度环：completedToday / todaysTotal（分母 0 时前端显示空态环）。 */
  completedToday: number;
  todaysTotal: number;
  selectedEntryId: string | null;
  /** Cursor for older ledger entries; the page loads them on request (0122). */
  nextCursor?: string | null;
  /** Ledger entries this view was built from, actionable or not. */
  loadedCount?: number;
  evidenceIds: readonly string[];
  errorCode: string | null;
  failureMessage: string | null;
}

export interface AgentActionsSearchParams {
  entry?: string | string[];
}

export interface AgentActionsRouteDependencies {
  ledgerService?: AgentLedgerService | null;
}

export interface AgentActionsRouteControls {
  scenario?: "empty" | "failure";
}

function readParam(
  params: AgentActionsSearchParams | undefined,
  key: string,
): string | null {
  const value = params?.[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export async function loadAgentActionsRouteViewModel(
  searchParams?: AgentActionsSearchParams,
  dependencies: AgentActionsRouteDependencies = {},
  controls: AgentActionsRouteControls = {},
): Promise<AgentActionsRouteViewModel> {
  if (dependencies.ledgerService === null) {
    return {
      completedToday: 0,
      errorCode: "AGENT_LEDGER_ACTOR_REQUIRED",
      evidenceIds: [],
      failureMessage:
        AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_ACTOR_REQUIRED.message,
      selectedEntryId: null,
      state: "failure",
      tiers: [],
      todaysTotal: 0,
    };
  }

  const service = dependencies.ledgerService ?? createAgentLedgerService();
  const result = await service.listEntries({ scenario: controls.scenario });

  if (result.success === false) {
    return {
      completedToday: 0,
      errorCode: result.error.code,
      evidenceIds: result.error.evidenceIds,
      failureMessage: agentLedgerFailureToAppError(result).message,
      selectedEntryId: null,
      state: "failure",
      tiers: [],
      todaysTotal: 0,
    };
  }

  const grouped = groupAgentActionEntries(result.data.entries);

  return {
    ...grouped,
    errorCode: null,
    evidenceIds: result.data.provenance.evidenceIds,
    failureMessage: null,
    loadedCount: result.data.entries.length,
    nextCursor: result.data.nextCursor ?? null,
    selectedEntryId: readParam(searchParams, "entry"),
    state: result.data.entries.length === 0 ? "empty" : "success",
  };
}
