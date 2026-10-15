// R27 参加登録 facade（events DESIGN §2.4）— POST cancel（「参加を取り消す」）.
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const POST = createEventJourneyRoutes().joinCancel;
