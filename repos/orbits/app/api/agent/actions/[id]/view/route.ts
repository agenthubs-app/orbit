import { NextResponse } from "next/server";

import { createOrbitAgentRuntimeService } from "../../../../../../features/agent/runtime/service-factory";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const runtime = createOrbitAgentRuntimeService();
  const action = (await runtime.listActions({})).find(
    (candidate) => candidate.actionId === id,
  );
  if (!action) {
    return NextResponse.json(
      { error: { code: "AGENT_ACTION_NOT_FOUND", message: "Action not found." } },
      { status: 404 },
    );
  }
  await runtime.recordAnalytics("today_item_opened", {
    runId: action.runId,
    actionId: action.actionId,
    workflowKey: action.workflowKey,
  });
  if (
    action.workflowKey === "pre_event_brief_v1" &&
    action.operations.some(
      (operation) => operation.operationType === "generate_meeting_brief",
    )
  ) {
    await runtime.recordAnalytics("brief_viewed", {
      runId: action.runId,
      actionId: action.actionId,
      workflowKey: action.workflowKey,
    });
  }
  return NextResponse.json({ data: { recorded: true } });
}
