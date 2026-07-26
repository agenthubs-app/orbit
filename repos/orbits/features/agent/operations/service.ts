import type {
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  AgentOperationsRecordPayload,
  AgentOperationsService,
  AgentWorkerHeartbeat,
} from "./contract";

export const AGENT_OPERATIONS_COLLECTION =
  "agentOperations" as const;

function required(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must be ${maximum} characters or fewer.`);
  }
  return normalized;
}

function instant(value: string, label: string): string {
  const normalized = required(value, label, 80);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${label} must be an ISO date-time.`);
  }
  return normalized;
}

function count(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function createStorageAgentOperationsService(input: {
  actorId: string;
  store: LiveRecordStoreLike<AgentOperationsRecordPayload>;
  workspaceId: string;
}): AgentOperationsService {
  const actorId = required(input.actorId, "Actor id", 180);
  const workspaceId =
    `${input.workspaceId}:agent-actor:${actorId}`;

  async function current(): Promise<AgentWorkerHeartbeat | null> {
    const record = await input.store.getRecord({
      collectionName: AGENT_OPERATIONS_COLLECTION,
      recordId: "worker:current",
      workspaceId,
    });
    return record?.payload.kind === "agent_worker_heartbeat"
      ? record.payload.heartbeat
      : null;
  }

  return {
    async recordHeartbeat(candidate) {
      const heartbeat: AgentWorkerHeartbeat = {
        automationRuns: count(candidate.automationRuns),
        outboxProcessed: count(candidate.outboxProcessed),
        recordedAt: instant(candidate.recordedAt, "Heartbeat time"),
        signalAutomationRuns: count(candidate.signalAutomationRuns),
        workerId: required(candidate.workerId, "Worker id", 120),
      };
      await input.store.upsertRecord({
        collectionName: AGENT_OPERATIONS_COLLECTION,
        createdAt: heartbeat.recordedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload: {
          heartbeat,
          kind: "agent_worker_heartbeat",
        },
        recordId: "worker:current",
        searchText: "agent worker heartbeat operations health",
        sourceId: heartbeat.workerId,
        sourceLabel: "Orbit Agent worker heartbeat",
        sourceType: "agent_action",
        updatedAt: heartbeat.recordedAt,
        workspaceId,
      });
      return heartbeat;
    },
    async workerHealth(options = {}) {
      const heartbeat = await current();
      if (!heartbeat) {
        return { lastHeartbeat: null, state: "not_seen" };
      }
      const now = Date.parse(options.now ?? new Date().toISOString());
      const healthyWithinMs = Math.max(
        10_000,
        options.healthyWithinMs ?? 120_000,
      );
      return {
        lastHeartbeat: heartbeat,
        state:
          Number.isFinite(now) &&
          now - Date.parse(heartbeat.recordedAt) <= healthyWithinMs
            ? "healthy"
            : "stale",
      };
    },
  };
}
