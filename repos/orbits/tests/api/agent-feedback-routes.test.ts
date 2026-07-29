import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentFeedback,
  AgentFeedbackService,
} from "../../features/agent/feedback/contract";
import type { AgentRuntimeService } from "../../features/agent/runtime/service";
import type { AgentFeedbackRequestContext } from "../../app/api/agent/feedback/request";
import { saveAgentFeedback } from "../../app/api/agent/feedback/handler";

function feedbackService(
  upsert: AgentFeedbackService["upsert"],
): AgentFeedbackService {
  return {
    context: async () => [],
    get: async () => null,
    list: async () => [],
    remove: async () => undefined,
    upsert,
  };
}

function requestContext(input: {
  getRun: AgentRuntimeService["getRun"];
  upsert: AgentFeedbackService["upsert"];
}): AgentFeedbackRequestContext {
  return {
    runtime: {
      getRun: input.getRun,
    } as AgentRuntimeService,
    service: feedbackService(input.upsert),
  };
}

test("Agent feedback rejects a Run outside the authenticated actor boundary", async () => {
  let upsertCalls = 0;
  const response = await saveAgentFeedback(
    requestContext({
      getRun: async () => null,
      upsert: async () => {
        upsertCalls += 1;
        throw new Error("must not write");
      },
    }),
    { rating: "helpful", runId: "run:foreign-or-missing" },
  );
  const envelope = await response.json();

  assert.equal(response.status, 404);
  assert.equal(envelope.success, false);
  assert.match(envelope.error.message, /authenticated actor/i);
  assert.equal(upsertCalls, 0);
});

test("Agent feedback persists only after the actor-scoped Run is found", async () => {
  const saved: AgentFeedback = {
    createdAt: "2026-07-29T12:00:00.000Z",
    evidenceIds: [],
    feedbackId: "feedback:run:owned",
    rating: "helpful",
    runId: "run:owned",
    sourceModules: [],
    updatedAt: "2026-07-29T12:00:00.000Z",
  };
  const response = await saveAgentFeedback(
    requestContext({
      getRun: async () => ({ run: { runId: "run:owned" } }) as never,
      upsert: async () => saved,
    }),
    { rating: "helpful", runId: "run:owned" },
  );
  const envelope = await response.json();

  assert.equal(response.status, 200);
  assert.equal(envelope.success, true);
  assert.deepEqual(envelope.data.feedback, saved);
});

test("Agent feedback reports runtime or storage failures as unavailable", async () => {
  const response = await saveAgentFeedback(
    requestContext({
      getRun: async () => {
        throw new Error("runtime unavailable");
      },
      upsert: async () => {
        throw new Error("must not write");
      },
    }),
    { rating: "not_relevant", runId: "run:owned" },
  );

  assert.equal(response.status, 503);
});
