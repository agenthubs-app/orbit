// R27 探す: community / plan-fit / all — GET (signed-out visitors get the public 「すべて」 only).
import { createEventJourneyRoutes } from "../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().discover;
