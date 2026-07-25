import type {
  AgentLedgerListResult,
  AgentLedgerMutationResult,
} from "./contract";
import type { AgentLedgerService } from "./service";
import { createMockAgentLedgerService } from "./mock-service";
import { createRuntimeBackedAgentLedgerService } from "./runtime-adapter";
import { createOrbitAgentRuntimeService } from "../runtime/service-factory";

interface OrbitAgentLedgerGlobal {
  __orbitAgentMockLedgerService?: AgentLedgerService;
}

function mergeListResults(
  fixtures: Extract<AgentLedgerListResult, { success: true }>,
  runtime: Extract<AgentLedgerListResult, { success: true }>,
): AgentLedgerListResult {
  const byId = new Map(
    [...fixtures.data.entries, ...runtime.data.entries].map((entry) => [
      entry.entryId,
      entry,
    ]),
  );
  const entries = [...byId.values()];
  return {
    success: true,
    data: {
      state: entries.length === 0 ? "empty" : "success",
      entries,
      summary: `账本共 ${entries.length} 条记录，可追溯、可撤销。`,
      provenance: {
        ...fixtures.data.provenance,
        evidenceIds: [
          ...new Set([
            ...fixtures.data.provenance.evidenceIds,
            ...runtime.data.provenance.evidenceIds,
          ]),
        ],
      },
      nextAction: "在 Today 或 All actions 中复核等待确认的操作。",
    },
  };
}

function createMockRuntimeLedgerCompatibilityService(): AgentLedgerService {
  const fixtures = createMockAgentLedgerService();
  const runtime = createOrbitAgentRuntimeService("mock");
  const runtimeLedger = createRuntimeBackedAgentLedgerService({ runtime });

  async function runtimeHasEntry(entryId: string): Promise<boolean> {
    return (await runtime.listActions({})).some(
      (action) => action.actionId === entryId,
    );
  }

  return {
    async listEntries(input = {}): Promise<AgentLedgerListResult> {
      const fixtureResult = await fixtures.listEntries(input);
      if (fixtureResult.success === false) return fixtureResult;
      const runtimeResult = await runtimeLedger.listEntries(input);
      if (runtimeResult.success === false) return runtimeResult;
      return mergeListResults(fixtureResult, runtimeResult);
    },
    async applyTransition(input): Promise<AgentLedgerMutationResult> {
      return (await runtimeHasEntry(input.entryId ?? ""))
        ? runtimeLedger.applyTransition(input)
        : fixtures.applyTransition(input);
    },
    async updateDraft(input): Promise<AgentLedgerMutationResult> {
      return (await runtimeHasEntry(input.entryId ?? ""))
        ? runtimeLedger.updateDraft(input)
        : fixtures.updateDraft(input);
    },
  };
}

export function createSharedMockAgentLedgerService(): AgentLedgerService {
  const ledgerGlobal = globalThis as typeof globalThis & OrbitAgentLedgerGlobal;
  if (!ledgerGlobal.__orbitAgentMockLedgerService) {
    ledgerGlobal.__orbitAgentMockLedgerService =
      createMockRuntimeLedgerCompatibilityService();
  }
  return ledgerGlobal.__orbitAgentMockLedgerService;
}

export function resetSharedMockAgentLedgerServiceForTests(): void {
  const ledgerGlobal = globalThis as typeof globalThis & OrbitAgentLedgerGlobal;
  delete ledgerGlobal.__orbitAgentMockLedgerService;
}
