import {
  OfflineDataPolicyRegistry as ContractPolicyRegistry,
} from "../../api/schema/offline-policy";
import type {
  OfflinePolicy,
  OfflinePolicyRegistration,
} from "../../api/contract/offline-policy";

export class OfflineDataPolicyRegistry {
  private readonly registry: ContractPolicyRegistry;

  constructor(registrations: readonly OfflinePolicyRegistration[] = []) {
    this.registry = new ContractPolicyRegistry(registrations);
  }

  resolve(method: string, pathname: string, action: string): OfflinePolicy {
    const policy = this.registry.resolve(method, pathname, action);
    if (relationshipFollowupActions.has(action)) return { ...policy, mutationPolicy: "online_only" };
    return policy;
  }
}

const relationshipFollowupActions = new Set([
  "relationship_followup.update",
  "relationship_followup.complete",
  "relationship_followup.reopen",
  "relationship_followup.cancel",
  "relationship_followup.delete",
]);
