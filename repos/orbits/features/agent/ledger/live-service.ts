/**
 * Live agent ledger：把 actor-scoped persistent runtime 投影成可复核账本。
 * 构造失败时保持 fail-closed，并区分缺少登录身份与缺少数据库配置。
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

function liveLedgerFailure(
  code:
    | "AGENT_LEDGER_ACTOR_REQUIRED"
    | "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED",
): AgentLedgerFailure {
  return {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS[code],
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
  } catch (error) {
    const code =
      error instanceof Error &&
      error.message.includes("authenticated actor context")
        ? "AGENT_LEDGER_ACTOR_REQUIRED"
        : "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED";
    return {
      listEntries: () => liveLedgerFailure(code),
      applyTransition: () => liveLedgerFailure(code),
      updateDraft: () => liveLedgerFailure(code),
    };
  }
}
