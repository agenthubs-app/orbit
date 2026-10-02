import { createPlanReanalyzeRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";
// W0048b（W48-8）：AI 生成在请求内同步完成。
export const maxDuration = 300;

// POST /api/agent/plans/reanalyze：重新分析（每月 1 次）、到期后制定下一份计划（不占额度），
// 或老模板计划的 AI 重新生成（ai_regenerate，不占额度）。
export const POST = createPlanReanalyzeRouteHandlers().POST;
