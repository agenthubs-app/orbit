// R27 会う準備 checklist (synced across clients) — PATCH { items }.
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const PATCH = createEventJourneyRoutes().patchChecklist;
