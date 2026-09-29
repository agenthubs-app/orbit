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
  return kind === "note" &&
    (operation === "create" || operation === "update") &&
    facts.actorPrivate && facts.confirmed && facts.connectionActive;
}

export function parseMutation(input: unknown): Mutation {
  return parseOfflineMutation(input) as Mutation;
}
