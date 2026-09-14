import { createNoteCollectionHandlers } from "./collection-handler";

export const dynamic = "force-dynamic";
const handlers = createNoteCollectionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
