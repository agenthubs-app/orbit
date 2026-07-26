import { NextResponse } from "next/server";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  parseCreateAgentAutomationInput,
  resolveAgentAutomationRequest,
} from "./request";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const context = await resolveAgentAutomationRequest();
    if (!context) return agentAutomationUnauthorizedResponse();
    return NextResponse.json({
      data: { automations: await context.service.list() },
    });
  } catch (error) {
    return agentAutomationErrorResponse(error, {
      code: "AGENT_AUTOMATIONS_UNAVAILABLE",
      fallback: "Agent automations are unavailable.",
      status: 503,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const context = await resolveAgentAutomationRequest();
  if (!context) return agentAutomationUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as unknown;
  const input = parseCreateAgentAutomationInput(body);
  if (!input) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "capabilityId, title, instruction, schedule, and delivery are required.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const automation = await context.service.create(input);
    return NextResponse.json({ data: { automation } }, { status: 201 });
  } catch (error) {
    return agentAutomationErrorResponse(error);
  }
}
