import { createEventsRouteHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createEventsRouteHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
