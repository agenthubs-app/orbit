// R27 参加コード → event id (App `/register/〈コード〉`, signed in).
import { createEventJourneyRoutes } from "../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().byCode;
