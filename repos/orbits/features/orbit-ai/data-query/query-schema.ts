import type { Validator } from "../agent-tools/registry";
import type { ActorQueryToolName, ActorScopedQueryInput } from "./query-service";
import type { AiReadTool, ReadInput } from "./read-contract";

export interface ActorQueryToolInput extends ActorScopedQueryInput {
  locale?: "zh" | "en";
}

const commonFields = ["operation", "query", "searchTerms", "locale", "id", "cursor", "limit"] as const;
const fieldsByTool: Record<ActorQueryToolName, readonly string[]> = {
  "notes.query": [...commonFields, "contactId", "eventId"],
  "tasks.query": [...commonFields, "status", "from", "to", "contactId", "eventId"],
  "followups.query": [...commonFields, "status", "from", "to", "contactId"],
  "schedule.query": [...commonFields, "from", "to", "contactId", "eventId"],
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, max: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.trim().length > 0 && value.length <= max);
}

function optionalInstant(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)));
}

export function createActorQueryInputSchema(toolName: ActorQueryToolName): Validator<ActorQueryToolInput> {
  const allowed = new Set(fieldsByTool[toolName]);
  const properties: Record<string, unknown> = {
    operation: { type: "string", enum: ["list", "search", "get"] },
    query: { type: "string", minLength: 1, maxLength: 2_000 },
    searchTerms: { type: "string", minLength: 1, maxLength: 500, description: "Required for search only: the title/text fragment to match, not the whole user instruction." },
    locale: { type: "string", enum: ["zh", "en"] },
    id: { type: "string", minLength: 1, maxLength: 512 },
    cursor: { type: "string", minLength: 1, maxLength: 2_048 },
    limit: { type: "integer", minimum: 1, maximum: 10 },
    status: { type: "string", enum: ["open", "completed", "cancelled"] },
    from: { type: "string", format: "date-time", maxLength: 64 },
    to: { type: "string", format: "date-time", maxLength: 64 },
    contactId: { type: "string", minLength: 1, maxLength: 512 },
    eventId: { type: "string", minLength: 1, maxLength: 512 },
  };
  return {
    jsonSchema: {
      type: "object",
      required: ["operation", "query"],
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(properties).filter(([key]) => allowed.has(key))),
    },
    parse(value) {
      if (!record(value) || Object.keys(value).some((key) => !allowed.has(key))) {
        return { success: false, error: `Only ${[...allowed].join(", ")} are accepted for ${toolName}.` };
      }
      if (!(["list", "search", "get"] as const).includes(value.operation as ActorQueryToolInput["operation"])) {
        return { success: false, error: "operation must be list, search, or get" };
      }
      if (typeof value.query !== "string" || !value.query.trim() || value.query.length > 2_000) {
        return { success: false, error: "query must contain 1-2000 characters" };
      }
      if (value.operation === "search"
        ? !optionalText(value.searchTerms, 500) || value.searchTerms === undefined
        : value.searchTerms !== undefined) {
        return { success: false, error: "searchTerms is required only for search and must contain 1-500 characters" };
      }
      if (value.locale !== undefined && value.locale !== "zh" && value.locale !== "en") return { success: false, error: "locale must be zh or en" };
      if (!optionalText(value.id, 512) || !optionalText(value.cursor, 2_048) || !optionalText(value.contactId, 512) || !optionalText(value.eventId, 512)) return { success: false, error: "identifier or cursor is invalid" };
      if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 10)) return { success: false, error: "limit must be an integer from 1 to 10" };
      if (value.status !== undefined && !["open", "completed", "cancelled"].includes(String(value.status))) return { success: false, error: "status is invalid" };
      if (!optionalInstant(value.from) || !optionalInstant(value.to) || (value.from && value.to && value.from > value.to)) return { success: false, error: "time range is invalid" };
      if (value.operation === "get" ? !value.id : value.id !== undefined) return { success: false, error: "id is required only for get" };
      return {
        success: true,
        data: {
          operation: value.operation as ActorQueryToolInput["operation"],
          query: value.query.trim(),
          ...(typeof value.searchTerms === "string" ? { searchTerms: value.searchTerms.trim() } : {}),
          ...(value.locale ? { locale: value.locale as "zh" | "en" } : {}),
          ...(value.id ? { id: String(value.id).trim() } : {}),
          ...(value.cursor ? { cursor: String(value.cursor).trim() } : {}),
          ...(value.limit !== undefined ? { limit: Number(value.limit) } : {}),
          ...(value.status ? { status: String(value.status) } : {}),
          ...(value.from ? { from: String(value.from) } : {}),
          ...(value.to ? { to: String(value.to) } : {}),
          ...(value.contactId ? { contactId: String(value.contactId).trim() } : {}),
          ...(value.eventId ? { eventId: String(value.eventId).trim() } : {}),
        },
      };
    },
  };
}

