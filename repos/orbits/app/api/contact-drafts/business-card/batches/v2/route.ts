import { createIngestV2CollectionHandlers } from "./handlers";

export const dynamic = "force-dynamic";

const handlers = createIngestV2CollectionHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
