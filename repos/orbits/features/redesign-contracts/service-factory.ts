// R08: the twelve redesign contracts only have mock implementations until their
// feature Sprints build the real ones. One factory per capability: mock (and
// hybrid, which falls back to mock) serve the demo-world fixtures; live — always the
// mode in production — resolves to the shared NOT_IMPLEMENTED failure, so a
// production request never sees sample data (RD-22).
// R16: `contact-completion` has a live implementation (features/contacts/completion);
// the route's handler receives the resolved mode and never serves fixtures in live.
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
/** A capability whose live implementation exists; the handler routes to it (never to fixtures). */
export type RedesignLiveService = { readonly mode: "live" };
export type RedesignContractService = RedesignMockService | RedesignLiveService;

/** Capabilities with a live implementation (the rest answer NOT_IMPLEMENTED in live). */
export const REDESIGN_CONTRACT_LIVE_CAPABILITIES: readonly RedesignContractCapability[] = ["contact-completion"];

export function resolveRedesignContract(capabilityId: RedesignContractCapability, mode?: ModuleMode | string): ServiceResolution<RedesignContractService> {
  return createModuleServiceFactory<RedesignContractService>({
    capabilityId,
    implementations: {
      mock: () => ({ mode: "mock" }),
      ...(REDESIGN_CONTRACT_LIVE_CAPABILITIES.includes(capabilityId) ? { live: () => ({ mode: "live" }) as const } : {}),
    },
  }).create(mode);
}
