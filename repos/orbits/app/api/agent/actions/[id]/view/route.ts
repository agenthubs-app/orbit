import { NextResponse } from "next/server";

import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const agentContext = await resolveAgentRequestContext(resolveFeatureMode());
  if (!agentContext) return agentRequestUnauthorizedResponse();
  const runtime = agentContext.runtime;
  // Exact lookup (0121): an action older than the newest list page still exists.
  const action = await runtime.getAction(id);
  if (!action) {
    return NextResponse.json(
      {
        error: { code: "AGENT_ACTION_NOT_FOUND", message: "Action not found." },
      },
      { status: 404 },
    );
  }
  if (
    action.workflowKey === "pre_event_brief_v1" &&
    action.operations.some(
      (operation) => operation.operationType === "generate_meeting_brief",
    )
  ) {
    await runtime.markActionViewed(action.actionId);
  }
  return NextResponse.json({ data: { recorded: true } });
}
