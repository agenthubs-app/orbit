import { NextResponse } from "next/server";
import {
  agentMemoryErrorResponse,
  agentMemoryUnauthorizedResponse,
  parseCreateAgentMemoryInput,
  resolveAgentMemoryRequest,
} from "./request";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const context = await resolveAgentMemoryRequest();
  if (!context) return agentMemoryUnauthorizedResponse();
  try {
    const [memories, settings] = await Promise.all([
      context.service.list(),
      context.service.getSettings(),
    ]);
    return NextResponse.json({ data: { memories, settings } });
  } catch (error) {
    return agentMemoryErrorResponse(error, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const context = await resolveAgentMemoryRequest();
  if (!context) return agentMemoryUnauthorizedResponse();
  const input = parseCreateAgentMemoryInput(
    await request.json().catch(() => null),
  );
  if (!input) {
    return agentMemoryErrorResponse(
      new Error("category and content are required."),
    );
  }
  try {
    const memory = await context.service.create(input);
    return NextResponse.json({ data: { memory } }, { status: 201 });
  } catch (error) {
    return agentMemoryErrorResponse(error);
  }
}
