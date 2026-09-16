import type { AiReadPermission, AiReadTool, ReadAdapter, ReadScope } from "./read-contract";
import { z } from "zod";

export const AI_READ_TOOLS = [
  "notes.query", "tasks.query", "followups.query", "schedule.query", "aiHistory.query",
  "contacts.query", "relationshipEvidence.query", "messages.query", "notifications.query",
  "meetings.query", "events.query", "goals.query", "agentData.query",
] as const satisfies readonly AiReadTool[];

const fieldsByTool = {
  "notes.query": ["title", "snippet", "body", "bodyTruncated", "contactIds", "eventIds", "createdAt"],
  "tasks.query": ["title", "description", "status", "category", "dueAt", "contactId", "eventId", "scheduleId", "source", "createdAt"],
  "followups.query": ["title", "status", "contactId", "connectionId", "dueAt", "source", "evidenceSummary", "createdAt"],
  "schedule.query": ["title", "kind", "category", "startsAt", "endsAt", "allDay", "timeZone", "location", "meetingMethod", "contactId", "eventId", "meetingId", "details", "missingFields"],
  "aiHistory.query": ["sessionId", "groupId", "title", "pinned", "role", "content", "visibleRunStatus", "visibleOutput"],
  "contacts.query": ["displayName", "headline", "company", "relationship", "status", "tags"],
  "relationshipEvidence.query": ["contactId", "kind", "summary", "occurredAt", "sourceId", "sourceRevision"],
  "messages.query": ["conversationId", "contactId", "direction", "content", "sentAt", "readAt", "visibleExtraction", "privacyState"],
  "notifications.query": ["kind", "title", "reason", "occurredAt", "readAt", "disposition", "targetStatus", "sourceIds"],
  "meetings.query": ["title", "startsAt", "endsAt", "timeZone", "location", "meetingMethod", "status", "participantLabels", "eventId", "details"],
  "events.query": ["title", "startsAt", "endsAt", "location", "organizerName", "registrationStatus", "visibleAnswers", "membershipStatus"],
  "goals.query": ["eventId", "title", "status", "progress", "readiness", "updatedAt"],
  "agentData.query": ["kind", "title", "status", "summary", "preferenceKey", "preferenceValue", "occurredAt", "visibleReceipt"],
} as const satisfies Record<AiReadTool, readonly string[]>;

const disabled = async (_scope: ReadScope) => false;

export const AI_READ_PERMISSIONS = AI_READ_TOOLS.map((tool) => ({
  tool,
  domain: tool.slice(0, -".query".length) as AiReadPermission["domain"],
  schemaVersion: 1 as const,
  fields: fieldsByTool[tool],
  maxItems: 10 as const,
  enabled: disabled,
})) satisfies readonly AiReadPermission[];

const text = z.string();
const texts = z.array(text);
const textOrTexts = z.union([text, texts]);
const scalarOrTexts = z.union([text, z.number(), z.boolean(), texts]);
const optional = <T extends z.ZodType>(schema: T) => schema.optional();

const fieldSchemas = {
  "notes.query": z.object({ title: optional(text), snippet: optional(text), body: optional(text), bodyTruncated: optional(z.boolean()), contactIds: optional(texts), eventIds: optional(texts), createdAt: optional(text) }).strict(),
  "tasks.query": z.object({ title: optional(text), description: optional(text), status: optional(text), category: optional(text), dueAt: optional(text), contactId: optional(text), eventId: optional(text), scheduleId: optional(text), source: optional(textOrTexts), createdAt: optional(text) }).strict(),
  "followups.query": z.object({ title: optional(text), status: optional(text), contactId: optional(text), connectionId: optional(text), dueAt: optional(text), source: optional(textOrTexts), evidenceSummary: optional(text), createdAt: optional(text) }).strict(),
  "schedule.query": z.object({ title: optional(text), kind: optional(text), category: optional(text), startsAt: optional(text), endsAt: optional(text), allDay: optional(z.boolean()), timeZone: optional(text), location: optional(text), meetingMethod: optional(text), contactId: optional(text), eventId: optional(text), meetingId: optional(text), details: optional(text), missingFields: optional(texts) }).strict(),
  "aiHistory.query": z.object({ sessionId: optional(text), groupId: optional(text), title: optional(text), pinned: optional(z.boolean()), role: optional(text), content: optional(text), visibleRunStatus: optional(text), visibleOutput: optional(textOrTexts) }).strict(),
  "contacts.query": z.object({ displayName: optional(text), headline: optional(text), company: optional(text), relationship: optional(text), status: optional(text), tags: optional(texts) }).strict(),
  "relationshipEvidence.query": z.object({ contactId: optional(text), kind: optional(text), summary: optional(text), occurredAt: optional(text), sourceId: optional(text), sourceRevision: optional(text) }).strict(),
  "messages.query": z.object({ conversationId: optional(text), contactId: optional(text), direction: optional(text), content: optional(text), sentAt: optional(text), readAt: optional(text), visibleExtraction: optional(textOrTexts), privacyState: optional(text) }).strict(),
  "notifications.query": z.object({ kind: optional(text), title: optional(text), reason: optional(text), occurredAt: optional(text), readAt: optional(text), disposition: optional(text), targetStatus: optional(text), sourceIds: optional(texts) }).strict(),
  "meetings.query": z.object({ title: optional(text), startsAt: optional(text), endsAt: optional(text), timeZone: optional(text), location: optional(text), meetingMethod: optional(text), status: optional(text), participantLabels: optional(texts), eventId: optional(text), details: optional(text) }).strict(),
  "events.query": z.object({ title: optional(text), startsAt: optional(text), endsAt: optional(text), location: optional(text), organizerName: optional(text), registrationStatus: optional(text), visibleAnswers: optional(textOrTexts), membershipStatus: optional(text) }).strict(),
  "goals.query": z.object({ eventId: optional(text), title: optional(text), status: optional(text), progress: optional(z.union([text, z.number()])), readiness: optional(z.union([text, z.number()])), updatedAt: optional(text) }).strict(),
  "agentData.query": z.object({ kind: optional(text), title: optional(text), status: optional(text), summary: optional(text), preferenceKey: optional(text), preferenceValue: optional(scalarOrTexts), occurredAt: optional(text), visibleReceipt: optional(textOrTexts) }).strict(),
} satisfies Record<AiReadTool, z.ZodType<Readonly<Record<string, unknown>>>>;

export async function assertAiReadAllowed(
  scope: ReadScope,
  permission: AiReadPermission,
  adapter: ReadAdapter,
): Promise<void> {
  if (
    !scope.actorId || !scope.workspaceId || !scope.authorizationEpoch ||
    !(await permission.enabled(scope)) || !(await adapter.authorize(scope))
  ) {
    throw new Error("AI_NOT_AUTHORIZED");
  }
}

export function projectReadFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): Readonly<Record<string, unknown>> {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("UNKNOWN_FIELD");
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}

export function resolveAiReadPermission(tool: string, schemaVersion: number): AiReadPermission {
  const permission = AI_READ_PERMISSIONS.find((entry) => entry.tool === tool);
  if (!permission) throw new Error("UNKNOWN_AI_READ_TOOL");
  if (schemaVersion !== permission.schemaVersion) throw new Error("UNKNOWN_SCHEMA_VERSION");
  return permission;
}

export function validateAiReadFields(
  tool: AiReadTool,
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result = fieldSchemas[tool].safeParse(value);
  if (!result.success) throw new Error("INVALID_FIELD");
  return result.data;
}
