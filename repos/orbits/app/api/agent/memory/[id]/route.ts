import { NextResponse } from "next/server";
import {
  agentMemoryErrorResponse,
  agentMemoryUnauthorizedResponse,
  parseUpdateAgentMemoryInput,
  resolveAgentMemoryRequest,
} from "../request";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentMemoryRequest();
  if (!requestContext) return agentMemoryUnauthorizedResponse();
  const input = parseUpdateAgentMemoryInput(
    await request.json().catch(() => null),
  );
  if (!input) {
    return agentMemoryErrorResponse(
      new Error("A valid category or content update is required."),
    );
  }
  try {
    const { id } = await context.params;
    const memory = await requestContext.service.update(id, input);
    return NextResponse.json({ data: { memory } });
  } catch (error) {
    return agentMemoryErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentMemoryRequest();
  if (!requestContext) return agentMemoryUnauthorizedResponse();
  try {
    const { id } = await context.params;
    await requestContext.service.remove(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return agentMemoryErrorResponse(error);
  }
}
