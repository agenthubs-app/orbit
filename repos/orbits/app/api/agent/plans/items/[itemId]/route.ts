import { createPlanRouteHandlers } from "../../route-handlers";

export const dynamic = "force-dynamic";

// PATCH /api/agent/plans/items/:itemId：单个条目的状态／联系人／答案／延后变化。
export const PATCH = createPlanRouteHandlers().PATCH_ITEM;
