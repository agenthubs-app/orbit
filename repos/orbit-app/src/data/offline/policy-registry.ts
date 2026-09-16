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
    return this.registry.resolve(method, pathname, action);
  }
}
