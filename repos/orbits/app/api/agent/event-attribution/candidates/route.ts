import { createEventAttributionCandidateRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

const handlers = createEventAttributionCandidateRouteHandlers();

// GET /api/agent/event-attribution/candidates?batchId=：名片审阅页的活动归属候选（W0015）。
export const GET = handlers.GET;
