import { createSyncRouteHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createSyncRouteHandlers();

export const GET = handlers.GET;
