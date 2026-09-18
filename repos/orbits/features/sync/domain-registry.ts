import type { SyncChangeKind } from "../../shared/contract/sync";

/**
 * Registry v1: the private collections a device may mirror. Domain ids match the
 * App's LEGACY_DOMAINS so lease grants bind directly to its read scopes.
 * Workspace-wide domains (contacts, events…) are not registered yet: their
 * per-actor visibility is derived, not stored, and belongs to a later sprint.
 */
export const SYNC_REGISTRY_VERSION = 1;
export const SYNC_DOMAIN_SCHEMA_VERSION = 1;

export interface SyncDomainDefinition {
  domainId: string;
  collectionName: "notes" | "tasks" | "personal_schedule_items";
  kind: SyncChangeKind;
}

export const SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  { domainId: "notes", collectionName: "notes", kind: "note" },
  { domainId: "tasks", collectionName: "tasks", kind: "task" },
  { domainId: "personal-schedule", collectionName: "personal_schedule_items", kind: "personal_schedule" },
];

export function findSyncDomain(domainId: string): SyncDomainDefinition | null {
  return SYNC_DOMAINS.find((domain) => domain.domainId === domainId) ?? null;
}
