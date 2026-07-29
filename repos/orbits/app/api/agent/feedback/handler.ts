import { NextResponse } from "next/server";

import type { UpsertAgentFeedbackInput } from "../../../../features/agent/feedback/contract";
import {
  type AgentFeedbackRequestContext,
  agentFeedbackErrorResponse,
} from "./request";

export async function saveAgentFeedback(
  context: AgentFeedbackRequestContext,
  input: UpsertAgentFeedbackInput,
): Promise<Response> {
  try {
    const run = await context.runtime.getRun(input.runId);
    if (!run) {
      return agentFeedbackErrorResponse(
        new Error("Agent Run was not found for the authenticated actor."),
        404,
      );
    }

    return NextResponse.json({
      success: true,
      data: { feedback: await context.service.upsert(input) },
    });
  } catch (error) {
    return agentFeedbackErrorResponse(error, 503);
  }
}
