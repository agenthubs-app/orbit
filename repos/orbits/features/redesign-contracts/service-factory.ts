// R08: the twelve redesign contracts only have mock implementations until their
// feature Sprints build the real ones. One factory per capability: mock (and
// hybrid, which falls back to mock) serve the demo-world fixtures; live — always the
// mode in production — resolves to the shared NOT_IMPLEMENTED failure, so a
// production request never sees sample data (RD-22).
import { createModuleServiceFactory, type ModuleMode, type ServiceResolution } from "../../shared/services/module-mode";

export const REDESIGN_CONTRACT_CAPABILITIES = [
  "home-layout",
  "contact-completion",
  "invite-codes",
  "event-assessment",
  "event-recommendation-feedback",
  "account-lifecycle",
  "plan-v2-summary",
] as const;

export type RedesignContractCapability = (typeof REDESIGN_CONTRACT_CAPABILITIES)[number];

/** The mock service is the fixtures themselves (features/redesign-contracts/mock-service.ts). */
export type RedesignMockService = { readonly mode: "mock" };

export function resolveRedesignContract(capabilityId: RedesignContractCapability, mode?: ModuleMode | string): ServiceResolution<RedesignMockService> {
  return createModuleServiceFactory<RedesignMockService>({
    capabilityId,
    implementations: { mock: () => ({ mode: "mock" }) },
  }).create(mode);
}
