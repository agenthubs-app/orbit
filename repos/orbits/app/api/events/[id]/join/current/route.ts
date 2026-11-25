// R27 参加登録 facade（events DESIGN §2.4）— GET current（改资料：上次的回答与自我介绍）.
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().joinCurrent;
