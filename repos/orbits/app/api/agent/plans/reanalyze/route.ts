import { createPlanReanalyzeRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

// POST /api/agent/plans/reanalyze：重新分析（每月 1 次）或到期后制定下一份计划（不占额度），mock 生成器（D3）。
export const POST = createPlanReanalyzeRouteHandlers().POST;
