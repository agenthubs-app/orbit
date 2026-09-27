import { createGuideStateRouteHandlers } from "./route-handler";

export const dynamic = "force-dynamic";

const handlers = createGuideStateRouteHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
