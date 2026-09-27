import { createPlanRouteHandlers } from "../route-handlers";

export const dynamic = "force-dynamic";

// GET /api/agent/plans/current：本人当前生效的计划（没有时 data 为 null）。
export const GET = createPlanRouteHandlers().GET_CURRENT;
