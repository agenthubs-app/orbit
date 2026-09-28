import { createPlanCandidateRouteHandlers } from "../route-handlers";

export const dynamic = "force-dynamic";
// 请求内执行一批的匹配任务（规则层 + 至多一次 AI）；审阅页最多等 8 秒，请求本身可以更久。
export const maxDuration = 60;

// POST /api/agent/plans/candidates/run：审阅页在名片批次确认完成后触发（W0010）。
export const POST = createPlanCandidateRouteHandlers().POST_RUN;
