// R27 会後のふりかえり — GET.
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().after;
