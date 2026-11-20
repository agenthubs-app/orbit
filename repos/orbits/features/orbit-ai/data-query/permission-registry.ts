import type { AiReadPermission, AiReadTool, ReadAdapter, ReadScope } from "./read-contract";
import { z } from "zod";

export const AI_READ_TOOLS = [
  "notes.query", "tasks.query", "followups.query", "schedule.query", "aiHistory.query",
  "contacts.query", "relationshipEvidence.query", "messages.query", "notifications.query",
  "meetings.query", "events.query", "goals.query", "agentData.query",
] as const satisfies readonly AiReadTool[];

const fieldsByTool = {
  // agent-design AG05: a memo's updatedAt, version and interaction; a to-do's planned date and times; a
  // schedule item's linked contacts and repetition; a contact's updatedAt. Contact methods stay out.
  // agent-design AG13: the typed event links ("platform:<id>", "private:<id>") of memos, to-dos and schedule items; a to-do's
  // people as a list; a schedule item's notes.
  "notes.query": ["title", "snippet", "body", "bodyTruncated", "contactIds", "eventIds", "eventRefs", "createdAt", "updatedAt", "version", "interaction"],
  "tasks.query": ["title", "description", "status", "category", "dueAt", "plannedDate", "completedAt", "contactId", "contactIds", "eventId", "eventRefs", "scheduleId", "source", "createdAt", "updatedAt"],
  "followups.query": ["title", "status", "contactId", "connectionId", "dueAt", "source", "evidenceSummary", "createdAt"],
  "schedule.query": ["title", "kind", "category", "startsAt", "endsAt", "allDay", "timeZone", "location", "meetingMethod", "contactId", "contactIds", "noteIds", "eventId", "eventRefs", "meetingId", "details", "missingFields", "recurrence", "updatedAt"],
  "aiHistory.query": ["sessionId", "groupId", "title", "pinned", "role", "content", "visibleRunStatus", "visibleOutput"],
  // agent-design AG12-5: contactMethods holds only which methods are on file ("email", "phone"), never a value.
  "contacts.query": ["displayName", "headline", "company", "relationship", "status", "tags", "updatedAt", "contactMethods"],
  "relationshipEvidence.query": ["contactId", "kind", "summary", "occurredAt", "sourceId", "sourceRevision"],
  "messages.query": ["conversationId", "contactId", "direction", "content", "sentAt", "readAt", "visibleExtraction", "privacyState"],
  "notifications.query": ["kind", "title", "reason", "occurredAt", "readAt", "disposition", "targetStatus", "sourceIds"],
  "meetings.query": ["title", "startsAt", "endsAt", "timeZone", "location", "meetingMethod", "status", "participantLabels", "eventId", "details"],
  // agent-design AG11: a private event or a «我去过» note read by id (kind private_event / attendance); «我去过» carries the
  // user's own day, parts of the day and sentence.
  // Integration 2026-11-20 (AG20a × the reader): `allDay` — an all-day private event, and a «我去过» note about one. Optional
  // and only ever true; an event without it reads as before.
  "events.query": ["title", "startsAt", "endsAt", "location", "organizerName", "registrationStatus", "visibleAnswers", "membershipStatus", "kind", "attendedOn", "dayParts", "selfNote", "eventRefId", "eventRefKind", "topics", "feeKind", "feeAmountYen", "allDay"],
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
/** agent-design AG05 (设计稿附录 E): a memo's actual interaction, as stored. */
const interaction = z.object({
  actualContactIds: texts,
  channel: z.enum(["phone", "meeting", "message", "email", "other"]),
  direction: z.enum(["incoming", "outgoing", "mutual"]),
  occurredOn: optional(text),
  occurredAt: optional(text),
  precision: z.enum(["day", "instant"]),
}).strict();

const fieldSchemas = {
  "notes.query": z.object({ title: optional(text), snippet: optional(text), body: optional(text), bodyTruncated: optional(z.boolean()), contactIds: optional(texts), eventIds: optional(texts), eventRefs: optional(texts), createdAt: optional(text), updatedAt: optional(text), version: optional(z.number()), interaction: optional(interaction) }).strict(),
  "tasks.query": z.object({ title: optional(text), description: optional(text), status: optional(text), category: optional(text), dueAt: optional(text), plannedDate: optional(text), completedAt: optional(text), contactId: optional(text), contactIds: optional(texts), eventId: optional(text), eventRefs: optional(texts), scheduleId: optional(text), source: optional(textOrTexts), createdAt: optional(text), updatedAt: optional(text) }).strict(),
  "followups.query": z.object({ title: optional(text), status: optional(text), contactId: optional(text), connectionId: optional(text), dueAt: optional(text), source: optional(textOrTexts), evidenceSummary: optional(text), createdAt: optional(text) }).strict(),
  "schedule.query": z.object({ title: optional(text), kind: optional(text), category: optional(text), startsAt: optional(text), endsAt: optional(text), allDay: optional(z.boolean()), timeZone: optional(text), location: optional(text), meetingMethod: optional(text), contactId: optional(text), contactIds: optional(texts), noteIds: optional(texts), eventId: optional(text), eventRefs: optional(texts), meetingId: optional(text), details: optional(text), missingFields: optional(texts), recurrence: optional(text), updatedAt: optional(text) }).strict(),
  "aiHistory.query": z.object({ sessionId: optional(text), groupId: optional(text), title: optional(text), pinned: optional(z.boolean()), role: optional(text), content: optional(text), visibleRunStatus: optional(text), visibleOutput: optional(textOrTexts) }).strict(),
  "contacts.query": z.object({ displayName: optional(text), headline: optional(text), company: optional(text), relationship: optional(text), status: optional(text), tags: optional(texts), updatedAt: optional(text), contactMethods: optional(z.array(z.enum(["email", "phone"]))) }).strict(),
  "relationshipEvidence.query": z.object({ contactId: optional(text), kind: optional(text), summary: optional(text), occurredAt: optional(text), sourceId: optional(text), sourceRevision: optional(text) }).strict(),
  "messages.query": z.object({ conversationId: optional(text), contactId: optional(text), direction: optional(text), content: optional(text), sentAt: optional(text), readAt: optional(text), visibleExtraction: optional(textOrTexts), privacyState: optional(text) }).strict(),
  "notifications.query": z.object({ kind: optional(text), title: optional(text), reason: optional(text), occurredAt: optional(text), readAt: optional(text), disposition: optional(text), targetStatus: optional(text), sourceIds: optional(texts) }).strict(),
  "meetings.query": z.object({ title: optional(text), startsAt: optional(text), endsAt: optional(text), timeZone: optional(text), location: optional(text), meetingMethod: optional(text), status: optional(text), participantLabels: optional(texts), eventId: optional(text), details: optional(text) }).strict(),
  "events.query": z.object({ title: optional(text), startsAt: optional(text), endsAt: optional(text), location: optional(text), organizerName: optional(text), registrationStatus: optional(text), visibleAnswers: optional(textOrTexts), membershipStatus: optional(text), kind: optional(text), attendedOn: optional(text), dayParts: optional(texts), selfNote: optional(text), eventRefId: optional(text), eventRefKind: optional(text), topics: optional(texts), feeKind: optional(text), feeAmountYen: optional(text), allDay: optional(z.boolean()) }).strict(),
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
