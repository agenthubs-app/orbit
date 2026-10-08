import { createPlanRouteHandlers } from "../route-handlers";

export const dynamic = "force-dynamic";

// POST /api/agent/plans/log：在生效计划上写一条手动进展记录。
export const POST = createPlanRouteHandlers().POST_LOG;
