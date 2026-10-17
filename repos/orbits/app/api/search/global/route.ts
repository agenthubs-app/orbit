// R30 global search (people / events / conversations in one answer) — GET ?q=&types=&limit=&semantic=.
// search/DESIGN.md §3.1; handler in features/search/global/handlers.ts.
import { createGlobalSearchHandlers } from "../../../../features/search/global/handlers";

export const dynamic = "force-dynamic";
export const GET = createGlobalSearchHandlers().get;
