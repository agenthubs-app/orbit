import { createEntityDraftRouteHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createEntityDraftRouteHandlers();

export const GET = handlers.GET;
