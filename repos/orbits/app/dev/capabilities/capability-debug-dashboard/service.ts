/**
 * Capability debug dashboard service contract。
 *
 * UI 和 route 只依赖这个接口，不直接绑定 mock fixture 的实现细节。
 */
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