export function createAiReadInputSchema(_toolName: AiReadTool): Validator<ReadInput> {
  const toolName = _toolName;
  const common = ["operation", "query", "id", "cursor", "limit"] as const;
  const filters: Record<AiReadTool, readonly string[]> = {
    "notes.query": ["contactId", "eventId"],
    "tasks.query": ["status", "from", "to", "contactId", "eventId"],
    "followups.query": ["status", "from", "to", "contactId"],
    "schedule.query": ["from", "to", "contactId", "eventId"],
    "aiHistory.query": ["status", "from", "to"],
    "contacts.query": ["status"],
    "relationshipEvidence.query": ["contactId", "from", "to"],
    "messages.query": ["status", "from", "to", "contactId"],
    "notifications.query": ["status", "from", "to"],
    "meetings.query": ["status", "from", "to", "contactId", "eventId"],
    "events.query": ["status", "from", "to", "eventId"],
    "goals.query": ["status", "eventId"],
    "agentData.query": ["status", "from", "to"],
  };
  const allowed = new Set<string>([...common, ...filters[toolName]]);
  const properties: Record<string, unknown> = {
    operation: { type: "string", enum: ["list", "search", "get"] },
    query: { type: "string", minLength: 1, maxLength: 2_000 },
    id: { type: "string", minLength: 1, maxLength: 512 },
    cursor: { type: "string", minLength: 1, maxLength: 2_048 },
    limit: { type: "integer", minimum: 1, maximum: 10 },
    status: { type: "string", minLength: 1, maxLength: 128 },
    from: { type: "string", format: "date-time", maxLength: 64 },
    to: { type: "string", format: "date-time", maxLength: 64 },
    contactId: { type: "string", minLength: 1, maxLength: 512 },
    eventId: { type: "string", minLength: 1, maxLength: 512 },
  };
  return {
    jsonSchema: {
      type: "object",
      required: ["operation", "query"],
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(properties).filter(([key]) => allowed.has(key))),
    },
    parse(value) {
      if (!record(value) || Object.keys(value).some((key) => !allowed.has(key))) {
        return { success: false, error: `Only ${[...allowed].join(", ")} are accepted for ${toolName}.` };
      }
      if (!(["list", "search", "get"] as const).includes(value.operation as ReadInput["operation"])) {
        return { success: false, error: "operation must be list, search, or get" };
      }
      if (typeof value.query !== "string" || !value.query.trim() || value.query.length > 2_000) {
        return { success: false, error: "query must contain 1-2000 characters" };
      }
      if (!optionalText(value.id, 512) || !optionalText(value.cursor, 2_048) || !optionalText(value.contactId, 512) || !optionalText(value.eventId, 512)) {
        return { success: false, error: "identifier or cursor is invalid" };
      }
      if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 10)) {
        return { success: false, error: "limit must be an integer from 1 to 10" };
      }
      if (value.status !== undefined && !optionalText(value.status, 128)) return { success: false, error: "status is invalid" };
      if (!optionalInstant(value.from) || !optionalInstant(value.to) || (value.from && value.to && value.from > value.to)) {
        return { success: false, error: "time range is invalid" };
      }
      if (value.operation === "get" ? !value.id : value.id !== undefined) return { success: false, error: "id is required only for get" };
      return {
        success: true,
        data: {
          operation: value.operation as ReadInput["operation"],
          query: value.query.trim(),
          ...(value.id ? { id: value.id.trim() } : {}),
          ...(value.cursor ? { cursor: value.cursor.trim() } : {}),
          ...(value.limit !== undefined ? { limit: Number(value.limit) } : {}),
          ...(value.contactId ? { contactId: value.contactId.trim() } : {}),
          ...(value.eventId ? { eventId: value.eventId.trim() } : {}),
          ...(value.status ? { status: String(value.status).trim() } : {}),
          ...(value.from ? { from: value.from } : {}),
          ...(value.to ? { to: value.to } : {}),
        },
      };
    },
  };
}
