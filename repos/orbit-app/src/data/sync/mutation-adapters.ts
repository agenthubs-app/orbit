import type { Mutation } from "../../api/contract/offline-mutations";
import { parseOfflineMutation } from "../../api/schema/offline-mutations";

const operations: Readonly<Record<string, readonly string[]>> = {
  note: ["create", "update", "delete"],
  task: ["create", "update", "complete", "reopen", "cancel", "delete"],
  relationship_followup: ["update", "complete", "reopen", "cancel", "delete"],
  personal_schedule: ["create", "update", "delete"],
};

export function isOfflineEligible(
  kind: string,
  operation: string,
  facts: {
    actorPrivate: boolean;
    confirmed: boolean;
    connectionActive: boolean;
  },
): boolean {
  return facts.actorPrivate && facts.confirmed &&
    (kind !== "relationship_followup" || facts.connectionActive) &&
    Object.hasOwn(operations, kind) &&
    operations[kind]!.includes(operation);
}

export function parseMutation(input: unknown): Mutation {
  return parseOfflineMutation(input) as Mutation;
}
