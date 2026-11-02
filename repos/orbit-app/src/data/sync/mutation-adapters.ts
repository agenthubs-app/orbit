import type { Mutation } from "../../api/contract/offline-mutations";
import { parseOfflineMutation } from "../../api/schema/offline-mutations";
import { OFFLINE_POLICY_REGISTRATIONS } from "../../api/schema/offline-policy";

/**
 * Sprint 0144: the single offline policy table decides which writes may wait offline. A write of `kind` (the table's
 * domain) and `operation` is eligible when the table queues that action offline (actions are either the operation or
 * `<domain>.<operation>`, e.g. relationship_followup.complete). Save time (the coordinator) and pre-upload checks call this.
 */
const offlineQueuedWrites = new Set(OFFLINE_POLICY_REGISTRATIONS
  .filter((entry) => entry.policy.mutationPolicy === "offline_queue")
  .map((entry) => {
    const prefix = `${entry.policy.domainId}.`;
    return `${entry.policy.domainId}\u0000${entry.action.startsWith(prefix) ? entry.action.slice(prefix.length) : entry.action}`;
  }));

export function isOfflineEligible(
  kind: string,
  operation: string,
  facts: {
    actorPrivate: boolean;
    confirmed: boolean;
    connectionActive: boolean;
  },
): boolean {
  return offlineQueuedWrites.has(`${kind}\u0000${operation}`) && facts.actorPrivate && facts.confirmed && facts.connectionActive;
}

export function parseMutation(input: unknown): Mutation {
  if (isLocalTaskWithoutServerRevision(input)) {
    const parsed = parseOfflineMutation({ ...input, baseRevision: "local-pending-create" }) as Mutation;
    return { ...parsed, baseRevision: null };
  }
  return parseOfflineMutation(input) as Mutation;
}

function isLocalTaskWithoutServerRevision(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const mutation = input as Record<string, unknown>;
  return mutation.kind === "task" && mutation.operation !== "create" && mutation.baseRevision === null &&
    typeof mutation.entityId === "string" &&
    /^local:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-8][0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/u.test(mutation.entityId);
}
