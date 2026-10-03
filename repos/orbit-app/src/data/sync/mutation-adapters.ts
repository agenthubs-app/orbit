import type { Mutation } from "../../api/contract/offline-mutations";
import { parseOfflineMutation } from "../../api/schema/offline-mutations";

export function isOfflineEligible(
  kind: string,
  operation: string,
  facts: {
    actorPrivate: boolean;
    confirmed: boolean;
    connectionActive: boolean;
  },
): boolean {
  const privateNoteWrite = kind === "note" && (operation === "create" || operation === "update");
  const personalTaskWrite = kind === "task" &&
    ["create", "update", "complete", "reopen", "cancel", "delete"].includes(operation);
  // Sprint 0135: a text message into a conversation the device holds and that is active.
  const relationshipMessageSend = kind === "relationship_message" && operation === "send";
  return (privateNoteWrite || personalTaskWrite || relationshipMessageSend) &&
    facts.actorPrivate && facts.confirmed && facts.connectionActive;
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
