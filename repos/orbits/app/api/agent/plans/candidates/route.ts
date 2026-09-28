import { createPlanCandidateRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

const handlers = createPlanCandidateRouteHandlers();

// GET /api/agent/plans/candidates：本人待确认的人脉需求匹配候选（W0010）。
export const GET = handlers.GET;
// POST /api/agent/plans/candidates：确认／忽略候选，或从联系人详情手动关联。
export const POST = handlers.POST;
