import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAgentSignalRequest,
  type AgentSignalRequestDependencies,
} from "../../app/api/agent/signals/request";
import type { AgentSignalService } from "../../features/agent/signals/contract";

test("Agent signals use the canonical authenticated account actor", async () => {
  const service = {} as AgentSignalService;
  let serviceActorId = "";
  const dependencies: AgentSignalRequestDependencies = {
    resolveActor: async () => ({ id: " account_orbit_generated " }),
    serviceForActor: (actorId) => {
      serviceActorId = actorId;
      return service;
    },
  };

  const context = await resolveAgentSignalRequest(dependencies);

  assert.equal(context?.actorId, "account_orbit_generated");
  assert.equal(context?.service, service);
  assert.equal(serviceActorId, "account_orbit_generated");
});

test("Agent signals reject sessions without canonical membership", async () => {
  let serviceCreated = false;
  const context = await resolveAgentSignalRequest({
    resolveActor: async () => null,
    serviceForActor: () => {
      serviceCreated = true;
      return {} as AgentSignalService;
    },
  });

  assert.equal(context, null);
  assert.equal(serviceCreated, false);
});
