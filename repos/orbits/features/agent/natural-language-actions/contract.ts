import {
  AGENT_MEMORY_CATEGORIES,
  type AgentMemoryCategory,
} from "../memory/contract";

export const AGENT_NATURAL_LANGUAGE_ACTION_CAPABILITY_IDS = [
  "followups.createTask",
  "notifications.createReminder",
  "followups.saveDraft",
  "memory.save",
] as const;

export type AgentNaturalLanguageActionCapabilityId =
  (typeof AGENT_NATURAL_LANGUAGE_ACTION_CAPABILITY_IDS)[number];

interface ConfirmedActionRequestBase {
  requiresUserConfirmation: true;
}

export type AgentNaturalLanguageActionRequest =
  | (ConfirmedActionRequestBase & {
      capabilityId: "followups.createTask";
      arguments: {
        title: string;
        dueAt?: string;
      };
    })
  | (ConfirmedActionRequestBase & {
      capabilityId: "notifications.createReminder";
      arguments: {
        title: string;
        dueAt: string;
      };
    })
  | (ConfirmedActionRequestBase & {
      capabilityId: "followups.saveDraft";
      arguments: {
        draftText: string;
      };
    })
  | (ConfirmedActionRequestBase & {
      capabilityId: "memory.save";
      arguments: {
        category: AgentMemoryCategory;
        content: string;
      };
    });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  maximumLength: number,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function normalizedDate(value: unknown): string | null {
  const text = boundedString(value, 120);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function parseAgentNaturalLanguageActionRequest(
  value: unknown,
): AgentNaturalLanguageActionRequest | null {
  if (
    !isRecord(value) ||
    value.requiresUserConfirmation !== true ||
    !isRecord(value.arguments)
  ) {
    return null;
  }

  switch (value.capabilityId) {
    case "followups.createTask": {
      const title = boundedString(value.arguments.title, 180);
      const rawDueAt = value.arguments.dueAt;
      const dueAt =
        rawDueAt === undefined || rawDueAt === null || rawDueAt === ""
          ? undefined
          : normalizedDate(rawDueAt);
      if (!title || (rawDueAt !== undefined && !dueAt)) return null;
      return {
        arguments: { title, ...(dueAt ? { dueAt } : {}) },
        capabilityId: value.capabilityId,
        requiresUserConfirmation: true,
      };
    }
    case "notifications.createReminder": {
      const title = boundedString(value.arguments.title, 180);
      const dueAt = normalizedDate(value.arguments.dueAt);
      if (!title || !dueAt) return null;
      return {
        arguments: { title, dueAt },
        capabilityId: value.capabilityId,
        requiresUserConfirmation: true,
      };
    }
    case "followups.saveDraft": {
      const draftText = boundedString(value.arguments.draftText, 3_000);
      if (!draftText) return null;
      return {
        arguments: { draftText },
        capabilityId: value.capabilityId,
        requiresUserConfirmation: true,
      };
    }
    case "memory.save": {
      const content = boundedString(value.arguments.content, 600);
      const category = value.arguments.category;
      if (
        !content ||
        !AGENT_MEMORY_CATEGORIES.includes(category as AgentMemoryCategory)
      ) {
        return null;
      }
      return {
        arguments: {
          category: category as AgentMemoryCategory,
          content,
        },
        capabilityId: value.capabilityId,
        requiresUserConfirmation: true,
      };
    }
    default:
      return null;
  }
}

export function parseAgentNaturalLanguageActionRequests(
  value: unknown,
): readonly AgentNaturalLanguageActionRequest[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  const parsed = value.map(parseAgentNaturalLanguageActionRequest);
  return parsed.every(
    (request): request is AgentNaturalLanguageActionRequest =>
      request !== null,
  )
    ? parsed
    : null;
}
