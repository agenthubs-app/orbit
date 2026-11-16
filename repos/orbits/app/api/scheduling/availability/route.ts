import { createSchedulingAvailabilityRouteHandlers } from "./route-handler";

export const dynamic = "force-dynamic";

const handlers = createSchedulingAvailabilityRouteHandlers();
export const GET = handlers.GET;
export const PUT = handlers.PUT;
