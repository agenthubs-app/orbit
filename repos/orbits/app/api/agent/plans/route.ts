import { createPlanRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

// POST /api/agent/plans：保存新版本（旧版本归档，已完成内容按规则带入）。
export const POST = createPlanRouteHandlers().POST_VERSION;
