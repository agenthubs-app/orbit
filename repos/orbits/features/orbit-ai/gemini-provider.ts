export const DEFAULT_GEMINI_ORBIT_AGENT_MODEL = "gemini-3.5-flash" as const;
export const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions" as const;

export const GEMINI_ORBIT_AGENT_INTENTS = [
  "general_chat",
  "event_recommendations",
  "contact_recommendations",
  "followup_queue",
  "relationship_chat_context",
] as const;

export const GEMINI_ORBIT_AGENT_TOOL_NAMES = [
  "events.recommend",
  "contacts.recommend",
  "followups.reviewQueue",
  "chat.context",
] as const;

export type GeminiOrbitAgentIntent =
  (typeof GEMINI_ORBIT_AGENT_INTENTS)[number];

export type GeminiOrbitAgentToolName =
  (typeof GEMINI_ORBIT_AGENT_TOOL_NAMES)[number];

export interface GeminiOrbitAgentToolRequest {
  arguments: Record<string, unknown>;
  requiresUserConfirmation: true;
  toolName: GeminiOrbitAgentToolName;
}

export interface GeminiOrbitAgentPlannerOutput {
  assistantMessage: string;
  intent: GeminiOrbitAgentIntent;
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}

export interface GeminiOrbitAgentPlannerInput {
  locale?: string | null;
  message: string;
}

export interface GeminiOrbitAgentToolResultSummary {
  kind: string;
  preferredSurface: string;
  summary: string;
  title: string;
}

export interface GeminiOrbitAgentSynthesisInput {
  artifacts: readonly GeminiOrbitAgentToolResultSummary[];
  assistantMessage: string;
  intent: GeminiOrbitAgentIntent;
  locale?: string | null;
  message: string;
  toolRequests: readonly GeminiOrbitAgentToolRequest[];
}

export interface GeminiOrbitAgentProviderConfig {
  apiKey?: string | null;
  endpoint?: string;
  fetchImplementation?: typeof fetch;
  model?: string | null;
}

export type GeminiOrbitAgentPlannerResult =
  | {
      success: true;
      data: GeminiOrbitAgentPlannerOutput & {
        model: string;
        rawOutputText: string;
      };
    }
  | {
      success: false;
      error: {
        code:
          | "GEMINI_API_KEY_MISSING"
          | "GEMINI_REQUEST_FAILED"
          | "GEMINI_SCHEMA_INVALID";
        message: string;
        rawOutputText?: string;
      };
    };

export type GeminiOrbitAgentSynthesisResult =
  | {
      success: true;
      data: {
        assistantMessage: string;
        model: string;
        rawOutputText: string;
      };
    }
  | {
      success: false;
      error: {
        code: "GEMINI_API_KEY_MISSING" | "GEMINI_REQUEST_FAILED";
        message: string;
        rawOutputText?: string;
      };
    };

type JsonRecord = Record<string, unknown>;

const allowedIntents = new Set<string>(GEMINI_ORBIT_AGENT_INTENTS);
const allowedToolNames = new Set<string>(GEMINI_ORBIT_AGENT_TOOL_NAMES);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseJsonFromText(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);

  if (objectMatch?.[0]) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error("No JSON object found in Gemini planner output.");
}

export function validateGeminiOrbitAgentPlannerOutput(
  value: unknown,
): GeminiOrbitAgentPlannerOutput | null {
  if (!isRecord(value)) {
    return null;
  }

  const assistantMessage = readString(value.assistantMessage);
  const intent = readString(value.intent);

  if (!assistantMessage || !intent || !allowedIntents.has(intent)) {
    return null;
  }

  if (!Array.isArray(value.toolRequests)) {
    return null;
  }

  const toolRequests: GeminiOrbitAgentToolRequest[] = [];

  for (const request of value.toolRequests) {
    if (!isRecord(request)) {
      return null;
    }

    const toolName = readString(request.toolName);

    if (!toolName || !allowedToolNames.has(toolName)) {
      return null;
    }

    if (request.requiresUserConfirmation !== true) {
      return null;
    }

    toolRequests.push({
      arguments: readObject(request.arguments),
      requiresUserConfirmation: true,
      toolName: toolName as GeminiOrbitAgentToolName,
    });
  }

  if (intent === "general_chat" && toolRequests.length > 0) {
    return null;
  }

  if (intent !== "general_chat" && toolRequests.length === 0) {
    return null;
  }

  return {
    assistantMessage,
    intent: intent as GeminiOrbitAgentIntent,
    toolRequests,
  };
}

