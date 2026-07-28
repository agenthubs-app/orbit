import { NextResponse } from "next/server";
import {
  validateAgentAutomationTrigger,
} from "../../../../../features/agent/automations/contract";
import { previewAgentAutomationDefinition } from "../../../../../features/agent/automations/runner";
import { createAgentMemoryService } from "../../../../../features/agent/memory/service-factory";
import {
  AGENT_PLAYBOOK_CAPABILITY_IDS,
} from "../../../../../features/agent/playbooks/contract";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  parseCreateAgentAutomationInput,
  resolveAgentAutomationRequest,
} from "../request";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await resolveAgentAutomationRequest();
  if (!context) return agentAutomationUnauthorizedResponse();
  const definition = parseCreateAgentAutomationInput(
    await request.json().catch(() => null),
  );
  if (
    !definition ||
    !AGENT_PLAYBOOK_CAPABILITY_IDS.includes(
      definition.capabilityId as (typeof AGENT_PLAYBOOK_CAPABILITY_IDS)[number],
    )
  ) {
    return agentAutomationErrorResponse(
      new Error("A safe, read-only Playbook definition is required."),
    );
  }
  try {
    validateAgentAutomationTrigger(definition.trigger);
    const memory = await createAgentMemoryService({
      actorId: context.actorId,
      mode: resolveModuleMode(),
    }).context();
    const result = await previewAgentAutomationDefinition(definition, {
      actorId: context.actorId,
      memory,
    });
    return NextResponse.json({
      data: {
        trial: {
          evidenceIds: result.evidenceIds ?? [],
          runId: result.runId,
          sideEffectsExecuted: false,
          sourceModules: result.sourceModules ?? [],
          summary: result.summary,
        },
      },
    });
  } catch (error) {
    return agentAutomationErrorResponse(error, {
      code: "AGENT_PLAYBOOK_DRY_RUN_FAILED",
      fallback: "The Playbook trial did not finish.",
      status: 422,
    });
  }
}
