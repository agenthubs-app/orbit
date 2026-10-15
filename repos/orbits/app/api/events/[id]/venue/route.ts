// R27 会場モード read model — GET (not registered → state not_registered; never calls the operations routes).
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().venue;
