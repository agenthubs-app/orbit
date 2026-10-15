// R27 (DESIGN §10 A2) follow / unfollow an organizer — POST / DELETE, idempotent.
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

const routes = createEventJourneyRoutes();
export const dynamic = "force-dynamic";
export const POST = routes.follow;
export const DELETE = routes.unfollow;
