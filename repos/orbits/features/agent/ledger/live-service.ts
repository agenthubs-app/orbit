/**
 * Live agent ledger 存根：数据库 provider 落地前，所有方法返回未配置 failure。
 * Postgres live-record-provider 在后续计划（All actions live 化）中实现。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  type AgentLedgerFailure,
} from "./contract";
import { mockAgentLedgerProvenance } from "./fixtures";
import type { AgentLedgerService } from "./service";
import { createRuntimeBackedAgentLedgerService } from "./runtime-adapter";
import { createOrbitAgentRuntimeService } from "../runtime/service-factory";
import type { AgentRuntimeService } from "../runtime/service";

function unconfiguredFailure(): AgentLedgerFailure {
  return {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_LIVE_STORE_UNCONFIGURED,
      state: "failure",
      provenance: {
        ...mockAgentLedgerProvenance,
        privacy: "live-agent-ledger-preview",
        generationMethod: "live-store-query",
      },
      evidenceIds: [],
    },
  };
}

export function createLiveAgentLedgerService(input?: {
  actorId?: string;
  runtime?: AgentRuntimeService;
}): AgentLedgerService {
  try {
    return createRuntimeBackedAgentLedgerService({
      runtime:
        input?.runtime ??
        createOrbitAgentRuntimeService(
          "live",
          input?.actorId ? { actorId: input.actorId } : undefined,
        ),
    });
  } catch {
    return {
      listEntries: () => unconfiguredFailure(),
      applyTransition: () => unconfiguredFailure(),
      updateDraft: () => unconfiguredFailure(),
    };
  }
}
