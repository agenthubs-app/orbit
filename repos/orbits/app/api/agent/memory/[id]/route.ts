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
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentMemoryRequest();
  if (!requestContext) return agentMemoryUnauthorizedResponse();
  // AG14: `?expectedRevision=n` deletes only the revision the page showed; without it the entry is deleted as it is.
  const said = new URL(request.url).searchParams.get("expectedRevision");
  const expectedRevision = said === null ? undefined : Number(said);
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) {
    return agentMemoryErrorResponse(new Error("expectedRevision must be a positive whole number."));
  }
  try {
    const { id } = await context.params;
    await requestContext.service.remove(id, expectedRevision !== undefined ? { expectedRevision } : {});
    return new Response(null, { status: 204 });
  } catch (error) {
    return agentMemoryErrorResponse(error);
  }
}
