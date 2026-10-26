// R22 计划 v2.2（features/plans/v2/handlers.ts）。
import { planV2Handlers } from "../../../../../../features/plans/v2/handlers";
import { planFlowHandlers } from "../../../../../../features/plans/v2/flow-handlers";
export const GET = planV2Handlers.detail;
export const DELETE = planFlowHandlers.deleteGoal;
export const dynamic = "force-dynamic";
