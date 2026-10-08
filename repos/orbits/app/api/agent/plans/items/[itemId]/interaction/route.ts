import { createPlanCandidateRouteHandlers } from "../../../candidates/route-handlers";

export const dynamic = "force-dynamic";

// POST /api/agent/plans/items/:itemId/interaction：「约 TA」行动上的「记一次互动」（W0010）。
export const POST = createPlanCandidateRouteHandlers().POST_INTERACTION;
