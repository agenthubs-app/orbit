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
  "app-version",
  "plan-v2-summary",
  // R17: 主催（host/DESIGN.md §4）——運営センター、运营台、受付、共同運営者、主办方资料与公开页。
  "host-operations",
  // R30: 全局搜索（search/DESIGN.md §3.1）——只编排已有 live 数据源，第一天就是 live。
  "global-search",
  "todo-page",
  "calendar-external-events",
  // R11b: 人脈分析（GET /api/network/analysis、…/people）——live 读 R11a 人脈数据；mock 为本机 fixture 世界（features/network-analysis/analysis-fixtures.ts）。
  "network-analysis",
] as const;

export type RedesignContractCapability = (typeof REDESIGN_CONTRACT_CAPABILITIES)[number];

/** The mock service is the fixtures themselves (features/redesign-contracts/mock-service.ts). */
export type RedesignMockService = { readonly mode: "mock" };
/** A capability whose live implementation exists; the handler routes to it (never to fixtures). */
export type RedesignLiveService = { readonly mode: "live" };
export type RedesignContractService = RedesignMockService | RedesignLiveService;

/** Capabilities with a live implementation (the rest answer NOT_IMPLEMENTED in live). */
// R26: `event-assessment` has a live implementation (features/events/assessment).
// R27: `event-recommendation-feedback` (興味なし) has a live implementation (features/events/journey).
export const REDESIGN_CONTRACT_LIVE_CAPABILITIES: readonly RedesignContractCapability[] = ["home-layout", "contact-completion", "event-assessment", "event-recommendation-feedback", "account-lifecycle", "host-operations", "global-search", "todo-page", "calendar-external-events", "network-analysis", "app-version"];
// R17: `host-operations` has a live implementation (features/events/host).

export function resolveRedesignContract(capabilityId: RedesignContractCapability, mode?: ModuleMode | string): ServiceResolution<RedesignContractService> {
  return createModuleServiceFactory<RedesignContractService>({
    capabilityId,
    implementations: {
      mock: () => ({ mode: "mock" }),
      ...(REDESIGN_CONTRACT_LIVE_CAPABILITIES.includes(capabilityId) ? { live: () => ({ mode: "live" }) as const } : {}),
    },
  }).create(mode);
}

/** Dev-only design-board fixtures (R26 `app/api/dev/event-design-fixture/route.dev.ts`): swap the mock assessment list, `null` restores the demo world. */
export async function overrideRedesignMockAssessments(items: Parameters<typeof import("./mock-service").redesignMock.overrideAssessments>[0]): Promise<void> {
  const { redesignMock } = await import("./mock-service");
  redesignMock.overrideAssessments(items);
}

// R27 设计稿门禁：切换 イベント参加者の動線 的示例变体（dev route 经由工厂拿 mock，不直接 import mock 模块）。
export { setJourneyMockState, type JourneyMockState } from "../events/journey/mock";

// R17 设计稿门禁：切换主催的示例变体。
export { setHostMockState } from "../events/host/mock";
