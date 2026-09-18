export type AiVisibilitySourceId =
  | `tool:${string}`
  | `context:${string}`;

export interface AiVisibilitySource {
  id: AiVisibilitySourceId;
  actorScope: "server_injected_actor";
  allowedFields: readonly string[];
  purpose: string;
  maxItems: number;
  redaction: {
    deniedFields: readonly string[];
    untrustedText: boolean;
  };
  retention: "request_only" | "conversation_window";
  audit: {
    event: string;
    recordContent: false;
  };
  confirmation: "none_for_read" | "confirmation_before_side_effect";
}

const deniedFields = [
  "accountId",
  "actorId",
  "attachmentBytes",
  "authToken",
  "password",
  "profileId",
  "providerToken",
  "pushToken",
  "rawAttachment",
  "rawBusinessCardImage",
  "userId",
] as const;

function source(
  id: AiVisibilitySourceId,
  allowedFields: readonly string[],
  purpose: string,
  options: Partial<Pick<AiVisibilitySource, "maxItems" | "retention" | "confirmation">> = {},
): AiVisibilitySource {
  return {
    id,
    actorScope: "server_injected_actor",
    allowedFields,
    purpose,
    maxItems: options.maxItems ?? 10,
    redaction: { deniedFields, untrustedText: true },
    retention: options.retention ?? "request_only",
    audit: { event: `orbit_ai_visibility:${id}`, recordContent: false },
    confirmation: options.confirmation ?? "confirmation_before_side_effect",
  };
}

const aiReadSources = AI_READ_PERMISSIONS.map((permission) => source(
  `tool:${permission.tool}`,
  ["id", "revision", "updatedAt", "evidenceIds", ...permission.fields],
  `Read bounded cloud-canonical ${permission.domain} data after current scope and source authorization.`,
  { maxItems: permission.maxItems, confirmation: "none_for_read" },
));

export const AI_VISIBILITY_MANIFEST = [
  source("tool:events.recommend", ["id", "title", "startsAt", "location", "reason", "evidenceIds"], "Recommend relevant events from actor-scoped event context."),
  source("tool:contacts.recommend", ["id", "displayName", "headline", "reason", "relationship", "evidenceIds"], "Recommend actor-scoped contacts and introduction paths."),
  source("tool:followups.reviewQueue", ["id", "title", "contactId", "dueAt", "reason", "evidenceIds"], "Rank derived follow-up candidates for review."),
  source("tool:chat.context", ["contactId", "summary", "relationship", "evidenceIds"], "Summarize actor-scoped relationship conversation context."),
  source("tool:profile.getSelf", ["displayName", "headline", "industry", "topics", "sourceVersion"], "Ground the current turn in the signed-in user's own profile.", { maxItems: 1, confirmation: "none_for_read" }),
  ...aiReadSources,
  source("context:message", ["content", "locale"], "Understand the current user request.", { maxItems: 1 }),
  source("context:history", ["role", "content"], "Resolve conversational references within a bounded recent window.", { retention: "conversation_window" }),
  source("context:memory", ["category", "content", "source", "updatedAt"], "Apply confirmed actor memory relevant to the current request."),
  source("context:outcomes", ["toolName", "status", "summary", "evidenceIds"], "Synthesize bounded results returned by approved read tools."),
] as const satisfies readonly AiVisibilitySource[];

export function getAiVisibilitySource(id: string): AiVisibilitySource | null {
  return AI_VISIBILITY_MANIFEST.find((entry) => entry.id === id) ?? null;
}

export function validateAiVisibilityManifest(entries: readonly AiVisibilitySource[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) issues.push(`duplicate source: ${entry.id}`);
    ids.add(entry.id);
    if (entry.allowedFields.length === 0) issues.push(`allowed fields are required: ${entry.id}`);
    if (!Number.isSafeInteger(entry.maxItems) || entry.maxItems < 1 || entry.maxItems > 20) issues.push(`max items must be between 1 and 20: ${entry.id}`);
    if (!entry.purpose.trim()) issues.push(`purpose is required: ${entry.id}`);
    if (entry.audit.recordContent !== false) issues.push(`audit content must be disabled: ${entry.id}`);
  }
  return issues;
}
import { AI_READ_PERMISSIONS } from "../data-query/permission-registry";
