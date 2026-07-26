import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentMemoryLearningDisabledError,
  createAgentNaturalLanguageActionProposalService,
} from "../../features/agent/natural-language-actions/service";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";

test("disabled conversation learning rejects Memory before creating a Run or Action", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const runtime = createOrbitAgentRuntimeService("mock");
  const proposal = createAgentNaturalLanguageActionProposalService({
    memoryLearningAllowed: false,
    runtime,
  });

  await assert.rejects(
    proposal.propose({
      conversationId: "conversation:memory-governance",
      message: "记住我偏好简短中文回复。",
      requests: [
        {
          arguments: {
            category: "preference",
            content: "回答保持简短中文。",
          },
          capabilityId: "memory.save",
          requiresUserConfirmation: true,
        },
      ],
    }),
    (error: unknown) =>
      error instanceof AgentMemoryLearningDisabledError &&
      error.code === "AGENT_MEMORY_LEARNING_DISABLED",
  );

  assert.deepEqual(await runtime.listActions({}), []);
});
