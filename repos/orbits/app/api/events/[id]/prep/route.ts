// R27 会う準備 — GET.
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().prep;
