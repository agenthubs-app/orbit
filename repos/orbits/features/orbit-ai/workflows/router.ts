import { createConfiguredEventMatchmakingService } from "../../events/matchmaking/service";
import { createOrbitAgentRuntimeService } from "../../agent/runtime/service-factory";
import type { OrbitKnownWorkflow } from "./contract";
import { createEventMatchmakingWorkflow } from "./event-matchmaking-v1";
import { createPostEventFollowupWorkflow } from "./post-event-followup-v1";
import { createPreEventBriefWorkflow } from "./pre-event-brief-v1";

export function createOrbitKnownWorkflowRouter(): {
  workflows: readonly OrbitKnownWorkflow<unknown, unknown>[];
  find: (trigger: string) => OrbitKnownWorkflow<unknown, unknown> | null;
} {
  const runtime = createOrbitAgentRuntimeService();
  const workflows = [
    createPostEventFollowupWorkflow(runtime),
    createPreEventBriefWorkflow(runtime),
    createEventMatchmakingWorkflow(
      runtime,
      createConfiguredEventMatchmakingService(),
    ),
  ] as unknown as readonly OrbitKnownWorkflow<unknown, unknown>[];

  return {
    workflows,
    find: (trigger) =>
      workflows.find((workflow) => workflow.canHandle(trigger)) ?? null,
  };
}
