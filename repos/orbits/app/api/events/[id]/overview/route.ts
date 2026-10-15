// R27 イベント詳細 read model — GET (public part for signed-out visitors).
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().overview;
