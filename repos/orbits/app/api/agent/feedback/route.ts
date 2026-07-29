import { NextResponse } from "next/server";
import {
  agentFeedbackErrorResponse,
  agentFeedbackUnauthorizedResponse,
  parseAgentFeedbackInput,
  resolveAgentFeedbackRequest,
} from "./request";
import { saveAgentFeedback } from "./handler";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const context = await resolveAgentFeedbackRequest();
  if (!context) return agentFeedbackUnauthorizedResponse();
  try {
    return NextResponse.json({
      success: true,
      data: { feedback: await context.service.list() },
    });
  } catch (error) {
    return agentFeedbackErrorResponse(error, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const context = await resolveAgentFeedbackRequest();
  if (!context) return agentFeedbackUnauthorizedResponse();
  const input = parseAgentFeedbackInput(
    await request.json().catch(() => null),
  );
  if (!input) {
    return agentFeedbackErrorResponse(
      new Error("A valid runId, rating, or outcome is required."),
    );
  }
  return saveAgentFeedback(context, input);
}
