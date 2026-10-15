// R08 contract 9 「興味なし」— R27: live (features/events/journey; mock / hybrid answer from the demo world).
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const POST = createEventJourneyRoutes().dismiss;
