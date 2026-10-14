// R26 events-mine: 参加予定 (registered / pending review / planned / attended / cancelled) — GET ?range=upcoming|past&limit=.
import { createMyEventsRoute } from "../../../../features/events/mine/configured";

export const dynamic = "force-dynamic";
export const GET = createMyEventsRoute();
