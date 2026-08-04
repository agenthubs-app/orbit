import {
  AGENT_READ_TOOL_NAMES,
  AGENT_RUNTIME_EXECUTOR_KEYS,
  AGENT_WORKFLOW_KEYS,
  type AgentCapabilityDefinition,
  type AgentCapabilityListFilter,
  type AgentCapabilityRegistry,
  type AgentRuntimeExecutorKey,
} from "./contract";

const allModes = ["mock", "hybrid", "live"] as const;

function readCapability(
  input: Pick<
    AgentCapabilityDefinition,
    "description" | "domains" | "title" | "toolName"
  > &
    Partial<
      Pick<
        AgentCapabilityDefinition,
        "triggers" | "userConfigurableAutomation"
      >
    >,
): AgentCapabilityDefinition {
  return {
    id: input.toolName,
    version: 1,
    kind: "read",
    title: input.title,
    description: input.description,
    domains: input.domains,
    executionBoundary: "artifact_tool",
    riskLevel: "read",
    confirmationPolicy: "none",
    allowedModes: allModes,
    requiredPermissions: [],
    evidenceRequired: true,
    compensationSupported: false,
    operationTypes: [],
    triggers: input.triggers ?? ["chat", "manual"],
    userConfigurableAutomation:
      input.userConfigurableAutomation ?? false,
    surfaces: ["chat"],
    toolName: input.toolName,
  };
}

function runtimeAction(
  input: Pick<
    AgentCapabilityDefinition,
    | "compensationSupported"
    | "description"
    | "domains"
    | "executorKey"
    | "operationTypes"
    | "requiredPermissions"
    | "riskLevel"
    | "surfaces"
    | "title"
    | "triggers"
    | "userConfigurableAutomation"
  >,
): AgentCapabilityDefinition {
  return {
    id: input.executorKey,
    version: 1,
    kind: "action",
    title: input.title,
    description: input.description,
    domains: input.domains,
    executionBoundary: "runtime_executor",
    riskLevel: input.riskLevel,
    confirmationPolicy: "per_operation",
    allowedModes: allModes,
    requiredPermissions: input.requiredPermissions,
    evidenceRequired: true,
    compensationSupported: input.compensationSupported,
    operationTypes: input.operationTypes,
    triggers: input.triggers,
    userConfigurableAutomation: input.userConfigurableAutomation,
    surfaces: input.surfaces,
    executorKey: input.executorKey,
  };
}

function workflowServiceAction(
  input: Pick<
    AgentCapabilityDefinition,
    | "description"
    | "domains"
    | "id"
    | "operationTypes"
    | "requiredPermissions"
    | "surfaces"
    | "title"
  >,
): AgentCapabilityDefinition {
  return {
    id: input.id,
    version: 1,
    kind: "action",
    title: input.title,
    description: input.description,
    domains: input.domains,
    executionBoundary: "workflow_service",
    riskLevel: "write",
    confirmationPolicy: "workflow_gate",
    allowedModes: allModes,
    requiredPermissions: input.requiredPermissions,
    evidenceRequired: true,
    compensationSupported: false,
    operationTypes: input.operationTypes,
    triggers: ["today", "manual"],
    userConfigurableAutomation: false,
    surfaces: input.surfaces,
  };
}

function workflowCapability(
  input: Pick<
    AgentCapabilityDefinition,
    | "description"
    | "domains"
    | "operationTypes"
    | "surfaces"
    | "title"
    | "triggers"
    | "userConfigurableAutomation"
    | "workflowKey"
  >,
): AgentCapabilityDefinition {
  return {
    id: input.workflowKey,
    version: 1,
    kind: "workflow",
    title: input.title,
    description: input.description,
    domains: input.domains,
    executionBoundary: "workflow",
    riskLevel: "write",
    confirmationPolicy: "workflow_gate",
    allowedModes: allModes,
    requiredPermissions: [],
    evidenceRequired: true,
    compensationSupported: false,
    operationTypes: input.operationTypes,
    triggers: input.triggers,
    userConfigurableAutomation: input.userConfigurableAutomation,
    surfaces: input.surfaces,
    workflowKey: input.workflowKey,
  };
}

