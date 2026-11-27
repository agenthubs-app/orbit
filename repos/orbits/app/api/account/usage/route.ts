import { createAccountUsageRouteHandlers } from "./handlers";

export const dynamic = "force-dynamic";

const handlers = createAccountUsageRouteHandlers();

export const GET = handlers.GET;
