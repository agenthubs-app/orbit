import { createPlanBootstrapRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";
// W0048b（W48-8）：AI 生成在请求内同步完成（快照 + 骨架 + 前 2 个阶段，每次 HTTP ≤ 90 s）。
export const maxDuration = 300;

// POST /api/agent/plans/bootstrap：固定问题 → 生成并保存第一份计划（ORBIT_PLAN_GENERATOR：mock 或 ai）。
export const POST = createPlanBootstrapRouteHandlers().POST;
