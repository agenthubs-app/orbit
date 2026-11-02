import {
  OfflineDataPolicyRegistry as ContractPolicyRegistry,
} from "../../api/schema/offline-policy";
import type {
  OfflinePolicy,
  OfflinePolicyRegistration,
} from "../../api/contract/offline-policy";

/**
 * Sprint 0144: the shared table is the single offline policy; the App no longer overrides it (relationship follow-up
 * complete/update are offline there, reopen/cancel/delete online).
 */
export class OfflineDataPolicyRegistry {
  private readonly registry: ContractPolicyRegistry;

  constructor(registrations: readonly OfflinePolicyRegistration[] = []) {
    this.registry = new ContractPolicyRegistry(registrations);
  }

  resolve(method: string, pathname: string, action: string): OfflinePolicy {
    return this.registry.resolve(method, pathname, action);
  }
}
