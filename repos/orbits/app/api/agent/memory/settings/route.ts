import { NextResponse } from "next/server";
import {
  agentMemoryErrorResponse,
  agentMemoryUnauthorizedResponse,
  isAgentMemoryRecord,
  resolveAgentMemoryRequest,
} from "../request";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  const context = await resolveAgentMemoryRequest();
  if (!context) return agentMemoryUnauthorizedResponse();
  const body = await request.json().catch(() => null);
  if (
    !isAgentMemoryRecord(body) ||
    (body.enabled !== undefined && typeof body.enabled !== "boolean") ||
    (body.allowConversationLearning !== undefined &&
      typeof body.allowConversationLearning !== "boolean")
  ) {
    return agentMemoryErrorResponse(
      new Error("Memory settings must use boolean values."),
    );
  }
  try {
    const settings = await context.service.updateSettings({
      enabled:
        typeof body.enabled === "boolean" ? body.enabled : undefined,
      allowConversationLearning:
        typeof body.allowConversationLearning === "boolean"
          ? body.allowConversationLearning
          : undefined,
    });
    return NextResponse.json({ data: { settings } });
  } catch (error) {
    return agentMemoryErrorResponse(error);
  }
}
