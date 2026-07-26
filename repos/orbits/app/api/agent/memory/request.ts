import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import {
  AGENT_MEMORY_CATEGORIES,
  type AgentMemoryCategory,
  type AgentMemoryService,
  type CreateAgentMemoryInput,
  type UpdateAgentMemoryInput,
} from "../../../../features/agent/memory/contract";
import { createAgentMemoryService } from "../../../../features/agent/memory/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";

interface AgentMemoryRequestContext {
  actorId: string;
  service: AgentMemoryService;
}

export function isAgentMemoryRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function categoryFrom(value: unknown): AgentMemoryCategory | undefined {
  return typeof value === "string" &&
    AGENT_MEMORY_CATEGORIES.includes(value as AgentMemoryCategory)
    ? (value as AgentMemoryCategory)
    : undefined;
}

export function parseCreateAgentMemoryInput(
  value: unknown,
): CreateAgentMemoryInput | null {
  if (!isAgentMemoryRecord(value)) return null;
  const category = categoryFrom(value.category);
  return category && typeof value.content === "string"
    ? { category, content: value.content, source: "manual" }
    : null;
}

export function parseUpdateAgentMemoryInput(
  value: unknown,
): UpdateAgentMemoryInput | null {
  if (!isAgentMemoryRecord(value)) return null;
  const category =
    value.category === undefined ? undefined : categoryFrom(value.category);
  const content =
    value.content === undefined
      ? undefined
      : typeof value.content === "string"
        ? value.content
        : null;
  if (
    (value.category !== undefined && !category) ||
    content === null ||
    (category === undefined && content === undefined)
  ) {
    return null;
  }
  return { category, content };
}

export async function resolveAgentMemoryRequest(): Promise<AgentMemoryRequestContext | null> {
  const session = await auth();
  const actorId = session?.user?.id?.trim();
  if (!actorId) return null;
  return {
    actorId,
    service: createAgentMemoryService({
      actorId,
      mode: resolveModuleMode(),
    }),
  };
}

export function agentMemoryUnauthorizedResponse(): Response {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in is required for Agent memory.",
      },
    },
    { status: 401 },
  );
}

export function agentMemoryErrorResponse(
  error: unknown,
  status = 400,
): Response {
  const notFound =
    error instanceof Error && error.message.includes("was not found");
  return NextResponse.json(
    {
      error: {
        code: notFound ? "NOT_FOUND" : "AGENT_MEMORY_INVALID",
        message:
          error instanceof Error ? error.message : "Agent memory is invalid.",
      },
    },
    { status: notFound ? 404 : status },
  );
}
