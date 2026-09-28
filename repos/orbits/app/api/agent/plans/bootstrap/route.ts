import { createPlanBootstrapRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

// POST /api/agent/plans/bootstrap：固定问题 → 生成并保存第一份计划（mock 生成器，D3）。
export const POST = createPlanBootstrapRouteHandlers().POST;
