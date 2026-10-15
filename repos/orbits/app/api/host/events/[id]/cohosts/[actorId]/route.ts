import { createHostRoutes } from "../../../../../../../features/events/host/handlers";

export const dynamic = "force-dynamic";

const routes = createHostRoutes();
export const PATCH = routes.changeCohostRole;
export const DELETE = routes.removeCohost;
