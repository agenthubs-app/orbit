import { z } from "zod";

import type { AiSyncVisibility } from "../../shared/contract/sync";

export type DataAuthorityMigrationStatus =
  | "canonical"
  | "compatibility"
  | "consolidating";

export interface DataAuthorityProjection {
  name: string;
  source: string;
  compatibilityUntil?: string;
}

export interface DataAuthorityEntry {
  domain: string;
  canonicalStore: string;
  ownerKey: string;
  apiContract: string;
  aiPolicy: string;
  localPersistenceClass: DataAuthorityLocalPersistenceClass;
  aiVisibility: AiSyncVisibility;
  projections: readonly DataAuthorityProjection[];
  migration: {
    status: DataAuthorityMigrationStatus;
    legacySources: readonly string[];
    completionCondition: string;
  };
}

export type DataAuthorityLocalPersistenceClass =
  | "durable_mirror"
  | "short_lived_cache"
  | "device_only"
  | "server_only";

export const syncEntityKindSchema = z.enum([
  "contact",
  "note",
  "task",
  "relationship_followup",
  "personal_schedule",
  "inbox_item",
]);
export const localSyncStateSchema = z.enum(["synced", "pending", "conflicted", "failed"]);
export const aiSyncVisibilitySchema = z.enum(["available_when_synced", "excluded"]);

const nonEmptyIdentifier = z.string().refine((value) => value.trim().length > 0, "value must not be blank");
const timestamp = z.string().datetime({ offset: true });
const syncPayloadSchema = z.json();

export const syncRecordSchema = z
  .strictObject({
    actorId: nonEmptyIdentifier,
    workspaceId: nonEmptyIdentifier,
    kind: syncEntityKindSchema,
    id: nonEmptyIdentifier,
    revision: nonEmptyIdentifier,
    updatedAt: timestamp,
    deletedAt: timestamp.nullable(),
    payload: syncPayloadSchema,
    syncState: localSyncStateSchema,
    aiVisibility: aiSyncVisibilitySchema,
  })
  .superRefine((record, context) => {
    if (record.deletedAt === null && record.payload === null) {
      context.addIssue({ code: "custom", message: "live sync records require a payload", path: ["payload"] });
    }
    if (record.deletedAt !== null && record.payload !== null) {
      context.addIssue({ code: "custom", message: "sync record tombstones require a null payload", path: ["payload"] });
    }
  });

export const clientSyncMutationSchema = z.strictObject({
  kind: syncEntityKindSchema,
  id: nonEmptyIdentifier,
  payload: syncPayloadSchema,
});

