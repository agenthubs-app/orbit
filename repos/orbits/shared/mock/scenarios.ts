import type { ApiErrorContext } from "../api/envelope";
import type { FeatureMode } from "../config/feature-mode";
import { AppError, type AppErrorCode } from "../errors/app-error";
import { cloneMockState } from "./state-store";

export const MOCK_SCENARIO_FIXTURE_SOURCE =
  "fixture:shared/mock/scenarios.ts";
export const DEFAULT_MOCK_SCENARIO_ID = "active-event-demo";
export const MOCK_DATA_SCENARIO_SERVICE =
  "mock-data-mutation-reset-and-scenario-switcher";

export const MOCK_SCENARIO_IDS = [
  "new-user-demo",
  "active-event-demo",
  "post-event-demo",
  "dormant-network-demo",
  "empty-account-demo",
  "error-demo",
] as const;

export type MockScenarioId = (typeof MOCK_SCENARIO_IDS)[number];
export type MockScenarioKind =
  | "new-user"
  | "active-event"
  | "post-event"
  | "dormant-network"
  | "empty-account"
  | "error";
export type MockScenarioState = "success" | "empty" | "pending" | "failure";

export const MOCK_SCENARIO_ERROR_CODES = [
  "MOCK_SCENARIO_NOT_FOUND",
  "MOCK_SCENARIO_CONTROLLED_FAILURE",
] as const;

export type MockScenarioErrorCode =
  (typeof MOCK_SCENARIO_ERROR_CODES)[number];

export const MOCK_SCENARIO_ERROR_DEFINITIONS: Record<
  MockScenarioErrorCode,
  {
    appCode: AppErrorCode;
    message: string;
    recovery: string;
  }
> = {
  MOCK_SCENARIO_NOT_FOUND: {
    appCode: "NOT_FOUND",
    message: "The requested mock scenario is not registered.",
    recovery:
      "Choose one of the mock scenario switcher fixture ids returned by GET /api/mock/scenarios.",
  },
  MOCK_SCENARIO_CONTROLLED_FAILURE: {
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock scenario switcher is pinned to a controlled failure scenario.",
    recovery:
      "Switch the scenario switcher to a non-error fixture before resetting mock data.",
  },
};

