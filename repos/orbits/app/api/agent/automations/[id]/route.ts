import { NextResponse } from "next/server";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  parseUpdateAgentAutomationInput,
  resolveAgentAutomationRequest,
  taskFormErrorResponse,
  taskFormFrom,
} from "../request";
import { updateInputFromForm } from "../../../../../features/agent/automations/task-form";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentAutomationRequest();
  if (!requestContext) return agentAutomationUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as unknown;
  // AG15 interface: 「改」 sends the form; the user changes it by hand, so it takes effect on 「保存」 (no card).
  const fromForm = await taskFormFrom(body, requestContext.actorId);
  if (fromForm && "error" in fromForm) return taskFormErrorResponse(fromForm.error);
  if (fromForm && "form" in fromForm) {
    try {
      const { id } = await context.params;
      const before = await requestContext.service.get(id);
      if (!before?.rule) return agentAutomationErrorResponse(new Error(`Automation ${id} was not found.`));
      const automation = await requestContext.service.update(id, updateInputFromForm(fromForm.form, fromForm.language, before));
      return NextResponse.json({ success: true, data: { automation } });
    } catch (error) {
      return agentAutomationErrorResponse(error);
    }
  }
  const input = parseUpdateAgentAutomationInput(body);
  if (!input) {
    return agentAutomationErrorResponse(
      new Error("The automation update body is invalid."),
    );
  }
  try {
    const { id } = await context.params;
    const automation = await requestContext.service.update(id, input);
    return NextResponse.json({ success: true, data: { automation } });
  } catch (error) {
    return agentAutomationErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentAutomationRequest();
  if (!requestContext) return agentAutomationUnauthorizedResponse();
  try {
    const { id } = await context.params;
    await requestContext.service.remove(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return agentAutomationErrorResponse(error);
  }
}
