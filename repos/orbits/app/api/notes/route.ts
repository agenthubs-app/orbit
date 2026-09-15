import { createNoteCollectionHandlers } from "./collection-handler";
import { withTotalServerTiming } from "../../../shared/performance/server-timing";

export const dynamic = "force-dynamic";
const handlers = createNoteCollectionHandlers();
export const GET = withTotalServerTiming(handlers.GET);
export const POST = handlers.POST;
