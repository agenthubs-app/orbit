import {
  AGENT_AUTOMATION_SIGNAL_TYPES,
  type AgentAutomationSchedule,
  type AgentAutomationSignalType,
  type AgentAutomationTrigger,
  type CreateAgentAutomationInput,
  validateAgentAutomationTrigger,
} from "../automations/contract";
import {
  AGENT_PLAYBOOK_CAPABILITY_IDS,
  type AgentPlaybookCompiler,
} from "./contract";
import {
  runOrbitAgentModelText,
  type OrbitAgentModelTextResult,
} from "../../orbit-ai/gemini-provider";

type ModelRunner = (input: {
  systemInstruction: string;
  userText: string;
}) => Promise<OrbitAgentModelTextResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(
  value: unknown,
  maximum: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function stringArray(
  value: unknown,
  maximum: number,
): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    return null;
  }
  return value
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maximum);
}

function jsonObject(output: string): Record<string, unknown> | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(output.slice(start, end + 1)) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function scheduleFrom(value: unknown): AgentAutomationSchedule | null {
  if (!isRecord(value)) return null;
  if (value.kind === "once") {
    const at = text(value.at, 80);
    return at ? { at, kind: "once" } : null;
  }
  if (value.kind === "daily") {
    const time = text(value.time, 5);
    const timeZone = text(value.timeZone, 80);
    return time && timeZone
      ? { kind: "daily", time, timeZone }
      : null;
  }
  if (value.kind === "weekly") {
    const time = text(value.time, 5);
    const timeZone = text(value.timeZone, 80);
    const daysOfWeek =
      Array.isArray(value.daysOfWeek) &&
      value.daysOfWeek.every((day) => typeof day === "number")
        ? value.daysOfWeek
        : null;
    return time && timeZone && daysOfWeek
      ? { daysOfWeek, kind: "weekly", time, timeZone }
      : null;
  }
  return null;
}

function triggerFrom(value: unknown): AgentAutomationTrigger | null {
  if (!isRecord(value)) return null;
  let trigger: AgentAutomationTrigger | null = null;
  if (value.kind === "schedule") {
    const schedule = scheduleFrom(value.schedule);
    trigger = schedule ? { kind: "schedule", schedule } : null;
  } else if (value.kind === "signal") {
    const signalTypes =
      Array.isArray(value.signalTypes) &&
      value.signalTypes.every(
        (signalType): signalType is AgentAutomationSignalType =>
          typeof signalType === "string" &&
          AGENT_AUTOMATION_SIGNAL_TYPES.includes(
            signalType as AgentAutomationSignalType,
          ),
      )
        ? value.signalTypes
        : null;
    trigger =
      signalTypes &&
      typeof value.minimumImportance === "number"
        ? {
            kind: "signal",
            minimumImportance: value.minimumImportance,
            signalTypes,
          }
        : null;
  }
  if (!trigger) return null;
  try {
    validateAgentAutomationTrigger(trigger);
    return trigger;
  } catch {
    return null;
  }
}

export function parseAgentPlaybookDraft(
  output: string,
): {
  definition: CreateAgentAutomationInput;
  explanation: string;
  assumptions: readonly string[];
} | null {
  const value = jsonObject(output);
  if (!value) return null;
  const capabilityId = text(value.capabilityId, 120);
  const title = text(value.title, 120);
  const instruction = text(value.instruction, 4_000);
  const trigger = triggerFrom(value.trigger);
  const explanation = text(value.explanation, 1_000);
  const assumptions = stringArray(value.assumptions, 6);
  if (
    !capabilityId ||
    !AGENT_PLAYBOOK_CAPABILITY_IDS.includes(
      capabilityId as (typeof AGENT_PLAYBOOK_CAPABILITY_IDS)[number],
    ) ||
    !title ||
    !instruction ||
    !trigger ||
    !explanation ||
    !assumptions
  ) {
    return null;
  }
  return {
    assumptions,
    definition: {
      capabilityId,
      delivery: "in_app",
      instruction,
      source: "natural_language",
      title,
      trigger,
    },
    explanation,
  };
}

function compilerInstruction(): string {
  return [
    "You compile one natural-language request into one Orbit relationship Playbook draft.",
    "Return exactly one JSON object and no markdown.",
    `capabilityId must be one of: ${AGENT_PLAYBOOK_CAPABILITY_IDS.join(", ")}.`,
    "Choose followups.reviewQueue for follow-up or dormant relationship reviews; contacts.recommend for people or introduction opportunities; events.recommend for event discovery; chat.context for source-backed relationship context.",
    "The Playbook is read-only. instruction must request analysis, ranking, review, or recommendations only. Never include sending, scheduling external events, notifications, writes, or promises of execution.",
    "trigger must be either {kind:'schedule', schedule:{kind:'once',at:ISO} | {kind:'daily',time:'HH:mm',timeZone:IANA} | {kind:'weekly',daysOfWeek:number[],time:'HH:mm',timeZone:IANA}} or {kind:'signal',signalTypes:string[],minimumImportance:integer}.",
    `signalTypes may contain only: ${AGENT_AUTOMATION_SIGNAL_TYPES.join(", ")}.`,
    "Use signal triggers only when the user says when a relationship becomes stale, a follow-up becomes due, or an event becomes upcoming. Otherwise use a schedule.",
    "State every inferred detail in assumptions. Keep explanation concise and user-readable.",
    "Required keys: title, capabilityId, instruction, trigger, explanation, assumptions.",
  ].join("\n");
}

export function createAgentPlaybookCompiler(
  modelRunner: ModelRunner = (input) =>
    runOrbitAgentModelText(input),
): AgentPlaybookCompiler {
  return {
    async compile(input) {
      const request = input.request.trim();
      if (!request || request.length > 4_000) {
        return {
          error: {
            code: "PLAYBOOK_REQUEST_REQUIRED",
            message:
              "Describe the relationship Playbook in 4,000 characters or fewer.",
          },
          success: false,
        };
      }
      const userText = JSON.stringify({
        currentTimeIso:
          input.currentTimeIso ?? new Date().toISOString(),
        locale: input.locale ?? "zh",
        request,
        timeZone: input.timeZone,
      });
      let result = await modelRunner({
        systemInstruction: compilerInstruction(),
        userText,
      });
      if (result.success === false) {
        return {
          error: {
            code: "PLAYBOOK_PROVIDER_FAILED",
            message: result.error.message,
          },
          success: false,
        };
      }
      let parsed = parseAgentPlaybookDraft(result.text);
      if (!parsed) {
        result = await modelRunner({
          systemInstruction: [
            compilerInstruction(),
            "A previous response failed the strict safety schema. Regenerate the draft once.",
            "Return every required key and use valid JSON with double quotes.",
            'For a daily schedule, use exactly: "trigger":{"kind":"schedule","schedule":{"kind":"daily","time":"09:00","timeZone":"Asia/Tokyo"}}.',
            "Do not add capabilities or actions outside the allowed read-only list.",
          ].join("\n"),
          userText,
        });
        if (result.success === false) {
          return {
            error: {
              code: "PLAYBOOK_PROVIDER_FAILED",
              message: result.error.message,
            },
            success: false,
          };
        }
        parsed = parseAgentPlaybookDraft(result.text);
      }
      if (!parsed) {
        return {
          error: {
            code: "PLAYBOOK_SCHEMA_INVALID",
            message:
              "The model did not return a safe, supported Playbook draft.",
          },
          success: false,
        };
      }
      return {
        draft: {
          ...parsed,
          model: result.model,
          provider: result.provider,
        },
        success: true,
      };
    },
  };
}
