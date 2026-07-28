import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_LEDGER_OPERATION_TYPES,
} from "../../features/agent/ledger/contract";
import {
  AGENT_READ_TOOL_NAMES,
  AGENT_WORKFLOW_KEYS,
} from "../../features/agent/capabilities/contract";
import {
  AGENT_CAPABILITY_DEFINITIONS,
  createAgentCapabilityRegistry,
} from "../../features/agent/capabilities/registry";
import {
  createAgentDomainExecutors,
  type AgentDomainExecutorDependencies,
} from "../../features/agent/runtime/domain-executors";
import { ORBIT_AGENT_TOOL_NAMES } from "../../features/orbit-ai/agent-tools/registry";
import { ORBIT_KNOWN_WORKFLOW_KEYS } from "../../features/orbit-ai/workflows/contract";

test("agent capability registry covers every current tool, workflow, and ledger operation", () => {
  const registry = createAgentCapabilityRegistry();

  assert.deepEqual(ORBIT_AGENT_TOOL_NAMES, AGENT_READ_TOOL_NAMES);
  assert.deepEqual(ORBIT_KNOWN_WORKFLOW_KEYS, AGENT_WORKFLOW_KEYS);
  assert.deepEqual(
    registry.list({ kind: "read" }).map((capability) => capability.toolName),
    [...AGENT_READ_TOOL_NAMES],
  );
  assert.deepEqual(
    registry.list({ kind: "workflow" }).map((capability) => capability.workflowKey),
    [...AGENT_WORKFLOW_KEYS],
  );
  assert.deepEqual(
    [...new Set(
      registry
        .list()
        .flatMap((capability) => capability.operationTypes),
    )].sort(),
    [...AGENT_LEDGER_OPERATION_TYPES].sort(),
  );
});

test("runtime executors obtain key, risk, and compensation policy from one registry", () => {
  const registry = createAgentCapabilityRegistry();
  const executors = createAgentDomainExecutors(
    {} as AgentDomainExecutorDependencies,
  );
  const runtimeCapabilities = registry
    .list({ executionBoundary: "runtime_executor" })
    .map((capability) => ({
      compensationSupported: capability.compensationSupported,
      executorKey: capability.executorKey,
      riskLevel: capability.riskLevel,
    }));

  assert.deepEqual(
    executors.map((executor) => ({
      compensationSupported: Boolean(executor.compensate),
      executorKey: executor.key,
      riskLevel: executor.riskLevel,
    })),
    runtimeCapabilities,
  );
});

test("agent capability registry exposes trigger, permission, confirmation, and surface policy", () => {
  const registry = createAgentCapabilityRegistry();
  const calendar = registry.require("calendar.syncEvent");
  const preEventBrief = registry.require("pre_event_brief_v1");
  const relationshipContext = registry.require("chat.context");

  assert.deepEqual(calendar.requiredPermissions, [
    "calendar.events.write",
  ]);
  assert.equal(calendar.confirmationPolicy, "per_operation");
  assert.equal(calendar.riskLevel, "external");
  assert.equal(calendar.compensationSupported, true);
  assert.deepEqual(calendar.surfaces, ["chat", "today", "ledger"]);

  assert.deepEqual(preEventBrief.triggers, [
    "scheduler",
    "domain_signal",
    "manual",
  ]);
  assert.equal(preEventBrief.surfaces.includes("chat"), false);
  assert.equal(preEventBrief.userConfigurableAutomation, true);

  assert.equal(relationshipContext.confirmationPolicy, "none");
  assert.equal(relationshipContext.riskLevel, "read");
});

test("agent capability registry rejects duplicate and structurally unsafe definitions", () => {
  assert.throws(
    () =>
      createAgentCapabilityRegistry([
        AGENT_CAPABILITY_DEFINITIONS[0],
        AGENT_CAPABILITY_DEFINITIONS[0],
      ]),
    /Duplicate Agent capability id/,
  );

  assert.throws(
    () =>
      createAgentCapabilityRegistry([
        {
          ...AGENT_CAPABILITY_DEFINITIONS.find(
            (capability) => capability.id === "calendar.syncEvent",
          )!,
          confirmationPolicy: "none",
        },
      ]),
    /external capability must require confirmation/,
  );
});