export interface MockScenarioProvenance {
  source: typeof MOCK_SCENARIO_FIXTURE_SOURCE;
  generationMethod: "fixture";
  evidenceIds: readonly string[];
  productionSeedManagementReplaced: true;
  persistentUserScenarioStorageReplaced: true;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

export interface MockScenarioRelationshipContext {
  accountLabel: string;
  profileLabel: string;
  eventLabel: string;
  contactCount: number;
  eventCount: number;
  taskCount: number;
  evidenceCount: number;
  nextAction: string;
}

export interface MockScenarioFixture {
  id: MockScenarioId;
  label: string;
  description: string;
  scenarioKind: MockScenarioKind;
  state: MockScenarioState;
  selected: boolean;
  relationshipContext: MockScenarioRelationshipContext;
  provenance: MockScenarioProvenance;
}

export interface MockScenarioListPayload {
  activeScenarioId: MockScenarioId;
  scenarios: readonly MockScenarioFixture[];
  stateCounts: Record<MockScenarioState, number>;
  provenance: MockScenarioProvenance;
}

export interface MockScenarioMutation {
  type: "scenario-activation";
  seedManagement: "deterministic-fixture-switch";
  persistentStorage: "rule-based-request-scope-selection";
  externalServicesTouched: false;
}

export interface MockScenarioActivationPayload {
  activeScenarioId: MockScenarioId;
  selectedScenario: MockScenarioFixture;
  mutation: MockScenarioMutation;
  provenance: MockScenarioProvenance;
}

export interface MockScenarioFailure {
  success: false;
  error: {
    code: MockScenarioErrorCode;
    appCode: AppErrorCode;
    message: string;
    recovery: string;
    provenance: MockScenarioProvenance;
  };
}

export type MockScenarioResult<TData> =
  | {
      success: true;
      data: TData;
    }
  | MockScenarioFailure;

export interface MockScenarioService {
  listScenarios: () => MockScenarioResult<MockScenarioListPayload>;
  activateScenario: (
    scenarioId: string,
  ) => MockScenarioResult<MockScenarioActivationPayload>;
}

const evidencePrefix = "evidence_mock_scenario";

function createProvenance(
  evidenceIds: readonly string[],
): MockScenarioProvenance {
  return {
    source: MOCK_SCENARIO_FIXTURE_SOURCE,
    generationMethod: "fixture",
    evidenceIds,
    productionSeedManagementReplaced: true,
    persistentUserScenarioStorageReplaced: true,
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

export const mockScenarioFixtures: readonly MockScenarioFixture[] = [
  {
    id: "new-user-demo",
    label: "New user",
    description:
      "A freshly created workspace with onboarding context and no imported relationship graph.",
    scenarioKind: "new-user",
    state: "success",
    selected: false,
    relationshipContext: {
      accountLabel: "Orbit Demo Workspace",
      profileLabel: "New operator",
      eventLabel: "No event selected",
      contactCount: 1,
      eventCount: 0,
      taskCount: 1,
      evidenceCount: 1,
      nextAction: "Complete profile context before importing contacts.",
    },
    provenance: createProvenance([`${evidencePrefix}_new_user`]),
  },
  {
    id: "active-event-demo",
    label: "Active event",
    description:
      "A live event readiness scenario with attendees, goals, and pending on-site actions.",
    scenarioKind: "active-event",
    state: "pending",
    selected: true,
    relationshipContext: {
      accountLabel: "Orbit Demo Workspace",
      profileLabel: "Ari Kato",
      eventLabel: "Orbit Summit Founder Roundtable",
      contactCount: 12,
      eventCount: 1,
      taskCount: 4,
      evidenceCount: 7,
      nextAction: "Review warm targets before the next session starts.",
    },
    provenance: createProvenance([`${evidencePrefix}_active_event`]),
  },
  {
    id: "post-event-demo",
    label: "Post-event",
    description:
      "A post-event review board with imported attendees, connection notes, and follow-up tasks.",
    scenarioKind: "post-event",
    state: "success",
    selected: false,
    relationshipContext: {
      accountLabel: "Orbit Demo Workspace",
      profileLabel: "Ari Kato",
      eventLabel: "Orbit Summit Founder Roundtable",
      contactCount: 18,
      eventCount: 1,
      taskCount: 6,
      evidenceCount: 11,
      nextAction: "Confirm the highest-value follow-ups from sourced notes.",
    },
    provenance: createProvenance([`${evidencePrefix}_post_event`]),
  },
  {
    id: "dormant-network-demo",
    label: "Dormant network",
    description:
      "A relationship graph with stale high-value contacts and reactivation suggestions.",
    scenarioKind: "dormant-network",
    state: "success",
    selected: false,
    relationshipContext: {
      accountLabel: "Orbit Demo Workspace",
      profileLabel: "Ari Kato",
      eventLabel: "No current event",
      contactCount: 42,
      eventCount: 0,
      taskCount: 8,
      evidenceCount: 15,
      nextAction: "Pick dormant relationships with recent context to revive.",
    },
    provenance: createProvenance([`${evidencePrefix}_dormant_network`]),
  },
  {
    id: "empty-account-demo",
    label: "Empty account",
    description:
      "An account with no contacts, events, tasks, or relationship evidence yet.",
    scenarioKind: "empty-account",
    state: "empty",
    selected: false,
    relationshipContext: {
      accountLabel: "Orbit Empty Workspace",
      profileLabel: "Ari Kato",
      eventLabel: "No event selected",
      contactCount: 0,
      eventCount: 0,
      taskCount: 0,
      evidenceCount: 0,
      nextAction: "Add a sourced contact or import an event roster.",
    },
    provenance: createProvenance([`${evidencePrefix}_empty_account`]),
  },
  {
    id: "error-demo",
    label: "Error state",
    description:
      "A controlled failure fixture used to prove the scenario boundary returns safe envelopes.",
    scenarioKind: "error",
    state: "failure",
    selected: false,
    relationshipContext: {
      accountLabel: "Orbit Demo Workspace",
      profileLabel: "Ari Kato",
      eventLabel: "Controlled failure fixture",
      contactCount: 0,
      eventCount: 0,
      taskCount: 0,
      evidenceCount: 1,
      nextAction: "Select a non-error fixture before continuing.",
    },
    provenance: createProvenance([`${evidencePrefix}_error_state`]),
  },
];

function isMockScenarioId(value: string): value is MockScenarioId {
  return MOCK_SCENARIO_IDS.includes(value as MockScenarioId);
}

function findScenario(scenarioId: string): MockScenarioFixture | null {
  if (!isMockScenarioId(scenarioId)) {
    return null;
  }

  return (
    mockScenarioFixtures.find((scenario) => scenario.id === scenarioId) ?? null
  );
}

function scenarioWithSelection(
  scenario: MockScenarioFixture,
  activeScenarioId: MockScenarioId,
): MockScenarioFixture {
  return {
    ...scenario,
    selected: scenario.id === activeScenarioId,
  };
}

function stateCounts(
  scenarios: readonly MockScenarioFixture[],
): Record<MockScenarioState, number> {
  return scenarios.reduce(
    (counts, scenario) => ({
      ...counts,
      [scenario.state]: counts[scenario.state] + 1,
    }),
    {
      empty: 0,
      failure: 0,
      pending: 0,
      success: 0,
    } satisfies Record<MockScenarioState, number>,
  );
}

function success<TData>(data: TData): MockScenarioResult<TData> {
  return {
    success: true,
    data: cloneMockState(data),
  };
}

function failure(code: MockScenarioErrorCode): MockScenarioFailure {
  const definition = MOCK_SCENARIO_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      code,
      appCode: definition.appCode,
      message: definition.message,
      recovery: definition.recovery,
      provenance: createProvenance([`${evidencePrefix}_failure`]),
    },
  };
}

export function mockScenarioFailureToAppError(
  result: MockScenarioFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function mockScenarioFailureContext(
  result: MockScenarioFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: "developer-admin",
    mode,
    mockScenarioErrorCode: result.error.code,
    privacy: "no-relationship-data",
    provenance: "Mock scenario failure came from deterministic fixture rules.",
    service: MOCK_DATA_SCENARIO_SERVICE,
  };
}

export function scenarioPayloadFor(
  activeScenarioId = DEFAULT_MOCK_SCENARIO_ID,
): MockScenarioListPayload {
  const activeId = isMockScenarioId(activeScenarioId)
    ? activeScenarioId
    : DEFAULT_MOCK_SCENARIO_ID;
  const scenarios = mockScenarioFixtures.map((scenario) =>
    scenarioWithSelection(scenario, activeId),
  );

  return {
    activeScenarioId: activeId,
    scenarios,
    stateCounts: stateCounts(scenarios),
    provenance: createProvenance([`${evidencePrefix}_list`]),
  };
}

export function createMockScenarioService(): MockScenarioService {
  return {
    listScenarios() {
      return success(scenarioPayloadFor());
    },
    activateScenario(scenarioId) {
      const scenario = findScenario(scenarioId);

      if (!scenario) {
        return failure("MOCK_SCENARIO_NOT_FOUND");
      }

      if (scenario.state === "failure") {
        return failure("MOCK_SCENARIO_CONTROLLED_FAILURE");
      }

      return success({
        activeScenarioId: scenario.id,
        selectedScenario: scenarioWithSelection(scenario, scenario.id),
        mutation: {
          type: "scenario-activation",
          seedManagement: "deterministic-fixture-switch",
          persistentStorage: "rule-based-request-scope-selection",
          externalServicesTouched: false,
        },
        provenance: createProvenance([`${evidencePrefix}_activate`]),
      });
    },
  };
}

export function getMockScenarioFixture(
  scenarioId: string,
): MockScenarioFixture | null {
  const scenario = findScenario(scenarioId);

  return scenario ? cloneMockState(scenario) : null;
}
