import { createPushTokenRouteHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createPushTokenRouteHandlers();
export const POST = handlers.POST;
