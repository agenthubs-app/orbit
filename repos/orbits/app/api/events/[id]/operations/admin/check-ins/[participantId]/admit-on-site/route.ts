import { createHostRoutes } from "../../../../../../../../../features/events/host/handlers";

export const dynamic = "force-dynamic";

const routes = createHostRoutes();
export const POST = routes.admitOnSite;
