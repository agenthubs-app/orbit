import type {
  AgentLedgerDraftUpdateInput,
  AgentLedgerListInput,
  AgentLedgerListResult,
  AgentLedgerMutationResult,
  AgentLedgerTransitionInput,
} from "./contract";

// AgentLedgerService 是操作账本的统一入口。
// applyTransition 收敛 confirm/defer/undo/retry 四种转换；
// 任何转换都不触发外部副作用，消息永远只存草稿。
export interface AgentLedgerService {
  listEntries: (
    input?: AgentLedgerListInput,
  ) => AgentLedgerServiceResult<AgentLedgerListResult>;
  applyTransition: (
    input: AgentLedgerTransitionInput,
  ) => AgentLedgerServiceResult<AgentLedgerMutationResult>;
  updateDraft: (
    input: AgentLedgerDraftUpdateInput,
  ) => AgentLedgerServiceResult<AgentLedgerMutationResult>;
}

export type AgentLedgerServiceResult<TResult> = TResult | Promise<TResult>;
