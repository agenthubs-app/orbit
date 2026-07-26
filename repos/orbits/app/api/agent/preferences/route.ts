import { createAgentPreferencesRouteHandlers } from "./route-handler";

export const dynamic = "force-dynamic";

const handlers = createAgentPreferencesRouteHandlers();
export const GET = handlers.GET;
export const PUT = handlers.PUT;