export const DATA_AUTHORITY_REGISTRY: readonly DataAuthorityEntry[] = [
  {
    domain: "notes",
    canonicalStore: "orbit_records/notes",
    ownerKey: "user_id = accountId = ownerUserId",
    apiContract: "/api/notes and /api/notes/:id",
    aiPolicy: "actor-scoped notes.query allowlist; body only for authorized get; untrusted text",
    localPersistenceClass: "durable_mirror",
    aiVisibility: "available_when_synced",
    projections: [
      { name: "Notes Web and App clients", source: "orbit_records/notes" },
    ],
    migration: {
      status: "canonical",
      legacySources: [],
      completionCondition: "all note readers use NoteService",
    },
  },
  {
    domain: "tasks",
    canonicalStore: "orbit_records/tasks",
    ownerKey: "user_id = accountId = ownerUserId",
    apiContract: "/api/tasks and /api/tasks/:id",
    aiPolicy: "actor-scoped tasks.query allowlist; taskSuggestions denied",
    localPersistenceClass: "durable_mirror",
    aiVisibility: "available_when_synced",
    projections: [
      { name: "Tasks and Today views", source: "orbit_records/tasks" },
    ],
    migration: {
      status: "canonical",
      legacySources: ["taskSuggestions"],
      completionCondition: "suggestions remain explicitly separate from confirmed tasks",
    },
  },
  {
    domain: "relationship_followups",
    canonicalStore: "orbit_records/tasks",
    ownerKey: "user_id = accountId = ownerUserId",
    apiContract: "internal Followups live graph filtered to Relationship Connection",
    aiPolicy: "actor-scoped followups.query allowlist; message bodies denied; evidence summarized",
    localPersistenceClass: "durable_mirror",
    aiVisibility: "available_when_synced",
    projections: [
      { name: "confirmed Relationship followups", source: "orbit_records/tasks" },
      { name: "followups.reviewQueue derived recommendation", source: "orbit_records/tasks" },
    ],
    migration: {
      status: "canonical",
      legacySources: [],
      completionCondition: "persistent facts and derived review queue remain separately labelled",
    },
  },
  {
    domain: "schedule",
    canonicalStore: "orbit_records/personal_schedule_items",
    ownerKey: "user_id = accountId = ownerUserId",
    apiContract: "/api/schedule-items and /api/schedule-items/:id",
    aiPolicy: "actor-scoped schedule.query allowlist after canonical projection; provider tokens denied",
    localPersistenceClass: "durable_mirror",
    aiVisibility: "available_when_synced",
    projections: [
      { name: "Today, Schedule, Event action, and Agent action", source: "orbit_records/personal_schedule_items" },
      {
        name: "legacy orbitScheduleItems reader",
        source: "orbit_records/personal_schedule_items",
        compatibilityUntil: "remove after migration parity evidence and one compatibility release",
      },
    ],
    migration: {
      status: "consolidating",
      legacySources: ["orbit_records/orbitScheduleItems"],
      completionCondition: "dry-run reports zero conflicts/orphans and all writers use PersonalScheduleService",
    },
  },
  {
    domain: "push_devices",
    canonicalStore: "SecureStore/orbit.pushDeviceId + orbit_records/pushDevices",
    ownerKey: "server-injected actorId + installation deviceId",
    apiContract: "/api/devices/push-tokens and /api/devices/push-tokens/:id",
    aiPolicy: "denied; device ids and push tokens are never model-visible",
    localPersistenceClass: "device_only",
    aiVisibility: "excluded",
    projections: [
      { name: "App notification lifecycle", source: "SecureStore/orbit.pushDeviceId + orbit_records/pushDevices" },
      {
        name: "legacy /api/devices/push-token compatibility adapter",
        source: "SecureStore/orbit.pushDeviceId + orbit_records/pushDevices",
        compatibilityUntil: "remove after upgraded-client telemetry shows no legacy calls for one release",
      },
    ],
    migration: {
      status: "consolidating",
      legacySources: [
        "AsyncStorage/orbit.notifications.device-id.v1",
        "orbit_records/devicePushTokens",
        "/api/devices/push-token",
      ],
      completionCondition: "legacy id is migrated/revoked and lifecycle traffic uses plural endpoint",
    },
  },
  {
    domain: "ai_provider_context",
    canonicalStore: "ephemeral Orbit AI request context",
    ownerKey: "server-injected authenticated actorId",
    apiContract: "Orbit AI live runtime provider-input contract",
    aiPolicy: "message/history/memory/outcomes are purpose-bound, bounded, redacted, and never authority",
    localPersistenceClass: "server_only",
    aiVisibility: "excluded",
    projections: [
      { name: "provider synthesis prompt", source: "ephemeral Orbit AI request context" },
    ],
    migration: {
      status: "canonical",
      legacySources: [],
      completionCondition: "all provider inputs appear in the AI visibility manifest",
    },
  },
] as const;

export function validateDataAuthorityRegistry(
  entries: readonly DataAuthorityEntry[],
): string[] {
  const errors: string[] = [];
  const domains = new Set<string>();
  for (const entry of entries) {
    if (domains.has(entry.domain)) errors.push(`duplicate domain: ${entry.domain}`);
    domains.add(entry.domain);
    if (!entry.canonicalStore.trim()) errors.push(`canonical store is required: ${entry.domain}`);
    if (!entry.ownerKey.trim()) errors.push(`owner key is required: ${entry.domain}`);
    if (!entry.apiContract.trim()) errors.push(`API contract is required: ${entry.domain}`);
    if (!entry.aiPolicy.trim()) errors.push(`AI policy is required: ${entry.domain}`);
    for (const projection of entry.projections) {
      if (!projection.source.trim()) {
        errors.push(`projection source is required: ${entry.domain}/${projection.name}`);
      }
    }
  }
  return errors;
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderDataAuthorityRegistryMarkdown(
  entries: readonly DataAuthorityEntry[],
): string {
  const rows = entries.map((entry) => {
    const projections = entry.projections
      .map((projection) =>
        projection.compatibilityUntil
          ? `${projection.name} (compat: ${projection.compatibilityUntil})`
          : projection.name,
      )
      .join("; ");
    const migration = `${entry.migration.status}; legacy: ${entry.migration.legacySources.join(", ") || "none"}; done when: ${entry.migration.completionCondition}`;
    return `| ${cell(entry.domain)} | ${cell(entry.canonicalStore)} | ${cell(entry.ownerKey)} | ${cell(entry.apiContract)} | ${cell(projections)} | ${cell(entry.aiPolicy)} | ${cell(migration)} |`;
  });
  return [
    "# Data authority registry",
    "",
    "> Generated from `features/data-authority/registry.ts`. Edit the registry and regenerate this view; do not maintain a second authority table.",
    "",
    "| Domain | Canonical store | Owner key | API contract | Projections | AI policy | Migration |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
