import { NextResponse } from "next/server";
import {
  agentFeedbackErrorResponse,
  agentFeedbackUnauthorizedResponse,
  resolveAgentFeedbackRequest,
} from "../request";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentFeedbackRequest();
  if (!requestContext) return agentFeedbackUnauthorizedResponse();
  try {
    const { runId } = await context.params;
    return NextResponse.json({
      success: true,
      data: { feedback: await requestContext.service.get(runId) },
    });
  } catch (error) {
    return agentFeedbackErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentFeedbackRequest();
  if (!requestContext) return agentFeedbackUnauthorizedResponse();
  try {
    const { runId } = await context.params;
    await requestContext.service.remove(runId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return agentFeedbackErrorResponse(error);
  }
}
