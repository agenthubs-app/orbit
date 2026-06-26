import type {
  CapabilityDebugDashboardErrorDefinition,
  CapabilityDebugDashboardProvenance,
  CapabilityDebugDashboardScenario,
  CapabilityDebugDashboardPayload,
} from "./contract";

export interface CapabilityDebugDashboardInput {
  scenario?: CapabilityDebugDashboardScenario | string | null;
}

export interface CapabilityDebugDashboardSuccess {
  success: true;
  data: CapabilityDebugDashboardPayload;
}

export interface CapabilityDebugDashboardFailure {
  success: false;
  error: CapabilityDebugDashboardErrorDefinition & {
    state: "failure";
    provenance: CapabilityDebugDashboardProvenance;
    evidenceIds: readonly string[];
  };
}

export type CapabilityDebugDashboardResult =
  | CapabilityDebugDashboardSuccess
  | CapabilityDebugDashboardFailure;

export interface CapabilityDebugDashboardService {
  getDashboard: (
    input?: CapabilityDebugDashboardInput,
  ) => CapabilityDebugDashboardResult;
}
