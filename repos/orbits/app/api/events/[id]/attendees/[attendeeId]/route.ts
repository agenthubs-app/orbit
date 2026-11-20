// 2026-11-20 参加者の詳細 — GET (registered attendees of the event only; anything else is a plain 404).
import { createEventJourneyRoutes } from "../../../../../../features/events/journey/handlers";

export const dynamic = "force-dynamic";
export const GET = createEventJourneyRoutes().attendeeProfile;
