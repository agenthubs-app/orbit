// R27 会後 confirm (only the checked rows take effect; drafts are never sent) — POST.
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const POST = createEventJourneyRoutes().confirmAfter;
