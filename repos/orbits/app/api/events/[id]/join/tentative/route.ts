// R27 参加登録 facade（events DESIGN §2.4）— POST tentative（添加日历）/ DELETE（移除，2026-11-27）.
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
const routes = createEventJourneyRoutes();
export const POST = routes.joinTentative;
export const DELETE = routes.joinCalendarRemove;
