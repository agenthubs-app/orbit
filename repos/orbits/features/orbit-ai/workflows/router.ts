import { createOrbitAgentRuntimeService } from "../../agent/runtime/service-factory";
import type { OrbitKnownWorkflow } from "./contract";
import { createEventMatchmakingWorkflow } from "./event-matchmaking-v1";
import { createPostEventFollowupWorkflow } from "./post-event-followup-v1";
import { createPreEventBriefWorkflow } from "./pre-event-brief-v1";

export function createOrbitKnownWorkflowRouter(options: {
  includeLegacyPostEventFollowup?: boolean;
} = {}): {
  workflows: readonly OrbitKnownWorkflow<unknown, unknown>[];
  find: (trigger: string) => OrbitKnownWorkflow<unknown, unknown> | null;
} {
  const runtime = createOrbitAgentRuntimeService();
  const workflows = [
    ...(options.includeLegacyPostEventFollowup ? [createPostEventFollowupWorkflow(runtime)] : []),
    createPreEventBriefWorkflow(runtime),
    createEventMatchmakingWorkflow(),
  ] as unknown as readonly OrbitKnownWorkflow<unknown, unknown>[];

  return {
    workflows,
    find: (trigger) =>
      workflows.find((workflow) => workflow.canHandle(trigger)) ?? null,
  };
}
