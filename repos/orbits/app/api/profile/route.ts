import { createProfileRouteHandlers } from "./handlers";
import { withTotalServerTiming } from "../../../shared/performance/server-timing";

export const dynamic = "force-dynamic";

const profileRouteHandlers = createProfileRouteHandlers();

export const GET = withTotalServerTiming(profileRouteHandlers.GET);
export const PUT = profileRouteHandlers.PUT;
