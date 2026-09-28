import { createPlanRouteHandlers } from "../route-handlers";

export const dynamic = "force-dynamic";

// GET /api/agent/plans/weekly-summary：东京周一返回上周的进展小结（规则拼出，不调 AI），其他日子 null。
export const GET = createPlanRouteHandlers().GET_WEEKLY_SUMMARY;
