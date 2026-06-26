import { listCapabilitySummaries } from "../../../../shared/services/capability-registry";
import { mockScenarioFixtures } from "../../../../shared/mock/scenarios";
import type {
  CapabilityDebugDashboardApiProbe,
  CapabilityDebugDashboardCapabilityLink,
  CapabilityDebugDashboardMockRouteLink,
  CapabilityDebugDashboardPayload,
  CapabilityDebugDashboardProvenance,
  CapabilityDebugDashboardResetControl,
  CapabilityDebugDashboardScenarioLink,
  CapabilityDebugDashboardStateProbe,
} from "./contract";
import { CAPABILITY_DEBUG_DASHBOARD_FIXTURE_SOURCE } from "./constants";

const collectedAt = "2026-06-26T10:45:00.000+09:00";

function createProvenance(input: {
  evidenceIds: readonly string[];
  generationMethod: CapabilityDebugDashboardProvenance["generationMethod"];
  sourceLabel: string;
}): CapabilityDebugDashboardProvenance {
  return {
    source: CAPABILITY_DEBUG_DASHBOARD_FIXTURE_SOURCE,
    sourceLabel: input.sourceLabel,
    evidenceIds: input.evidenceIds,
    collectedAt,
    privacy: "demo-capability-debug-dashboard-only",
    generationMethod: input.generationMethod,
    productionAdminToolsReplaced: true,
    externalObservabilityReplaced: true,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

export const capabilityDebugDashboardCapabilityLinks: readonly CapabilityDebugDashboardCapabilityLink[] =
  listCapabilitySummaries().map((capability) => ({
    id: capability.id,
    label: capability.label,
    description: capability.description,
    href: `/dev/capabilities#${capability.id}`,
    serviceStatus: capability.serviceStatus,
    mode: capability.currentMode,
  }));

export const capabilityDebugDashboardMockRouteLinks: readonly CapabilityDebugDashboardMockRouteLink[] =
  [
    {
      id: "app-bootstrap-mock-aggregator",
      label: "App bootstrap mock aggregator",
      href: "/dev/capabilities/app-bootstrap-mock-aggregator",
      boundary: "First-screen app bootstrap aggregate",
    },
    {
      id: "mock-data-mutation-reset-and-scenario-switcher",
      label: "Mock data mutation reset and scenario switcher",
      href: "/dev/capabilities/mock-data-mutation-reset-and-scenario-switcher",
      boundary: "Scenario selection and reset controls",
    },
    {
      id: "source-consistency-and-provenance-audit",
      label: "Source consistency and provenance audit",
      href: "/dev/capabilities/source-consistency-and-provenance-audit",
      boundary: "Provenance audit probe",
    },
    {
      id: "ai-provider-mock-and-provenance-boundary",
      label: "AI provider mock and provenance boundary",
      href: "/dev/capabilities/ai-provider-mock-and-provenance-boundary",
      boundary: "Provider provenance without live AI calls",
    },
  ];

export const capabilityDebugDashboardScenarioLinks: readonly CapabilityDebugDashboardScenarioLink[] =
  mockScenarioFixtures.map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    state: scenario.state,
    href: "/dev/capabilities/mock-data-mutation-reset-and-scenario-switcher",
    activationTarget: {
      method: "POST",
      path: `/api/mock/scenarios/${scenario.id}/activate`,
      expectStatus: scenario.state === "failure" ? 503 : 200,
      envelope: scenario.state === "failure" ? "failure" : "success",
    },
    evidenceIds: scenario.provenance.evidenceIds,
    nextAction: scenario.relationshipContext.nextAction,
  }));

export const capabilityDebugDashboardApiProbes: readonly CapabilityDebugDashboardApiProbe[] =
  [
    {
      name: "capability-debug-dashboard_1",
      label: "App bootstrap",
      method: "GET",
      path: "/api/app/bootstrap",
      expectStatus: 200,
      envelope: "success",
      description:
        "Returns the mock first-screen bootstrap payload for account, profile, events, followups, actions, dashboard, permissions, and notifications.",
    },
    {
      name: "capability-debug-dashboard_2",
      label: "Mock scenarios",
      method: "GET",
      path: "/api/mock/scenarios",
      expectStatus: 200,
      envelope: "success",
      description:
        "Returns deterministic scenario fixtures for success, pending, empty, and controlled failure coverage.",
    },
    {
      name: "capability-debug-dashboard_3",
      label: "Provenance audit",
      method: "GET",
      path: "/api/audit/provenance",
      expectStatus: 200,
      envelope: "success",
      description:
        "Returns the mock source and evidence provenance audit snapshot.",
    },
  ];

