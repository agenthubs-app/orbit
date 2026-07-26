import { NextResponse } from "next/server";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  parseUpdateAgentAutomationInput,
  resolveAgentAutomationRequest,
} from "../request";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentAutomationRequest();
  if (!requestContext) return agentAutomationUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as unknown;
  const input = parseUpdateAgentAutomationInput(body);
  if (!input) {
    return agentAutomationErrorResponse(
      new Error("The automation update body is invalid."),
    );
  }
  try {
    const { id } = await context.params;
    const automation = await requestContext.service.update(id, input);
    return NextResponse.json({ data: { automation } });
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
