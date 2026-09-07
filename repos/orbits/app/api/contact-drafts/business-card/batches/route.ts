import { createBusinessCardBatchCollectionHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createBusinessCardBatchCollectionHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
