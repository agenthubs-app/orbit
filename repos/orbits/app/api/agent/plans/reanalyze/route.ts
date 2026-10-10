import { planV1RetiredPost } from "../../../../../features/plans/v2/v1-retired";

export const dynamic = "force-dynamic";

// POST /api/agent/plans/reanalyze：R25 起 v1 计划不再重新分析 / 续订——一律 409 PLAN_V1_RETIRED，带 v2 目標入力的地址。
export const POST = planV1RetiredPost;