export const capabilityDebugDashboardStateProbes: readonly CapabilityDebugDashboardStateProbe[] =
  [
    {
      label: "Success bootstrap",
      method: "GET",
      path: "/api/app/bootstrap",
      expectStatus: 200,
      state: "success",
      envelope: "success",
    },
    {
      label: "Empty bootstrap",
      method: "GET",
      path: "/api/app/bootstrap?scenario=empty",
      expectStatus: 200,
      state: "empty",
      envelope: "success",
    },
    {
      label: "Pending audit",
      method: "GET",
      path: "/api/audit/provenance?scenario=pending",
      expectStatus: 200,
      state: "pending",
      envelope: "success",
    },
    {
      label: "Failure audit",
      method: "GET",
      path: "/api/audit/provenance?scenario=failure",
      expectStatus: 503,
      state: "failure",
      envelope: "failure",
    },
  ];

export const capabilityDebugDashboardResetControls: readonly CapabilityDebugDashboardResetControl[] =
  [
    {
      id: "reset-active-event",
      label: "Reset active-event demo",
      method: "POST",
      path: "/api/mock/reset",
      expectStatus: 200,
      description:
        "Restores the default active-event mock state through request-scope rules.",
    },
    {
      id: "reset-empty-account",
      label: "Reset empty account demo",
      method: "POST",
      path: "/api/mock/reset?scenario=empty-account-demo",
      expectStatus: 200,
      description:
        "Restores the empty-account mock state without writing production seed data.",
    },
  ];

const successProvenance = createProvenance({
  evidenceIds: [
    "evidence:debug-dashboard:capabilities",
    "evidence:debug-dashboard:scenarios",
    "evidence:debug-dashboard:api-probes",
    "evidence:debug-dashboard:reset-controls",
  ],
  generationMethod: "fixture",
  sourceLabel: "Capability debug dashboard fixture",
});

const emptyProvenance = createProvenance({
  evidenceIds: ["evidence:debug-dashboard:empty-state"],
  generationMethod: "rule-based-state",
  sourceLabel: "Capability debug dashboard empty fixture",
});

const pendingProvenance = createProvenance({
  evidenceIds: ["evidence:debug-dashboard:pending-state"],
  generationMethod: "rule-based-state",
  sourceLabel: "Capability debug dashboard pending fixture",
});

export const capabilityDebugDashboardFailureProvenance = createProvenance({
  evidenceIds: ["evidence:debug-dashboard:controlled-failure"],
  generationMethod: "rule-based-state",
  sourceLabel: "Capability debug dashboard controlled failure fixture",
});

export const capabilityDebugDashboardFixture: CapabilityDebugDashboardPayload = {
  state: "success",
  summary:
    "Mock dashboard links registered capabilities, scenario fixtures, declared API probes, and reset controls for local evaluator evidence.",
  capabilityLinks: capabilityDebugDashboardCapabilityLinks,
  mockRouteLinks: capabilityDebugDashboardMockRouteLinks,
  scenarioLinks: capabilityDebugDashboardScenarioLinks,
  apiProbes: capabilityDebugDashboardApiProbes,
  stateProbes: capabilityDebugDashboardStateProbes,
  resetControls: capabilityDebugDashboardResetControls,
  provenance: successProvenance,
  nextAction:
    "Use the linked dev surfaces to inspect mock boundaries before enabling any live admin or observability provider.",
};

export const capabilityDebugDashboardEmptyFixture: CapabilityDebugDashboardPayload =
  {
    state: "empty",
    summary:
      "No registered mock capability links are available in this deterministic empty dashboard state.",
    capabilityLinks: [],
    mockRouteLinks: [],
    scenarioLinks: [],
    apiProbes: [],
    stateProbes: [],
    resetControls: [],
    provenance: emptyProvenance,
    nextAction:
      "Restore capability registrations before expecting dashboard link coverage.",
  };

export const capabilityDebugDashboardPendingFixture: CapabilityDebugDashboardPayload =
  {
    state: "pending",
    summary:
      "The capability debug dashboard is waiting on the local capability probe refresh.",
    capabilityLinks: capabilityDebugDashboardCapabilityLinks,
    mockRouteLinks: capabilityDebugDashboardMockRouteLinks,
    scenarioLinks: capabilityDebugDashboardScenarioLinks,
    apiProbes: capabilityDebugDashboardApiProbes,
    stateProbes: capabilityDebugDashboardStateProbes,
    resetControls: capabilityDebugDashboardResetControls,
    pendingReason: "local capability probe refresh",
    provenance: pendingProvenance,
    nextAction:
      "Keep the pending state visible and continue using fixture-backed probes only.",
  };
