import { createCommunityMembershipRouteHandlers } from "./route-handler";

export const dynamic = "force-dynamic";

const handlers = createCommunityMembershipRouteHandlers();
export const GET = handlers.GET;
export const PUT = handlers.PUT;
