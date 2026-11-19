import { NextResponse } from "next/server";
import { resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import {
  AGENT_MEMORY_CATEGORIES,
  AGENT_MEMORY_TASKS,
  AgentMemoryRevisionConflictError,
  type AgentMemoryCategory,
  type AgentMemoryService,
  type AgentMemoryStructured,
  type AgentMemoryTask,
  type CreateAgentMemoryInput,
  type UpdateAgentMemoryInput,
} from "../../../../features/agent/memory/contract";
import { createAgentMemoryService } from "../../../../features/agent/memory/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";

interface AgentMemoryRequestContext {
  /** The canonical account id (the same one the conversation, a resumed conversation and background runs use). */
  actorId: string;
  workspaceId: string;
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

/** `undefined`: not given; `null`: given and not valid. */
function tasksFrom(value: unknown): AgentMemoryTask[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > AGENT_MEMORY_TASKS.length) return null;
  return value.every((item) => typeof item === "string" && AGENT_MEMORY_TASKS.includes(item as AgentMemoryTask))
    ? (value as AgentMemoryTask[])
    : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** A day (YYYY-MM-DD), `null` to clear it; `undefined`: not given; `false`: given and not valid. */
function dayFrom(value: unknown): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" && DAY.test(value) ? value : false;
}

function structuredFrom(value: unknown): AgentMemoryStructured | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isAgentMemoryRecord(value) ? (value as AgentMemoryStructured) : false;
}

export function parseCreateAgentMemoryInput(
  value: unknown,
): CreateAgentMemoryInput | null {
  if (!isAgentMemoryRecord(value)) return null;
  const category = categoryFrom(value.category);
  const appliesTo = tasksFrom(value.appliesTo);
  const validFrom = dayFrom(value.validFrom);
  const validUntil = dayFrom(value.validUntil);
  const structured = structuredFrom(value.structured);
  if (!category || typeof value.content !== "string" || appliesTo === null || validFrom === false || validUntil === false || structured === false) return null;
  // An entry typed on the settings page is the user's own: `manual`, with no source message.
  return {
    category,
    content: value.content,
    source: "manual",
    ...(appliesTo !== undefined ? { appliesTo } : {}),
    ...(structured !== undefined ? { structured } : {}),
    ...(validFrom !== undefined ? { validFrom } : {}),
    ...(validUntil !== undefined ? { validUntil } : {}),
  };
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
  const appliesTo = tasksFrom(value.appliesTo);
  const validFrom = dayFrom(value.validFrom);
  const validUntil = dayFrom(value.validUntil);
  const structured = structuredFrom(value.structured);
  const expectedRevision = value.expectedRevision === undefined
    ? undefined
    : typeof value.expectedRevision === "number" && Number.isInteger(value.expectedRevision) && value.expectedRevision >= 1
      ? value.expectedRevision
      : null;
  if (
    (value.category !== undefined && !category) ||
    content === null ||
    appliesTo === null ||
    validFrom === false ||
    validUntil === false ||
    structured === false ||
    expectedRevision === null ||
    (category === undefined && content === undefined && appliesTo === undefined && validFrom === undefined && validUntil === undefined && structured === undefined)
  ) {
    return null;
  }
  return {
    ...(category !== undefined ? { category } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(appliesTo !== undefined ? { appliesTo } : {}),
    ...(structured !== undefined ? { structured } : {}),
    ...(validFrom !== undefined ? { validFrom } : {}),
    ...(validUntil !== undefined ? { validUntil } : {}),
    ...(expectedRevision !== undefined ? { expectedRevision } : {}),
  };
}

/**
 * agent-design AG14 (设计稿 §6 "账号一致性要先验收"): the settings page reads and writes the same scope as the
 * conversation — the canonical account and its workspace, through the one identity resolver. The Auth.js user id of
 * the session is never the partition key.
 */
export async function resolveAgentMemoryRequest(dependencies: {
  /** The one identity resolver of API routes (a test passes a resolver over its own identity records). */
  resolveActor?: () => Promise<Pick<AuthenticatedApiActor, "id" | "workspaceId"> | null>;
  serviceFor?: (scope: { actorId: string; workspaceId: string }) => AgentMemoryService;
} = {}): Promise<AgentMemoryRequestContext | null> {
  const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
  const actorId = actor?.id?.trim();
  if (!actor || !actorId) return null;
  const serviceFor = dependencies.serviceFor ?? ((scope) => createAgentMemoryService({ actorId: scope.actorId, mode: resolveModuleMode(), workspaceId: scope.workspaceId }));
  return {
    actorId,
    service: serviceFor({ actorId, workspaceId: actor.workspaceId }),
    workspaceId: actor.workspaceId,
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
  if (error instanceof AgentMemoryRevisionConflictError) {
    return NextResponse.json(
      { error: { code: "CONFLICT", context: { currentRevision: error.current, reason: error.code }, message: error.message } },
      { status: 409 },
    );
  }
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