export function parseGeminiOrbitAgentPlannerOutput(
  outputText: string,
): GeminiOrbitAgentPlannerOutput | null {
  try {
    return validateGeminiOrbitAgentPlannerOutput(parseJsonFromText(outputText));
  } catch {
    return null;
  }
}

function systemInstruction(): string {
  return [
    "You are Orbit Agent, a relationship-work orchestration planner.",
    "Return only a JSON object with assistantMessage, intent, and toolRequests.",
    "Allowed intents: general_chat, event_recommendations, contact_recommendations, followup_queue, relationship_chat_context.",
    "Allowed tool names: events.recommend, contacts.recommend, followups.reviewQueue, chat.context.",
    "Use general_chat with an empty toolRequests array when no tool is needed.",
    "Every non-general tool request must set requiresUserConfirmation to true.",
    "Never claim that an email, calendar event, notification, database write, or external action has been executed.",
  ].join("\n");
}

function plannerInput(input: GeminiOrbitAgentPlannerInput): string {
  return JSON.stringify({
    locale: input.locale ?? "zh",
    message: input.message,
    outputSchema: {
      assistantMessage: "string",
      intent: GEMINI_ORBIT_AGENT_INTENTS,
      toolRequests: [
        {
          arguments: "object",
          requiresUserConfirmation: true,
          toolName: GEMINI_ORBIT_AGENT_TOOL_NAMES,
        },
      ],
    },
  });
}

function synthesisInstruction(): string {
  return [
    "You are Orbit Agent, writing the final user-facing response after Orbit tools returned information.",
    "Return natural language only, not JSON.",
    "Use the provided tool result summaries, but do not invent executed actions.",
    "Mention when recommendations are staged for review or require confirmation.",
    "Keep the response concise and useful.",
  ].join("\n");
}

function synthesisInput(input: GeminiOrbitAgentSynthesisInput): string {
  return JSON.stringify({
    artifacts: input.artifacts,
    locale: input.locale ?? "zh",
    originalAssistantMessage: input.assistantMessage,
    originalUserMessage: input.message,
    plannerIntent: input.intent,
    toolRequests: input.toolRequests,
  });
}

function readGeminiOutputText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const legacyOutputText =
    readString(value.output_text) ?? readString(value.outputText);

  if (legacyOutputText) {
    return legacyOutputText;
  }

  if (!Array.isArray(value.steps)) {
    return null;
  }

  const outputParts: string[] = [];

  for (const step of value.steps) {
    if (!isRecord(step) || step.type !== "model_output") {
      continue;
    }

    if (!Array.isArray(step.content)) {
      continue;
    }

    for (const part of step.content) {
      if (!isRecord(part)) {
        continue;
      }

      const text = readString(part.text);

      if (text) {
        outputParts.push(text);
      }
    }
  }

  return outputParts.length > 0 ? outputParts.join("\n") : null;
}

function readGeminiErrorMessage(value: unknown): string | null {
  if (Array.isArray(value)) {
    return readGeminiErrorMessage(value[0]);
  }

  if (!isRecord(value)) {
    return null;
  }

  const error = value.error;

  if (!isRecord(error)) {
    return null;
  }

  return readString(error.message);
}

