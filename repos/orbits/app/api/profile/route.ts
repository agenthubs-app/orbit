import { createProfileRouteHandlers } from "./handlers";

export const dynamic = "force-dynamic";

const profileRouteHandlers = createProfileRouteHandlers();

export const GET = profileRouteHandlers.GET;
export const PUT = profileRouteHandlers.PUT;
