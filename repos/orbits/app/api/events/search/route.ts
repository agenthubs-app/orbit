// R27 event search (events / organizers / people from my network) — GET ?q=&limit=. Also used by R30.
import { createEventJourneyRoutes } from "../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().search;
