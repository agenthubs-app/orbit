// R27 会場モード（events DESIGN §2.6）— POST memo（「メモ（自分だけ）」）.
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const POST = createEventJourneyRoutes().venueMemo;
