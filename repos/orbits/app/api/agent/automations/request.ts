import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import type {
  AgentAutomationDeliveryChannel,
  AgentAutomationSchedule,
  AgentAutomationService,
  CreateAgentAutomationInput,
  UpdateAgentAutomationInput,
} from "../../../../features/agent/automations/contract";
import { createAgentAutomationService } from "../../../../features/agent/automations/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";

interface AgentAutomationRequestContext {
  actorId: string;
  service: AgentAutomationService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scheduleFrom(value: unknown): AgentAutomationSchedule | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "once" && typeof value.at === "string") {
    return { kind: "once", at: value.at };
  }
  if (
    value.kind === "daily" &&
    typeof value.time === "string" &&
    typeof value.timeZone === "string"
  ) {
    return {
      kind: "daily",
      time: value.time,
      timeZone: value.timeZone,
    };
  }
  if (
    value.kind === "weekly" &&
    Array.isArray(value.daysOfWeek) &&
    value.daysOfWeek.every((day) => typeof day === "number") &&
    typeof value.time === "string" &&
    typeof value.timeZone === "string"
  ) {
    return {
      kind: "weekly",
      daysOfWeek: value.daysOfWeek,
      time: value.time,
      timeZone: value.timeZone,
    };
  }
  return undefined;
}

function deliveryFrom(
  value: unknown,
): AgentAutomationDeliveryChannel | undefined {
  return value === "in_app" || value === "push" ? value : undefined;
}

export function parseCreateAgentAutomationInput(
  value: unknown,
): CreateAgentAutomationInput | null {
  if (!isRecord(value)) return null;
  const schedule = scheduleFrom(value.schedule);
  const delivery = deliveryFrom(value.delivery);
  if (
    typeof value.capabilityId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.instruction !== "string" ||
    !schedule ||
    !delivery
  ) {
    return null;
  }
  return {
    capabilityId: value.capabilityId,
    title: value.title,
    instruction: value.instruction,
    schedule,
    delivery,
  };
}

export function parseUpdateAgentAutomationInput(
  value: unknown,
): UpdateAgentAutomationInput | null {
  if (!isRecord(value)) return null;
  const schedule =
    value.schedule === undefined ? undefined : scheduleFrom(value.schedule);
  const delivery =
    value.delivery === undefined ? undefined : deliveryFrom(value.delivery);
  const status =
    value.status === undefined
      ? undefined
      : value.status === "active" || value.status === "paused"
        ? value.status
        : null;
  if (
    (value.capabilityId !== undefined &&
      typeof value.capabilityId !== "string") ||
    (value.title !== undefined && typeof value.title !== "string") ||
    (value.instruction !== undefined &&
      typeof value.instruction !== "string") ||
    (value.schedule !== undefined && !schedule) ||
    (value.delivery !== undefined && !delivery) ||
    status === null
  ) {
    return null;
  }
  return {
    capabilityId:
      typeof value.capabilityId === "string"
        ? value.capabilityId
        : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    instruction:
      typeof value.instruction === "string" ? value.instruction : undefined,
    schedule,
    delivery,
    status,
  };
}

export async function resolveAgentAutomationRequest(): Promise<AgentAutomationRequestContext | null> {
  const session = await auth();
  const actorId = session?.user?.id?.trim();
  if (!actorId) return null;
  return {
    actorId,
    service: createAgentAutomationService({
      actorId,
      mode: resolveModuleMode(),
    }),
  };
}

export function agentAutomationUnauthorizedResponse(): Response {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in is required for Agent automations.",
      },
    },
    { status: 401 },
  );
}

export function agentAutomationErrorResponse(
  error: unknown,
  options: {
    code?: string;
    fallback?: string;
    status?: number;
  } = {},
): Response {
  const notFound =
    error instanceof Error && error.message.includes("was not found");
  return NextResponse.json(
    {
      error: {
        code: notFound
          ? "NOT_FOUND"
          : (options.code ?? "AGENT_AUTOMATION_INVALID"),
        message:
          error instanceof Error
            ? error.message
            : (options.fallback ?? "Automation is invalid."),
      },
    },
    { status: notFound ? 404 : (options.status ?? 400) },
  );
}
