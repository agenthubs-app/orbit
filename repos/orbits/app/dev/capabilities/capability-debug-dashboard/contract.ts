/**
 * Capability debug dashboard 的契约定义。
 *
 * 这里描述 dashboard payload 中的能力链接、mock route、scenario、
 * API probe、reset control 和 provenance 字段，供 UI、service 和测试共享。
 */
import type { AppErrorCode } from "../../../../shared/errors/app-error";
import type { CapabilityServiceStatus } from "../../../../shared/services/capability-registry";
import type { ModuleMode } from "../../../../shared/services/module-mode";
import type {
  CapabilityDebugDashboardErrorCode,
  CapabilityDebugDashboardErrorDefinition,
} from "./error-codes";

export {
  CAPABILITY_DEBUG_DASHBOARD_SLUG,
} from "./constants";

export type CapabilityDebugDashboardScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type CapabilityDebugDashboardState = "success" | "empty" | "pending";
export type CapabilityDebugDashboardProbeState =
  CapabilityDebugDashboardScenario;
export type CapabilityDebugDashboardEnvelope = "success" | "failure";
export type CapabilityDebugDashboardMethod = "GET" | "POST";

export interface CapabilityDebugDashboardCapabilityLink {
  id: string;
  label: string;
  description: string;
  href: string;
  serviceStatus: CapabilityServiceStatus | "not-implemented";
  mode: ModuleMode;
}

export interface CapabilityDebugDashboardMockRouteLink {
  id: string;
  label: string;
  href: string;
  boundary: string;
}

export interface CapabilityDebugDashboardScenarioLink {
  id: string;
  label: string;
  description: string;
  state: CapabilityDebugDashboardProbeState;
  href: string;
  activationTarget: {
    method: "POST";
    path: string;
    expectStatus: 200 | 503;
    envelope: CapabilityDebugDashboardEnvelope;
  };
  evidenceIds: readonly string[];
  nextAction: string;
}

export interface CapabilityDebugDashboardApiProbe {
  name: string;
  label: string;
  method: "GET";
  path: string;
  expectStatus: 200;
  envelope: "success";
  description: string;
}

export interface CapabilityDebugDashboardStateProbe {
  label: string;
  method: "GET";
  path: string;
  expectStatus: 200 | 503;
  state: CapabilityDebugDashboardProbeState;
  envelope: CapabilityDebugDashboardEnvelope;
}

export interface CapabilityDebugDashboardResetControl {
  id: string;
  label: string;
  method: "POST";
  path: string;
  expectStatus: 200;
  description: string;
}

export interface CapabilityDebugDashboardProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-capability-debug-dashboard-only";
  generationMethod: "fixture" | "rule-based-state";
  productionAdminToolsReplaced: true;
  externalObservabilityReplaced: true;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

export interface CapabilityDebugDashboardPayload {
  state: CapabilityDebugDashboardState;
  summary: string;
  capabilityLinks: readonly CapabilityDebugDashboardCapabilityLink[];
  mockRouteLinks: readonly CapabilityDebugDashboardMockRouteLink[];
  scenarioLinks: readonly CapabilityDebugDashboardScenarioLink[];
  apiProbes: readonly CapabilityDebugDashboardApiProbe[];
  stateProbes: readonly CapabilityDebugDashboardStateProbe[];
  resetControls: readonly CapabilityDebugDashboardResetControl[];
  pendingReason?: string;
  provenance: CapabilityDebugDashboardProvenance;
  nextAction: string;
}

export type {
  CapabilityDebugDashboardErrorCode,
  CapabilityDebugDashboardErrorDefinition,
};

export {
  CAPABILITY_DEBUG_DASHBOARD_ERROR_CODES,
  CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS,
  capabilityDebugDashboardFailureContext,
  capabilityDebugDashboardFailureToAppError,
} from "./error-codes";

export {
  capabilityDebugDashboardApiProbes,
  capabilityDebugDashboardCapabilityLinks,
  capabilityDebugDashboardEmptyFixture,
  capabilityDebugDashboardFailureProvenance,
  capabilityDebugDashboardFixture,
  capabilityDebugDashboardMockRouteLinks,
  capabilityDebugDashboardPendingFixture,
  capabilityDebugDashboardResetControls,
  capabilityDebugDashboardScenarioLinks,
  capabilityDebugDashboardStateProbes,
} from "./fixtures";

export type {
  CapabilityDebugDashboardFailure,
  CapabilityDebugDashboardInput,
  CapabilityDebugDashboardResult,
  CapabilityDebugDashboardService,
  CapabilityDebugDashboardSuccess,
} from "./service";

export type CapabilityDebugDashboardAppErrorCode = AppErrorCode;
