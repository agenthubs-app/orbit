import { NextResponse } from "next/server";
import { resolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import type {
  AgentAutomationDeliveryChannel,
  AgentAutomationSchedule,
  AgentAutomationSignalType,
  AgentAutomationService,
  AgentAutomationTrigger,
  AgentRuleSpec,
  CreateAgentAutomationInput,
  UpdateAgentAutomationInput,
} from "../../../../features/agent/automations/contract";
import {
  AGENT_AUTOMATION_SIGNAL_TYPES,
} from "../../../../features/agent/automations/contract";
import type { AutomationStorage } from "../../../../features/agent/automations/due-index";
import { configuredAutomationStorage, createAgentAutomationService } from "../../../../features/agent/automations/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { agentScheduledTaskFormSchema } from "../../../../shared/api-schema/agent-v1";
import type { AgentScheduledTaskFormContract } from "../../../../shared/contract/agent-v1";
import { configuredRecordAccess } from "../../../../features/agent-v1/domains/configured";

interface AgentAutomationRequestContext {
  actorId: string;
  service: AgentAutomationService;
  /** AG15: the run history and the due index (null when no database is configured). */
  storage: AutomationStorage | null;
}

/** AG15: the rule fields of a form (the service validates them; an id is never taken from a request). */
function ruleFrom(value: unknown): AgentRuleSpec | undefined {
  return isRecord(value) && isRecord(value.scope) && isRecord(value.notify) && isRecord(value.ranking) ? (value as unknown as AgentRuleSpec) : undefined;
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

function triggerFrom(value: unknown): AgentAutomationTrigger | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "schedule") {
    const schedule = scheduleFrom(value.schedule);
    return schedule ? { kind: "schedule", schedule } : undefined;
  }
  if (
    value.kind === "signal" &&
    Array.isArray(value.signalTypes) &&
    value.signalTypes.every(
      (signalType): signalType is AgentAutomationSignalType =>
        typeof signalType === "string" &&
        AGENT_AUTOMATION_SIGNAL_TYPES.includes(
          signalType as AgentAutomationSignalType,
        ),
    ) &&
    typeof value.minimumImportance === "number"
  ) {
    return {
      kind: "signal",
      minimumImportance: value.minimumImportance,
      signalTypes: value.signalTypes,
    };
  }
  return undefined;
}

function sourceFrom(
  value: unknown,
): "manual" | "natural_language" | undefined {
  return value === "manual" || value === "natural_language"
    ? value
    : undefined;
}

export function parseCreateAgentAutomationInput(
  value: unknown,
): CreateAgentAutomationInput | null {
  if (!isRecord(value)) return null;
  const trigger =
    triggerFrom(value.trigger) ??
    (scheduleFrom(value.schedule)
      ? {
          kind: "schedule" as const,
          schedule: scheduleFrom(value.schedule)!,
        }
      : undefined);
  const delivery = deliveryFrom(value.delivery);
  if (
    typeof value.capabilityId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.instruction !== "string" ||
    !trigger ||
    !delivery
  ) {
    return null;
  }
  return {
    capabilityId: value.capabilityId,
    title: value.title,
    instruction: value.instruction,
    ...(ruleFrom(value.rule) ? { rule: ruleFrom(value.rule) } : {}),
    source: sourceFrom(value.source),
    trigger,
    delivery,
  };
}

export function parseUpdateAgentAutomationInput(
  value: unknown,
): UpdateAgentAutomationInput | null {
  if (!isRecord(value)) return null;
  const trigger =
    value.trigger === undefined ? undefined : triggerFrom(value.trigger);
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
    (value.trigger !== undefined && !trigger) ||
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
    trigger,
    delivery,
    status,
    ...(ruleFrom(value.rule) ? { rule: ruleFrom(value.rule) } : {}),
    source: sourceFrom(value.source),
    changeNote:
      typeof value.changeNote === "string"
        ? value.changeNote
        : undefined,
  };
}

/**
 * AG15 interface (approved draft 15-4): `{ form, language }` — a task made or changed by hand with the form. Null when
 * the body has no form or it does not validate. The owner must still be able to open a note chosen in it.
 */
export async function taskFormFrom(body: unknown, actorId: string): Promise<{ form: AgentScheduledTaskFormContract; language: "zh" | "en" | "ja" } | { error: "invalid" | "note_unreadable" } | null> {
  if (!isRecord(body) || body.form === undefined) return null;
  const parsed = agentScheduledTaskFormSchema.safeParse(body.form);
  if (!parsed.success) return { error: "invalid" };
  const form = parsed.data;
  if (form.basis.kind === "note") {
    const access = configuredRecordAccess();
    const ref = `memo:${form.basis.noteId}`;
    if (!access || !(await access.visible(actorId, [ref])).has(ref)) return { error: "note_unreadable" };
  }
  const language = body.language === "en" || body.language === "ja" ? body.language : "zh";
  return { form, language };
}

/** AG15 interface: `?language=` — the pages' words in the reader's language (absent: each task's own language). */
export function languageOf(request: Request | undefined): { locale?: "zh" | "en" | "ja" } {
  const value = request ? new URL(request.url).searchParams.get("language") : null;
  return value === "zh" || value === "en" || value === "ja" ? { locale: value } : {};
}

export function taskFormErrorResponse(error: "invalid" | "note_unreadable"): Response {
  return NextResponse.json({ success: false, error: error === "invalid" ? { code: "VALIDATION_ERROR", message: "The task form is incomplete." } : { code: "NOTE_UNREADABLE", message: "The note chosen to pick by cannot be opened." } }, { status: 400 });
}

/**
 * agent-design AG15 (易错边界 2): a rule's owner is the canonical account — the same identity the conversation, the
 * card ledger and the dispatcher use — never the raw sign-in subject.
 */
export async function resolveAgentAutomationRequest(): Promise<AgentAutomationRequestContext | null> {
  const actor = await resolveAuthenticatedApiActor();
  const actorId = actor?.id?.trim();
  if (!actorId) return null;
  const mode = resolveModuleMode();
  return {
    actorId,
    service: createAgentAutomationService({
      actorId,
      mode,
    }),
    storage: configuredAutomationStorage(mode),
  };
}

export function agentAutomationUnauthorizedResponse(): Response {
  return NextResponse.json(
    {
      success: false,
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
      success: false,
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
