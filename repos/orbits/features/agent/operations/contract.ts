export type AgentWorkerHealthState = "healthy" | "stale" | "not_seen";

export interface AgentWorkerHeartbeat {
  workerId: string;
  recordedAt: string;
  outboxProcessed: number;
  automationRuns: number;
  signalAutomationRuns: number;
}

export interface AgentWorkerHealth {
  state: AgentWorkerHealthState;
  lastHeartbeat: AgentWorkerHeartbeat | null;
}

export interface AgentOperationsRecordPayload
  extends Record<string, unknown> {
  kind: "agent_worker_heartbeat";
  heartbeat: AgentWorkerHeartbeat;
}

export interface AgentOperationsService {
  recordHeartbeat: (
    heartbeat: AgentWorkerHeartbeat,
  ) => Promise<AgentWorkerHeartbeat>;
  workerHealth: (input?: {
    now?: string;
    healthyWithinMs?: number;
  }) => Promise<AgentWorkerHealth>;
}
