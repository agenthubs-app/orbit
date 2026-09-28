import { createPlanCandidateRouteHandlers } from "../../../candidates/route-handlers";

export const dynamic = "force-dynamic";

// POST /api/agent/plans/items/:itemId/draft：「约 TA」行动上的「起草邮件」（W0010）。
// 只在点击时调用；当前是模板草稿，不调 AI、不发送。
export const POST = createPlanCandidateRouteHandlers().POST_DRAFT;
