import type { Mutation } from "../../api/contract/offline-mutations";
import { parseOfflineMutation } from "../../api/schema/offline-mutations";

export function isOfflineEligible(
  _kind: string,
  _operation: string,
  _facts: {
    actorPrivate: boolean;
    confirmed: boolean;
    connectionActive: boolean;
  },
): boolean {
  return false;
}

export function parseMutation(input: unknown): Mutation {
  return parseOfflineMutation(input) as Mutation;
}
