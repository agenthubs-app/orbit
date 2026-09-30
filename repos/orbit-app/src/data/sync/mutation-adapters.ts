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
  return (privateNoteWrite || personalTaskWrite) &&
    facts.actorPrivate && facts.confirmed && facts.connectionActive;
}

export function parseMutation(input: unknown): Mutation {
  return parseOfflineMutation(input) as Mutation;
}
