import { createTaskCollectionHandlers } from "./collection-handler";

export const dynamic = "force-dynamic";

const handlers = createTaskCollectionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