export const AGENT_CAPABILITY_DEFINITIONS = [
  readCapability({
    toolName: AGENT_READ_TOOL_NAMES[0],
    title: "Recommend events",
    description:
      "Rank source-backed events and preparation opportunities for review.",
    domains: ["agent", "events"],
    triggers: ["chat", "scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
  }),
  readCapability({
    toolName: AGENT_READ_TOOL_NAMES[1],
    title: "Recommend contacts",
    description:
      "Find source-backed contacts and warm relationship paths.",
    domains: ["agent", "contacts"],
    triggers: ["chat", "scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
  }),
  readCapability({
    toolName: AGENT_READ_TOOL_NAMES[2],
    title: "Review follow-up queue",
    description:
      "Rank overdue, upcoming, and dormant relationship follow-ups.",
    domains: ["agent", "followups"],
    triggers: ["chat", "scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
  }),
  readCapability({
    toolName: AGENT_READ_TOOL_NAMES[3],
    title: "Read relationship context",
    description:
      "Read grounded relationship context for explanations and drafting.",
    domains: ["agent", "chat", "contacts"],
    triggers: ["chat", "scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[0],
    title: "Create follow-up task",
    description: "Create an internal Orbit follow-up or preparation task.",
    domains: ["agent", "followups"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["create_followup_task", "create_preparation_task"],
    triggers: ["chat", "today", "scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
    surfaces: ["chat", "today", "ledger", "event", "background"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[1],
    title: "Create reminder",
    description: "Schedule an internal Orbit relationship reminder.",
    domains: ["agent", "followups", "notifications"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["create_followup_reminder"],
    triggers: ["chat", "today", "scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
    surfaces: ["chat", "today", "ledger", "background"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[2],
    title: "Save message draft",
    description:
      "Save relationship-aware copy as an internal draft without sending.",
    domains: ["agent", "chat", "followups"],
    riskLevel: "draft",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["save_message_draft"],
    triggers: ["chat", "today", "domain_signal", "manual"],
    userConfigurableAutomation: true,
    surfaces: ["chat", "today", "ledger", "event"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[3],
    title: "Save meeting note",
    description: "Persist a user-confirmed typed note or voice transcript.",
    domains: ["agent", "events"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["save_meeting_note"],
    triggers: ["manual"],
    userConfigurableAutomation: false,
    surfaces: ["today", "ledger", "event"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[4],
    title: "Save pre-event brief",
    description: "Persist a source-backed pre-event brief in Orbit.",
    domains: ["agent", "events"],
    riskLevel: "draft",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["generate_meeting_brief"],
    triggers: ["scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
    surfaces: ["today", "ledger", "event", "background"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[5],
    title: "Save event goal",
    description: "Persist the user's confirmed goal for an event.",
    domains: ["agent", "events"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["save_event_goal"],
    triggers: ["today", "manual"],
    userConfigurableAutomation: false,
    surfaces: ["today", "ledger", "event"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[6],
    title: "Add to Orbit schedule",
    description: "Add an event to the internal Orbit schedule.",
    domains: ["agent", "events"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["add_to_orbit_schedule"],
    triggers: ["today", "manual"],
    userConfigurableAutomation: false,
    surfaces: ["today", "ledger", "event"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[7],
    title: "Archive contacts",
    description: "Archive confirmed contacts into Orbit relationship storage.",
    domains: ["agent", "contacts"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["archive_contacts"],
    triggers: ["manual"],
    userConfigurableAutomation: false,
    surfaces: ["ledger"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[8],
    title: "Sync event to calendar",
    description:
      "Create a provider calendar event after explicit confirmation.",
    domains: ["agent", "calendar", "events"],
    riskLevel: "external",
    requiredPermissions: ["calendar.events.write"],
    compensationSupported: true,
    operationTypes: ["sync_event_to_calendar"],
    triggers: ["chat", "today", "manual"],
    userConfigurableAutomation: false,
    surfaces: ["chat", "today", "ledger"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[9],
    title: "Retired introduction request boundary",
    description:
      "Fail closed for queued legacy introduction actions; new contact requests use event operations.",
    domains: ["agent", "events", "matchmaking"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: false,
    operationTypes: ["create_intro_request"],
    triggers: ["manual"],
    userConfigurableAutomation: false,
    surfaces: ["today", "ledger", "event"],
  }),
  runtimeAction({
    executorKey: AGENT_RUNTIME_EXECUTOR_KEYS[10],
    title: "Save Agent memory",
    description:
      "Save user-confirmed long-term context from an explicit conversation request.",
    domains: ["agent", "memory"],
    riskLevel: "write",
    requiredPermissions: [],
    compensationSupported: true,
    operationTypes: ["save_memory"],
    triggers: ["chat", "manual"],
    userConfigurableAutomation: false,
    surfaces: ["chat", "ledger"],
  }),
  workflowServiceAction({
    id: "matchmaking.acceptIntroductionRequest",
    title: "Retired introduction response boundary",
    description:
      "Legacy introduction responses are read-only; event operations owns current contact-request consent.",
    domains: ["agent", "events", "matchmaking"],
    requiredPermissions: [],
    operationTypes: ["accept_intro_request"],
    surfaces: ["today", "ledger", "event"],
  }),
  workflowServiceAction({
    id: "matchmaking.proposeMeetingSlots",
    title: "Retired matchmaking slot boundary",
    description:
      "Legacy matchmaking slots are read-only; accepted event contacts use the appointment aggregate.",
    domains: ["agent", "events", "matchmaking"],
    requiredPermissions: [],
    operationTypes: ["propose_meeting_slots"],
    surfaces: ["today", "ledger", "event"],
  }),
  workflowCapability({
    workflowKey: AGENT_WORKFLOW_KEYS[0],
    title: "Post-event follow-up",
    description:
      "Turn a verified encounter into a note, draft, task, and reminder proposal.",
    domains: ["agent", "events", "followups"],
    operationTypes: [
      "save_meeting_note",
      "save_message_draft",
      "create_followup_task",
      "create_followup_reminder",
    ],
    triggers: ["chat", "domain_signal", "manual"],
    userConfigurableAutomation: true,
    surfaces: ["chat", "today", "ledger", "event", "background"],
  }),
  workflowCapability({
    workflowKey: AGENT_WORKFLOW_KEYS[1],
    title: "Pre-event brief",
    description:
      "Prepare a grounded event brief, goal, preparation task, and schedule proposal.",
    domains: ["agent", "calendar", "events", "followups"],
    operationTypes: [
      "generate_meeting_brief",
      "save_event_goal",
      "create_preparation_task",
      "add_to_orbit_schedule",
      "sync_event_to_calendar",
    ],
    triggers: ["scheduler", "domain_signal", "manual"],
    userConfigurableAutomation: true,
    surfaces: ["today", "ledger", "event", "background"],
  }),
  workflowCapability({
    workflowKey: AGENT_WORKFLOW_KEYS[2],
    title: "Retired event matchmaking boundary",
    description:
      "Intercept retired matchmaking triggers and fail closed without ranking, fallback, or writes.",
    domains: ["agent", "events", "matchmaking"],
    operationTypes: [
      "create_intro_request",
      "accept_intro_request",
      "propose_meeting_slots",
    ],
    triggers: ["today", "domain_signal", "manual"],
    userConfigurableAutomation: false,
    surfaces: ["today", "ledger", "event"],
  }),
] as const satisfies readonly AgentCapabilityDefinition[];

function validateDefinitions(
  definitions: readonly AgentCapabilityDefinition[],
): void {
  const ids = new Set<string>();
  const executorKeys = new Set<string>();
  const toolNames = new Set<string>();
  const workflowKeys = new Set<string>();

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate Agent capability id: ${definition.id}`);
    }
    ids.add(definition.id);

    if (
      definition.riskLevel === "external" &&
      definition.confirmationPolicy === "none"
    ) {
      throw new Error(
        `${definition.id}: external capability must require confirmation.`,
      );
    }
    if (
      definition.executionBoundary === "runtime_executor" &&
      !definition.executorKey
    ) {
      throw new Error(
        `${definition.id}: runtime executor capability requires executorKey.`,
      );
    }
    if (
      definition.executionBoundary === "artifact_tool" &&
      (!definition.toolName ||
        definition.riskLevel !== "read" ||
        definition.confirmationPolicy !== "none")
    ) {
      throw new Error(
        `${definition.id}: artifact tools must be read-only and require no confirmation.`,
      );
    }
    if (
      definition.executionBoundary === "workflow" &&
      !definition.workflowKey
    ) {
      throw new Error(
        `${definition.id}: workflow capability requires workflowKey.`,
      );
    }
    if (definition.executorKey) {
      if (executorKeys.has(definition.executorKey)) {
        throw new Error(
          `Duplicate Agent executor key: ${definition.executorKey}`,
        );
      }
      executorKeys.add(definition.executorKey);
    }
    if (definition.toolName) {
      if (toolNames.has(definition.toolName)) {
        throw new Error(`Duplicate Agent tool name: ${definition.toolName}`);
      }
      toolNames.add(definition.toolName);
    }
    if (definition.workflowKey) {
      if (workflowKeys.has(definition.workflowKey)) {
        throw new Error(
          `Duplicate Agent workflow key: ${definition.workflowKey}`,
        );
      }
      workflowKeys.add(definition.workflowKey);
    }
  }
}

function matchesFilter(
  definition: AgentCapabilityDefinition,
  filter: AgentCapabilityListFilter,
): boolean {
  return (
    (!filter.kind || definition.kind === filter.kind) &&
    (!filter.executionBoundary ||
      definition.executionBoundary === filter.executionBoundary) &&
    (!filter.trigger || definition.triggers.includes(filter.trigger)) &&
    (!filter.surface || definition.surfaces.includes(filter.surface))
  );
}

export function createAgentCapabilityRegistry(
  definitions: readonly AgentCapabilityDefinition[] =
    AGENT_CAPABILITY_DEFINITIONS,
): AgentCapabilityRegistry {
  validateDefinitions(definitions);
  const byId = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const byExecutorKey = new Map(
    definitions.flatMap((definition) =>
      definition.executorKey
        ? [[definition.executorKey, definition] as const]
        : [],
    ),
  );
  const byToolName = new Map(
    definitions.flatMap((definition) =>
      definition.toolName
        ? [[definition.toolName, definition] as const]
        : [],
    ),
  );
  const byWorkflowKey = new Map(
    definitions.flatMap((definition) =>
      definition.workflowKey
        ? [[definition.workflowKey, definition] as const]
        : [],
    ),
  );

  return {
    get: (id) => byId.get(id) ?? null,
    require(id) {
      const definition = byId.get(id);
      if (!definition) {
        throw new Error(`Unknown Agent capability: ${id}`);
      }
      return definition;
    },
    getByExecutorKey: (executorKey) =>
      byExecutorKey.get(executorKey as AgentRuntimeExecutorKey) ?? null,
    getByToolName: (toolName) =>
      byToolName.get(toolName as (typeof AGENT_READ_TOOL_NAMES)[number]) ??
      null,
    getByWorkflowKey: (workflowKey) =>
      byWorkflowKey.get(
        workflowKey as (typeof AGENT_WORKFLOW_KEYS)[number],
      ) ?? null,
    list: (filter = {}) =>
      definitions.filter((definition) => matchesFilter(definition, filter)),
  };
}

const defaultAgentCapabilityRegistry = createAgentCapabilityRegistry();

export function getAgentRuntimeExecutorDescriptor(
  executorKey: AgentRuntimeExecutorKey,
): Pick<
  AgentCapabilityDefinition,
  "riskLevel"
> & { key: AgentRuntimeExecutorKey } {
  const capability =
    defaultAgentCapabilityRegistry.getByExecutorKey(executorKey);
  if (!capability?.executorKey) {
    throw new Error(`Unknown Agent runtime executor: ${executorKey}`);
  }
  return {
    key: capability.executorKey,
    riskLevel: capability.riskLevel,
  };
}