export function createGeminiOrbitAgentPlanner(
  config: GeminiOrbitAgentProviderConfig = {},
) {
  return {
    async plan(
      input: GeminiOrbitAgentPlannerInput,
    ): Promise<GeminiOrbitAgentPlannerResult> {
      const apiKey = readString(config.apiKey ?? process.env.GEMINI_API_KEY);
      const model =
        readString(config.model ?? process.env.ORBIT_GEMINI_MODEL) ??
        DEFAULT_GEMINI_ORBIT_AGENT_MODEL;
      const endpoint = config.endpoint ?? GEMINI_INTERACTIONS_ENDPOINT;
      const fetchImplementation = config.fetchImplementation ?? fetch;

      if (!apiKey) {
        return {
          error: {
            code: "GEMINI_API_KEY_MISSING",
            message: "GEMINI_API_KEY is not configured.",
          },
          success: false,
        };
      }

      const response = await fetchImplementation(endpoint, {
        body: JSON.stringify({
          generation_config: {
            thinking_level: "low",
          },
          input: plannerInput(input),
          model,
          store: false,
          system_instruction: systemInstruction(),
        }),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        method: "POST",
      });

      const responseBody = (await response.json()) as unknown;

      if (!response.ok) {
        return {
          error: {
            code: "GEMINI_REQUEST_FAILED",
            message:
              readGeminiErrorMessage(responseBody) ??
              `Gemini request failed with HTTP ${response.status}.`,
          },
          success: false,
        };
      }

      const outputText = readGeminiOutputText(responseBody);

      if (!outputText) {
        return {
          error: {
            code: "GEMINI_REQUEST_FAILED",
            message: "Gemini response did not include output text.",
          },
          success: false,
        };
      }

      const plannerOutput = parseGeminiOrbitAgentPlannerOutput(outputText);

      if (!plannerOutput) {
        return {
          error: {
            code: "GEMINI_SCHEMA_INVALID",
            message: "Gemini planner output did not match the Orbit Agent schema.",
            rawOutputText: outputText,
          },
          success: false,
        };
      }

      return {
        data: {
          ...plannerOutput,
          model,
          rawOutputText: outputText,
        },
        success: true,
      };
    },

    async synthesize(
      input: GeminiOrbitAgentSynthesisInput,
    ): Promise<GeminiOrbitAgentSynthesisResult> {
      const apiKey = readString(config.apiKey ?? process.env.GEMINI_API_KEY);
      const model =
        readString(config.model ?? process.env.ORBIT_GEMINI_MODEL) ??
        DEFAULT_GEMINI_ORBIT_AGENT_MODEL;
      const endpoint = config.endpoint ?? GEMINI_INTERACTIONS_ENDPOINT;
      const fetchImplementation = config.fetchImplementation ?? fetch;

      if (!apiKey) {
        return {
          error: {
            code: "GEMINI_API_KEY_MISSING",
            message: "GEMINI_API_KEY is not configured.",
          },
          success: false,
        };
      }

      const response = await fetchImplementation(endpoint, {
        body: JSON.stringify({
          generation_config: {
            thinking_level: "low",
          },
          input: synthesisInput(input),
          model,
          store: false,
          system_instruction: synthesisInstruction(),
        }),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        method: "POST",
      });

      const responseBody = (await response.json()) as unknown;

      if (!response.ok) {
        return {
          error: {
            code: "GEMINI_REQUEST_FAILED",
            message:
              readGeminiErrorMessage(responseBody) ??
              `Gemini request failed with HTTP ${response.status}.`,
          },
          success: false,
        };
      }

      const outputText = readGeminiOutputText(responseBody);

      if (!outputText) {
        return {
          error: {
            code: "GEMINI_REQUEST_FAILED",
            message: "Gemini response did not include output text.",
          },
          success: false,
        };
      }

      return {
        data: {
          assistantMessage: outputText,
          model,
          rawOutputText: outputText,
        },
        success: true,
      };
    },
  };
}
