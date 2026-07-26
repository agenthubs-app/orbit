import { NextResponse } from "next/server";
import type { AgentSignalStatus } from "../../../../../features/agent/signals/contract";
import {
  agentSignalErrorResponse,
  agentSignalUnauthorizedResponse,
  resolveAgentSignalRequest,
} from "../request";

function validStatus(
  value: unknown,
): value is Exclude<AgentSignalStatus, "new" | "resolved"> {
  return (
    value === "acknowledged" ||
    value === "snoozed" ||
    value === "dismissed"
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const requestContext = await resolveAgentSignalRequest();
    if (!requestContext) return agentSignalUnauthorizedResponse();
    const body = (await request.json().catch(() => null)) as {
      snoozedUntil?: unknown;
      status?: unknown;
    } | null;
    if (!body || !validStatus(body.status)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "A supported signal status is required.",
          },
        },
        { status: 400 },
      );
    }
    const { id } = await context.params;
    return NextResponse.json({
      data: {
        signal: await requestContext.service.updateStatus(
          id,
          {
            snoozedUntil:
              typeof body.snoozedUntil === "string"
                ? body.snoozedUntil
                : undefined,
            status: body.status,
          },
        ),
      },
    });
  } catch (error) {
    return agentSignalErrorResponse(error);
  }
}
